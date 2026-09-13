pub mod association;
pub mod crypto;
pub mod error;
pub mod handshake;
pub mod rpc;
pub mod sequence;
pub mod session;
pub mod transport;

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::panic::catch_unwind;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

use crate::rpc::{DappIdentity, SendOptions};
use crate::session::global_session_manager;

use crate::error::ShaheenError;

pub fn error_to_code(err: &ShaheenError) -> &'static str {
    match err {
        ShaheenError::CryptoError(_) => "CRYPTO_ERROR",
        ShaheenError::HandshakeError(_) => "HANDSHAKE_ERROR",
        ShaheenError::SequenceMismatch { .. } => "SEQUENCE_MISMATCH",
        ShaheenError::TransportError(_) => "TRANSPORT_ERROR",
        ShaheenError::ProtocolError(_) => "PROTOCOL_ERROR",
        ShaheenError::RpcError { code, .. } => {
            if *code == -32603 { "INTERNAL_ERROR" }
            else if *code == 4001 || *code == -32000 { "USER_REJECTED" }
            else { "RPC_ERROR" }
        },
        ShaheenError::SessionError(_) => "SESSION_ERROR",
        ShaheenError::InvalidAddress(_) => "INVALID_ADDRESS",
        ShaheenError::SerializationError(_) => "SERIALIZATION_ERROR",
        ShaheenError::Timeout(_) => "TIMEOUT_ERROR",
    }
}

fn to_c_string(json_val: serde_json::Value) -> *mut c_char {
    let s = json_val.to_string();
    CString::new(s).unwrap_or_default().into_raw()
}

fn error_to_c_string(err: &str) -> *mut c_char {
    let json = serde_json::json!({
        "success": false,
        "errorCode": "UNKNOWN_ERROR",
        "error": err
    });
    to_c_string(json)
}

// ---------------------------------------------------------------------------
// NEW SESSION-BASED C-ABI (Used by Phase 3 TurboModule)
// ---------------------------------------------------------------------------

#[no_mangle]
pub unsafe extern "C" fn rust_mwa_create_session(port: u16) -> *mut c_char {
    let result = catch_unwind(|| {
        let manager = global_session_manager();
        let port_opt = if port > 0 { Some(port) } else { None };
        match manager.create_session(port_opt) {
            Ok((session_id, assoc_uri)) => {
                serde_json::json!({
                    "success": true,
                    "sessionId": session_id,
                    "uri": assoc_uri.uri,
                    "port": assoc_uri.port,
                    "associationToken": assoc_uri.association_token
                })
            }
            Err(e) => serde_json::json!({
                "success": false,
                "errorCode": error_to_code(&e),
                "error": e.to_string()
            }),
        }
    });

    match result {
        Ok(json) => to_c_string(json),
        Err(_) => error_to_c_string("Panic occurred while creating session"),
    }
}

