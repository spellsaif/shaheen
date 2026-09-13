import { Platform, Linking } from 'react-native';
import ShaheenModule, {
  ShaheenAuthorizeSessionResult,
  ShaheenGetCapabilitiesResult,
} from './NativeShaheenSpec';

// ---------------------------------------------------------------------------
// ERROR TAXONOMY
// ---------------------------------------------------------------------------

export class ShaheenError extends Error {
  constructor(message: string, public readonly code: string = 'SHAHEEN_ERROR') {
    super(message);
    this.name = 'ShaheenError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UserRejectedError extends ShaheenError {
  constructor(message: string = 'User rejected the wallet request') {
    super(message, 'USER_REJECTED');
    this.name = 'UserRejectedError';
  }
}

export class TimeoutError extends ShaheenError {
  constructor(message: string = 'Wallet operation timed out') {
    super(message, 'TIMEOUT_ERROR');
    this.name = 'TimeoutError';
  }
}

export class HandshakeError extends ShaheenError {
  constructor(message: string = 'MWA 2.0 handshake verification failed') {
    super(message, 'HANDSHAKE_ERROR');
    this.name = 'HandshakeError';
  }
}

export class AuthorizationError extends ShaheenError {
  constructor(message: string = 'Wallet authorization failed') {
    super(message, 'AUTHORIZE_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class WalletUnavailableError extends ShaheenError {
  constructor(message: string = 'Wallet unavailable or intent launch failed') {
    super(message, 'WALLET_UNAVAILABLE');
    this.name = 'WalletUnavailableError';
  }
}

export class CapabilityError extends ShaheenError {
  constructor(message: string = 'Wallet does not support this requested capability') {
    super(message, 'CAPABILITY_ERROR');
    this.name = 'CapabilityError';
  }
}

export class ProtocolError extends ShaheenError {
  constructor(message: string = 'MWA protocol or sequence mismatch error') {
    super(message, 'PROTOCOL_ERROR');
    this.name = 'ProtocolError';
  }
}

function mapError(rawError: any, fallbackCode: string = 'SHAHEEN_ERROR'): ShaheenError {
  if (rawError instanceof ShaheenError) {
    return rawError;
  }
  const message = rawError?.message || (typeof rawError === 'string' ? rawError : 'Unknown error');
  const code = rawError?.code || fallbackCode;

  const lower = message.toLowerCase();
  if (code === 'USER_REJECTED' || lower.includes('user rejected') || lower.includes('rejected by user') || lower.includes('declined')) {
    return new UserRejectedError(message);
  }
  if (code === 'TIMEOUT_ERROR' || lower.includes('timeout') || lower.includes('timed out')) {
    return new TimeoutError(message);
  }
  if (code === 'HANDSHAKE_ERROR' || lower.includes('handshake')) {
    return new HandshakeError(message);
  }
  if (code === 'AUTHORIZE_ERROR' || lower.includes('auth')) {
    return new AuthorizationError(message);
  }
  if (code === 'ACTIVITY_NULL' || code === 'INTENT_LAUNCH_ERROR' || lower.includes('wallet intent') || lower.includes('activity')) {
    return new WalletUnavailableError(message);
  }
  if (code === 'SEQUENCE_MISMATCH' || code === 'PROTOCOL_ERROR') {
    return new ProtocolError(message);
  }
  return new ShaheenError(message, code);
}

// ---------------------------------------------------------------------------
// BYTE & BASE64 ENCODING HELPERS
// ---------------------------------------------------------------------------

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;
    result += chars[b1 >> 2];
    result += chars[((b1 & 3) << 4) | (b2 >> 4)];
    result += i + 1 < len ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    result += i + 2 < len ? chars[b3 & 63] : '=';
  }
  return result;
}

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let bufferLength = base64.length * 0.75;
  if (base64[base64.length - 1] === '=') {
    bufferLength--;
    if (base64[base64.length - 2] === '=') {
      bufferLength--;
    }
  }
  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < base64.length; i += 4) {
    const enc1 = chars.indexOf(base64[i]);
    const enc2 = chars.indexOf(base64[i + 1]);
    const enc3 = chars.indexOf(base64[i + 2]);
    const enc4 = chars.indexOf(base64[i + 3]);
    bytes[p++] = (enc1 << 2) | (enc2 >> 4);
    if (enc3 !== 64 && enc3 !== -1) {
      bytes[p++] = ((enc2 & 15) << 4) | (enc3 >> 2);
    }
    if (enc4 !== 64 && enc4 !== -1) {
      bytes[p++] = ((enc3 & 3) << 6) | enc4;
    }
  }
  return bytes;
}

