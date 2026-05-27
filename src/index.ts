import { useState } from 'react';
import ShaheenModule, { ShaheenInstruction, ShaheenExecutionResult } from './NativeShaheenSpec';

export { ShaheenInstruction, ShaheenExecutionResult };
export * from './ShaheenMobileWalletAdapter';

// Declare global for the synchronous JSI method
declare global {
  var shaheenExecuteSync: ((cluster: string, instruction: any) => string) | undefined;
}

export function useShaheenWallet() {
  const [loading, setLoading] = useState(false);

  const executeTransaction = async (
    cluster: 'mainnet-beta' | 'devnet',
    instruction: ShaheenInstruction
  ): Promise<ShaheenExecutionResult> => {
    setLoading(true);
    try {
      const result = await ShaheenModule.connectAndExecute(cluster, instruction);
      return result;
    } catch (e: any) {
      return { success: false, signature: '', error: e.message || 'Unknown Native Error' };
    } finally {
      setLoading(false);
    }
  };

  return { executeTransaction, loading };
}

/**
 * Synchronous transaction execution using the C++ JSI direct binding.
 * Intercepts execution synchronously from Hermes runtime memory references.
 */
export function executeTransactionSync(
  cluster: 'mainnet-beta' | 'devnet',
  instruction: ShaheenInstruction
): ShaheenExecutionResult {
  const g = globalThis as any;
  if (typeof g.shaheenExecuteSync === 'function') {
    try {
      const resultJson = g.shaheenExecuteSync(cluster, instruction);
      return JSON.parse(resultJson);
    } catch (e: any) {
      return { success: false, signature: '', error: e.message || 'JSI Execution Error' };
    }
  } else {
    return {
      success: false,
      signature: '',
      error: 'Shaheen JSI bindings are not installed in the runtime. Ensure Native Module is initialized.'
    };
  }
}
