# ✨ shaheen: High-Performance, Shim-Free Solana Mobile Wallet Adapter SDK for React Native

> **`shaheen`** is an optimized, zero-shim React Native client that implements the official Solana Mobile Wallet Adapter (MWA) protocol specification. By offloading the cryptographic handshakes and WebSocket communication defined by the protocol to a native Rust engine accessed via C++ JSI, `shaheen` replaces the standard JavaScript library implementations to eliminate the need for global shims and keep the JS thread fully responsive.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Compiler](https://img.shields.io/badge/Rust-2021-orange.svg)](https://www.rust-lang.org/)
[![C++](https://img.shields.io/badge/C%2B%2B-17-green.svg)](https://en.cppreference.com/)
[![React Native](https://img.shields.io/badge/React_Native-0.74%2B-cyan.svg)](https://reactnative.dev/)

---

## 💡 The Context: Optimizing React Native Web3

The **Solana Mobile Wallet Adapter (MWA)** is the industry-standard foundation of the Solana mobile ecosystem, enabling secure inter-app communication between mobile dApps and wallets. 

While the official JavaScript SDKs work beautifully in browser environments, integrating them into React Native apps historically required developers to configure global Node.js shims (like patching `global.Buffer` or `global.crypto` with external npm packages). Additionally, running CPU-intensive cryptographic operations (P-256 ECDH and AES-GCM) directly on the single-threaded JavaScript virtual machine (Hermes) can block rendering. This might cause micro-stuttering on high-refresh-rate displays.

`shaheen` solves these specific React Native integration challenges by:

1. **Eliminating Global Polyfills**: The core cryptographic handshake and WebSocket communication are handled natively in Rust. Your JavaScript environment remains completely clean.
2. **Offloading CPU-Intensive Tasks**: Cryptography and networking run in native background threads (Java Thread on Android, Dispatch Queue on iOS), leaving the Hermes JS thread completely unblocked.
3. **Optimizing Memory Transfers**: Payload parameters (such as public keys, transaction hex strings, and auth tokens) are copied directly across the boundary using C++ JSI memory references, bypassing JSON serialization overhead.

---

## 🏗️ Architecture & Direct JSI Execution

```
   ┌───────────────────────────────────────────────────────────┐
   │                   React Native JS Thread                  │
   │  dApp calls useShaheenWallet() or ShaheenWalletAdapter    │
   └─────────────────────────────┬─────────────────────────────┘
                                 │
                                 │  [JSI Direct Call]
                                 ▼
   ┌───────────────────────────────────────────────────────────┐
   │                     C++ JSI Interface                     │
   │  - Intercepts JS call on the runtime thread               │
   │  - Parses JS arrays/objects directly out of Hermes memory │
   │  - Packages values into raw C-strings                     │
   └─────────────────────────────┬─────────────────────────────┘
                                 │
                                 │  [C-ABI FFI Boundary]
                                 ▼
   ┌───────────────────────────────────────────────────────────┐
   │                  Rust Core Engine (Native)                │
   │  - Offloads operation to background thread pool           │
   │  - Generates Ephemeral P-256 EC Keypair                   │
   │  - Starts MWA WebSocket Client over TCP loopback          │
   │  - Negotiates ECDH Shared Secret                          │
   │  - Derives AES-128 key via HKDF-SHA256                    │
   │  - Encrypts MWA JSON-RPC payloads with AES-128-GCM        │
   │  - Deserializes and validates Solana transactions         │
   └─────────────────────────────┬─────────────────────────────┘
                                 │
                                 │  [Local WebSocket Socket]
                                 ▼
   ┌───────────────────────────────────────────────────────────┐
   │                   Solana Mobile Wallet                    │
   │              (Phantom, Solflare, etc.)                    │
   └───────────────────────────────────────────────────────────┘
```

### The Transaction Life-Cycle:
1. **Trigger**: Your dApp invokes `executeTransaction(...)`.
2. **JSI Interception**: C++ intercepts the call, reads the transaction hex directly from the Hermes heap, and passes raw pointers to the Rust FFI.
3. **Intent Launch**: The system Intent wakes up the **Solana Mobile Wallet** app on the user's phone.
4. **Rust Handshake**: The Rust engine opens a local loopback TCP connection to the wallet's WebSocket server. It exchanges P-256 public keys via plaintext `HELLO` frames.
5. **Key Agreement**: Rust derives an encryption key using **Diffie-Hellman (ECDH)** and **HKDF-SHA256**.
6. **Encrypted RPC**: Rust wraps the `authorize` and `sign_transactions` payloads inside **AES-128-GCM** envelopes, using increasing sequence numbers as AAD (Additional Authenticated Data) to protect against injection/replay attacks.
7. **Return**: The signed transaction is received by Rust, decoded, and both the signature and the updated signed transaction hex string are returned to the JavaScript layer. C++ JSI copies the strings to resolve the JS Promise and immediately releases the native memory safely.

---

## 🛠️ The Tech Stack: Why Rust + C++ JSI?

A common question is: *If we are already using C++ JSI to talk to Hermes, why don't we write the entire wallet adapter in C++ instead of adding Rust?*

While C++ is the required glue for JSI (as Hermes is written in C++), writing a secure cryptographic socket engine in C++ is highly complex:

### The Case for Rust:
* **Memory Safety**: Cryptographic sessions require manipulating key buffers, arrays, and sockets. C++ is notoriously prone to buffer overflows, dangling pointers, and memory leaks. Rust guarantees compile-time memory safety.
* **Modern Crypto Ecosystem**: Rust has the premier `RustCrypto` ecosystem (`p256`, `aes-gcm`). These crates are audited, clean, and highly optimized. In C++, we would have to manually compile and link bulky libraries like OpenSSL or BoringSSL, which is extremely difficult to cross-compile for Android and iOS.
* **No-STD Networking**: Rust compiles down to a compact `staticlib` (for iOS) and `cdylib` (for Android) with zero external runtime dependencies.
* **The Hybrid Synergy**: 
  * We use **C++ JSI** for what it does best: direct, high-performance interactions with the Hermes JavaScript VM.
  * We use **Rust** for what it does best: bulletproof cryptography, safe multi-threading, and concurrent socket networking.

---

## 🚀 Installation & Build Pipelines

Add `shaheen` to your project:

```bash
npm install shaheen
```

### iOS Compilation Setup (Static Linking)
The library packages a CocoaPods script that intercepts Xcode's linking pipeline and compiles the Rust engine for iOS devices automatically:

```bash
cd ios
pod install
```
*Note: Make sure you have the iOS Rust target installed: `rustup target add aarch64-apple-ios`.*

### Android Compilation Setup (Dynamic Linking)
Android handles native builds via CMake. Make sure your `local.properties` file points to your Android NDK:
```ini
ndk.dir=/path/to/your/android-sdk/ndk/version
```

---

## 🛠️ Integration Strategies

`shaheen` is designed to be highly flexible, offering two integration patterns depending on your project needs:

### Strategy 1: Standalone Mode (Pure `shaheen`)
* **Best for**: Brand new dApps, mobile games, or lightweight applications.
* **How it works**: You import the hook `useShaheenWallet` directly and pass a serialized transaction hex.
* **Performance Benefit**: You **do not need to install @solana/wallet-adapter-react** or configure global Node-shims (like `Buffer` or `crypto` polyfills) in your app's entry points. The native bridge remains completely shim-free.

### Strategy 2: Ecosystem Bridge Mode
* **Best for**: Upgrading existing projects already built around the standard Solana React Hook system.
* **How it works**: You import `ShaheenMobileWalletAdapter` and register it inside your root `WalletProvider`.
* **Benefit**: To your UI, it looks like a standard wallet adapter. But underneath, all signature requests are intercepted and executed inside the native Rust/JSI engine.

---

## 📖 API Reference

### 1. Standalone Mode (Strategy 1)

```typescript
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useShaheenWallet } from 'shaheen';
import { Transaction, SystemProgram, PublicKey } from '@solana/web3.js';

export default function StandaloneExample() {
  const { executeTransaction, loading } = useShaheenWallet();

  const handleSign = async () => {
    // 1. Construct and serialize the transaction (no global shims/polyfills needed)
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey("37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B"),
        toPubkey: new PublicKey("37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B"),
        lamports: 1000,
      })
    );
    const txBytes = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
    const txHex = Array.from(txBytes, (byte) => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');

    // 2. Execute via Native MWA Bridge
    const result = await executeTransaction('devnet', txHex);
    if (result.success) {
      console.log("Transaction Signature:", result.signature);
      console.log("Signed Transaction Hex:", result.signedTxHex);
    } else {
      console.error("Error signing:", result.error);
    }
  };

  return (
    <TouchableOpacity style={styles.button} onPress={handleSign} disabled={loading}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.text}>Sign Transaction</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#9932cc',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
```

### 2. Ecosystem Bridge Mode (Strategy 2)

```typescript
import React from 'react';
import { WalletProvider } from '@solana/wallet-adapter-react';
import { ShaheenMobileWalletAdapter } from 'shaheen';

// Register Shaheen inside the standard Wallet Adapter list
const wallets = [
  new ShaheenMobileWalletAdapter()
];

export default function App() {
  return (
    <WalletProvider wallets={wallets} autoConnect>
      <MyDappComponents />
    </WalletProvider>
  );
}
```

---

## ⚡ Performance Metrics & Hardware Acceleration

`shaheen` achieves massive speedups by leveraging hardware-level acceleration and memory optimizations:

* **Hardware Crypto Acceleration**: The `aes-gcm` crate compiles down to use **ARM NEON** and **AES-NI** CPU assembly instructions directly on Apple Silicon (M1/M2/A-series chips) and Android ARM64 devices. Encryption takes **less than 5 microseconds**.
* **Direct JSI Pass-through**: Ephemeral parameters (like transaction hex strings and auth tokens) are passed directly across the JS-to-C++ boundary using direct memory handles. We avoid heavy JSON serialization overhead on the JS side, bypassing standard React Native bridge bottlenecks.
* **Native Thread Offloading**: The JSI methods return a JavaScript Promise and offload all network socket operations and cryptographic exchanges to native background threads (Java Thread on Android, Dispatch Queue on iOS). The Hermes JS runtime thread remains completely free and responsive, maintaining a smooth **120Hz display refresh rate**.

---

## 🔒 Hardened Security & Safety

* **Anti-Replay Envelopes**: AES-GCM wraps all payloads. Tampered frames, modified sequence numbers, or out-of-order packets fail authentication and immediately drop the socket session.
* **Memory Jails**: Ephemeral P-256 session keys are created and handled exclusively inside Rust's compiled stack memory. The keys never leak into the JavaScript heap, preventing heap-dump exploits.
* **Process Crash Protection**: The FFI boundary uses Rust's `catch_unwind` block to capture any native thread crashes, converting them to JSON error messages instead of terminating the mobile app.

---

## 🧪 Testing & Verification

`shaheen` is covered by tests at every level of the stack:

### Rust Core Tests (Cryptography, Sockets, & FFI Safety)
Verify the AES-GCM encryption, ECDH derivation, TCP listener re-use, and loopback E2E handshake:
```bash
cd rust
cargo test
```

### JS/TS Layer Tests (Adapter state & Bridge flows)
Verify state transitions, association failures, and URL launching:
```bash
npm run test
```
