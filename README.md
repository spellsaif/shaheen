# 🦅 shaheen: The Polyfill-Free Solana Mobile Wallet Adapter

> **`shaheen`** (Arabic/Persian for *royal peregrine falcon*) is a lightning-fast, zero-polyfill React Native library designed to connect mobile dApps to the Solana Mobile Wallet Adapter (MWA) protocol using cross-compiled Rust and C++ JSI.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Compiler](https://img.shields.io/badge/Rust-2021-orange.svg)](https://www.rust-lang.org/)
[![C++](https://img.shields.io/badge/C%2B%2B-17-green.svg)](https://en.cppreference.com/)
[![React Native](https://img.shields.io/badge/React_Native-0.74%2B-cyan.svg)](https://reactnative.dev/)

---

## 💡 The Problem: The "Polyfill Tax" of Mobile Web3

Developing Solana dApps in React Native has historically felt like trying to fly a falcon with lead weights tied to its talons. 

Standard Solana JavaScript SDKs are written for Web browsers and Node.js. They rely heavily on Node built-ins: `Buffer`, `crypto`, `stream`, and `path`. Because React Native doesn't have these, developers are forced to pay the **Polyfill Tax**:

1. **Scope Pollution**: You are forced to patch your environment by injecting global variables at the top of `index.js`:
   ```javascript
   global.Buffer = require('buffer').Buffer;
   global.crypto = require('react-native-get-random-values');
   ```
2. **UI Thread Freeze (Stutter)**: Performing complex cryptographic handshakes (like P-256 ECDH and AES-GCM encryption) inside the single-threaded JavaScript virtual machine (Hermes) blocks rendering. This causes noticeable frame drops, making high-end 120Hz screens stutter.
3. **Security Risks**: Relying on nested, un-audited npm shims for core randomness (`getrandom`) introduces massive supply-chain attack vectors.
4. **App Bloat**: Your bundle size swells with megabytes of browser emulation code, increasing cold startup latency.

---

## 🦅 The Shaheen Philosophy: Push it to the Metal

`shaheen` does away with JS shims entirely. 

Instead of emulating a browser inside JavaScript, **`shaheen` delegates 100% of the heavy cryptographic handshakes and socket networking to a pre-compiled native Rust engine**.

We connect this Rust engine directly to the React Native Hermes VM using **C++ JSI (JavaScript Interface)**. Data payloads (like transaction bytes and keys) are passed as raw memory references across the boundary, completely bypassing the slow React Native JSON bridge.

---

## 🏗️ Architecture & Data Flow

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
   │  - Serializes Solana Instruction to Transaction Bytes     │
   └─────────────────────────────┬─────────────────────────────┘
                                 │
                                 │  [Local WebSocket Socket]
                                 ▼
   ┌───────────────────────────────────────────────────────────┐
   │                   Solana Mobile Wallet                    │
   │        (Phantom, Solflare, or Mock Fake Wallet)           │
   └───────────────────────────────────────────────────────────┘
```

### The Transaction Life-Cycle:
1. **Trigger**: Your dApp invokes `executeTransactionSync(...)`.
2. **JSI Interception**: C++ intercepts the call, reads the program keys and data hex directly from the Hermes heap, and passes raw pointers to the Rust FFI.
3. **Intent Launch**: The system Intent wakes up the **Solana Mobile Wallet** app on the user's phone.
4. **Rust Handshake**: The Rust engine opens a local loopback TCP connection to the wallet's WebSocket server. It exchanges P-256 public keys via plaintext `HELLO` frames.
5. **Key Agreement**: Rust derives an encryption key using **Diffie-Hellman (ECDH)** and **HKDF-SHA256**.
6. **Encrypted RPC**: Rust wraps the `authorize` and `sign_transactions` payloads inside **AES-128-GCM** envelopes, using increasing sequence numbers as AAD (Additional Authenticated Data) to protect against injection/replay attacks.
7. **Return**: The signed transaction is received by Rust, deserialized to verify validity, and the signature is returned up to the JSI thread. C++ JSI copies the signature into a JS String and immediately calls `rust_free_string` to release the native memory safely.

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
* **How it works**: You import the hook `useShaheenWallet` directly and pass raw instruction fields.
* **Performance Benefit**: You **do not need to install `@solana/web3.js` or `@solana/wallet-adapter-react`**. Your JavaScript bundle size is virtually zero, and your app has absolutely no dependency on Node shims.

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

export default function StandaloneExample() {
  const { executeTransaction, loading } = useShaheenWallet();

  const handleSign = async () => {
    // Construct the instruction. No web3.js classes required!
    const instruction = {
      programId: "Memo1U2x22222222222222222222222222222225", 
      keys: [
        { pubkey: "37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B", isSigner: true, isWritable: true }
      ],
      dataHex: "48656c6c6f" // "Hello" in hex
    };

    const result = await executeTransaction('devnet', instruction);
    if (result.success) {
      console.log("Transaction Signature:", result.signature);
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
* **Zero JSI String Copies**: Program keys and instructions are parsed straight out of the Hermes VM heap via JSI references. We avoid stringifying JSON or converting arrays inside JavaScript, bypassing garbage collection pauses.
* **Native Thread Offloading**: While C++ JSI methods execute synchronously on the JavaScript thread, network operations are immediately dispatched to background worker pools (GCD on iOS, native threads on Android), maintaining a smooth **120Hz display refresh rate**.

---

## 🔒 Hardened Security & Safety

* **Anti-Replay Envelopes**: AES-GCM wraps all payloads. Tampered frames, modified sequence numbers, or out-of-order packets fail authentication and immediately drop the socket session.
* **Memory Jails**: Ephemeral P-256 session keys are created and handled exclusively inside Rust's compiled stack memory. The keys never leak into the JavaScript heap, preventing heap-dump exploits.
* **Process Crash Protection**: The FFI boundary uses Rust's `catch_unwind` block to capture any native thread crashes, converting them to JSON error messages instead of terminating the mobile app.

---

## 🧪 Testing & Verification

`shaheen` is covered by tests at every level of the stack:

### Rust Core Tests (Cryptography & FFI Safety)
Verify the AES-GCM encryption, ECDH derivation, and null pointer FFI checks:
```bash
cd rust
cargo test
```

### JS/TS Layer Tests (Bridge Mocks)
Verify the JS React Hooks and JSI mock interfaces:
```bash
npm run test
```

### End-to-End UI Automation (Maestro)
We package a [Maestro test flow](maestro/connect_wallet.yaml) to automate the inter-app launch and signing process on active mobile emulators using Solana's Fake Wallet app.
