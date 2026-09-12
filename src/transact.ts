import { Platform, Linking } from 'react-native';
import ShaheenModule, { ShaheenAuthorizeSessionResult } from './NativeShaheenSpec';

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
  relayUrl?: string; // Optional remote WebSocket relay URL
}

export type AnyTransaction = Uint8Array | { serialize(config?: any): Uint8Array };

export type SignAndSendArgs = 
  | AnyTransaction[]
  | { transactions: AnyTransaction[] };

export type SignTransactionsArgs = 
  | AnyTransaction[]
  | { transactions: AnyTransaction[] };

function normalizeTransactions(args: SignAndSendArgs | SignTransactionsArgs): AnyTransaction[] {
  if (Array.isArray(args)) {
    return args;
  }
  if (args && Array.isArray((args as any).transactions)) {
    return (args as any).transactions;
  }
  throw new Error('Invalid arguments: expected array of transactions or { transactions: [...] }');
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
  throw new Error('Invalid transaction payload: expected Uint8Array or Transaction object');
}

export interface TransactWallet {
  authorize(options?: AuthorizeOptions): Promise<ShaheenAuthorizeSessionResult>;
  signAndSendTransactions(args: SignAndSendArgs): Promise<string[]>;
  signTransactions<T extends AnyTransaction>(args: T[] | { transactions: T[] }): Promise<T[]>;
}

/**
 * Modern Android MWA 2.0 transact pattern:
 * - Uses native MWA 2.0 via ShaheenModule (local loopback WebSocket + Android intent).
 *
 * Automatically manages session creation, intent dispatch, multi-request RPC execution,
 * and secret zeroization on completion.
 */
export async function transact<T>(
  callback: (wallet: TransactWallet) => Promise<T>,
  options?: TransactOptions
): Promise<T> {
  const session = await ShaheenModule.createSession(options?.port || 0);
  if (!session || !session.success) {
    throw new Error(`Failed to create MWA session: ${session?.error || 'Unknown error'}`);
  }

  try {
    // On mobile platforms, launch wallet app via native startActivityForResult on Android or Linking
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

    const wallet: TransactWallet = {
      async authorize(opts) {
        const chain = opts?.chain || 'solana:mainnet';
        const identityName = opts?.identity?.name || '';
        const identityUri = opts?.identity?.uri || '';
        const identityIcon = opts?.identity?.icon || '';
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
          throw new Error(res.error || 'Authorization failed');
        }
        return res;
      },

      async signAndSendTransactions(args) {
        const txList = normalizeTransactions(args);
        if (txList.length === 0) {
          return [];
        }
        const b64List = txList.map((item) => {
          const rawBytes = serializeTx(item);
          return uint8ArrayToBase64(rawBytes);
        });
        const res = await ShaheenModule.signAndSend(
          session.sessionId,
          JSON.stringify(b64List)
        );
        if (!res.success) {
          throw new Error(res.error || 'Sign and send transaction failed');
        }
        return res.signatures || (res.signature ? [res.signature] : []);
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
        const res = await ShaheenModule.signTransactions(
          session.sessionId,
          JSON.stringify(b64List)
        );
        if (!res.success) {
          throw new Error(res.error || 'Sign transaction failed');
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
      },
    };

    return await callback(wallet);
  } finally {
    await ShaheenModule.closeSession(session.sessionId).catch(() => {});
  }
}