#[no_mangle]
pub unsafe extern "C" fn rust_mwa_connect_and_authorize(
    c_session_id: *const c_char,
    c_ws_url: *const c_char,
    c_chain: *const c_char,
    c_auth_token: *const c_char,
    c_identity_name: *const c_char,
    c_identity_uri: *const c_char,
    c_identity_icon: *const c_char,
) -> *mut c_char {
    let result = catch_unwind(|| {
        if c_session_id.is_null() {
            return serde_json::json!({"success": false, "errorCode": "INVALID_ARGUMENTS", "error": "Null session ID"});
        }

        let session_id = match CStr::from_ptr(c_session_id).to_str() {
            Ok(s) => s,
            Err(_) => return serde_json::json!({"success": false, "errorCode": "INVALID_ARGUMENTS", "error": "Invalid UTF-8 in session ID"}),
        };

        let ws_url = if !c_ws_url.is_null() {
            match CStr::from_ptr(c_ws_url).to_str() {
                Ok(s) => s.to_string(),
                Err(_) => return serde_json::json!({"success": false, "errorCode": "INVALID_ARGUMENTS", "error": "Invalid UTF-8 in URL"}),
            }
        } else {
            "".to_string()
        };

        let chain = if !c_chain.is_null() {
            CStr::from_ptr(c_chain).to_str().ok().map(|s| s.to_string())
        } else {
            Some("solana:mainnet".to_string())
        };

        let auth_token = if !c_auth_token.is_null() {
            let s = CStr::from_ptr(c_auth_token).to_str().unwrap_or_default();
            if s.is_empty() { None } else { Some(s.to_string()) }
        } else {
            None
        };

        let identity_name = if !c_identity_name.is_null() {
            let s = CStr::from_ptr(c_identity_name).to_str().unwrap_or_default();
            if s.is_empty() { None } else { Some(s.to_string()) }
        } else {
            None
        };

        let identity_uri = if !c_identity_uri.is_null() {
            let s = CStr::from_ptr(c_identity_uri).to_str().unwrap_or_default();
            if s.is_empty() { None } else { Some(s.to_string()) }
        } else {
            None
        };

        let identity_icon = if !c_identity_icon.is_null() {
            let s = CStr::from_ptr(c_identity_icon).to_str().unwrap_or_default();
            if s.is_empty() { None } else { Some(s.to_string()) }
        } else {
            None
        };

        let identity = DappIdentity {
            name: identity_name.or_else(|| Some("Shaheen Client".to_string())),
            uri: identity_uri.or_else(|| Some("https://shaheen.dev".to_string())),
            icon: identity_icon,
        };

        let manager = global_session_manager();
        let auth_result = manager.with_session(session_id, |session| {
            let target_url = if ws_url.is_empty() {
                format!("ws://127.0.0.1:{}/solana-wallet", session.association_uri.port)
            } else {
                ws_url
            };

            session.connect_and_handshake(&target_url, 15)?;
            session.authorize(identity, chain, auth_token)
        });

        match auth_result {
            Ok(auth) => {
                let first_pubkey_b58 = auth
                    .accounts
                    .first()
                    .and_then(|acc| acc.to_base58_address().ok())
                    .unwrap_or_default();

                serde_json::json!({
                    "success": true,
                    "authToken": auth.auth_token,
                    "publicKey": first_pubkey_b58,
                    "accounts": auth.accounts,
                    "error": ""
                })
            }
            Err(e) => serde_json::json!({
                "success": false,
                "publicKey": "",
                "authToken": "",
                "errorCode": error_to_code(&e),
                "error": e.to_string()
            }),
        }
    });

    match result {
        Ok(json) => to_c_string(json),
        Err(_) => error_to_c_string("Panic occurred during authorization"),
    }
}

#[no_mangle]
pub unsafe extern "C" fn rust_mwa_sign_and_send(
    c_session_id: *const c_char,
    c_tx_payloads_json: *const c_char,
) -> *mut c_char {
    let result = catch_unwind(|| {
        if c_session_id.is_null() || c_tx_payloads_json.is_null() {
            return serde_json::json!({"success": false, "errorCode": "INVALID_ARGUMENTS", "error": "Invalid arguments"});
        }

        let session_id = match CStr::from_ptr(c_session_id).to_str() {
            Ok(s) => s,
            Err(_) => return serde_json::json!({"success": false, "errorCode": "INVALID_ARGUMENTS", "error": "Invalid UTF-8 in session ID"}),
        };

        let payloads_str = match CStr::from_ptr(c_tx_payloads_json).to_str() {
            Ok(s) => s,
            Err(_) => return serde_json::json!({"success": false, "errorCode": "INVALID_ARGUMENTS", "error": "Invalid UTF-8 in transaction payloads"}),
        };

        let b64_payloads: Vec<String> = match serde_json::from_str(payloads_str) {
            Ok(v) => v,
            Err(e) => return serde_json::json!({"success": false, "errorCode": "SERIALIZATION_ERROR", "error": format!("Invalid JSON payloads: {}", e)}),
        };

        let mut decoded_txs = Vec::with_capacity(b64_payloads.len());
        for p in &b64_payloads {
            match BASE64.decode(p) {
                Ok(b) => decoded_txs.push(b),
                Err(e) => return serde_json::json!({"success": false, "errorCode": "SERIALIZATION_ERROR", "error": format!("Base64 decode failed: {}", e)}),
            }
        }

        let tx_slices: Vec<&[u8]> = decoded_txs.iter().map(|b| b.as_slice()).collect();
        let manager = global_session_manager();

        let send_res = manager.with_session(session_id, |session| {
            session.sign_and_send_transactions(tx_slices, Some(SendOptions::default()))
        });

        match send_res {
            Ok(signatures) => serde_json::json!({
                "success": true,
                "signatures": signatures,
                "signature": signatures.first().cloned().unwrap_or_default(),
                "error": ""
            }),
            Err(e) => serde_json::json!({
                "success": false,
                "signatures": [],
                "signature": "",
                "errorCode": error_to_code(&e),
                "error": e.to_string()
            }),
        }
    });

    match result {
        Ok(json) => to_c_string(json),
        Err(_) => error_to_c_string("Panic occurred during sign and send"),
    }
}

