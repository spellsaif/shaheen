#![allow(dead_code)]

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::panic::catch_unwind;
use std::net::TcpStream;
use std::time::Duration;
use std::sync::Mutex;

use solana_sdk::instruction::Instruction;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::transaction::Transaction;
use solana_sdk::message::Message;

use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::ecdh::diffie_hellman;
use p256::{PublicKey, SecretKey};
use rand::rngs::OsRng;
use rand::Rng;

use hkdf::Hkdf;
use sha2::Sha256;
use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes128Gcm, Nonce};
use tungstenite::Message as WsMessage;
use url::Url;
use base64::engine::general_purpose::{STANDARD as BASE64, URL_SAFE_NO_PAD};
use base64::Engine;

#[derive(serde::Deserialize)]
struct KeyInfo {
    pubkey: String,
    #[serde(rename = "isSigner")]
    is_signer: bool,
    #[serde(rename = "isWritable")]
    is_writable: bool,
}

#[derive(serde::Serialize)]
struct MwaAuthorizeParams {
    identity: MwaIdentity,
}

#[derive(serde::Serialize)]
struct MwaIdentity {
    uri: String,
    icon: String,
    name: String,
}

#[derive(serde::Serialize)]
struct MwaSignTransactionsParams {
    transactions: Vec<String>,
}

#[derive(serde::Deserialize)]
struct MwaResponse<T> {
    result: Option<T>,
    error: Option<MwaErrorDetail>,
}

#[derive(serde::Deserialize)]
struct MwaErrorDetail {
    code: i32,
    message: String,
}

#[derive(serde::Deserialize)]
struct AuthorizeResult {
    #[serde(rename = "auth_token")]
    auth_token: String,
    accounts: Vec<MwaAccount>,
}

#[derive(serde::Deserialize)]
struct MwaAccount {
    address: String,
    label: Option<String>,
}

#[derive(serde::Deserialize)]
struct SignTransactionsResult {
    #[serde(rename = "signed_transactions")]
    signed_transactions: Vec<String>,
}

fn decode_hex(s: &str) -> Result<Vec<u8>, &'static str> {
    if s.len() % 2 != 0 {
        return Err("Odd hex string length");
    }
    let mut res = Vec::with_capacity(s.len() / 2);
    let bytes = s.as_bytes();
    for i in (0..s.len()).step_by(2) {
        let high = char::from(bytes[i]).to_digit(16).ok_or("Invalid hex character")? as u8;
        let low = char::from(bytes[i + 1]).to_digit(16).ok_or("Invalid hex character")? as u8;
        res.push((high << 4) | low);
    }
    Ok(res)
}

fn encrypt_payload(aes_key: &[u8; 16], seq_num: u32, plaintext: &[u8]) -> Result<Vec<u8>, &'static str> {
    let cipher = Aes128Gcm::new_from_slice(aes_key).map_err(|_| "AES Init failed")?;
    let mut iv = [0u8; 12];
    rand::thread_rng().fill(&mut iv);
    let nonce = Nonce::from_slice(&iv);
    
    let seq_bytes = seq_num.to_be_bytes();
    let payload = Payload {
        msg: plaintext,
        aad: &seq_bytes,
    };
    
    let ciphertext_with_tag = cipher.encrypt(nonce, payload).map_err(|_| "Encryption failed")?;
    
    let mut msg = Vec::new();
    msg.extend_from_slice(&seq_bytes);
    msg.extend_from_slice(&iv);
    msg.extend_from_slice(&ciphertext_with_tag);
    Ok(msg)
}

fn decrypt_payload(aes_key: &[u8; 16], msg: &[u8]) -> Result<(u32, Vec<u8>), &'static str> {
    if msg.len() < 16 {
        return Err("Message too short");
    }
    
    let seq_bytes: [u8; 4] = msg[0..4].try_into().map_err(|_| "Invalid seq range")?;
    let seq_num = u32::from_be_bytes(seq_bytes);
    
    let iv: [u8; 12] = msg[4..16].try_into().map_err(|_| "Invalid IV range")?;
    let nonce = Nonce::from_slice(&iv);
    
    let ciphertext_with_tag = &msg[16..];
    let cipher = Aes128Gcm::new_from_slice(aes_key).map_err(|_| "AES Init failed")?;
    
    let payload = Payload {
        msg: ciphertext_with_tag,
        aad: &seq_bytes,
    };
    
    let plaintext = cipher.decrypt(nonce, payload).map_err(|_| "Decryption failed")?;
    Ok((seq_num, plaintext))
}