function stringToUint8Array(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const utf8: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let charcode = str.charCodeAt(i);
    if (charcode < 0x80) utf8.push(charcode);
    else if (charcode < 0x800) {
      utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
    } else {
      i++;
      charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      utf8.push(
        0xf0 | (charcode >> 18),
        0x80 | ((charcode >> 12) & 0x3f),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f)
      );
    }
  }
  return new Uint8Array(utf8);
}

// ---------------------------------------------------------------------------
// PUBLIC API TYPES
// ---------------------------------------------------------------------------

export type SolanaChain = 'solana:mainnet' | 'solana:devnet' | 'solana:testnet';

export interface AuthorizeOptions {
  chain?: SolanaChain;
  authToken?: string;
  identity?: {
    name?: string;
    uri?: string;
    icon?: string;
  };
}

export interface TransactOptions {
  port?: number;
  /**
   * @experimental Custom WebSocket relay URL override.
   * Full cross-device MWA remote reflector flow will be supported in a future release.
   */
  relayUrl?: string;
}

export type AnyTransaction = Uint8Array | { serialize(config?: any): Uint8Array };

export type SignAndSendArgs = 
  | AnyTransaction[]
  | { transactions: AnyTransaction[] };

export type SignTransactionsArgs = 
  | AnyTransaction[]
  | { transactions: AnyTransaction[] };

export type AnyMessage = Uint8Array | string;

export type SignMessagesArgs =
  | AnyMessage[]
  | { messages: AnyMessage[]; addresses?: string[] };

function normalizeTransactions(args: SignAndSendArgs | SignTransactionsArgs): AnyTransaction[] {
  if (Array.isArray(args)) {
    return args;
  }
  if (args && Array.isArray((args as any).transactions)) {
    return (args as any).transactions;
  }
  throw new ShaheenError('Invalid arguments: expected array of transactions or { transactions: [...] }', 'INVALID_ARGUMENTS');
}

function serializeTx(item: any): Uint8Array {
  if (item instanceof Uint8Array) {
    return item;
  }
  if (item && typeof item.serialize === 'function') {
    if ('version' in item) {
      return item.serialize();
    }
    return item.serialize({ requireAllSignatures: false, verifySignatures: false });
  }
  if (Array.isArray(item)) {
    return new Uint8Array(item);
  }
  throw new ShaheenError('Invalid transaction payload: expected Uint8Array or Transaction object', 'INVALID_PAYLOAD');
}

function normalizeMessages(args: SignMessagesArgs): { messages: Uint8Array[]; addresses: string[] } {
  let msgs: AnyMessage[] = [];
  let addrs: string[] = [];

  if (Array.isArray(args)) {
    msgs = args;
  } else if (args && Array.isArray(args.messages)) {
    msgs = args.messages;
    if (Array.isArray(args.addresses)) {
      addrs = args.addresses;
    }
  } else {
    throw new ShaheenError('Invalid arguments: expected array of messages or { messages: [...] }', 'INVALID_ARGUMENTS');
  }

  const normalizedMsgs = msgs.map((m) => {
    if (m instanceof Uint8Array) return m;
    if (typeof m === 'string') return stringToUint8Array(m);
    throw new ShaheenError('Invalid message payload: expected Uint8Array or string', 'INVALID_PAYLOAD');
  });

  return { messages: normalizedMsgs, addresses: addrs };
}

