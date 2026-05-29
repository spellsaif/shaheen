import { ShaheenAuthorizeResult, ShaheenSignResult } from './NativeShaheenSpec';
export { ShaheenAuthorizeResult, ShaheenSignResult };
export * from './ShaheenMobileWalletAdapter';
export declare function useShaheenWallet(): {
    executeTransaction: (cluster: "mainnet-beta" | "devnet", txHex: string) => Promise<ShaheenSignResult>;
    loading: boolean;
};
