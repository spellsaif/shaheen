# 🦅 Shaheen: Native Rust Protocol Engine for Solana Mobile Wallet Adapter (MWA 2.0)

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Compiler](https://img.shields.io/badge/Rust-2021-orange.svg)](https://www.rust-lang.org/)
[![C++](https://img.shields.io/badge/C%2B%2B-17-green.svg)](https://en.cppreference.com/)
[![React Native](https://img.shields.io/badge/React_Native-0.74_%E2%80%93_0.87%2B_(Bridgeless)-cyan.svg)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-Config_Plugin-black.svg)](https://expo.dev/)

**Shaheen** (شاهين, meaning *Falcon*) is an **Android-first, specification-compliant native protocol engine and React Native SDK** for the **Solana Mobile Wallet Adapter (MWA 2.0)** standard. 

By executing all MWA 2.0 handshakes, key derivation, authenticated encryption, and session state machines inside a compiled **Rust core**, Shaheen completely eliminates the need for Node.js runtime polyfills (`Buffer`, `react-native-quick-crypto`, `react-native-get-random-values`), prevents JavaScript thread stalls, and provides single-session transaction batching for React Native and Expo applications.

---

## ⚡ Key Highlights

- 🚀 **Zero JS Crypto Polyfills**: No `react-native-get-random-values`, `buffer`, or `crypto-browserify` needed in your application entry point. All cryptography executes in native compiled Rust.
- 🔒 **MWA 2.0 Spec Compliant**: Implements the official P-256 Association Keypair separation, 129-byte `HELLO_REQ` wire framing, HKDF-SHA256 key derivation with $Q_a$ salt, AES-128-GCM sequence AAD, and monotonic sequence validation.
- 🧵 **Native Background Execution**: All WebSocket networking, frame decoding, and cryptographic operations run on dedicated native background threads via Rust, preventing React Native / Hermes JavaScript thread stalls.
- 📦 **Expo Config Plugin**: Zero-configuration Android manifest intent injection via `app.plugin.js` for Expo Development Builds (`npx expo run:android` / EAS Build).
- 🍏 **Extensible Transport Architecture**: Native Rust core compiles across Android and Apple platforms; designed to support emerging remote MWA relay transports (Nostr / reflector) for cross-platform extensions.

---

## 📊 Empirical Cryptographic Benchmarks

The following benchmarks were measured directly on a release build of `shaheen_core` running 1,000 iterations per operation (`cargo bench` in `rust/`):

| Operation | Specification / Cryptographic Primitive | Average Latency (`cargo bench`) |
| :--- | :--- | :--- |
| **Association Keypair Generation** | NIST P-256 (`secp256r1`) | **~412.00 µs** (0.41 ms) |
| **HELLO_REQ Signature** | ECDSA-SHA256 (64-byte IEEE P1363) | **~889.33 µs** (0.89 ms) |
| **HELLO_REQ Signature Verification** | ECDSA-SHA256 | **~801.75 µs** (0.80 ms) |
| **Session Key Derivation** | P-256 ECDH + HKDF-SHA256 ($Q_a$ Salt) | **~411.49 µs** (0.41 ms) |
| **Transaction Payload Encryption** | AES-128-GCM (300B Payload, 4B Seq AAD) | **~1.36 µs** (0.001 ms) |
| **Transaction Payload Decryption** | AES-128-GCM (300B Payload, 4B Seq AAD) | **~1.28 µs** (0.001 ms) |
| **Full Handshake + Tx Encrypt** | **Complete MWA 2.0 Cycle** | **~1.73 ms** |

> *Reproduce locally: `cd rust && cargo bench`. Hardware: 12th Gen Intel(R) Core(TM) i3-1215U / Linux x86_64.*

---

## 🏗️ Architecture

```
   ┌─────────────────────────────────────────────────────────────┐
   │                   React Native JS Thread                    │
   │           transact(async (wallet) => { ... })               │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  │  TurboModule Async Native Bridge
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │               Shaheen TurboModule                           │
   │  - Handles React Native module lifecycle & promises         │
   │  - Passes payloads to native background execution thread    │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  │  Platform Background Thread
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │               Platform Native Layer                         │
   │  - Android: startActivityForResult (Package Auth Verification)│
   │  - Native JNI / C-ABI bridge calling Rust core              │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  │  C-ABI FFI Boundary
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                 shaheen_core (Rust Native)                  │
   │  - Generates P-256 Association Keypair (Qa, da)             │
   │  - Generates Ephemeral Dapp Keypair (Qd, dd)                │
   │  - Signs Qd with da (ECDSA-SHA256, 64-byte P1363)           │
   │  - Constructs exact 129-byte HELLO_REQ frame [Qd || Sa]     │
   │  - Derives AES-128 key via HKDF-SHA256 (Salt = Qa)          │
   │  - Enforces monotonic sequence counter with AAD validation  │
   │  - Zeroizes all private keys and secrets on drop            │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  │  Encrypted WebSocket (127.0.0.1:<port>/solana-wallet)
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │               Android Wallet (Phantom / Solflare)           │
   └─────────────────────────────────────────────────────────────┘
```

---

## 📦 Installation

```bash
npm install shaheen
# or
yarn add shaheen
```

### Peer Dependencies
Ensure you have the standard Solana and React Native dependencies installed:
```bash
npm install @solana/web3.js
```

### Expo Projects (Managed or Bare)
Add `shaheen` to your `app.json` plugins:
```json
{
  "expo": {
    "name": "MyDapp",
    "slug": "my-dapp",
    "plugins": [
      "shaheen"
    ]
  }
}
```
*The plugin automatically injects the required `<queries>` intent filters into `AndroidManifest.xml` so Android 11+ (API 30+) devices can discover installed Solana wallets.*

### Bare React Native Projects

#### Android Setup
In your `android/app/src/main/AndroidManifest.xml`, add the wallet query filter inside `<manifest>`:
```xml
<queries>
    <intent>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="solana-wallet" />
    </intent>
</queries>
```

---

## 💻 API Reference & Usage

### 1. Modern MWA 2.0 `transact()` Pattern (Recommended)

The `transact()` helper executes all operations inside a single, continuous wallet session, avoiding multi-roundtrip app switching:

```typescript
import { transact } from 'shaheen';
import { Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

async function sendSolTransaction() {
  const result = await transact(async (wallet) => {
    // 1. Authorize connection with wallet (passes dApp identity to wallet prompt)
    const auth = await wallet.authorize({
      chain: 'solana:devnet',
      identity: {
        name: 'My Dapp',
        uri: 'https://mydapp.com',
        icon: 'favicon.ico',
      },
    });

    console.log('Connected account:', auth.publicKey); // Base58 Solana public key

    // 2. Build a transaction
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(auth.publicKey),
        toPubkey: new PublicKey('37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B'),
        lamports: 0.01 * LAMPORTS_PER_SOL,
      })
    );
    tx.feePayer = new PublicKey(auth.publicKey);
    tx.recentBlockhash = 'EETubP5AKHgjQtcrkoWIbNuAnNuv2sub2bp79usJB2A-placeholder';

    // 3. Sign and broadcast in the same session
    const [signature] = await wallet.signAndSendTransactions([tx]);

    return { publicKey: auth.publicKey, signature };
  });

  console.log('Transaction confirmed! Signature:', result.signature);
}
```

### 2. True Transaction Batching

Rather than sending transactions one-by-one in a sequential loop, Shaheen serializes the entire array and dispatches a single `sign_and_send_transactions` or `sign_transactions` RPC request over the encrypted MWA 2.0 session:

```typescript
await transact(async (wallet) => {
  await wallet.authorize();

  // Batched into a single MWA RPC request:
  const signatures = await wallet.signAndSendTransactions([tx1, tx2, tx3]);
  console.log('Batch signatures:', signatures);

  // Or sign without sending:
  const signedTransactions = await wallet.signTransactions([tx1, tx2]);
});
```

### 3. Silent Re-Authorization (Token Persistence)

To provide a seamless experience without showing the "Authorize" dialog every time, save the `authToken` (in `AsyncStorage` or `expo-secure-store`) and supply it on subsequent calls:

```typescript
// 1. First time: Save the token
const auth = await wallet.authorize({ chain: 'solana:mainnet' });
await AsyncStorage.setItem('mwa_auth_token', auth.authToken);

// 2. Subsequent runs: Pass token for silent authorization without user prompt
const savedToken = await AsyncStorage.getItem('mwa_auth_token');
const silentAuth = await wallet.authorize({
  chain: 'solana:mainnet',
  authToken: savedToken ?? undefined,
});
```

---

## 🔒 Security & Wire Specification Details

Shaheen strictly enforces the formal Mobile Wallet Adapter specification:

1. **Key Separation**:
   - **Association Keypair $(Q_a, d_a)$**: A NIST P-256 EC keypair generated for the association URI. Only $Q_a$ is exposed in the URI as a Base64-URL-encoded token.
   - **Ephemeral Dapp Keypair $(Q_d, d_d)$**: A separate ephemeral keypair generated fresh for each session handshake.
2. **Deterministic 129-Byte `HELLO_REQ`**:
   The initial unencrypted handshake frame sent over WebSocket is exactly 129 bytes:
   $$\text{HELLO\_REQ} = Q_d (65 \text{ bytes SEC1 uncompressed}) \parallel S_a (64 \text{ bytes IEEE P1363})$$
   where $S_a = \text{ECDSA-SHA256}_{d_a}(Q_d)$. Any frame size $\neq 129$ bytes is instantly rejected.
3. **HKDF-SHA256 with $Q_a$ Salt**:
   The shared secret $Z = \text{ECDH}(d_d, Q_w)$ is derived using HKDF-SHA256 with the 65-byte uncompressed association public key $Q_a$ as the salt, generating a 128-bit key ($L=16$) for AES-128-GCM.
4. **Strict Monotonic Sequence Counter**:
   Every encrypted message payload includes a 4-byte big-endian sequence counter ($1, 2, 3, \dots$) as Additional Authenticated Data (AAD). If a frame arrives out of sequence or repeats a previous counter, the session aborts immediately to prevent replay attacks.
5. **Memory Jailing with Zeroize**:
   All sensitive private scalar keys (`d_a`, `d_d`), shared secrets, and derived AES-GCM keys implement the `ZeroizeOnDrop` trait, securely wiping heap and stack memory when the session terminates.

---

## 🧪 Testing & Verification

Shaheen features comprehensive unit, integration, and fuzz testing:

### Pure Rust Core & Cryptographic Verification
```bash
cd rust
cargo test --all-targets
```
*Executes 24 automated tests including RFC 5869 HKDF standard vectors, corrupted IV/tag fuzzing, SEC1 public key tampering, sequence replay attacks, and end-to-end simulated wallet handshakes.*

### Microsecond Benchmarks
```bash
cd rust
cargo bench
```

### TypeScript & React Native Tests
```bash
npm test
```
*Executes automated Jest tests covering `transact()` lifecycle, Android native intent dispatch, single-session transaction batching, dApp identity passing, and TurboModule mock verifications.*

---

## 📄 License

MIT License. Copyright (c) 2026 Shaheen Contributors.
