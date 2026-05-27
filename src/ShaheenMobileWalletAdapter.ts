import { BaseSignerWalletAdapter, WalletName, WalletReadyState } from '@solana/wallet-adapter-base';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { Linking } from 'react-native';
import ShaheenModule from './NativeShaheenSpec';

export const ShaheenWalletName = 'Solana Mobile (Shaheen)' as WalletName<'Solana Mobile (Shaheen)'>;

function toHexString(byteArray: Uint8Array): string {
  return Array.from(byteArray, (byte) => {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function fromHexString(hexString: string): Uint8Array {
  const matches = hexString.match(/.{1,2}/g);
  if (!matches) return new Uint8Array(0);
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

export class ShaheenMobileWalletAdapter extends BaseSignerWalletAdapter {
  name = ShaheenWalletName;
  url = 'https://shaheen.dev';
  icon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjOTkzMmNjIj48cGF0aCBkPSJNMTIgMkwyIDdsMTAgNSA5LTUtOS01em0wIDE4bC04LTMuNVY5LjVsOCAzLjUgOC0zLjV2Ny41bC04IDMuNXoiLz48L3N2Zz4=';
  readyState = WalletReadyState.Installed;
  supportedTransactionVersions = new Set(['legacy', 0] as const);

  private _publicKey: PublicKey | null = null;
  private _authToken: string | null = null;
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
      
      const assoc = await ShaheenModule.generateAssociationUri();
      await Linking.openURL(assoc.uri);
      
      const authResult = await ShaheenModule.connectAndAuthorize('mainnet-beta', assoc.port);
      if (!authResult.success) {
        throw new Error(`Shaheen Native Authorization Error: ${authResult.error}`);
      }
      
      this._publicKey = new PublicKey(authResult.publicKey);
      this._authToken = authResult.authToken;
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
    this._authToken = null;
    this.emit('disconnect');
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    if (!this.connected || !this._authToken) throw new Error('Wallet not connected');

    const tx = transaction as any;
    const isVersioned = 'version' in tx;
    const txBytes = isVersioned 
      ? tx.serialize() 
      : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const txHex = toHexString(txBytes);

    const assoc = await ShaheenModule.generateAssociationUri();
    await Linking.openURL(assoc.uri);

    const result = await ShaheenModule.connectAndSign('mainnet-beta', assoc.port, txHex, this._authToken);
    if (!result.success) {
      throw new Error(`Shaheen Native Signing Error: ${result.error}`);
    }

    const signedTxBytes = fromHexString(result.signedTxHex);
    const signedTx = isVersioned 
      ? VersionedTransaction.deserialize(signedTxBytes) 
      : Transaction.from(signedTxBytes);

    return signedTx as T;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    const signed: T[] = [];
    for (const tx of transactions) {
      signed.push(await this.signTransaction(tx));
    }
    return signed;
  }
}
