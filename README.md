<p align="center">
  <img src="./logo.png" alt="Shaheen" width="160" />
</p>

<h1 align="center">Shaheen</h1>

<p align="center">
  <b>Android-first, polyfill-free Solana Mobile Wallet Adapter (MWA 2.0) native protocol engine for React Native & Expo</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/shaheen"><img src="https://img.shields.io/badge/npm-v1.1.0-black?logo=npm" alt="npm version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-black.svg" alt="license" /></a>
  <a href="https://reactnative.dev"><img src="https://img.shields.io/badge/React_Native-Native_Module-blue" alt="React Native" /></a>
  <a href="https://expo.dev"><img src="https://img.shields.io/badge/Expo-Config_Plugin-black" alt="Expo" /></a>
  <a href="https://www.rust-lang.org"><img src="https://img.shields.io/badge/Core-Rust_2021-orange" alt="Rust" /></a>
</p>

---

## Why Shaheen?

Traditional Solana mobile integration on React Native requires heavy JavaScript polyfills (`Buffer`, `react-native-quick-crypto`, `react-native-get-random-values`), which slow down the Hermes runtime and complicate Metro configurations.

**Shaheen moves the entire MWA 2.0 protocol into compiled native Rust:**

* **⚡ Native Performance** — P-256 key exchange, HKDF-SHA256 derivation, and AES-128-GCM execute in native code off the JavaScript thread.
* **🚀 No MWA Crypto Polyfills** — Shaheen's MWA cryptography and transport run natively, so Shaheen itself does not require JavaScript crypto polyfills or Metro crypto shims.
* **📱 Native Android Architecture** — MWA transport and cryptography execute off the JavaScript thread in a Rust native core, with asynchronous Android execution.
* **🔒 MWA 2.0 dApp API** — Supports authorization, capability discovery, message signing, transaction signing/sending, and deauthorization.
* **🧠 Intelligent Batching** — Automatically chunks transactions to conform to wallet `max_transactions_per_request` constraints.
* **🛡️ Typed Error Taxonomy** — Clean exception classes (`UserRejectedError`, `TimeoutError`, etc.) replace untyped string errors.

---

## Scope

### What Shaheen Is

Shaheen is a native Android implementation of the dApp side of the Solana Mobile Wallet Adapter (MWA) 2.0 protocol for React Native and Expo.

It provides:
* MWA wallet association
* MWA 2.0 handshake and encrypted transport
* Wallet authorization
* Capability discovery
* Message signing
* Transaction signing
* Transaction signing and sending
* Deauthorization
* Session management

### What Shaheen Is Not

Shaheen is not:
* A Solana RPC client
* A Solana transaction-building library
* A wallet
* A replacement for `@solana/web3.js`
* A replacement for the MWA protocol

Your application can continue using `@solana/web3.js` or another Solana library for transaction construction and RPC while using Shaheen for MWA wallet communication.

---

## Compatibility

Shaheen is a dApp-side implementation of the Solana Mobile Wallet Adapter (MWA) 2.0 protocol.

It is designed to communicate with wallets that implement the MWA protocol. Wallet compatibility therefore depends on the wallet supporting MWA; Shaheen does not require a separate Shaheen-specific integration in the wallet.

Shaheen can be used alongside Solana transaction and RPC libraries such as `@solana/web3.js`.

```text
@solana/web3.js
       │
       │ Build / serialize transaction
       ▼
   Uint8Array
       │
       ▼
     Shaheen
       │
       │ MWA 2.0
       ▼
MWA-compatible wallet
```

Shaheen is not intended to replace Solana RPC or transaction libraries. It provides the dApp-side wallet communication layer.

---

## Architecture

Shaheen separates the React Native API from the MWA protocol engine.

```text
React Native application
        │
        ▼
   Shaheen JS API
        │
        ▼
 Android native layer
        │
        │ JNI / native calls
        ▼
     Rust core
        │
        ├── Association
        ├── MWA 2.0 handshake
        ├── ECDH + HKDF
        ├── AES-128-GCM
        ├── Sequence validation
        ├── JSON-RPC
        └── WebSocket transport
        │
        ▼
 MWA-compatible wallet
```

The Rust core owns the MWA protocol, cryptographic operations, session state, sequencing, and transport. The Android layer provides the React Native and Android platform integration.

Shaheen follows the MWA 2.0 wire protocol. Its internal implementation language and React Native integration do not change the protocol spoken to wallets.

### Data Handling

Shaheen accepts standard Solana transaction/message data and keeps the MWA wire serialization inside the native protocol engine.

MWA still uses its specified JSON-RPC and base64 payload representation on the wallet-facing wire. Shaheen's native implementation is designed to avoid unnecessary JavaScript-side cryptographic and protocol processing.

### React Native Architecture

Shaheen 1.1 uses an Android native module with a Rust protocol core. MWA cryptography, session management, protocol framing, and transport execute natively rather than in JavaScript.

The React Native integration is intentionally kept thin. A future release may further reduce JavaScript/native serialization overhead through the React Native New Architecture and a more direct binary data path without changing the MWA 2.0 wire protocol or the public Shaheen API.

---

## Installation

```bash
npm install shaheen @solana/web3.js
# or
yarn add shaheen @solana/web3.js
# or
pnpm add shaheen @solana/web3.js
```

### Expo Setup

Add the plugin to your `app.json`:

```json
{
  "expo": {
    "plugins": ["shaheen"]
  }
}
```

*The config plugin automatically injects required Android intent queries (`solana-wallet`) into `AndroidManifest.xml`.*

### Bare React Native Setup

Add the intent query to `android/app/src/main/AndroidManifest.xml`:

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

