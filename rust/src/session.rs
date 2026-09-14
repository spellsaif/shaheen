use std::collections::HashMap;
use std::sync::Mutex;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use uuid::Uuid;

use crate::association::{AssociationKeypair, AssociationUri};
use crate::crypto::{decrypt_mwa_message, encrypt_mwa_message, SessionKey};
use crate::error::{Result, ShaheenError};
use crate::handshake::{build_hello_req, process_hello_rsp, DappEphemeralKeypair};
use crate::rpc::{
    AuthorizeParams, AuthorizeResult, AuthorizedAccount, DappIdentity, DeauthorizeParams,
    GetCapabilitiesParams, GetCapabilitiesResult, JsonRpcRequest, JsonRpcResponse, SendOptions,
    SignAndSendTransactionsParams, SignAndSendTransactionsResult, SignMessagesParams,
    SignMessagesResult, SignTransactionsParams, SignTransactionsResult,
};
use crate::sequence::SequenceTracker;
use crate::transport::{Transport, WebSocketTransport};

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum SessionState {
    Created,
    Connecting,
    Handshaking,
    Established,
    Authorized,
    Closed,
}

/// A stateful MWA session managing cryptographic keys, sequence counters,
/// transport, and RPC exchanges.
pub struct MwaSession {
    pub id: String,
    pub state: SessionState,
    pub association: AssociationKeypair,
    pub association_uri: AssociationUri,
    dapp_ephemeral: Option<DappEphemeralKeypair>,
    transport: Option<Box<dyn Transport>>,
    session_key: Option<SessionKey>,
    sequence_tracker: SequenceTracker,
    pub auth_token: Option<String>,
    pub accounts: Vec<AuthorizedAccount>,
    pub negotiated_version: Option<String>,
    next_rpc_id: u64,
}

impl MwaSession {
    /// Creates a new uninitialized session with a fresh Association Keypair.
    pub fn new(port: Option<u16>) -> Result<Self> {
        let association = AssociationKeypair::generate()?;
        let association_uri = AssociationUri::build(&association, port);
        let id = Uuid::new_v4().to_string();

        Ok(Self {
            id,
            state: SessionState::Created,
            association,
            association_uri,
            dapp_ephemeral: None,
            transport: None,
            session_key: None,
            sequence_tracker: SequenceTracker::new(),
            auth_token: None,
            accounts: Vec::new(),
            negotiated_version: None,
            next_rpc_id: 1,
        })
    }

    /// Connects to the wallet WebSocket and performs the full MWA 2.0 handshake:
    /// 1. Sends binary HELLO_REQ = Qd || Sa.
    /// 2. Receives and verifies HELLO_RSP = Qw || session_props.
    /// 3. Derives the AES-128 session key via HKDF with Qa as salt.
    pub fn connect_and_handshake(&mut self, ws_url: &str, timeout_secs: u64) -> Result<()> {
        if self.state == SessionState::Closed {
            return Err(ShaheenError::SessionError("Session is already closed".to_string()));
        }

        self.state = SessionState::Connecting;
        let mut transport = WebSocketTransport::connect(ws_url, timeout_secs)?;

        self.state = SessionState::Handshaking;
        let dapp_ephemeral = DappEphemeralKeypair::generate()?;
        let hello_req = build_hello_req(&self.association, &dapp_ephemeral)?;

        // Send HELLO_REQ
        transport.send_frame(&hello_req)?;

        // Receive HELLO_RSP
        let hello_rsp = transport.receive_frame()?;

        // Process HELLO_RSP
        let handshake_res = process_hello_rsp(
            &self.association.public_key_bytes,
            &dapp_ephemeral,
            &hello_rsp,
        )?;

        self.transport = Some(Box::new(transport));
        self.dapp_ephemeral = Some(dapp_ephemeral);
        self.session_key = Some(handshake_res.session_key);
        self.sequence_tracker = handshake_res.sequence_tracker;
        self.negotiated_version = handshake_res.negotiated_version;
        self.state = SessionState::Established;

        Ok(())
    }