struct SessionState {
    dapp_priv: SecretKey,
    port: u16,
}

static SESSION_STATE: Mutex<Option<SessionState>> = Mutex::new(None);

#[derive(serde::Serialize)]
struct MwaReauthorizeParams {
    identity: MwaIdentity,
    #[serde(rename = "auth_token")]
    auth_token: String,
}

fn to_hex_string(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

fn connect_with_retry(socket_addr: &str) -> Result<TcpStream, String> {
    let max_attempts = 15;
    let delay = Duration::from_millis(200);
    
    for attempt in 1..=max_attempts {
        match TcpStream::connect_timeout(
            &socket_addr.parse().map_err(|e| format!("Invalid socket address: {}", e))?,
            Duration::from_secs(1)
        ) {
            Ok(stream) => return Ok(stream),
            Err(e) => {
                if attempt == max_attempts {
                    return Err(format!("TCP Connection timed out after {} attempts: {}", max_attempts, e));
                }
                std::thread::sleep(delay);
            }
        }
    }
    Err("TCP Connection retry loop terminated unexpectedly".to_string())
}

fn execute_authorize_flow(
    ws_url: &str,
    dapp_priv: &SecretKey,
) -> Result<(String, String), String> {
    let url = Url::parse(ws_url).map_err(|e| format!("Invalid URL: {}", e))?;
    
    let socket_addr = format!(
        "{}:{}",
        url.host_str().unwrap_or("127.0.0.1"),
        url.port().unwrap_or(49152)
    );
    
    let stream = connect_with_retry(&socket_addr)?;
    let (mut socket, _) = tungstenite::client(url, stream).map_err(|e| format!("WebSocket Handshake failed: {}", e))?;
    
    let dapp_pub = dapp_priv.public_key();
    let dapp_pub_bytes = dapp_pub.to_encoded_point(false);
    
    socket.send(WsMessage::Binary(dapp_pub_bytes.as_bytes().to_vec()))
        .map_err(|e| format!("Failed to send HELLO: {}", e))?;
    
    let resp = socket.read().map_err(|e| format!("Failed to read HELLO response: {}", e))?;
    let wallet_pub_bytes = match resp {
        WsMessage::Binary(bytes) => bytes,
        _ => return Err("Expected binary HELLO response".to_string()),
    };
    
    let wallet_pub_point = PublicKey::from_sec1_bytes(&wallet_pub_bytes)
        .map_err(|e| format!("Invalid wallet public key: {}", e))?;
    
    let shared_secret = diffie_hellman(dapp_priv.to_nonzero_scalar(), wallet_pub_point.as_affine());
    let shared_secret_bytes = shared_secret.raw_secret_bytes();
    
    let hk = Hkdf::<Sha256>::new(Some(dapp_pub_bytes.as_bytes()), &shared_secret_bytes);
    let mut aes_key = [0u8; 16];
    hk.expand(&[], &mut aes_key).map_err(|e| format!("HKDF expansion failed: {}", e))?;
    
    let seq_num = 1;
    
    let auth_request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "authorize",
        "params": MwaAuthorizeParams {
            identity: MwaIdentity {
                uri: "https://shaheen.dev".to_string(),
                icon: "favicon.png".to_string(),
                name: "Shaheen Client".to_string(),
            }
        }
    });
    
    let auth_payload = serde_json::to_vec(&auth_request).map_err(|e| e.to_string())?;
    let encrypted_auth = encrypt_payload(&aes_key, seq_num, &auth_payload)?;
    
    socket.send(WsMessage::Binary(encrypted_auth))
        .map_err(|e| format!("Failed to send encrypted authorize request: {}", e))?;
    
    let auth_resp_msg = socket.read().map_err(|e| format!("Failed to read authorize response: {}", e))?;
    let auth_resp_bytes = match auth_resp_msg {
        WsMessage::Binary(bytes) => bytes,
        _ => return Err("Expected encrypted binary response".to_string()),
    };
    
    let (_, decrypted_auth_payload) = decrypt_payload(&aes_key, &auth_resp_bytes)?;
    let auth_resp: MwaResponse<AuthorizeResult> = serde_json::from_slice(&decrypted_auth_payload)
        .map_err(|e| format!("Failed to parse authorize response JSON: {}", e))?;
    
    if let Some(err) = auth_resp.error {
        return Err(format!("Authorize failed: {} (code: {})", err.message, err.code));
    }
    
    let auth_result = auth_resp.result.ok_or_else(|| "Missing authorize result".to_string())?;
    let first_account = auth_result.accounts.first().ok_or_else(|| "No authorized accounts returned".to_string())?;
    
    Ok((first_account.address.clone(), auth_result.auth_token))
}