#[no_mangle]
pub unsafe extern "C" fn rust_mwa_sign_transactions_session(
    c_session_id: *const c_char,
    c_tx_payloads_json: *const c_char,
) -> *mut c_char {
    let result = catch_unwind(|| {
        if c_session_id.is_null() || c_tx_payloads_json.is_null() {
            return serde_json::json!({"success": false, "errorCode": "INVALID_ARGUMENTS", "error": "Invalid arguments"});
        }

        let session_id = match CStr::from_ptr(c_session_id).to_str() {
            Ok(s) => s,
            Err(_) => return serde_json::json!({"success": false, "errorCode": "INVALID_ARGUMENTS", "error": "Invalid UTF-8 in session ID"}),
        };

        let payloads_str = match CStr::from_ptr(c_tx_payloads_json).to_str() {
            Ok(s) => s,
            Err(_) => return serde_json::json!({"success": false, "errorCode": "INVALID_ARGUMENTS", "error": "Invalid UTF-8 in transaction payloads"}),
        };

        let b64_payloads: Vec<String> = match serde_json::from_str(payloads_str) {
            Ok(v) => v,
            Err(e) => return serde_json::json!({"success": false, "errorCode": "SERIALIZATION_ERROR", "error": format!("Invalid JSON payloads: {}", e)}),
        };

        let mut decoded_txs = Vec::with_capacity(b64_payloads.len());
        for p in &b64_payloads {
            match BASE64.decode(p) {
                Ok(b) => decoded_txs.push(b),
                Err(e) => return serde_json::json!({"success": false, "errorCode": "SERIALIZATION_ERROR", "error": format!("Base64 decode failed: {}", e)}),
            }
        }

        let tx_slices: Vec<&[u8]> = decoded_txs.iter().map(|b| b.as_slice()).collect();
        let manager = global_session_manager();

        let sign_res = manager.with_session(session_id, |session| {
            session.sign_transactions(tx_slices)
        });

        match sign_res {
            Ok(signed_txs) => {
                let first_b64 = signed_txs
                    .first()
                    .map(|b| BASE64.encode(b))
                    .unwrap_or_default();
                let all_b64: Vec<String> = signed_txs.iter().map(|b| BASE64.encode(b)).collect();
                serde_json::json!({
                    "success": true,
                    "signedTxBase64": first_b64,
                    "signedTxsBase64": all_b64,
                    "error": ""
                })
            }
            Err(e) => serde_json::json!({
                "success": false,
                "signedTxBase64": "",
                "signedTxsBase64": [],
                "errorCode": error_to_code(&e),
                "error": e.to_string()
            }),
        }
    });

    match result {
        Ok(json) => to_c_string(json),
        Err(_) => error_to_c_string("Panic occurred during sign transactions"),
    }
}

