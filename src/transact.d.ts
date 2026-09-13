import { ShaheenAuthorizeSessionResult, ShaheenGetCapabilitiesResult } from './NativeShaheenSpec';
export declare class ShaheenError extends Error {
    readonly code: string;
    constructor(message: string, code?: string);
}
export declare class UserRejectedError extends ShaheenError {
    constructor(message?: string);
}
export declare class TimeoutError extends ShaheenError {
    constructor(message?: string);
}
export declare class HandshakeError extends ShaheenError {
    constructor(message?: string);
}
export declare class AuthorizationError extends ShaheenError {
    constructor(message?: string);
}
export declare class WalletUnavailableError extends ShaheenError {
    constructor(message?: string);
}
export declare class CapabilityError extends ShaheenError {
    constructor(message?: string);
}
export declare class ProtocolError extends ShaheenError {
    constructor(message?: string);
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
    /**
     * @experimental Custom WebSocket relay URL override.
     * Full cross-device MWA remote reflector flow will be supported in a future release.
     */
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
export type AnyMessage = Uint8Array | string;
export type SignMessagesArgs = AnyMessage[] | {
    messages: AnyMessage[];
    addresses?: string[];
};
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
    signTransactions<T extends AnyTransaction>(args: T[] | {
        transactions: T[];
    }): Promise<T[]>;
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
export declare function transact<T>(callback: (wallet: TransactWallet) => Promise<T>, options?: TransactOptions): Promise<T>;
