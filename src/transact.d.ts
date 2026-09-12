import { ShaheenAuthorizeSessionResult } from './NativeShaheenSpec';
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
    relayUrl?: string;
}
export type AnyTransaction = Uint8Array | {
    serialize(config?: any): Uint8Array;
};
export type SignAndSendArgs = AnyTransaction[] | {
    transactions: AnyTransaction[];
};
export type SignTransactionsArgs = AnyTransaction[] | {
    transactions: AnyTransaction[];
};
export interface TransactWallet {
    authorize(options?: AuthorizeOptions): Promise<ShaheenAuthorizeSessionResult>;
    signAndSendTransactions(args: SignAndSendArgs): Promise<string[]>;
    signTransactions<T extends AnyTransaction>(args: T[] | {
        transactions: T[];
    }): Promise<T[]>;
}
/**
 * Modern Android MWA 2.0 transact pattern:
 * - Uses native MWA 2.0 via ShaheenModule (local loopback WebSocket + Android intent).
 *
 * Automatically manages session creation, intent dispatch, multi-request RPC execution,
 * and secret zeroization on completion.
 */
export declare function transact<T>(callback: (wallet: TransactWallet) => Promise<T>, options?: TransactOptions): Promise<T>;
