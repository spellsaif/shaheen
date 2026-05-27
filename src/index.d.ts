import { ShaheenAuthorizeResult, ShaheenSignResult } from './NativeShaheenSpec';
export { ShaheenAuthorizeResult, ShaheenSignResult };
export * from './ShaheenMobileWalletAdapter';
declare global {
    var shaheenGenerateAssociationSync: (() => string) | undefined;
    var shaheenAuthorizeSync: ((cluster: string) => string) | undefined;
    var shaheenSignTransactionsSync: ((cluster: string, txHex: string, authToken: string) => string) | undefined;
}
export declare function useShaheenWallet(): {
    executeTransaction: (cluster: "mainnet-beta" | "devnet", txHex: string) => Promise<ShaheenSignResult>;
    loading: boolean;
};
export declare function generateAssociationSync(): {
    uri: string;
    port: number;
};
export declare function authorizeSync(cluster: string): ShaheenAuthorizeResult;
export declare function signTransactionsSync(cluster: string, txHex: string, authToken: string): ShaheenSignResult;
