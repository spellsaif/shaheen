use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes128Gcm, Nonce};
use hkdf::Hkdf;
use p256::ecdh::diffie_hellman;
use p256::{PublicKey, SecretKey};
use rand::Rng;

use sha2::Sha256;
use zeroize::{Zeroize, ZeroizeOnDrop};

use crate::error::{Result, ShaheenError};

/// Wrapper around the 16-byte derived AES-128 key that scrubs its memory on drop.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct SessionKey {
    key: [u8; 16],
}

impl SessionKey {
    pub fn new(key: [u8; 16]) -> Self {
        Self { key }
    }

    pub fn as_bytes(&self) -> &[u8; 16] {
        &self.key
    }
}

/// Derives the 16-byte AES-128 session key using ECDH and HKDF-SHA256 as mandated by MWA 2.0:
/// - ikm: 32-byte ECDH shared secret between dapp ephemeral private key and wallet ephemeral public key
/// - salt: 65-byte uncompressed X9.62 association public key Qa
/// - info: empty
/// - L: 16 bytes
pub fn derive_session_key(
    dapp_ephemeral_priv: &SecretKey,
    wallet_ephemeral_pub_bytes: &[u8],
    association_pub_bytes: &[u8; 65],
) -> Result<SessionKey> {
    let wallet_point = PublicKey::from_sec1_bytes(wallet_ephemeral_pub_bytes)
        .map_err(|e| ShaheenError::CryptoError(format!("Invalid wallet public key: {}", e)))?;

    let shared_secret = diffie_hellman(
        dapp_ephemeral_priv.to_nonzero_scalar(),
        wallet_point.as_affine(),
    );
    let shared_secret_bytes = *shared_secret.raw_secret_bytes();

    let hk = Hkdf::<Sha256>::new(Some(association_pub_bytes), &shared_secret_bytes);
    let mut aes_key = [0u8; 16];
    hk.expand(&[], &mut aes_key)
        .map_err(|e| ShaheenError::CryptoError(format!("HKDF expand failed: {}", e)))?;

    Ok(SessionKey::new(aes_key))

}

/// Encrypts plaintext into MWA wire format:
/// `[sequence (4 bytes)] || [IV (12 bytes)] || [ciphertext + 16-byte tag]`
/// with the 4-byte sequence number passed as Additional Authenticated Data (AAD).
pub fn encrypt_mwa_message(
    session_key: &SessionKey,
    sequence: u32,
    plaintext: &[u8],
) -> Result<Vec<u8>> {
    let cipher = Aes128Gcm::new_from_slice(session_key.as_bytes())
        .map_err(|e| ShaheenError::CryptoError(format!("AES-GCM init failed: {}", e)))?;

    let mut iv = [0u8; 12];
    rand::thread_rng().fill(&mut iv);
    let nonce = Nonce::from_slice(&iv);

    let seq_bytes = sequence.to_be_bytes();
    let payload = Payload {
        msg: plaintext,
        aad: &seq_bytes,
    };

    let ciphertext_with_tag = cipher
        .encrypt(nonce, payload)
        .map_err(|e| ShaheenError::CryptoError(format!("AES-GCM encryption failed: {}", e)))?;

    let mut frame = Vec::with_capacity(4 + 12 + ciphertext_with_tag.len());
    frame.extend_from_slice(&seq_bytes);
    frame.extend_from_slice(&iv);
    frame.extend_from_slice(&ciphertext_with_tag);

    Ok(frame)
}