    /// Sends an encrypted JSON-RPC request and returns the decrypted response payload.
    fn rpc_call<Req: serde::Serialize, Resp: for<'de> serde::Deserialize<'de>>(
        &mut self,
        method: &str,
        params: Req,
    ) -> Result<Resp> {
        let session_key = self
            .session_key
            .as_ref()
            .ok_or_else(|| ShaheenError::SessionError("Session encryption key not established".to_string()))?;

        let transport = self
            .transport
            .as_mut()
            .ok_or_else(|| ShaheenError::SessionError("Transport not connected".to_string()))?;

        let rpc_id = self.next_rpc_id;
        self.next_rpc_id += 1;

        let request = JsonRpcRequest::new(rpc_id, method, params);
        let request_bytes = request.to_bytes()?;

        // Encrypt with outbound sequence counter
        let send_seq = self.sequence_tracker.next_send_sequence();
        let encrypted_frame = encrypt_mwa_message(session_key, send_seq, &request_bytes)?;

        transport.send_frame(&encrypted_frame)?;

        // Receive encrypted response
        let resp_frame = transport.receive_frame()?;

        // Decrypt and validate inbound sequence number
        let (recv_seq, decrypted_bytes) = decrypt_mwa_message(session_key, &resp_frame)?;
        self.sequence_tracker.validate_and_update_recv(recv_seq)?;

        let rpc_response: JsonRpcResponse<Resp> = JsonRpcResponse::from_bytes(&decrypted_bytes)?;
        rpc_response.into_result()
    }

    /// Invokes the MWA `authorize` method, placing the session in the Authorized state.
    pub fn authorize(
        &mut self,
        identity: DappIdentity,
        chain: Option<String>,
        auth_token: Option<String>,
    ) -> Result<AuthorizeResult> {
        if self.state != SessionState::Established && self.state != SessionState::Authorized {
            return Err(ShaheenError::SessionError(format!(
                "Cannot authorize in state {:?}",
                self.state
            )));
        }

        // Adapt parameters dynamically based on negotiated protocol version:
        // Legacy MWA 1.0 wallets (Phantom) require `cluster` without the conflicting `chain` field.
        // Modern MWA 2.0 wallets (Solflare) expect `chain`.
        let is_legacy = self.negotiated_version.is_none();

        let (final_chain, final_cluster) = if is_legacy {
            let c = chain.as_deref().map(|c| match c {
                "solana:devnet" => "devnet".to_string(),
                "solana:testnet" => "testnet".to_string(),
                _ => "mainnet-beta".to_string(),
            });
            (None, c)
        } else {
            (chain, None)
        };

        let params = AuthorizeParams {
            identity,
            chain: final_chain,
            cluster: final_cluster,
            auth_token,
            ..Default::default()
        };

        let result: AuthorizeResult = self.rpc_call("authorize", params)?;

        self.auth_token = Some(result.auth_token.clone());
        self.accounts = result.accounts.clone();
        self.state = SessionState::Authorized;

        Ok(result)
    }

    /// Invokes `deauthorize` and resets the authorization state.
    pub fn deauthorize(&mut self) -> Result<()> {
        if let Some(token) = self.auth_token.take() {
            let params = DeauthorizeParams { auth_token: token };
            let _: serde_json::Value = self.rpc_call("deauthorize", params)?;
        }
        self.accounts.clear();
        if self.state == SessionState::Authorized {
            self.state = SessionState::Established;
        }
        Ok(())
    }

    /// Queries the wallet capabilities and supported transaction versions.
    pub fn get_capabilities(&mut self) -> Result<GetCapabilitiesResult> {
        self.rpc_call("get_capabilities", GetCapabilitiesParams {})
    }

    /// Signs and sends raw serialized Solana transactions via the wallet.
    pub fn sign_and_send_transactions(
        &mut self,
        transactions: Vec<&[u8]>,
        options: Option<SendOptions>,
    ) -> Result<Vec<String>> {
        if self.state != SessionState::Authorized {
            return Err(ShaheenError::SessionError(
                "Session must be authorized to sign transactions".to_string(),
            ));
        }

        let payloads: Vec<String> = transactions.iter().map(|tx| BASE64.encode(tx)).collect();
        let params = SignAndSendTransactionsParams { payloads, options };

        let result: SignAndSendTransactionsResult =
            self.rpc_call("sign_and_send_transactions", params)?;
        Ok(result.signatures)
    }