export interface TransactWallet {
  /**
   * Authorizes the session with the connected wallet.
   */
  authorize(options?: AuthorizeOptions): Promise<ShaheenAuthorizeSessionResult>;

  /**
   * Discovers wallet constraints and supported features (MWA 2.0).
   */
  getCapabilities(): Promise<ShaheenGetCapabilitiesResult>;

  /**
   * Signs arbitrary messages with the wallet key (MWA 2.0).
   */
  signMessages(args: SignMessagesArgs): Promise<Uint8Array[]>;

  /**
   * Signs and broadcasts transactions in a single batch (or automatically chunked batches).
   */
  signAndSendTransactions(args: SignAndSendArgs): Promise<string[]>;

  /**
   * @deprecated Deprecated in MWA 2.0. Wallets may reject this method.
   * Use `signAndSendTransactions()` instead.
   */
  signTransactions<T extends AnyTransaction>(args: T[] | { transactions: T[] }): Promise<T[]>;

  /**
   * Deauthorizes the active session, clearing stored wallet auth tokens.
   */
  deauthorize(): Promise<void>;
}

/**
 * Modern Android MWA 2.0 transact pattern:
 * - Local loopback WebSocket + Android Intent
 * - Automatic session lifecycle management
 * - Capability-aware batching
 * - Native zero-polyfill Rust execution
 */
