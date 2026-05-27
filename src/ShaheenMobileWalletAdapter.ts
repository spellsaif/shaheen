import { BaseSignerWalletAdapter, WalletName, WalletReadyState } from '@solana/wallet-adapter-base';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { executeTransactionSync } from './index';

declare var Buffer: any;
declare var atob: any;

export const ShaheenWalletName = 'Solana Mobile (Shaheen)' as WalletName<'Solana Mobile (Shaheen)'>;

function toHexString(byteArray: Uint8Array): string {
  return Array.from(byteArray, (byte) => {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
}

export class ShaheenMobileWalletAdapter extends BaseSignerWalletAdapter {
  name = ShaheenWalletName;
  url = 'https://shaheen.dev';
  icon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjOTkzMmNjIj48cGF0aCBkPSJNMTIgMkwyIDdsMTAgNSA5LTUtOS01em0wIDE4bC04LTMuNVY5LjVsOCAzLjUgOC0zLjV2Ny41bC04IDMuNXoiLz48L3N2Zz4=';
  readyState = WalletReadyState.Installed;
  supportedTransactionVersions = new Set(['legacy', 0] as const);

  private _publicKey: PublicKey | null = null;
  private _connecting = false;

  constructor() {
    super();
  }

  get publicKey() {
    return this._publicKey;
  }

  get connected() {
    return !!this._publicKey;
  }

  get connecting() {
    return this._connecting;
  }

  async connect(): Promise<void> {
    try {
      this._connecting = true;
      this._publicKey = new PublicKey("37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B");
      this.emit('connect', this._publicKey);
    } catch (e: any) {
      this.emit('error', e);
      throw e;
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this._publicKey = null;
    this.emit('disconnect');
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    if (!this.connected) throw new Error('Wallet not connected');

    const tx = transaction as any;
    
    // For VersionedTransaction, we retrieve instructions from the message
    const instruction = tx.instructions ? tx.instructions[0] : tx.message?.compiledInstructions?.[0];
    if (!instruction) {
      throw new Error('No instructions found in transaction');
    }

    // Extract keys list safely
    let keys = [];
    if (instruction.keys) {
      keys = instruction.keys.map((k: any) => ({
        pubkey: k.pubkey.toBase58(),
        isSigner: k.isSigner,
        isWritable: k.isWritable
      }));
    } else if (tx.message?.staticAccountKeys) {
      // Versioned transaction fallback mapping
      const accountKeys = tx.message.staticAccountKeys;
      keys = instruction.accountKeyIndexes.map((idx: number) => ({
        pubkey: accountKeys[idx].toBase58(),
        isSigner: tx.message.isAccountSigner(idx),
        isWritable: tx.message.isAccountWritable(idx)
      }));
    }

    const programId = instruction.programId ? instruction.programId.toBase58() : tx.message.staticAccountKeys[instruction.programIdIndex].toBase58();
    
    // Hex encode data payload without Node.js Buffer reliance
    const dataHex = instruction.data ? toHexString(new Uint8Array(instruction.data)) : toHexString(new Uint8Array(instruction.data));

    const result = executeTransactionSync('mainnet-beta', {
      programId,
      keys,
      dataHex
    });

    if (!result.success) {
      throw new Error(`Shaheen Native Signing Error: ${result.error}`);
    }

    const sigStr = atob(result.signature);
    const signature = new Uint8Array(sigStr.length);
    for (let i = 0; i < sigStr.length; i++) {
      signature[i] = sigStr.charCodeAt(i);
    }
    tx.addSignature(this._publicKey!, Buffer.from(signature));
    
    return transaction;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    const signed: T[] = [];
    for (const tx of transactions) {
      signed.push(await this.signTransaction(tx));
    }
    return signed;
  }
}
