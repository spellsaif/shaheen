import { BaseSignerWalletAdapter, WalletName, WalletReadyState } from '@solana/wallet-adapter-base';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
export declare const ShaheenWalletName: WalletName<"Solana Mobile (Shaheen)">;
export declare class ShaheenMobileWalletAdapter extends BaseSignerWalletAdapter {
    name: WalletName<"Solana Mobile (Shaheen)">;
    url: string;
    icon: string;
    readyState: WalletReadyState;
    supportedTransactionVersions: Set<0 | "legacy">;
    private _publicKey;
    private _connecting;
    constructor();
    get publicKey(): PublicKey | null;
    get connected(): boolean;
    get connecting(): boolean;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
    signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
}
