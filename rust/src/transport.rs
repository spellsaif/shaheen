use std::net::TcpStream;
use std::time::Duration;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use tungstenite::client::IntoClientRequest;
use tungstenite::handshake::client::Request;
use tungstenite::protocol::WebSocket;
use tungstenite::Message as WsMessage;
use url::Url;

use crate::error::{Result, ShaheenError};

pub const SUBPROTOCOL_BINARY: &str = "com.solana.mobilewalletadapter.v1";
pub const SUBPROTOCOL_BASE64: &str = "com.solana.mobilewalletadapter.v1.base64";

/// Abstract transport trait for MWA frame exchanges.
pub trait Transport: Send {
    fn send_frame(&mut self, payload: &[u8]) -> Result<()>;
    fn receive_frame(&mut self) -> Result<Vec<u8>>;
    fn close(&mut self) -> Result<()>;
}

/// WebSocket transport implementing MWA subprotocol negotiation and frame framing.
pub struct WebSocketTransport {
    socket: WebSocket<TcpStream>,
    use_base64_frames: bool,
}

impl WebSocketTransport {
    /// Connects to a WebSocket URL (e.g. `ws://127.0.0.1:49152/solana-wallet`)
    /// with retry and subprotocol negotiation.
    pub fn connect(ws_url: &str, timeout_secs: u64) -> Result<Self> {
        let url = Url::parse(ws_url)
            .map_err(|e| ShaheenError::TransportError(format!("Invalid WebSocket URL: {}", e)))?;

        let host = url.host_str().unwrap_or("127.0.0.1");
        let port = url.port().unwrap_or(49152);
        let socket_addr = format!("{}:{}", host, port);

        // Retry TCP connection loop
        let deadline = std::time::Instant::now() + Duration::from_secs(timeout_secs);
        let mut stream = None;

        while std::time::Instant::now() < deadline {
            match TcpStream::connect_timeout(
                &socket_addr
                    .parse()
                    .map_err(|e| ShaheenError::TransportError(format!("Invalid socket address: {}", e)))?,
                Duration::from_millis(500),
            ) {
                Ok(s) => {
                    let _ = s.set_read_timeout(Some(Duration::from_secs(timeout_secs)));
                    let _ = s.set_write_timeout(Some(Duration::from_secs(10)));
                    stream = Some(s);
                    break;
                }
                Err(_) => {
                    std::thread::sleep(Duration::from_millis(200));
                }
            }
        }

        let tcp_stream = stream.ok_or_else(|| {
            ShaheenError::Timeout(format!(
                "Failed to connect to wallet socket at {} within {}s",
                socket_addr, timeout_secs
            ))
        })?;

        // Build WebSocket handshake request requesting both MWA subprotocols
        let mut request: Request = url
            .into_client_request()
            .map_err(|e| ShaheenError::TransportError(format!("Failed to build WS request: {}", e)))?;

        request.headers_mut().insert(
            "Sec-WebSocket-Protocol",
            format!("{}, {}", SUBPROTOCOL_BINARY, SUBPROTOCOL_BASE64)
                .parse()
                .unwrap(),
        );

        let (socket, response) = tungstenite::client(request, tcp_stream)
            .map_err(|e| ShaheenError::TransportError(format!("WebSocket handshake failed: {}", e)))?;

        // Check negotiated subprotocol
        let negotiated_protocol = response
            .headers()
            .get("Sec-WebSocket-Protocol")
            .and_then(|v| v.to_str().ok())
            .unwrap_or(SUBPROTOCOL_BINARY);

        let use_base64_frames = negotiated_protocol == SUBPROTOCOL_BASE64;

        Ok(Self {
            socket,
            use_base64_frames,
        })
    }
}

impl Transport for WebSocketTransport {
    fn send_frame(&mut self, payload: &[u8]) -> Result<()> {
        let msg = if self.use_base64_frames {
            let b64 = BASE64.encode(payload);
            WsMessage::Text(b64)
        } else {
            WsMessage::Binary(payload.to_vec())
        };

        self.socket
            .send(msg)
            .map_err(|e| ShaheenError::TransportError(format!("Failed to send WS frame: {}", e)))
    }

    fn receive_frame(&mut self) -> Result<Vec<u8>> {
        loop {
            let msg = self
                .socket
                .read()
                .map_err(|e| ShaheenError::TransportError(format!("Failed to read WS frame: {}", e)))?;

            match msg {
                WsMessage::Binary(bytes) => return Ok(bytes),
                WsMessage::Text(text) => {
                    let decoded = BASE64
                        .decode(text.trim())
                        .map_err(|e| ShaheenError::TransportError(format!("Failed to decode base64 frame: {}", e)))?;
                    return Ok(decoded);
                }
                WsMessage::Ping(ping_data) => {
                    let _ = self.socket.send(WsMessage::Pong(ping_data));
                }
                WsMessage::Pong(_) => {}
                WsMessage::Close(_) => {
                    return Err(ShaheenError::TransportError("WebSocket closed by wallet".to_string()));
                }
                WsMessage::Frame(_) => {}
            }
        }
    }

    fn close(&mut self) -> Result<()> {
        let _ = self.socket.close(None);
        Ok(())
    }
}
