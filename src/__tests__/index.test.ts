// Mock peer dependencies to prevent ES module resolution issues
jest.mock('@solana/web3.js', () => ({
  PublicKey: class {
    val: string;
    constructor(val: string) { this.val = val; }
    toBase58() { return this.val; }
  },
  Transaction: class {}
}));
jest.mock('@solana/wallet-adapter-base', () => ({
  BaseSignerWalletAdapter: class {},
  WalletReadyState: { Installed: 'Installed' }
}));

import { executeTransactionSync } from '../index';
import ShaheenModule from '../NativeShaheenSpec';

// Mock the Native Module
jest.mock('../NativeShaheenSpec', () => ({
  __esModule: true,
  default: {
    connectAndExecute: jest.fn(),
  },
}));

describe('Shaheen JS Layer Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).shaheenExecuteSync = undefined;
  });

  it('executeTransaction resolves successfully via TurboModule spec', async () => {
    const mockResult = {
      success: true,
      signature: 'test_sig',
      error: '',
    };
    (ShaheenModule.connectAndExecute as jest.Mock).mockResolvedValue(mockResult);

    const instruction = {
      programId: 'Memo1U2x22222222222222222222222222222225',
      keys: [],
      dataHex: '00',
    };

    const res = await ShaheenModule.connectAndExecute('devnet', instruction);
    expect(res.success).toBe(true);
    expect(res.signature).toBe('test_sig');
    expect(ShaheenModule.connectAndExecute).toHaveBeenCalledWith('devnet', instruction);
  });

  it('executeTransactionSync calls JSI correctly', () => {
    (global as any).shaheenExecuteSync = jest.fn().mockReturnValue(
      JSON.stringify({
        success: true,
        signature: 'jsi_sig',
        error: '',
      })
    );

    const instruction = {
      programId: 'Memo1U2x22222222222222222222222222222225',
      keys: [],
      dataHex: '00',
    };

    const res = executeTransactionSync('devnet', instruction);
    expect(res.success).toBe(true);
    expect(res.signature).toBe('jsi_sig');
    expect((global as any).shaheenExecuteSync).toHaveBeenCalledWith('devnet', instruction);
  });

  it('executeTransactionSync returns error if JSI is not installed', () => {
    const instruction = {
      programId: 'Memo1U2x22222222222222222222222222222225',
      keys: [],
      dataHex: '00',
    };

    const res = executeTransactionSync('devnet', instruction);
    expect(res.success).toBe(false);
    expect(res.signature).toBe('');
    expect(res.error).toContain('JSI bindings are not installed');
  });
});
