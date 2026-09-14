use shaheen_core::crypto::{decrypt_mwa_message, encrypt_mwa_message, SessionKey};
use shaheen_core::handshake::{build_hello_req, verify_hello_req, DappEphemeralKeypair};
use shaheen_core::association::AssociationKeypair;
use shaheen_core::sequence::SequenceTracker;
use shaheen_core::rpc::{AuthorizedAccount, DappIdentity, AuthorizeParams, JsonRpcRequest};
use base64::Engine;


#[test]
fn test_fuzz_truncated_and_malformed_frames() {
    let key = SessionKey::new([0x42; 16]);

    // Less than 32 bytes (minimum MWA frame size)
    assert!(decrypt_mwa_message(&key, &[]).is_err());
    assert!(decrypt_mwa_message(&key, &[0u8; 1]).is_err());
    assert!(decrypt_mwa_message(&key, &[0u8; 15]).is_err());
    assert!(decrypt_mwa_message(&key, &[0u8; 31]).is_err());

    // Exactly 32 bytes with zeroed tag (invalid authentication tag)
    assert!(decrypt_mwa_message(&key, &[0u8; 32]).is_err());
}

#[test]
fn test_corrupted_iv_causes_decryption_failure() {
    let key = SessionKey::new([0x77; 16]);
    let plaintext = b"test transaction";

    let mut frame = encrypt_mwa_message(&key, 1, plaintext).unwrap();
    // Corrupt an IV byte (bytes 4..16)
    frame[5] ^= 0xFF;

    assert!(decrypt_mwa_message(&key, &frame).is_err(), "Flipped IV bit must fail GCM authentication");
}

#[test]
fn test_corrupted_tag_causes_decryption_failure() {
    let key = SessionKey::new([0x88; 16]);
    let plaintext = b"test transaction";

    let mut frame = encrypt_mwa_message(&key, 1, plaintext).unwrap();
    let len = frame.len();
    // Corrupt tag (last 16 bytes)
    frame[len - 1] ^= 0x01;

    assert!(decrypt_mwa_message(&key, &frame).is_err(), "Flipped Tag bit must fail GCM authentication");
}

#[test]
fn test_invalid_sec1_public_key_rejection() {
    let assoc = AssociationKeypair::generate().unwrap();
    let dapp_ephemeral = DappEphemeralKeypair::generate().unwrap();

    // Valid HELLO_REQ
    let mut hello_req = build_hello_req(&assoc, &dapp_ephemeral).unwrap();

    // Corrupt the first byte of Qd (must be 0x04 for uncompressed SEC1)
    hello_req[0] = 0x02; // Compressed point tag instead of uncompressed 0x04
    assert!(verify_hello_req(&assoc.public_key_bytes, &hello_req).is_err());

    // Invalid coordinates
    hello_req[0] = 0x04;
    hello_req[1] = 0xFF; // Not a valid point on NIST P-256 curve
    assert!(verify_hello_req(&assoc.public_key_bytes, &hello_req).is_err());
}

#[test]
fn test_sequence_tracker_adversarial_patterns() {
    let mut tracker = SequenceTracker::new();

    // 1. Initial sequence must be 1
    assert!(tracker.validate_and_update_recv(0).is_err());
    assert!(tracker.validate_and_update_recv(2).is_err());
    assert!(tracker.validate_and_update_recv(100).is_err());
    assert!(tracker.validate_and_update_recv(1).is_ok());

    // 2. Cannot repeat sequence 1
    assert!(tracker.validate_and_update_recv(1).is_err());

    // 3. Next must be 2
    assert!(tracker.validate_and_update_recv(3).is_err());
    assert!(tracker.validate_and_update_recv(2).is_ok());

    // 4. Cannot decrement or replay
    assert!(tracker.validate_and_update_recv(1).is_err());
    assert!(tracker.validate_and_update_recv(2).is_err());

    // 5. Normal increment
    assert!(tracker.validate_and_update_recv(3).is_ok());
    assert!(tracker.validate_and_update_recv(4).is_ok());
}

#[test]
fn test_caip2_chain_identifiers_and_silent_auth() {
    // Test Devnet legacy payload (Phantom): only cluster sent, chain is omitted
    let devnet_params = AuthorizeParams {
        identity: DappIdentity {
            name: Some("Devnet Dapp".to_string()),
            uri: None,
            icon: None,
        },
        cluster: Some("devnet".to_string()),
        auth_token: Some("existing_token_xyz".to_string()),
        ..Default::default()
    };

    let devnet_req = JsonRpcRequest::new(1, "authorize", devnet_params);
    let bytes = devnet_req.to_bytes().unwrap();
    let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();

    assert_eq!(json["params"]["cluster"], "devnet");
    assert!(json["params"].get("chain").is_none());
    assert_eq!(json["params"]["auth_token"], "existing_token_xyz");

    // Test Modern MWA 2.0 payload (Solflare): only chain sent, cluster is omitted
    let modern_params = AuthorizeParams {
        identity: DappIdentity::default(),
        chain: Some("solana:devnet".to_string()),
        ..Default::default()
    };
    let modern_req = JsonRpcRequest::new(2, "authorize", modern_params);
    let json_modern: serde_json::Value = serde_json::from_slice(&modern_req.to_bytes().unwrap()).unwrap();
    assert_eq!(json_modern["params"]["chain"], "solana:devnet");
    assert!(json_modern["params"].get("cluster").is_none());
}

#[test]
fn test_base58_solana_pubkey_validation() {
    // 32-byte known pubkey
    let bytes = [1u8; 32];
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);

    let account = AuthorizedAccount {
        address: b64,
        display_address: None,
        display_address_format: None,
        label: None,
        icon: None,
        chains: None,
        features: None,
    };

    let b58 = account.to_base58_address().unwrap();
    // Decoding back from base58 must yield original 32 bytes
    let decoded_b58 = bs58::decode(b58).into_vec().unwrap();
    assert_eq!(decoded_b58, bytes);
}

#[test]
fn test_legacy_cluster_validation_and_unsupported_rejection() {
    let mut session = shaheen_core::session::MwaSession::new(None).unwrap();
    // In Created state, authorize returns error
    let err = session.authorize(
        DappIdentity::default(),
        Some("solana:localnet".to_string()),
        None,
    );
    assert!(err.is_err());
}

