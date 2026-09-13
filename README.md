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
  <a href="https://reactnative.dev"><img src="https://img.shields.io/badge/React_Native-TurboModule-blue" alt="React Native" /></a>
  <a href="https://expo.dev"><img src="https://img.shields.io/badge/Expo-Config_Plugin-black" alt="Expo" /></a>
  <a href="https://www.rust-lang.org"><img src="https://img.shields.io/badge/Core-Rust_2021-orange" alt="Rust" /></a>
</p>

---

## Why Shaheen?

Traditional Solana mobile integration on React Native requires heavy JavaScript polyfills (`Buffer`, `react-native-quick-crypto`, `react-native-get-random-values`), which slow down the Hermes runtime and complicate Metro configurations.

**Shaheen moves the entire MWA 2.0 protocol into compiled native Rust:**

* **⚡ Native Performance** — P-256 key exchange, HKDF-SHA256 derivation, and AES-128-GCM execute in native code off the JavaScript thread.
* **🚀 Zero Polyfills** — Works out of the box with `@solana/web3.js` without configuring shim files or Metro transformers.
* **📱 TurboModule Architecture** — Designed for React Native's New Architecture (Bridgeless / JSI) with background thread pooling.
* **🔒 Full MWA 2.0 Feature Parity** — Supports `authorize`, `getCapabilities`, `signMessages` (Sign-In with Solana), `signAndSendTransactions`, and `deauthorize`.
* **🧠 Intelligent Batching** — Automatically chunks transactions to conform to wallet `max_transactions_per_request` constraints.
* **🛡️ Typed Error Taxonomy** — Clean exception classes (`UserRejectedError`, `TimeoutError`, etc.) replace untyped string errors.

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
| **Total Native Crypto Pipeline** | **KeyGen + ECDSA + ECDH + AES** | **~1.73 ms CPU** |

> *Note: Cryptographic latency reflects native computation. Real-world end-to-end latency includes Android intent switching and wallet user approval.*

---

## Security Architecture

* **Key Separation** — NIST P-256 Association Keypair $(Q_a, d_a)$ is isolated from the Ephemeral Handshake Keypair $(Q_d, d_d)$.
* **Spec Wire Framing** — Strict 129-byte unencrypted `HELLO_REQ` wire format ($Q_d \parallel S_a$).
* **Monotonic AAD Validation** — Every message enforces a strict, incremental 4-byte sequence counter as AES-GCM Additional Authenticated Data to protect against replay attacks.
* **Zeroization** — Private scalar keys and AES session keys implement `ZeroizeOnDrop` to scrub memory when sessions terminate.
* **Unwind Isolation** — FFI boundaries use Rust `catch_unwind` to prevent native panics from terminating the React Native host process.

---

## License

[MIT](LICENSE) © Shaheen Contributors
