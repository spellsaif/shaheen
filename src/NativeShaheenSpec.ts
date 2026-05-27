import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface ShaheenAuthorizeResult {
  success: boolean;
  publicKey: string;
  authToken: string;
  error: string;
}

export interface ShaheenSignResult {
  success: boolean;
  signature: string;
  signedTxHex: string;
  error: string;
}

export interface Spec extends TurboModule {
  generateAssociationUri(): Promise<{ uri: string; port: number }>;
  connectAndAuthorize(cluster: string, port: number): Promise<ShaheenAuthorizeResult>;
  connectAndSign(
    cluster: string,
    port: number,
    txHex: string,
    authToken: string
  ): Promise<ShaheenSignResult>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ShaheenModule');