fn execute_sign_flow(
    ws_url: &str,
    dapp_priv: &SecretKey,
    transaction_bytes: Vec<u8>,
    auth_token: &str,
) -> Result<(String, String), String> {
    let url = Url::parse(ws_url).map_err(|e| format!("Invalid URL: {}", e))?;
    
    let socket_addr = format!(
        "{}:{}",
        url.host_str().unwrap_or("127.0.0.1"),
        url.port().unwrap_or(49152)
    );
    
    let stream = connect_with_retry(&socket_addr)?;
    let (mut socket, _) = tungstenite::client(url, stream).map_err(|e| format!("WebSocket Handshake failed: {}", e))?;
    
    let dapp_pub = dapp_priv.public_key();
    let dapp_pub_bytes = dapp_pub.to_encoded_point(false);
    
    socket.send(WsMessage::Binary(dapp_pub_bytes.as_bytes().to_vec()))
        .map_err(|e| format!("Failed to send HELLO: {}", e))?;
    
    let resp = socket.read().map_err(|e| format!("Failed to read HELLO response: {}", e))?;
    let wallet_pub_bytes = match resp {
        WsMessage::Binary(bytes) => bytes,
        _ => return Err("Expected binary HELLO response".to_string()),
    };
    
    let wallet_pub_point = PublicKey::from_sec1_bytes(&wallet_pub_bytes)
        .map_err(|e| format!("Invalid wallet public key: {}", e))?;
    
    let shared_secret = diffie_hellman(dapp_priv.to_nonzero_scalar(), wallet_pub_point.as_affine());
    let shared_secret_bytes = shared_secret.raw_secret_bytes();
    
    let hk = Hkdf::<Sha256>::new(Some(dapp_pub_bytes.as_bytes()), &shared_secret_bytes);
    let mut aes_key = [0u8; 16];
    hk.expand(&[], &mut aes_key).map_err(|e| format!("HKDF expansion failed: {}", e))?;
    
    let mut seq_num = 1;
    
    let reauth_request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "reauthorize",
        "params": MwaReauthorizeParams {
            identity: MwaIdentity {
                uri: "https://shaheen.dev".to_string(),
                icon: "favicon.png".to_string(),
                name: "Shaheen Client".to_string(),
            },
            auth_token: auth_token.to_string(),
        }
    });
    
    let reauth_payload = serde_json::to_vec(&reauth_request).map_err(|e| e.to_string())?;
    let encrypted_reauth = encrypt_payload(&aes_key, seq_num, &reauth_payload)?;
    
    socket.send(WsMessage::Binary(encrypted_reauth))
        .map_err(|e| format!("Failed to send encrypted reauthorize request: {}", e))?;
    
    let reauth_resp_msg = socket.read().map_err(|e| format!("Failed to read reauthorize response: {}", e))?;
    let reauth_resp_bytes = match reauth_resp_msg {
        WsMessage::Binary(bytes) => bytes,
        _ => return Err("Expected encrypted binary reauthorize response".to_string()),
    };
    
    let (_, decrypted_reauth_payload) = decrypt_payload(&aes_key, &reauth_resp_bytes)?;
    let reauth_resp: MwaResponse<AuthorizeResult> = serde_json::from_slice(&decrypted_reauth_payload)
        .map_err(|e| format!("Failed to parse reauthorize response JSON: {}", e))?;
    
    if let Some(err) = reauth_resp.error {
        return Err(format!("Reauthorize failed: {} (code: {})", err.message, err.code));
    }
    
    seq_num += 1;
    let tx_base64 = BASE64.encode(&transaction_bytes);
    
    let sign_request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "sign_transactions",
        "params": MwaSignTransactionsParams {
            transactions: vec![tx_base64],
        }
    });
    
    let sign_payload = serde_json::to_vec(&sign_request).map_err(|e| e.to_string())?;
    let encrypted_sign = encrypt_payload(&aes_key, seq_num, &sign_payload)?;
    
    socket.send(WsMessage::Binary(encrypted_sign))
        .map_err(|e| format!("Failed to send encrypted sign request: {}", e))?;
    
    let sign_resp_msg = socket.read().map_err(|e| format!("Failed to read sign response: {}", e))?;
    let sign_resp_bytes = match sign_resp_msg {
        WsMessage::Binary(bytes) => bytes,
        _ => return Err("Expected encrypted binary sign response".to_string()),
    };
    
    let (_, decrypted_sign_payload) = decrypt_payload(&aes_key, &sign_resp_bytes)?;
    let sign_resp: MwaResponse<SignTransactionsResult> = serde_json::from_slice(&decrypted_sign_payload)
        .map_err(|e| format!("Failed to parse sign response JSON: {}", e))?;
    
    if let Some(err) = sign_resp.error {
        return Err(format!("Signing failed: {} (code: {})", err.message, err.code));
    }
    
    let sign_result = sign_resp.result.ok_or_else(|| "Missing sign result".to_string())?;
    let signed_tx_base64 = sign_result.signed_transactions.first()
        .ok_or_else(|| "No signed transactions returned".to_string())?;
    
    let signed_tx_bytes = BASE64.decode(signed_tx_base64)
        .map_err(|e| format!("Failed to decode base64 signed transaction: {}", e))?;
    
    let signed_tx_hex = to_hex_string(&signed_tx_bytes);
    
    let deserialized_tx: Transaction = bincode::deserialize(&signed_tx_bytes)
        .map_err(|e| format!("Failed to deserialize signed transaction: {}", e))?;
    
    let signature = deserialized_tx.signatures.first()
        .ok_or_else(|| "Missing transaction signature".to_string())?;
    
    Ok((signature.to_string(), signed_tx_hex))
}

