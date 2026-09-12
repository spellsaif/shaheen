use shaheen_core::crypto::{decrypt_mwa_message, encrypt_mwa_message, SessionKey};
use shaheen_core::session::SessionManager;
use shaheen_core::association::AssociationKeypair;
use shaheen_core::handshake::{build_hello_req, verify_hello_req, DappEphemeralKeypair};

#[test]
fn test_rfc_5869_hkdf_sha256_standard_vector() {
    use hkdf::Hkdf;
    use sha2::Sha256;

    // RFC 5869 Test Case 1
    let ikm = hex::decode("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b").unwrap();
    let salt = hex::decode("000102030405060708090a0b0c").unwrap();
    let info = hex::decode("f0f1f2f3f4f5f6f7f8f9").unwrap();
    let expected_okm = hex::decode("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865").unwrap();


    let hk = Hkdf::<Sha256>::new(Some(&salt), &ikm);
    let mut okm = vec![0u8; 42];
    hk.expand(&info, &mut okm).unwrap();

    assert_eq!(okm, expected_okm[0..42]);
}

#[test]
fn test_concurrent_independent_sessions() {
    let manager = SessionManager::new();

    // Create 5 concurrent sessions
    let mut session_ids = Vec::new();
    for i in 0..5 {
        let (id, uri) = manager.create_session(Some(50000 + i)).unwrap();
        assert!(uri.uri.contains(&format!("port={}", 50000 + i)));
        assert!(uri.uri.contains("v=2"));
        session_ids.push(id);
    }

    // Verify all 5 sessions exist independently with distinct keys
    let mut assoc_tokens = Vec::new();
    for id in &session_ids {
        manager.with_session(id, |session| {
            assoc_tokens.push(session.association_uri.association_token.clone());
            Ok(())
        }).unwrap();
    }

    // Ensure all association tokens are unique
    for i in 0..assoc_tokens.len() {
        for j in (i + 1)..assoc_tokens.len() {
            assert_ne!(assoc_tokens[i], assoc_tokens[j], "Association tokens must be unique per session");
        }
    }

    // Close session 2
    manager.close_session(&session_ids[2]).unwrap();

    // Verify session 2 is gone, but sessions 0, 1, 3, 4 are still intact
    assert!(manager.with_session(&session_ids[2], |_| Ok(())).is_err());
    assert!(manager.with_session(&session_ids[0], |_| Ok(())).is_ok());
    assert!(manager.with_session(&session_ids[1], |_| Ok(())).is_ok());
    assert!(manager.with_session(&session_ids[3], |_| Ok(())).is_ok());
    assert!(manager.with_session(&session_ids[4], |_| Ok(())).is_ok());
}

#[test]
fn test_mwa_hello_req_format_and_tamper_rejection() {
    let assoc = AssociationKeypair::generate().unwrap();
    let dapp_ephemeral = DappEphemeralKeypair::generate().unwrap();

    let mut hello_req = build_hello_req(&assoc, &dapp_ephemeral).unwrap();
    assert_eq!(hello_req.len(), 129);

    // Valid verification
    let verified = verify_hello_req(&assoc.public_key_bytes, &hello_req);
    assert!(verified.is_ok());

    // Tampering with the ephemeral public key Qd should cause signature verification failure
    hello_req[10] ^= 0x55;
    let tampered_result = verify_hello_req(&assoc.public_key_bytes, &hello_req);
    assert!(tampered_result.is_err(), "Tampered Qd must be rejected by ECDSA verification");
}

#[test]
fn test_sequence_aad_spoofing_defense() {
    let key = SessionKey::new([0x33; 16]);
    let plaintext = b"critical transaction payload";

    // Frame encrypted with sequence 10
    let mut frame = encrypt_mwa_message(&key, 10, plaintext).unwrap();

    // Adversary attempts to replay the message with modified sequence number 11 in the header
    let forged_seq = 11u32.to_be_bytes();
    frame[0..4].copy_from_slice(&forged_seq);

    // Decryption must fail because AES-GCM authenticates the sequence in AAD!
    let decrypt_res = decrypt_mwa_message(&key, &frame);
    assert!(decrypt_res.is_err(), "Manipulated sequence AAD must fail authentication");
}