export async function transact<T>(
  callback: (wallet: TransactWallet) => Promise<T>,
  options?: TransactOptions
): Promise<T> {
  let session;
  try {
    session = await ShaheenModule.createSession(options?.port || 0);
  } catch (err) {
    throw mapError(err, 'SESSION_CREATE_ERROR');
  }

  if (!session || !session.success) {
    throw mapError(session?.error || 'Failed to create MWA session', session?.errorCode || 'SESSION_CREATE_ERROR');
  }

  try {
    // Launch wallet app intent
    if (session.uri) {
      if (Platform.OS === 'android' && typeof ShaheenModule.launchWalletIntent === 'function') {
        try {
          await ShaheenModule.launchWalletIntent(session.uri);
        } catch (_) {
          await Linking.openURL(session.uri);
        }
      } else {
        await Linking.openURL(session.uri);
      }
    }

    const wsUrl = options?.relayUrl || '';
    let authorizedAccountAddress = '';
    let cachedCapabilities: ShaheenGetCapabilitiesResult | null = null;

    const wallet: TransactWallet = {
      async authorize(opts) {
        const chain = opts?.chain || 'solana:mainnet';
        const identityName = opts?.identity?.name || '';
        const identityUri = opts?.identity?.uri || '';
        const identityIcon = opts?.identity?.icon || '';

        try {
          const res = await ShaheenModule.connectAndAuthorizeSession(
            session.sessionId,
            wsUrl,
            chain,
            opts?.authToken || '',
            identityName,
            identityUri,
            identityIcon
          );
          if (!res.success) {
            throw mapError(res.error || 'Authorization failed', res.errorCode || 'AUTHORIZE_ERROR');
          }
          if (res.accounts && res.accounts.length > 0) {
            authorizedAccountAddress = res.accounts[0].address;
          }
          return res;
        } catch (err) {
          throw mapError(err, 'AUTHORIZE_ERROR');
        }
      },

      async getCapabilities() {
        try {
          const res = await ShaheenModule.getCapabilities(session.sessionId);
          if (!res.success) {
            throw mapError(res.error || 'Failed to get wallet capabilities', res.errorCode || 'GET_CAPABILITIES_ERROR');
          }
          cachedCapabilities = res;
          return res;
        } catch (err) {
          throw mapError(err, 'GET_CAPABILITIES_ERROR');
        }
      },

      async signMessages(args) {
        const { messages, addresses } = normalizeMessages(args);
        if (messages.length === 0) {
          return [];
        }

        const effectiveAddresses = addresses.length > 0 
          ? addresses 
          : messages.map(() => authorizedAccountAddress);

        const b64Messages = messages.map((m) => uint8ArrayToBase64(m));

        try {
          const res = await ShaheenModule.signMessages(
            session.sessionId,
            JSON.stringify(effectiveAddresses),
            JSON.stringify(b64Messages)
          );
          if (!res.success) {
            throw mapError(res.error || 'Sign messages failed', res.errorCode || 'SIGN_MESSAGES_ERROR');
          }

          const rawPayloads = res.signedPayloads || (res.signedPayload ? [res.signedPayload] : []);
          return rawPayloads.map((b64) => base64ToUint8Array(b64));
        } catch (err) {
          throw mapError(err, 'SIGN_MESSAGES_ERROR');
        }
      },

      async signAndSendTransactions(args) {
        const txList = normalizeTransactions(args);
        if (txList.length === 0) {
          return [];
        }

        // Capability-aware batch slicing if maxTransactionsPerRequest is defined
        let maxBatch = cachedCapabilities?.maxTransactionsPerRequest;
        if (!maxBatch || maxBatch <= 0) {
          maxBatch = txList.length;
        }

        const allSignatures: string[] = [];

        for (let i = 0; i < txList.length; i += maxBatch) {
          const chunk = txList.slice(i, i + maxBatch);
          const b64List = chunk.map((item) => {
            const rawBytes = serializeTx(item);
            return uint8ArrayToBase64(rawBytes);
          });

          try {
            const res = await ShaheenModule.signAndSend(
              session.sessionId,
              JSON.stringify(b64List)
            );
            if (!res.success) {
              throw mapError(res.error || 'Sign and send transaction failed', res.errorCode || 'SIGN_AND_SEND_ERROR');
            }
            const sigs = res.signatures || (res.signature ? [res.signature] : []);
            allSignatures.push(...sigs);
          } catch (err) {
            throw mapError(err, 'SIGN_AND_SEND_ERROR');
          }
        }

        return allSignatures;
      },

      async signTransactions<U extends AnyTransaction>(args: U[] | { transactions: U[] }): Promise<U[]> {
        const txList = normalizeTransactions(args) as U[];
        if (txList.length === 0) {
          return [];
        }

        const b64List = txList.map((item) => {
          const rawBytes = serializeTx(item);
          return uint8ArrayToBase64(rawBytes);
        });

        try {
          const res = await ShaheenModule.signTransactions(
            session.sessionId,
            JSON.stringify(b64List)
          );
          if (!res.success) {
            throw mapError(res.error || 'Sign transaction failed', res.errorCode || 'SIGN_TRANSACTIONS_ERROR');
          }
          const signedB64List = res.signedTxsBase64 || (res.signedTxBase64 ? [res.signedTxBase64] : []);
          const signedList: U[] = [];
          for (let i = 0; i < txList.length; i++) {
            const item = txList[i];
            const b64 = signedB64List[i] || '';
            const signedBytes = base64ToUint8Array(b64);
            if ((item as any)?.constructor?.deserialize) {
              signedList.push((item as any).constructor.deserialize(signedBytes));
            } else if ((item as any)?.constructor?.from) {
              signedList.push((item as any).constructor.from(signedBytes));
            } else {
              signedList.push(signedBytes as unknown as U);
            }
          }
          return signedList;
        } catch (err) {
          throw mapError(err, 'SIGN_TRANSACTIONS_ERROR');
        }
      },

      async deauthorize() {
        try {
          const res = await ShaheenModule.deauthorize(session.sessionId);
          if (!res.success) {
            throw mapError(res.error || 'Deauthorize failed', res.errorCode || 'DEAUTHORIZE_ERROR');
          }
          authorizedAccountAddress = '';
        } catch (err) {
          throw mapError(err, 'DEAUTHORIZE_ERROR');
        }
      },
    };

    return await callback(wallet);
  } finally {
    await ShaheenModule.closeSession(session.sessionId).catch(() => {});
  }
}
