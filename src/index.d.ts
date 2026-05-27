import { ShaheenInstruction, ShaheenExecutionResult } from './NativeShaheenSpec';
export { ShaheenInstruction, ShaheenExecutionResult };
export * from './ShaheenMobileWalletAdapter';
declare global {
    var shaheenExecuteSync: ((cluster: string, instruction: any) => string) | undefined;
}
export declare function useShaheenWallet(): {
    executeTransaction: (cluster: "mainnet-beta" | "devnet", instruction: ShaheenInstruction) => Promise<ShaheenExecutionResult>;
    loading: boolean;
};
/**
 * Synchronous transaction execution using the C++ JSI direct binding.
 * Intercepts execution synchronously from Hermes runtime memory references.
 */
export declare function executeTransactionSync(cluster: 'mainnet-beta' | 'devnet', instruction: ShaheenInstruction): ShaheenExecutionResult;
