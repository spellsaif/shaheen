import { useState } from 'react';
import { Linking } from 'react-native';
import ShaheenModule, { ShaheenAuthorizeResult, ShaheenSignResult } from './NativeShaheenSpec';

export { ShaheenAuthorizeResult, ShaheenSignResult };
export * from './ShaheenMobileWalletAdapter';

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

