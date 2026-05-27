import { useState } from 'react';
import { Linking } from 'react-native';
import ShaheenModule, { ShaheenAuthorizeResult, ShaheenSignResult } from './NativeShaheenSpec';

export { ShaheenAuthorizeResult, ShaheenSignResult };
export * from './ShaheenMobileWalletAdapter';

// Declare globals for the synchronous JSI methods
declare global {
  var shaheenGenerateAssociationSync: (() => string) | undefined;
  var shaheenAuthorizeSync: ((cluster: string) => string) | undefined;
  var shaheenSignTransactionsSync: ((cluster: string, txHex: string, authToken: string) => string) | undefined;
}

export function useShaheenWallet() {
  const [loading, setLoading] = useState(false);

  const executeTransaction = async (
    cluster: 'mainnet-beta' | 'devnet',
    txHex: string
  ): Promise<ShaheenSignResult> => {
    setLoading(true);
    try {
      const assoc = await ShaheenModule.generateAssociationUri();
      await Linking.openURL(assoc.uri);
      
      const auth = await ShaheenModule.connectAndAuthorize(cluster, assoc.port);
      if (!auth.success) {
        return { success: false, signature: '', signedTxHex: '', error: auth.error };
      }
      
      const assoc2 = await ShaheenModule.generateAssociationUri();
      await Linking.openURL(assoc2.uri);
      
      const result = await ShaheenModule.connectAndSign(cluster, assoc2.port, txHex, auth.authToken);
      return result;
    } catch (e: any) {
      return { success: false, signature: '', signedTxHex: '', error: e.message || 'Unknown Native Error' };
    } finally {
      setLoading(false);
    }
  };

  return { executeTransaction, loading };
}

export function generateAssociationSync(): { uri: string; port: number } {
  const g = globalThis as any;
  if (typeof g.shaheenGenerateAssociationSync === 'function') {
    return JSON.parse(g.shaheenGenerateAssociationSync());
  }
  throw new Error('Shaheen JSI bindings are not installed');
}

export function authorizeSync(cluster: string): ShaheenAuthorizeResult {
  const g = globalThis as any;
  if (typeof g.shaheenAuthorizeSync === 'function') {
    return JSON.parse(g.shaheenAuthorizeSync(cluster));
  }
  throw new Error('Shaheen JSI bindings are not installed');
}

export function signTransactionsSync(cluster: string, txHex: string, authToken: string): ShaheenSignResult {
  const g = globalThis as any;
  if (typeof g.shaheenSignTransactionsSync === 'function') {
    return JSON.parse(g.shaheenSignTransactionsSync(cluster, txHex, authToken));
  }
  throw new Error('Shaheen JSI bindings are not installed');
}
