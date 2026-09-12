use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::SecretKey;
use rand::rngs::OsRng;
use rand::Rng;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use zeroize::{Zeroize, ZeroizeOnDrop};

use crate::error::{Result, ShaheenError};

/// Association keypair used to generate the association URI and authenticate
/// the dapp during the MWA handshake.
///
/// Under MWA 2.0:
/// - Qa is the X9.62 uncompressed 65-byte public key point (0x04 || X || Y).
/// - The association token is base64url(Qa).
/// - da (the private key) signs the ephemeral ECDH key Qd during HELLO_REQ.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct AssociationKeypair {
    #[zeroize(skip)]
    pub public_key_bytes: [u8; 65],
    private_key_bytes: [u8; 32],
}

impl AssociationKeypair {
    /// Generates a new random P-256 association keypair.
    pub fn generate() -> Result<Self> {
        let secret = SecretKey::random(&mut OsRng);
        let public = secret.public_key();
        let encoded_point = public.to_encoded_point(false);
        let pub_bytes = encoded_point.as_bytes();

        if pub_bytes.len() != 65 {
            return Err(ShaheenError::CryptoError(format!(
                "Unexpected public key length: expected 65, got {}",
                pub_bytes.len()
            )));
        }

        let mut public_key_bytes = [0u8; 65];
        public_key_bytes.copy_from_slice(pub_bytes);

        let mut private_key_bytes = [0u8; 32];
        private_key_bytes.copy_from_slice(&secret.to_bytes());

        Ok(Self {
            public_key_bytes,
            private_key_bytes,
        })
    }

    /// Reconstructs the SecretKey for ECDSA signing.
    pub fn secret_key(&self) -> Result<SecretKey> {
        SecretKey::from_slice(&self.private_key_bytes)
            .map_err(|e| ShaheenError::CryptoError(format!("Invalid secret key bytes: {}", e)))
    }

    /// Returns the base64url-encoded association token without padding.
    pub fn association_token(&self) -> String {
        URL_SAFE_NO_PAD.encode(self.public_key_bytes)
    }
}

/// Details of an association needed by the dApp to launch the wallet intent.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct AssociationUri {
    pub uri: String,
    pub port: u16,
    pub association_token: String,
}

impl AssociationUri {
    /// Builds an association URI conforming to MWA 2.0 specification:
    /// `solana-wallet:/v1/associate/local?association=<token>&port=<port>&v=2`
    pub fn build(keypair: &AssociationKeypair, port: Option<u16>) -> Self {
        let token = keypair.association_token();
        let port_number = port.unwrap_or_else(|| {
            let mut rng = rand::thread_rng();
            rng.gen_range(49152..=65535)
        });

        let uri = format!(
            "solana-wallet:/v1/associate/local?association={}&port={}&v=2",
            token, port_number
        );

        Self {
            uri,
            port: port_number,
            association_token: token,
        }
    }
}
