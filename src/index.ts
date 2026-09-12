import { useState } from 'react';
import { transact, SolanaChain } from './transact';

export * from './transact';
export * from './NativeShaheenSpec';

export interface ShaheenExecuteResult {
  success: boolean;
  signature: string;
  signedTxHex: string;
  error: string;
}

function hexToUint8Array(hexString: string): Uint8Array {
  const matches = hexString.match(/.{1,2}/g);
  if (!matches) return new Uint8Array(0);
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

export function useShaheenWallet() {
  const [loading, setLoading] = useState(false);

  /**
   * Executes a transaction using a single, persistent MWA 2.0 session.
   * Eliminates the double-intent bug and keeps the Hermes JS thread unblocked.
   */
  const executeTransaction = async (
    cluster: 'mainnet-beta' | 'devnet',
    txHex: string
  ): Promise<ShaheenExecuteResult> => {
    setLoading(true);
    try {
      const chain: SolanaChain = cluster === 'devnet' ? 'solana:devnet' : 'solana:mainnet';
      const txBytes = hexToUint8Array(txHex);

      const result = await transact(async (wallet) => {
        await wallet.authorize({ chain });
        const signatures = await wallet.signAndSendTransactions([txBytes]);
        return signatures[0] || '';
      });

      return {
        success: true,
        signature: result,
        signedTxHex: txHex,
        error: '',
      };
    } catch (e: any) {
      return {
        success: false,
        signature: '',
        signedTxHex: '',
        error: e.message || 'Unknown Native Error',
      };
    } finally {
      setLoading(false);
    }
  };

  return { executeTransaction, loading };
}
