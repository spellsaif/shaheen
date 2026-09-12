use std::time::Instant;
use shaheen_core::crypto::{derive_session_key, encrypt_mwa_message, decrypt_mwa_message, SessionKey};
use shaheen_core::association::AssociationKeypair;
use shaheen_core::handshake::{build_hello_req, verify_hello_req, DappEphemeralKeypair};
use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::SecretKey;
use rand::rngs::OsRng;

fn main() {
    println!("============================================================");
    println!("   SHAHEEN MWA 2.0 EMPIRICAL CRYPTOGRAPHIC BENCHMARKS       ");
    println!("============================================================");

    const ITERATIONS: u32 = 1000;

    // 1. Benchmark Association Keypair Generation
    let start = Instant::now();
    for _ in 0..ITERATIONS {
        let _ = AssociationKeypair::generate().unwrap();
    }
    let duration = start.elapsed();
    let avg_assoc_us = duration.as_secs_f64() * 1_000_000.0 / (ITERATIONS as f64);
    println!("1. Association Keypair Gen (P-256): {:>8.2} µs / op ({} iterations)", avg_assoc_us, ITERATIONS);

    // 2. Benchmark HELLO_REQ Building (ECDSA-SHA256 Signature over Qd)
    let assoc = AssociationKeypair::generate().unwrap();
    let dapp_ephemeral = DappEphemeralKeypair::generate().unwrap();
    let start = Instant::now();
    for _ in 0..ITERATIONS {
        let _ = build_hello_req(&assoc, &dapp_ephemeral).unwrap();
    }
    let duration = start.elapsed();
    let avg_hello_req_us = duration.as_secs_f64() * 1_000_000.0 / (ITERATIONS as f64);
    println!("2. HELLO_REQ (ECDSA-SHA256 Sign):   {:>8.2} µs / op ({} iterations)", avg_hello_req_us, ITERATIONS);

    // 3. Benchmark HELLO_REQ Verification (ECDSA-SHA256 Verify)
    let hello_req = build_hello_req(&assoc, &dapp_ephemeral).unwrap();
    let start = Instant::now();
    for _ in 0..ITERATIONS {
        let _ = verify_hello_req(&assoc.public_key_bytes, &hello_req).unwrap();
    }
    let duration = start.elapsed();
    let avg_verify_us = duration.as_secs_f64() * 1_000_000.0 / (ITERATIONS as f64);
    println!("3. HELLO_REQ (ECDSA-SHA256 Verify): {:>8.2} µs / op ({} iterations)", avg_verify_us, ITERATIONS);

    // 4. Benchmark ECDH + HKDF-SHA256 Session Key Derivation
    let wallet_priv = SecretKey::random(&mut OsRng);
    let wallet_pub = wallet_priv.public_key();
    let wallet_pub_bytes = wallet_pub.to_encoded_point(false);
    let dapp_priv = dapp_ephemeral.secret_key().unwrap();
    let start = Instant::now();
    for _ in 0..ITERATIONS {
        let _ = derive_session_key(&dapp_priv, wallet_pub_bytes.as_bytes(), &assoc.public_key_bytes).unwrap();
    }
    let duration = start.elapsed();
    let avg_ecdh_us = duration.as_secs_f64() * 1_000_000.0 / (ITERATIONS as f64);
    println!("4. Session Key Derivation (ECDH+HKDF):{:>7.2} µs / op ({} iterations)", avg_ecdh_us, ITERATIONS);

    // 5. Benchmark AES-128-GCM Payload Encryption (Typical Solana Transaction ~300 bytes)
    let session_key = SessionKey::new([0x55; 16]);
    let tx_payload = vec![0xAB; 300];
    let start = Instant::now();
    for seq in 1..=ITERATIONS {
        let _ = encrypt_mwa_message(&session_key, seq, &tx_payload).unwrap();
    }
    let duration = start.elapsed();
    let avg_encrypt_us = duration.as_secs_f64() * 1_000_000.0 / (ITERATIONS as f64);
    println!("5. AES-128-GCM Encrypt (300B Tx):   {:>8.2} µs / op ({} iterations)", avg_encrypt_us, ITERATIONS);

    // 6. Benchmark AES-128-GCM Payload Decryption
    let encrypted_frame = encrypt_mwa_message(&session_key, 1, &tx_payload).unwrap();
    let start = Instant::now();
    for _ in 0..ITERATIONS {
        let _ = decrypt_mwa_message(&session_key, &encrypted_frame).unwrap();
    }
    let duration = start.elapsed();
    let avg_decrypt_us = duration.as_secs_f64() * 1_000_000.0 / (ITERATIONS as f64);
    println!("6. AES-128-GCM Decrypt (300B Tx):   {:>8.2} µs / op ({} iterations)", avg_decrypt_us, ITERATIONS);

    println!("============================================================");
}
