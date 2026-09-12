import type { TurboModule } from 'react-native';
export interface ShaheenSessionInfo {
    success: boolean;
    sessionId: string;
    uri: string;
    port: number;
    associationToken: string;
    error?: string;
}
export interface ShaheenAccount {
    address: string;
    displayAddress?: string;
    label?: string;
}
export interface ShaheenAuthorizeSessionResult {
    success: boolean;
    authToken: string;
    publicKey: string;
    accounts: ShaheenAccount[];
    error: string;
}
export interface ShaheenSignAndSendResult {
    success: boolean;
    signatures: string[];
    signature: string;
    error: string;
}
export interface ShaheenSignTransactionsResult {
    success: boolean;
    signedTxBase64: string;
    signedTxsBase64: string[];
    error: string;
}
export interface Spec extends TurboModule {
    createSession(port: number): Promise<ShaheenSessionInfo>;
    launchWalletIntent?(uri: string): Promise<boolean>;
    connectAndAuthorizeSession(sessionId: string, wsUrl: string, chain: string, authToken: string, identityName: string, identityUri: string, identityIcon: string): Promise<ShaheenAuthorizeSessionResult>;
    signAndSend(sessionId: string, txPayloadsJson: string): Promise<ShaheenSignAndSendResult>;
    signTransactions(sessionId: string, txPayloadsJson: string): Promise<ShaheenSignTransactionsResult>;
    closeSession(sessionId: string): Promise<void>;
}
declare const _default: Spec;
export default _default;