#[no_mangle]
pub unsafe extern "C" fn rust_mwa_generate_association() -> *mut c_char {
    let result = catch_unwind(|| {
        let dapp_priv = SecretKey::random(&mut OsRng);
        let dapp_pub = dapp_priv.public_key();
        let dapp_pub_bytes = dapp_pub.to_encoded_point(false);
        
        let token = URL_SAFE_NO_PAD.encode(dapp_pub_bytes.as_bytes());
        
        let mut rng = rand::thread_rng();
        let port: u16 = rng.gen_range(49152..=65535);
        
        let uri = format!("solana-wallet:/v1/associate/local?association={}&port={}", token, port);
        
        let mut state = SESSION_STATE.lock().unwrap();
        *state = Some(SessionState {
            dapp_priv,
            port,
        });
        
        format!("{{\"uri\":\"{}\",\"port\":{}}}", uri, port)
    });
    
    let output = match result {
        Ok(s) => s,
        Err(_) => "{\"uri\":\"\",\"port\":0}".to_string(),
    };
    
    CString::new(output).unwrap().into_raw()
}

#[no_mangle]
pub unsafe extern "C" fn rust_mwa_authorize(
    cluster: *const c_char,
) -> *mut c_char {
    let result = catch_unwind(|| {
        if cluster.is_null() {
            return "{\"success\":false,\"publicKey\":\"\",\"authToken\":\"\",\"error\":\"Null pointer passed to Rust\"}".to_string();
        }
        let c_cluster = match CStr::from_ptr(cluster).to_str() {
            Ok(s) => s,
            Err(_) => return "{\"success\":false,\"publicKey\":\"\",\"authToken\":\"\",\"error\":\"Invalid cluster string encoding\"}".to_string(),
        };

        let (dapp_priv, port) = {
            let state_opt = SESSION_STATE.lock().unwrap();
            if let Some(ref state) = *state_opt {
                let key = SecretKey::from_slice(&state.dapp_priv.to_bytes()).unwrap();
                (key, state.port)
            } else {
                return "{\"success\":false,\"publicKey\":\"\",\"authToken\":\"\",\"error\":\"Session state not generated. Call generate_association first.\"}".to_string();
            }
        };

        let ws_url = if c_cluster.starts_with("ws://") || c_cluster.starts_with("wss://") {
            c_cluster.to_string()
        } else {
            format!("ws://127.0.0.1:{}/solana-wallet", port)
        };

        match execute_authorize_flow(&ws_url, &dapp_priv) {
            Ok((pubkey, auth_token)) => {
                format!(
                    "{{\"success\":true,\"publicKey\":\"{}\",\"authToken\":\"{}\",\"error\":\"\"}}",
                    pubkey, auth_token
                )
            }
            Err(e) => {
                format!(
                    "{{\"success\":false,\"publicKey\":\"\",\"authToken\":\"\",\"error\":\"{}\"}}",
                    e
                )
            }
        }
    });

    let output_str = match result {
        Ok(s) => s,
        Err(_) => "{\"success\":false,\"publicKey\":\"\",\"authToken\":\"\",\"error\":\"Rust Thread Panic in Authorize\"}".to_string(),
    };

    CString::new(output_str).unwrap().into_raw()
}