## Quickstart

All operations take place inside a single, stateful wallet session via `transact()`:

```typescript
import { transact, UserRejectedError, TimeoutError } from 'shaheen';
import { Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

async function sendSol() {
  try {
    const result = await transact(async (wallet) => {
      // 1. Authorize session
      const auth = await wallet.authorize({
        chain: 'solana:mainnet',
        identity: {
          name: 'My Dapp',
          uri: 'https://mydapp.com',
          icon: 'favicon.ico',
        },
      });

      // 2. Build standard Solana transaction
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(auth.publicKey),
          toPubkey: new PublicKey('RecipientAddressHere1111111111111111111111'),
          lamports: 0.01 * LAMPORTS_PER_SOL,
        })
      );
      tx.feePayer = new PublicKey(auth.publicKey);
      tx.recentBlockhash = 'RecentBlockhashHere...';

      // 3. Sign & send via wallet
      const [signature] = await wallet.signAndSendTransactions([tx]);
      return { address: auth.publicKey, signature };
    });

    console.log('Transaction Confirmed:', result.signature);
  } catch (error) {
    if (error instanceof UserRejectedError) {
      console.warn('User rejected approval');
    } else if (error instanceof TimeoutError) {
      console.error('Wallet connection timed out');
    } else {
      console.error('Operation failed:', error);
    }
  }
}
```

---

## API Overview

Inside `transact(async (wallet) => { ... })`, the `wallet` client provides:

| Method | Description |
| :--- | :--- |
| `wallet.authorize(options)` | Authenticates session with wallet; returns public key, auth token, and accounts. |
| `wallet.getCapabilities()` | Queries wallet constraints (`maxTransactionsPerRequest`, supported features). |
| `wallet.signMessages(messages)` | Signs arbitrary strings or `Uint8Array` messages (Sign-In with Solana). |
| `wallet.signAndSendTransactions(txs)` | Signs and broadcasts an array of transactions with capability-aware chunking. |
| `wallet.deauthorize()` | Revokes authorization token and clears session secrets. |
| `wallet.signTransactions(txs)` | *(Deprecated in MWA 2.0)* Signs transactions offline without broadcasting. |

### Message Signing (Sign-In with Solana)

```typescript
await transact(async (wallet) => {
  await wallet.authorize();

  const [signatureBytes] = await wallet.signMessages([
    'Sign-In with Solana: ' + Date.now(),
  ]);

  console.log('Signature:', signatureBytes);
});
```

### Capability Discovery & Smart Batching

```typescript
await transact(async (wallet) => {
  // Query wallet limits
  const caps = await wallet.getCapabilities();

  // Shaheen automatically splits arrays larger than wallet limits into valid sub-batches
  const signatures = await wallet.signAndSendTransactions([tx1, tx2, tx3, tx4, tx5]);
});
```

### Silent Re-Authorization

```typescript
// Persist the token from first authorization
const auth = await wallet.authorize({ chain: 'solana:mainnet' });
await AsyncStorage.setItem('mwa_auth_token', auth.authToken);

// Re-authorize silently on future sessions without user prompt
const savedToken = await AsyncStorage.getItem('mwa_auth_token');
const silentAuth = await wallet.authorize({
  chain: 'solana:mainnet',
  authToken: savedToken ?? undefined,
});
```

---

## Error Handling

Shaheen provides a structured exception taxonomy:

```typescript
import {
  ShaheenError,
  UserRejectedError,
  TimeoutError,
  AuthorizationError,
  WalletUnavailableError,
  CapabilityError,
  ProtocolError,
  HandshakeError,
} from 'shaheen';
```

---

## Cryptographic Benchmarks

Measured on a release build of `shaheen_core` across 1,000 iterations (`cargo bench`):

| Operation | Standard | Latency |
| :--- | :--- | :--- |
| **Association Keypair Gen** | NIST P-256 (`secp256r1`) | **~412 µs** |
| **HELLO_REQ Signature** | ECDSA-SHA256 (IEEE P1363) | **~889 µs** |
| **HELLO_REQ Verification** | ECDSA-SHA256 | **~801 µs** |
| **Session Key Derivation** | P-256 ECDH + HKDF-SHA256 | **~411 µs** |
| **Payload Encryption (300B)** | AES-128-GCM + 4B Seq AAD | **~1.3 µs** |
| **Payload Decryption (300B)** | AES-128-GCM + 4B Seq AAD | **~1.2 µs** |
| **Native Cryptographic Pipeline** | **Key generation + ECDSA + ECDH + AES** | **~1.73 ms CPU** |

> *These measurements cover native cryptographic computation only. They do not represent end-to-end wallet transaction latency, which also includes React Native/native invocation, WebSocket transport, Android activity switching, wallet processing, user interaction, and Solana network/RPC latency.*

---

## Security Architecture

* **Key Separation** — NIST P-256 Association Keypair $(Q_a, d_a)$ is isolated from the Ephemeral Handshake Keypair $(Q_d, d_d)$.
* **Spec Wire Framing** — Strict 129-byte unencrypted `HELLO_REQ` wire format ($Q_d \parallel S_a$).
* **Monotonic AAD Validation** — Every message enforces a strict, incremental 4-byte sequence counter as AES-GCM Additional Authenticated Data to protect against replay attacks.
* **Zeroization** — Sensitive private-key and session-key structures use `ZeroizeOnDrop` to reduce the lifetime of cryptographic material in memory.
* **Unwind Isolation** — Rust FFI entry points use `catch_unwind` to prevent Rust panics from unwinding across the FFI boundary.

---

## License

[MIT](LICENSE) © Shaheen Contributors