#[no_mangle]
pub unsafe extern "C" fn rust_mwa_sign_messages(
    c_session_id: *const c_char,
    c_addresses_json: *const c_char,
    c_payloads_json: *const c_char,
) -> *mut c_char {
    let result = catch_unwind(|| {
        if c_session_id.is_null() || c_addresses_json.is_null() || c_payloads_json.is_null() {
            return serde_json::json!({"success": false, "errorCode": "INVALID_ARGUMENTS", "error": "Invalid arguments"});
        }

        let session_id = match CStr::from_ptr(c_session_id).to_str() {
            Ok(s) => s,
            Err(_) => return serde_json::json!({"success": false, "errorCode": "INVALID_ARGUMENTS", "error": "Invalid UTF-8 in session ID"}),
        };

        let addresses_str = match CStr::from_ptr(c_addresses_json).to_str() {
            Ok(s) => s,
            Err(_) => return serde_json::json!({"success": false, "errorCode": "INVALID_ARGUMENTS", "error": "Invalid UTF-8 in addresses"}),
        };

        let payloads_str = match CStr::from_ptr(c_payloads_json).to_str() {
            Ok(s) => s,
            Err(_) => return serde_json::json!({"success": false, "errorCode": "INVALID_ARGUMENTS", "error": "Invalid UTF-8 in payloads"}),
        };

        let addresses: Vec<String> = match serde_json::from_str(addresses_str) {
            Ok(v) => v,
            Err(e) => return serde_json::json!({"success": false, "errorCode": "SERIALIZATION_ERROR", "error": format!("Invalid JSON addresses: {}", e)}),
        };

        let b64_payloads: Vec<String> = match serde_json::from_str(payloads_str) {
            Ok(v) => v,
            Err(e) => return serde_json::json!({"success": false, "errorCode": "SERIALIZATION_ERROR", "error": format!("Invalid JSON payloads: {}", e)}),
        };

        let mut decoded_msgs = Vec::with_capacity(b64_payloads.len());
        for p in &b64_payloads {
            match BASE64.decode(p) {
                Ok(b) => decoded_msgs.push(b),
                Err(e) => return serde_json::json!({"success": false, "errorCode": "SERIALIZATION_ERROR", "error": format!("Base64 decode failed: {}", e)}),
            }
        }

        let msg_slices: Vec<&[u8]> = decoded_msgs.iter().map(|b| b.as_slice()).collect();
        let manager = global_session_manager();

        let sign_res = manager.with_session(session_id, |session| {
            session.sign_messages(addresses, msg_slices)
        });

        match sign_res {
            Ok(signed_payloads) => serde_json::json!({
                "success": true,
                "signedPayloads": signed_payloads,
                "signedPayload": signed_payloads.first().cloned().unwrap_or_default(),
                "error": ""
            }),
            Err(e) => serde_json::json!({
                "success": false,
                "signedPayloads": [],
                "signedPayload": "",
                "errorCode": error_to_code(&e),
                "error": e.to_string()
            }),
        }
    });

    match result {
        Ok(json) => to_c_string(json),
        Err(_) => error_to_c_string("Panic occurred during sign messages"),
    }
}

#[no_mangle]
pub unsafe extern "C" fn rust_mwa_get_capabilities(c_session_id: *const c_char) -> *mut c_char {
    let result = catch_unwind(|| {
        if c_session_id.is_null() {
            return serde_json::json!({"success": false, "errorCode": "INVALID_ARGUMENTS", "error": "Null session ID"});
        }

        let session_id = match CStr::from_ptr(c_session_id).to_str() {
            Ok(s) => s,
            Err(_) => return serde_json::json!({"success": false, "errorCode": "INVALID_ARGUMENTS", "error": "Invalid UTF-8 in session ID"}),
        };

        let manager = global_session_manager();
        let cap_res = manager.with_session(session_id, |session| {
            session.get_capabilities()
        });

        match cap_res {
            Ok(caps) => serde_json::json!({
                "success": true,
                "maxTransactionsPerRequest": caps.max_transactions_per_request,
                "maxMessagesPerRequest": caps.max_messages_per_request,
                "supportedTransactionVersions": caps.supported_transaction_versions,
                "features": caps.features,
                "error": ""
            }),
            Err(e) => serde_json::json!({
                "success": false,
                "errorCode": error_to_code(&e),
                "error": e.to_string()
            }),
        }
    });

    match result {
        Ok(json) => to_c_string(json),
        Err(_) => error_to_c_string("Panic occurred while getting capabilities"),
    }
}

#[no_mangle]
pub unsafe extern "C" fn rust_mwa_deauthorize(c_session_id: *const c_char) -> *mut c_char {
    let result = catch_unwind(|| {
        if c_session_id.is_null() {
            return serde_json::json!({"success": false, "errorCode": "INVALID_ARGUMENTS", "error": "Null session ID"});
        }

        let session_id = match CStr::from_ptr(c_session_id).to_str() {
            Ok(s) => s,
            Err(_) => return serde_json::json!({"success": false, "errorCode": "INVALID_ARGUMENTS", "error": "Invalid UTF-8 in session ID"}),
        };

        let manager = global_session_manager();
        let deauth_res = manager.with_session(session_id, |session| {
            session.deauthorize()
        });

        match deauth_res {
            Ok(()) => serde_json::json!({
                "success": true,
                "error": ""
            }),
            Err(e) => serde_json::json!({
                "success": false,
                "errorCode": error_to_code(&e),
                "error": e.to_string()
            }),
        }
    });

    match result {
        Ok(json) => to_c_string(json),
        Err(_) => error_to_c_string("Panic occurred while deauthorizing"),
    }
}

