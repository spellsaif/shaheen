import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface ShaheenSessionInfo {
  success: boolean;
  sessionId: string;
  uri: string;
  port: number;
  associationToken: string;
  errorCode?: string;
  error?: string;
}

export interface ShaheenAccount {
  address: string; // base64 encoded
  displayAddress?: string; // base58 formatted
  label?: string;
}

export interface ShaheenAuthorizeSessionResult {
  success: boolean;
  authToken: string;
  publicKey: string;
  accounts: ShaheenAccount[];
  errorCode?: string;
  error: string;
}

export interface ShaheenSignAndSendResult {
  success: boolean;
  signatures: string[];
  signature: string;
  errorCode?: string;
  error: string;
}

export interface ShaheenSignTransactionsResult {
  success: boolean;
  signedTxBase64: string;
  signedTxsBase64: string[];
  errorCode?: string;
  error: string;
}

export interface ShaheenSignMessagesResult {
  success: boolean;
  signedPayloads: string[];
  signedPayload: string;
  errorCode?: string;
  error: string;
}

export interface ShaheenGetCapabilitiesResult {
  success: boolean;
  maxTransactionsPerRequest?: number;
  maxMessagesPerRequest?: number;
  supportedTransactionVersions: string[];
  features: string[];
  errorCode?: string;
  error: string;
}

export interface ShaheenDeauthorizeResult {
  success: boolean;
  errorCode?: string;
  error: string;
}

export interface Spec extends TurboModule {
  // --- Modern MWA 2.0 Multi-Session API ---
  createSession(port: number): Promise<ShaheenSessionInfo>;
  launchWalletIntent?(uri: string): Promise<boolean>;
  connectAndAuthorizeSession(
    sessionId: string,
    wsUrl: string,
    chain: string,
    authToken: string,
    identityName: string,
    identityUri: string,
    identityIcon: string
  ): Promise<ShaheenAuthorizeSessionResult>;
  signAndSend(
    sessionId: string,
    txPayloadsJson: string
  ): Promise<ShaheenSignAndSendResult>;
  /**
   * @deprecated Deprecated in MWA 2.0. Wallets may reject this method. Use signAndSend instead.
   */
  signTransactions(
    sessionId: string,
    txPayloadsJson: string
  ): Promise<ShaheenSignTransactionsResult>;
  signMessages(
    sessionId: string,
    addressesJson: string,
    payloadsJson: string
  ): Promise<ShaheenSignMessagesResult>;
  getCapabilities(sessionId: string): Promise<ShaheenGetCapabilitiesResult>;
  deauthorize(sessionId: string): Promise<ShaheenDeauthorizeResult>;
  closeSession(sessionId: string): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ShaheenModule');