#[no_mangle]
pub unsafe extern "C" fn rust_mwa_sign_transactions(
    cluster: *const c_char,
    tx_hex: *const c_char,
    auth_token: *const c_char,
) -> *mut c_char {
    let result = catch_unwind(|| {
        if cluster.is_null() || tx_hex.is_null() || auth_token.is_null() {
            return "{\"success\":false,\"signature\":\"\",\"signedTxHex\":\"\",\"error\":\"Null pointer passed to Rust\"}".to_string();
        }
        let c_cluster = match CStr::from_ptr(cluster).to_str() {
            Ok(s) => s,
            Err(_) => return "{\"success\":false,\"signature\":\"\",\"signedTxHex\":\"\",\"error\":\"Invalid cluster string encoding\"}".to_string(),
        };
        let c_tx_hex = match CStr::from_ptr(tx_hex).to_str() {
            Ok(s) => s,
            Err(_) => return "{\"success\":false,\"signature\":\"\",\"signedTxHex\":\"\",\"error\":\"Invalid transaction hex encoding\"}".to_string(),
        };
        let c_auth_token = match CStr::from_ptr(auth_token).to_str() {
            Ok(s) => s,
            Err(_) => return "{\"success\":false,\"signature\":\"\",\"signedTxHex\":\"\",\"error\":\"Invalid auth token encoding\"}".to_string(),
        };

        let tx_bytes = match decode_hex(c_tx_hex) {
            Ok(b) => b,
            Err(e) => return format!("{{\"success\":false,\"signature\":\"\",\"signedTxHex\":\"\",\"error\":\"Hex decode failed: {}\"}}", e),
        };

        let (dapp_priv, port) = {
            let state_opt = SESSION_STATE.lock().unwrap();
            if let Some(ref state) = *state_opt {
                let key = SecretKey::from_slice(&state.dapp_priv.to_bytes()).unwrap();
                (key, state.port)
            } else {
                return "{\"success\":false,\"signature\":\"\",\"signedTxHex\":\"\",\"error\":\"Session state not generated. Call generate_association first.\"}".to_string();
            }
        };

        let ws_url = if c_cluster.starts_with("ws://") || c_cluster.starts_with("wss://") {
            c_cluster.to_string()
        } else {
            format!("ws://127.0.0.1:{}/solana-wallet", port)
        };

        match execute_sign_flow(&ws_url, &dapp_priv, tx_bytes, c_auth_token) {
            Ok((sig, signed_hex)) => {
                format!(
                    "{{\"success\":true,\"signature\":\"{}\",\"signedTxHex\":\"{}\",\"error\":\"\"}}",
                    sig, signed_hex
                )
            }
            Err(e) => {
                format!(
                    "{{\"success\":false,\"signature\":\"\",\"signedTxHex\":\"\",\"error\":\"{}\"}}",
                    e
                )
            }
        }
    });

    let output_str = match result {
        Ok(s) => s,
        Err(_) => "{\"success\":false,\"signature\":\"\",\"signedTxHex\":\"\",\"error\":\"Rust Thread Panic in Sign\"}".to_string(),
    };

    CString::new(output_str).unwrap().into_raw()
}