#[no_mangle]
pub unsafe extern "C" fn rust_mwa_close_session(c_session_id: *const c_char) {
    let _ = catch_unwind(|| {
        if !c_session_id.is_null() {
            if let Ok(session_id) = CStr::from_ptr(c_session_id).to_str() {
                let manager = global_session_manager();
                let _ = manager.close_session(session_id);
            }
        }
    });
}

#[no_mangle]
pub unsafe extern "C" fn rust_free_string(s: *mut c_char) {
    if !s.is_null() {
        drop(CString::from_raw(s));
    }
}

// ---------------------------------------------------------------------------
// END-TO-END SPEC-COMPLIANT MWA 2.0 TEST
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::SessionManager;
    use std::net::TcpListener;

    use tungstenite::accept_hdr;
    use tungstenite::handshake::server::{Request, Response};
    use tungstenite::Message as WsMessage;
    use p256::elliptic_curve::sec1::ToEncodedPoint;
    use p256::SecretKey;
    use rand::rngs::OsRng;
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine;
    use crate::crypto::{derive_session_key, encrypt_mwa_message, decrypt_mwa_message};
    use crate::handshake::verify_hello_req;

    /// Mock MWA 2.0 wallet server strictly verifying:
    /// - Subprotocols: com.solana.mobilewalletadapter.v1
    /// - Handshake: HELLO_REQ = Qd || Sa with ECDSA-SHA256 verification against Qa
    /// - Handshake: HELLO_RSP = Qw || session_props encrypted with seq=1
    /// - Sequence numbers: Monotonically increasing AAD enforcement
    /// - RPC: authorize returning 32-byte Ed25519 public key
    fn mock_mwa_2_0_wallet_server(
        listener: TcpListener,
        expected_assoc_pub: [u8; 65],
    ) {
        let (stream, _) = listener.accept().unwrap();

        // WebSocket handshake verifying MWA subprotocol
        let callback = |req: &Request, mut resp: Response| {
            let subproto = req.headers().get("Sec-WebSocket-Protocol")
                .and_then(|v| v.to_str().ok())
                .unwrap_or_default();
            assert!(subproto.contains(crate::transport::SUBPROTOCOL_BINARY));
            resp.headers_mut().insert(
                "Sec-WebSocket-Protocol",
                crate::transport::SUBPROTOCOL_BINARY.parse().unwrap(),
            );
            Ok(resp)
        };

        let mut socket = accept_hdr(stream, callback).unwrap();

        // 1. Read binary HELLO_REQ (129 bytes: Qd || Sa)
        let msg = socket.read().unwrap();
        let hello_req_bytes = match msg {
            WsMessage::Binary(bytes) => bytes,
            _ => panic!("Expected binary HELLO_REQ"),
        };
        assert_eq!(hello_req_bytes.len(), 129, "HELLO_REQ must be exactly 129 bytes");

        // Verify Qd against Qa using ECDSA-SHA256!
        let qd_bytes = verify_hello_req(&expected_assoc_pub, &hello_req_bytes).unwrap();

        // 2. Generate wallet ephemeral keypair Qw
        let wallet_priv = SecretKey::random(&mut OsRng);
        let wallet_pub = wallet_priv.public_key();
        let wallet_pub_bytes = wallet_pub.to_encoded_point(false);

        // Derive AES-128 key via HKDF using Qa as salt!
        let wallet_session_key = derive_session_key(
            &wallet_priv,
            &qd_bytes,
            &expected_assoc_pub,
        ).unwrap();

        // Encrypt session_props with seq=1
        let session_props = b"{\"v\":\"2\"}";
        let encrypted_props = encrypt_mwa_message(&wallet_session_key, 1, session_props).unwrap();

        // Build HELLO_RSP: Qw || encrypted_props
        let mut hello_rsp = Vec::new();
        hello_rsp.extend_from_slice(wallet_pub_bytes.as_bytes());
        hello_rsp.extend_from_slice(&encrypted_props);

        socket.send(WsMessage::Binary(hello_rsp)).unwrap();

        // 3. Receive encrypted authorize request from dapp (seq should be 1 for client)
        let auth_msg = socket.read().unwrap();
        let enc_auth_bytes = match auth_msg {
            WsMessage::Binary(b) => b,
            _ => panic!("Expected binary authorize message"),
        };

        let (seq, decrypted_auth) = decrypt_mwa_message(&wallet_session_key, &enc_auth_bytes).unwrap();
        assert_eq!(seq, 1, "Client's first outbound message sequence must be 1");

        let auth_req: serde_json::Value = serde_json::from_slice(&decrypted_auth).unwrap();
        assert_eq!(auth_req["method"], "authorize");
        assert_eq!(auth_req["params"]["chain"], "solana:mainnet");

        // 4. Respond with valid 32-byte Solana Ed25519 public key
        let valid_solana_pubkey = [7u8; 32];
        let valid_b64_pubkey = BASE64.encode(valid_solana_pubkey);
        let valid_b58_pubkey = bs58::encode(valid_solana_pubkey).into_string();

        let auth_resp = serde_json::json!({
            "jsonrpc": "2.0",
            "id": auth_req["id"],
            "result": {
                "auth_token": "valid_mwa2_token_999",
                "accounts": [
                    {
                        "address": valid_b64_pubkey,
                        "display_address": valid_b58_pubkey,
                        "display_address_format": "base58",
                        "label": "Test MWA Wallet"
                    }
                ]
            }
        });

        // Wallet sends auth response with sequence=2 (since session_props was sequence 1!)
        let auth_resp_bytes = serde_json::to_vec(&auth_resp).unwrap();
        let enc_auth_resp = encrypt_mwa_message(&wallet_session_key, 2, &auth_resp_bytes).unwrap();
        socket.send(WsMessage::Binary(enc_auth_resp)).unwrap();

        // 5. Receive sign_and_send_transactions request (client seq=2)
        let sign_msg = socket.read().unwrap();
        let enc_sign_bytes = match sign_msg {
            WsMessage::Binary(b) => b,
            _ => panic!("Expected binary sign message"),
        };

        let (seq_sign, decrypted_sign) = decrypt_mwa_message(&wallet_session_key, &enc_sign_bytes).unwrap();
        assert_eq!(seq_sign, 2, "Client's second outbound message sequence must be 2");

        let sign_req: serde_json::Value = serde_json::from_slice(&decrypted_sign).unwrap();
        assert_eq!(sign_req["method"], "sign_and_send_transactions");

        // Respond with signature (wallet seq=3)
        let sign_resp = serde_json::json!({
            "jsonrpc": "2.0",
            "id": sign_req["id"],
            "result": {
                "signatures": ["5UfDu82...mockSignature..."]
            }
        });

        let sign_resp_bytes = serde_json::to_vec(&sign_resp).unwrap();
        let enc_sign_resp = encrypt_mwa_message(&wallet_session_key, 3, &sign_resp_bytes).unwrap();
        socket.send(WsMessage::Binary(enc_sign_resp)).unwrap();
    }

    #[test]
    fn test_mwa_2_0_full_handshake_and_rpc_e2e() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        let manager = SessionManager::new();
        let (session_id, _uri) = manager.create_session(Some(port)).unwrap();

        // Get association public key
        let assoc_pub = manager.with_session(&session_id, |s| {
            Ok(s.association.public_key_bytes)
        }).unwrap();

        // Spawn mock wallet thread
        let server_handle = std::thread::spawn(move || {
            mock_mwa_2_0_wallet_server(listener, assoc_pub);
        });

        // Dapp connects and authorizes
        let auth_res = manager.with_session(&session_id, |session| {
            let ws_url = format!("ws://127.0.0.1:{}/solana-wallet", port);
            session.connect_and_handshake(&ws_url, 5)?;
            session.authorize(
                DappIdentity {
                    uri: Some("https://shaheen.dev".to_string()),
                    icon: None,
                    name: Some("Test Dapp".to_string()),
                },
                Some("solana:mainnet".to_string()),
                None,
            )
        }).unwrap();

        assert_eq!(auth_res.auth_token, "valid_mwa2_token_999");
        assert_eq!(auth_res.accounts.len(), 1);
        let b58_address = auth_res.accounts[0].to_base58_address().unwrap();
        assert_eq!(b58_address, bs58::encode([7u8; 32]).into_string());

        // Dapp signs transaction on the SAME connected session (no reconnect, no intent re-launch!)
        let dummy_tx = vec![1u8, 2, 3, 4];
        let signatures = manager.with_session(&session_id, |session| {
            session.sign_and_send_transactions(vec![&dummy_tx], None)
        }).unwrap();

        assert_eq!(signatures.len(), 1);
        assert_eq!(signatures[0], "5UfDu82...mockSignature...");

        server_handle.join().unwrap();
    }
}
