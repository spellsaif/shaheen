export * from './transact';
export * from './NativeShaheenSpec';
export interface ShaheenExecuteResult {
    success: boolean;
    signature: string;
    signedTxHex: string;
    error: string;
}
export declare function useShaheenWallet(): {
    executeTransaction: (cluster: "mainnet-beta" | "devnet", txHex: string) => Promise<ShaheenExecuteResult>;
    loading: boolean;
};