#[no_mangle]
pub unsafe extern "C" fn rust_free_string(s: *mut c_char) {
    if !s.is_null() {
        let _ = CString::from_raw(s);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ptr;
    use std::net::TcpListener;
    use tungstenite::accept as ws_accept;

    #[test]
    fn test_decode_hex() {
        assert_eq!(decode_hex("00").unwrap(), vec![0]);
        assert_eq!(decode_hex("aabbcc").unwrap(), vec![170, 187, 204]);
        assert!(decode_hex("a").is_err());
        assert!(decode_hex("zz").is_err());
    }

    #[test]
    fn test_encryption_decryption() {
        let aes_key = [7u8; 16];
        let plaintext = b"Hello, Solana MWA!";
        let seq_num = 42;
        
        let encrypted = encrypt_payload(&aes_key, seq_num, plaintext).unwrap();
        
        let (decrypted_seq, decrypted_text) = decrypt_payload(&aes_key, &encrypted).unwrap();
        assert_eq!(decrypted_seq, seq_num);
        assert_eq!(decrypted_text, plaintext);
    }

    #[test]
    fn test_mwa_generate_association() {
        unsafe {
            let res = rust_mwa_generate_association();
            let c_str = CStr::from_ptr(res).to_str().unwrap();
            assert!(c_str.contains("solana-wallet:/v1/associate/local?association="));
            assert!(c_str.contains("\"port\":"));
            rust_free_string(res);
        }
    }

    #[test]
    fn test_mwa_null_pointers() {
        unsafe {
            let res = rust_mwa_authorize(ptr::null());
            let c_str = CStr::from_ptr(res).to_str().unwrap();
            assert!(c_str.contains("Null pointer passed to Rust"));
            rust_free_string(res);

            let res2 = rust_mwa_sign_transactions(ptr::null(), ptr::null(), ptr::null());
            let c_str2 = CStr::from_ptr(res2).to_str().unwrap();
            assert!(c_str2.contains("Null pointer passed to Rust"));
            rust_free_string(res2);
        }
    }

    #[test]
    fn test_ecdh_key_agreement() {
        let priv_a = SecretKey::random(&mut OsRng);
        let pub_a = priv_a.public_key();
        let pub_a_bytes = pub_a.to_encoded_point(false);

        let priv_b = SecretKey::random(&mut OsRng);
        let pub_b = priv_b.public_key();
        let pub_b_bytes = pub_b.to_encoded_point(false);

        let pub_a_recon = PublicKey::from_sec1_bytes(pub_a_bytes.as_bytes()).unwrap();
        let pub_b_recon = PublicKey::from_sec1_bytes(pub_b_bytes.as_bytes()).unwrap();

        let secret_a = diffie_hellman(priv_a.to_nonzero_scalar(), pub_b_recon.as_affine());
        let secret_b = diffie_hellman(priv_b.to_nonzero_scalar(), pub_a_recon.as_affine());

        assert_eq!(secret_a.raw_secret_bytes(), secret_b.raw_secret_bytes());
    }

    #[test]
    fn test_session_state_mutex() {
        let dapp_priv = SecretKey::random(&mut OsRng);
        let port = 12345;

        {
            let mut state = SESSION_STATE.lock().unwrap();
            *state = Some(SessionState {
                dapp_priv,
                port,
            });
        }

        {
            let state_opt = SESSION_STATE.lock().unwrap();
            assert!(state_opt.is_some());
            let state = state_opt.as_ref().unwrap();
            assert_eq!(state.port, port);
        }
    }

    fn mock_mwa_wallet_server(listener: TcpListener) {
        // --- CONNECTION 1: Authorize ---
        let (stream1, _) = listener.accept().unwrap();
        let mut socket1 = ws_accept(stream1).unwrap();

        // 1. Read HELLO from client
        let msg1 = socket1.read().unwrap();
        let client_pub_bytes1 = match msg1 {
            WsMessage::Binary(bytes) => bytes,
            _ => panic!("Expected binary HELLO"),
        };

        // Generate mock wallet session keys
        let wallet_priv1 = SecretKey::random(&mut OsRng);
        let wallet_pub1 = wallet_priv1.public_key();
        let wallet_pub_bytes1 = wallet_pub1.to_encoded_point(false);

        // Send HELLO
        socket1.send(WsMessage::Binary(wallet_pub_bytes1.as_bytes().to_vec())).unwrap();

        // Derive AES key
        let client_pub_point1 = PublicKey::from_sec1_bytes(&client_pub_bytes1).unwrap();
        let shared_secret1 = diffie_hellman(wallet_priv1.to_nonzero_scalar(), client_pub_point1.as_affine());
        let shared_secret_bytes1 = shared_secret1.raw_secret_bytes();
        
        let hk1 = Hkdf::<Sha256>::new(Some(&client_pub_bytes1), &shared_secret_bytes1);
        let mut aes_key1 = [0u8; 16];
        hk1.expand(&[], &mut aes_key1).unwrap();

        // 2. Handle Authorize Request
        let msg2 = socket1.read().unwrap();
        let encrypted_payload1 = match msg2 {
            WsMessage::Binary(bytes) => bytes,
            _ => panic!("Expected binary payload"),
        };

        let (seq1, decrypted_auth) = decrypt_payload(&aes_key1, &encrypted_payload1).unwrap();
        assert_eq!(seq1, 1);

        let auth_req: serde_json::Value = serde_json::from_slice(&decrypted_auth).unwrap();
        assert_eq!(auth_req["method"], "authorize");

        // Respond with Authorize Result
        let auth_resp = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "auth_token": "mock_token_12345",
                "accounts": [
                    {
                        "address": "37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B",
                        "label": "Main Wallet"
                    }
                ]
            }
        });

        let auth_resp_payload = serde_json::to_vec(&auth_resp).unwrap();
        let encrypted_auth_resp = encrypt_payload(&aes_key1, 1, &auth_resp_payload).unwrap();
        socket1.send(WsMessage::Binary(encrypted_auth_resp)).unwrap();

        // Connection 1 ends here (socket1 is dropped, closing the connection)
        drop(socket1);

        // --- CONNECTION 2: Reauthorize & Sign ---
        let (stream2, _) = listener.accept().unwrap();
        let mut socket2 = ws_accept(stream2).unwrap();

        // 1. Read HELLO from client
        let msg3 = socket2.read().unwrap();
        let client_pub_bytes2 = match msg3 {
            WsMessage::Binary(bytes) => bytes,
            _ => panic!("Expected binary HELLO"),
        };

        // Generate mock wallet session keys
        let wallet_priv2 = SecretKey::random(&mut OsRng);
        let wallet_pub2 = wallet_priv2.public_key();
        let wallet_pub_bytes2 = wallet_pub2.to_encoded_point(false);

        // Send HELLO
        socket2.send(WsMessage::Binary(wallet_pub_bytes2.as_bytes().to_vec())).unwrap();

        // Derive AES key
        let client_pub_point2 = PublicKey::from_sec1_bytes(&client_pub_bytes2).unwrap();
        let shared_secret2 = diffie_hellman(wallet_priv2.to_nonzero_scalar(), client_pub_point2.as_affine());
        let shared_secret_bytes2 = shared_secret2.raw_secret_bytes();
        
        let hk2 = Hkdf::<Sha256>::new(Some(&client_pub_bytes2), &shared_secret_bytes2);
        let mut aes_key2 = [0u8; 16];
        hk2.expand(&[], &mut aes_key2).unwrap();

        // 2. Handle Reauthorize Request
        let msg4 = socket2.read().unwrap();
        let encrypted_reauth_payload = match msg4 {
            WsMessage::Binary(bytes) => bytes,
            _ => panic!("Expected binary payload"),
        };

        let (seq2, decrypted_reauth) = decrypt_payload(&aes_key2, &encrypted_reauth_payload).unwrap();
        assert_eq!(seq2, 1);

        let reauth_req: serde_json::Value = serde_json::from_slice(&decrypted_reauth).unwrap();
        assert_eq!(reauth_req["method"], "reauthorize");
        assert_eq!(reauth_req["params"]["auth_token"], "mock_token_12345");

        // Respond with success
        let reauth_resp = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "auth_token": "mock_token_12345",
                "accounts": [
                    {
                        "address": "37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B",
                        "label": "Main Wallet"
                    }
                ]
            }
        });
        let reauth_resp_payload = serde_json::to_vec(&reauth_resp).unwrap();
        let encrypted_reauth_resp = encrypt_payload(&aes_key2, 1, &reauth_resp_payload).unwrap();
        socket2.send(WsMessage::Binary(encrypted_reauth_resp)).unwrap();

        // 3. Handle Sign Transactions Request
        let msg5 = socket2.read().unwrap();
        let encrypted_sign_payload = match msg5 {
            WsMessage::Binary(bytes) => bytes,
            _ => panic!("Expected binary payload"),
        };

        let (seq3, decrypted_sign) = decrypt_payload(&aes_key2, &encrypted_sign_payload).unwrap();
        assert_eq!(seq3, 2);

        let sign_req: serde_json::Value = serde_json::from_slice(&decrypted_sign).unwrap();
        assert_eq!(sign_req["method"], "sign_transactions");

        let tx_base64 = sign_req["params"]["transactions"][0].as_str().unwrap();
        let tx_bytes = BASE64.decode(tx_base64).unwrap();

        // Sign the transaction (add signature)
        let mut tx: Transaction = bincode::deserialize(&tx_bytes).unwrap();
        tx.signatures = vec![solana_sdk::signature::Signature::from([5u8; 64])];

        let signed_tx_bytes = bincode::serialize(&tx).unwrap();
        let signed_tx_base64 = BASE64.encode(&signed_tx_bytes);

        let sign_resp = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "result": {
                "signed_transactions": [signed_tx_base64]
            }
        });

        let sign_resp_payload = serde_json::to_vec(&sign_resp).unwrap();
        let encrypted_sign_resp = encrypt_payload(&aes_key2, 2, &sign_resp_payload).unwrap();
        socket2.send(WsMessage::Binary(encrypted_sign_resp)).unwrap();
    }

    #[test]
    fn test_mwa_loopback_e2e() {
        // Bind to a free local port
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        // Spawn mock wallet server
        let server_thread = std::thread::spawn(move || {
            mock_mwa_wallet_server(listener);
        });

        // Initialize session state manually
        let dapp_priv = SecretKey::random(&mut OsRng);
        {
            let mut state = SESSION_STATE.lock().unwrap();
            *state = Some(SessionState {
                dapp_priv,
                port,
            });
        }

        // 1. Execute Authorize Flow
        unsafe {
            let c_cluster = CString::new(format!("ws://127.0.0.1:{}/solana-wallet", port)).unwrap();
            let auth_res = rust_mwa_authorize(c_cluster.as_ptr());
            let auth_str = CStr::from_ptr(auth_res).to_str().unwrap();
            
            let auth_json: serde_json::Value = serde_json::from_str(auth_str).unwrap();
            assert_eq!(auth_json["success"], true);
            assert_eq!(auth_json["publicKey"], "37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B");
            assert_eq!(auth_json["authToken"], "mock_token_12345");
            assert_eq!(auth_json["error"], "");
            
            rust_free_string(auth_res);
        }

        // 2. Execute Sign Flow
        unsafe {
            // Build a dummy Transaction to sign
            let program_id = Pubkey::new_from_array([1u8; 32]);
            let instruction = Instruction {
                program_id,
                accounts: vec![],
                data: vec![1, 2, 3],
            };
            let message = Message::new(&[instruction], None);
            let transaction = Transaction::new_unsigned(message);
            let tx_bytes = bincode::serialize(&transaction).unwrap();
            let tx_hex = to_hex_string(&tx_bytes);

            let c_cluster = CString::new(format!("ws://127.0.0.1:{}/solana-wallet", port)).unwrap();
            let c_tx_hex = CString::new(tx_hex).unwrap();
            let c_auth_token = CString::new("mock_token_12345").unwrap();

            let sign_res = rust_mwa_sign_transactions(
                c_cluster.as_ptr(),
                c_tx_hex.as_ptr(),
                c_auth_token.as_ptr(),
            );
            let sign_str = CStr::from_ptr(sign_res).to_str().unwrap();
            let sign_json: serde_json::Value = serde_json::from_str(sign_str).unwrap();
            
            assert_eq!(sign_json["success"], true);
            assert!(sign_json["signature"].as_str().unwrap().len() > 0);
            assert!(sign_json["signedTxHex"].as_str().unwrap().len() > 0);
            assert_eq!(sign_json["error"], "");

            rust_free_string(sign_res);
        }

        server_thread.join().unwrap();
    }
}
