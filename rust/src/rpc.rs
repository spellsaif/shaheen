use serde::{Deserialize, Serialize};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

use crate::error::{Result, ShaheenError};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JsonRpcRequest<T> {
    pub jsonrpc: &'static str,
    pub id: u64,
    pub method: String,
    pub params: T,
}

impl<T: Serialize> JsonRpcRequest<T> {
    pub fn new(id: u64, method: impl Into<String>, params: T) -> Self {
        Self {
            jsonrpc: "2.0",
            id,
            method: method.into(),
            params,
        }
    }

    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        serde_json::to_vec(self).map_err(ShaheenError::from)
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JsonRpcResponse<T> {
    pub jsonrpc: String,
    pub id: u64,
    pub result: Option<T>,
    pub error: Option<JsonRpcError>,
}

impl<T: for<'de> Deserialize<'de>> JsonRpcResponse<T> {
    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        serde_json::from_slice(bytes).map_err(ShaheenError::from)
    }

    pub fn into_result(self) -> Result<T> {
        if let Some(err) = self.error {
            return Err(ShaheenError::RpcError {
                code: err.code,
                message: err.message,
            });
        }
        self.result
            .ok_or_else(|| ShaheenError::ProtocolError("Empty JSON-RPC result".to_string()))
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

// --- MWA Identity & Authorize ---

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct DappIdentity {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct AuthorizeParams {
    pub identity: DappIdentity,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chain: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub features: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub addresses: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sign_in_payload: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AuthorizedAccount {
    pub address: String, // base64 encoded public key
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_address: Option<String>, // base58 formatted string
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_address_format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chains: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub features: Option<Vec<String>>,
}

impl AuthorizedAccount {
    /// Returns the standard 32-byte Solana public key encoded in Base58.
    /// MWA returns base64 `address`. If `display_address` is provided, returns that.
    /// Otherwise, decodes the 32-byte base64 address and formats it as Base58.
    pub fn to_base58_address(&self) -> Result<String> {
        if let Some(ref disp) = self.display_address {
            return Ok(disp.clone());
        }

        let raw_pubkey = BASE64
            .decode(&self.address)
            .map_err(|e| ShaheenError::InvalidAddress(format!("Base64 decode failed: {}", e)))?;

        if raw_pubkey.len() != 32 {
            return Err(ShaheenError::InvalidAddress(format!(
                "Invalid Solana public key length: expected 32 bytes, got {}",
                raw_pubkey.len()
            )));
        }

        Ok(bs58::encode(&raw_pubkey).into_string())
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AuthorizeResult {
    pub auth_token: String,
    pub accounts: Vec<AuthorizedAccount>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wallet_uri_base: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wallet_icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sign_in_result: Option<serde_json::Value>,
}

// --- Deauthorize ---

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DeauthorizeParams {
    pub auth_token: String,
}

// --- Get Capabilities ---

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct GetCapabilitiesParams {}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GetCapabilitiesResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_transactions_per_request: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_messages_per_request: Option<u32>,
    #[serde(default)]
    pub supported_transaction_versions: Vec<serde_json::Value>,
    #[serde(default)]
    pub features: Vec<String>,
}

// --- Sign and Send Transactions ---

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct SendOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_context_slot: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commitment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skip_preflight: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_retries: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wait_for_commitment_to_send_next_transaction: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignAndSendTransactionsParams {
    pub payloads: Vec<String>, // base64 encoded transactions
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<SendOptions>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignAndSendTransactionsResult {
    pub signatures: Vec<String>, // base64 encoded signatures
}

// --- Sign Messages ---

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignMessagesParams {
    pub addresses: Vec<String>, // base64 encoded addresses
    pub payloads: Vec<String>,  // base64 encoded messages
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignMessagesResult {
    pub signed_payloads: Vec<String>, // base64 encoded signed payloads
}

// --- Sign Transactions (Deprecated MWA 1.0 method) ---

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignTransactionsParams {
    pub payloads: Vec<String>, // base64 encoded transactions
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignTransactionsResult {
    pub signed_payloads: Vec<String>, // base64 encoded signed transactions
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_authorize_request_serialization() {
        let params = AuthorizeParams {
            identity: DappIdentity {
                uri: Some("https://shaheen.dev".to_string()),
                icon: Some("icon.png".to_string()),
                name: Some("Shaheen App".to_string()),
            },
            chain: Some("solana:mainnet".to_string()),
            ..Default::default()
        };

        let req = JsonRpcRequest::new(1, "authorize", params);
        let bytes = req.to_bytes().unwrap();
        let json_str = String::from_utf8(bytes).unwrap();

        assert!(json_str.contains("\"method\":\"authorize\""));
        assert!(json_str.contains("\"chain\":\"solana:mainnet\""));
        assert!(json_str.contains("\"name\":\"Shaheen App\""));
    }

    #[test]
    fn test_authorized_account_pubkey_conversion() {
        // Valid 32-byte Ed25519 Solana pubkey (System Program: 11111111111111111111111111111111)
        let system_program_bytes = [0u8; 32];
        let base64_pubkey = BASE64.encode(system_program_bytes);

        let account = AuthorizedAccount {
            address: base64_pubkey,
            display_address: None,
            display_address_format: None,
            label: Some("System".to_string()),
            icon: None,
            chains: None,
            features: None,
        };

        let base58_addr = account.to_base58_address().unwrap();
        assert_eq!(base58_addr, "11111111111111111111111111111111");
    }
}