    /// Signs arbitrary messages via the wallet.
    pub fn sign_messages(
        &mut self,
        addresses: Vec<String>,
        messages: Vec<&[u8]>,
    ) -> Result<Vec<String>> {
        if self.state != SessionState::Authorized {
            return Err(ShaheenError::SessionError(
                "Session must be authorized to sign messages".to_string(),
            ));
        }

        let payloads: Vec<String> = messages.iter().map(|m| BASE64.encode(m)).collect();
        let params = SignMessagesParams {
            addresses,
            payloads,
        };

        let result: SignMessagesResult = self.rpc_call("sign_messages", params)?;
        Ok(result.signed_payloads)
    }

    /// Signs transactions without sending (MWA deprecated method).
    pub fn sign_transactions(&mut self, transactions: Vec<&[u8]>) -> Result<Vec<Vec<u8>>> {
        if self.state != SessionState::Authorized {
            return Err(ShaheenError::SessionError(
                "Session must be authorized to sign transactions".to_string(),
            ));
        }

        let payloads: Vec<String> = transactions.iter().map(|tx| BASE64.encode(tx)).collect();
        let params = SignTransactionsParams { payloads };

        let result: SignTransactionsResult = self.rpc_call("sign_transactions", params)?;

        let mut signed_txs = Vec::with_capacity(result.signed_payloads.len());
        for p in result.signed_payloads {
            let bytes = BASE64
                .decode(&p)
                .map_err(|e| ShaheenError::SerializationError(format!("Base64 decode failed: {}", e)))?;
            signed_txs.push(bytes);
        }

        Ok(signed_txs)
    }

    /// Closes the session and cleans up secrets.
    pub fn close(&mut self) -> Result<()> {
        if let Some(mut transport) = self.transport.take() {
            let _ = transport.close();
        }
        self.session_key = None;
        self.dapp_ephemeral = None;
        self.state = SessionState::Closed;
        Ok(())
    }
}

/// Thread-safe SessionManager supporting concurrent sessions keyed by SessionId.
pub struct SessionManager {
    sessions: Mutex<HashMap<String, MwaSession>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// Creates and registers a new MwaSession, returning its ID and Association URI.
    pub fn create_session(&self, port: Option<u16>) -> Result<(String, AssociationUri)> {
        let session = MwaSession::new(port)?;
        let id = session.id.clone();
        let uri = session.association_uri.clone();

        let mut lock = self
            .sessions
            .lock()
            .map_err(|_| ShaheenError::SessionError("Session mutex poisoned".to_string()))?;
        lock.insert(id.clone(), session);

        Ok((id, uri))
    }

    /// Executes a closure with mutable access to the session identified by session_id.
    pub fn with_session<F, R>(&self, session_id: &str, f: F) -> Result<R>
    where
        F: FnOnce(&mut MwaSession) -> Result<R>,
    {
        let mut lock = self
            .sessions
            .lock()
            .map_err(|_| ShaheenError::SessionError("Session mutex poisoned".to_string()))?;

        let session = lock
            .get_mut(session_id)
            .ok_or_else(|| ShaheenError::SessionError(format!("Session {} not found", session_id)))?;

        f(session)
    }

    /// Closes and removes the session from the manager.
    pub fn close_session(&self, session_id: &str) -> Result<()> {
        let mut lock = self
            .sessions
            .lock()
            .map_err(|_| ShaheenError::SessionError("Session mutex poisoned".to_string()))?;

        if let Some(mut session) = lock.remove(session_id) {
            session.close()?;
        }

        Ok(())
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

pub fn global_session_manager() -> &'static SessionManager {
    static INSTANCE: std::sync::OnceLock<SessionManager> = std::sync::OnceLock::new();
    INSTANCE.get_or_init(SessionManager::new)
}

