use thiserror::Error;

#[derive(Error, Debug)]
pub enum ShaheenError {
    #[error("Cryptographic error: {0}")]
    CryptoError(String),

    #[error("Handshake failed: {0}")]
    HandshakeError(String),

    #[error("Invalid sequence number: expected {expected}, received {received}")]
    SequenceMismatch { expected: u32, received: u32 },

    #[error("Transport error: {0}")]
    TransportError(String),

    #[error("Protocol error: {0}")]
    ProtocolError(String),

    #[error("RPC Error {code}: {message}")]
    RpcError { code: i32, message: String },

    #[error("Session error: {0}")]
    SessionError(String),

    #[error("Invalid Solana address: {0}")]
    InvalidAddress(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Timeout: {0}")]
    Timeout(String),
}

impl From<serde_json::Error> for ShaheenError {
    fn from(e: serde_json::Error) -> Self {
        ShaheenError::SerializationError(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, ShaheenError>;