/// Decrypts an incoming MWA wire frame:
/// Validates frame length >= 32, extracts sequence and IV, checks authentication tag over
/// ciphertext and sequence AAD, and returns `(sequence, plaintext)`.
pub fn decrypt_mwa_message(session_key: &SessionKey, frame: &[u8]) -> Result<(u32, Vec<u8>)> {
    if frame.len() < 32 {
        return Err(ShaheenError::CryptoError(format!(
            "MWA frame too short: minimum 32 bytes required, got {}",
            frame.len()
        )));
    }

    let seq_bytes: [u8; 4] = frame[0..4]
        .try_into()
        .map_err(|_| ShaheenError::CryptoError("Failed to parse sequence bytes".to_string()))?;
    let sequence = u32::from_be_bytes(seq_bytes);

    let iv: [u8; 12] = frame[4..16]
        .try_into()
        .map_err(|_| ShaheenError::CryptoError("Failed to parse IV bytes".to_string()))?;
    let nonce = Nonce::from_slice(&iv);

    let ciphertext_with_tag = &frame[16..];

    let cipher = Aes128Gcm::new_from_slice(session_key.as_bytes())
        .map_err(|e| ShaheenError::CryptoError(format!("AES-GCM init failed: {}", e)))?;

    let payload = Payload {
        msg: ciphertext_with_tag,
        aad: &seq_bytes,
    };

    let plaintext = cipher
        .decrypt(nonce, payload)
        .map_err(|_| ShaheenError::CryptoError("AES-GCM decryption failed (tag mismatch or corrupted ciphertext)".to_string()))?;

    Ok((sequence, plaintext))
}

#[cfg(test)]
mod tests {
    use super::*;
    use p256::elliptic_curve::sec1::ToEncodedPoint;
    use rand::rngs::OsRng;


    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = SessionKey::new([42u8; 16]);
        let sequence = 1u32;
        let plaintext = b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"authorize\"}";

        let encrypted = encrypt_mwa_message(&key, sequence, plaintext).unwrap();
        assert_eq!(&encrypted[0..4], &sequence.to_be_bytes());

        let (dec_seq, decrypted) = decrypt_mwa_message(&key, &encrypted).unwrap();
        assert_eq!(dec_seq, sequence);
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_tampered_sequence_fails_decryption() {
        let key = SessionKey::new([7u8; 16]);
        let sequence = 5u32;
        let plaintext = b"secure payload";

        let mut encrypted = encrypt_mwa_message(&key, sequence, plaintext).unwrap();

        // Tamper with sequence number in ciphertext header
        encrypted[3] ^= 0x01;

        // Decryption must fail because AAD will not match the tag!
        let result = decrypt_mwa_message(&key, &encrypted);
        assert!(result.is_err());
    }

    #[test]
    fn test_tampered_ciphertext_fails_decryption() {
        let key = SessionKey::new([9u8; 16]);
        let sequence = 2u32;
        let plaintext = b"another payload";

        let mut encrypted = encrypt_mwa_message(&key, sequence, plaintext).unwrap();

        // Tamper with ciphertext byte
        let len = encrypted.len();
        encrypted[len - 1] ^= 0xFF;

        let result = decrypt_mwa_message(&key, &encrypted);
        assert!(result.is_err());
    }

    #[test]
    fn test_ecdh_and_hkdf_derivation() {
        let dapp_priv = SecretKey::random(&mut OsRng);
        let wallet_priv = SecretKey::random(&mut OsRng);

        let dapp_pub = dapp_priv.public_key();
        let dapp_pub_bytes = dapp_pub.to_encoded_point(false);

        let wallet_pub = wallet_priv.public_key();
        let wallet_pub_bytes = wallet_pub.to_encoded_point(false);

        let assoc_priv = SecretKey::random(&mut OsRng);
        let assoc_pub = assoc_priv.public_key();
        let assoc_pub_bytes: [u8; 65] = assoc_pub.to_encoded_point(false).as_bytes().try_into().unwrap();

        // Dapp derives key
        let dapp_session_key = derive_session_key(
            &dapp_priv,
            wallet_pub_bytes.as_bytes(),
            &assoc_pub_bytes,
        ).unwrap();

        // Wallet derives key
        let wallet_point = PublicKey::from_sec1_bytes(dapp_pub_bytes.as_bytes()).unwrap();
        let shared_secret = diffie_hellman(
            wallet_priv.to_nonzero_scalar(),
            wallet_point.as_affine(),
        );
        let hk = Hkdf::<Sha256>::new(Some(&assoc_pub_bytes), shared_secret.raw_secret_bytes());
        let mut wallet_aes_key = [0u8; 16];
        hk.expand(&[], &mut wallet_aes_key).unwrap();

        // Both derived keys MUST match!
        assert_eq!(dapp_session_key.as_bytes(), &wallet_aes_key);
    }
}
