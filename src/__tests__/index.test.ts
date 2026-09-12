// Mock peer dependencies to prevent ES module resolution issues
jest.mock('@solana/web3.js', () => {
  class MockPublicKey {
    private _val: string;
    constructor(val: string) { this._val = val; }
    toBase58() { return this._val; }
    toString() { return this._val; }
  }
  class MockTransaction {
    serialize(opts?: any) {
      return new Uint8Array([1, 2, 3]);
    }
    static from(bytes: Uint8Array) {
      return new MockTransaction();
    }
  }
  class MockVersionedTransaction {
    serialize() {
      return new Uint8Array([4, 5, 6]);
    }
    static deserialize(bytes: Uint8Array) {
      return new MockVersionedTransaction();
    }
    get version() { return 0; }
  }
  return {
    PublicKey: MockPublicKey,
    Transaction: MockTransaction,
    VersionedTransaction: MockVersionedTransaction,
  };
});

jest.mock('react-native', () => ({
  TurboModuleRegistry: {
    getEnforcing: jest.fn(),
  },
  Linking: {
    openURL: jest.fn().mockResolvedValue(true),
  },
  Platform: {
    OS: 'ios',
  },
}));

import { transact } from '../index';
import ShaheenModule from '../NativeShaheenSpec';
import { Linking, Platform } from 'react-native';

jest.mock('../NativeShaheenSpec', () => ({
  __esModule: true,
  default: {
    createSession: jest.fn(),
    launchWalletIntent: jest.fn(),
    connectAndAuthorizeSession: jest.fn(),
    signAndSend: jest.fn(),
    signTransactions: jest.fn(),
    closeSession: jest.fn(),
  },
}));

describe('Shaheen MWA 2.0 Native Protocol Engine Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Linking.openURL as jest.Mock).mockResolvedValue(true);
    Platform.OS = 'ios';
  });

  describe('MWA 2.0 transact() Core Lifecycle', () => {
    it('executes authorize with custom identity and signAndSend in a single session', async () => {
      (ShaheenModule.createSession as jest.Mock).mockResolvedValue({
        success: true,
        sessionId: 'session-uuid-123',
        uri: 'solana-wallet:/v1/associate/local?association=xyz&port=50000&v=2',
        port: 50000,
        associationToken: 'xyz',
      });

      (ShaheenModule.connectAndAuthorizeSession as jest.Mock).mockResolvedValue({
        success: true,
        authToken: 'auth-tok-123',
        publicKey: '11111111111111111111111111111111',
        accounts: [{ address: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', label: 'Main' }],
        error: '',
      });

      (ShaheenModule.signAndSend as jest.Mock).mockResolvedValue({
        success: true,
        signatures: ['signature123'],
        signature: 'signature123',
        error: '',
      });

      (ShaheenModule.closeSession as jest.Mock).mockResolvedValue(undefined);

      const result = await transact(async (wallet) => {
        const auth = await wallet.authorize({
          chain: 'solana:mainnet',
          identity: {
            name: 'Super Dapp',
            uri: 'https://superdapp.com',
            icon: 'icon.png',
          },
        });
        expect(auth.authToken).toBe('auth-tok-123');

        const sigs = await wallet.signAndSendTransactions([new Uint8Array([1, 2, 3])]);
        return sigs[0];
      });

      expect(result).toBe('signature123');
      expect(Linking.openURL).toHaveBeenCalledWith(
        'solana-wallet:/v1/associate/local?association=xyz&port=50000&v=2'
      );
      expect(ShaheenModule.connectAndAuthorizeSession).toHaveBeenCalledWith(
        'session-uuid-123',
        '',
        'solana:mainnet',
        '',
        'Super Dapp',
        'https://superdapp.com',
        'icon.png'
      );
      expect(ShaheenModule.signAndSend).toHaveBeenCalledTimes(1);
      expect(ShaheenModule.closeSession).toHaveBeenCalledWith('session-uuid-123');
    });

    it('cleans up session in finally block even on authorization error', async () => {
      (ShaheenModule.createSession as jest.Mock).mockResolvedValue({
        success: true,
        sessionId: 'session-fail-1',
        uri: 'solana-wallet://fail',
        port: 50001,
        associationToken: 'tok',
      });

      (ShaheenModule.connectAndAuthorizeSession as jest.Mock).mockResolvedValue({
        success: false,
        authToken: '',
        publicKey: '',
        accounts: [],
        error: 'User rejected',
      });

      await expect(
        transact(async (wallet) => {
          await wallet.authorize();
        })
      ).rejects.toThrow('User rejected');

      expect(ShaheenModule.closeSession).toHaveBeenCalledWith('session-fail-1');
    });

    it('invokes launchWalletIntent on Android when available', async () => {
      Platform.OS = 'android';
      (ShaheenModule.launchWalletIntent as jest.Mock).mockResolvedValue(true);

      (ShaheenModule.createSession as jest.Mock).mockResolvedValue({
        success: true,
        sessionId: 'session-android-1',
        uri: 'solana-wallet:/v1/associate/local?association=xyz&port=50000&v=2',
        port: 50000,
        associationToken: 'xyz',
      });

      (ShaheenModule.connectAndAuthorizeSession as jest.Mock).mockResolvedValue({
        success: true,
        authToken: 'auth-android',
        publicKey: '11111111111111111111111111111111',
        accounts: [],
        error: '',
      });
      (ShaheenModule.closeSession as jest.Mock).mockResolvedValue(undefined);

      await transact(async (wallet) => {
        await wallet.authorize();
      });

      expect(ShaheenModule.launchWalletIntent).toHaveBeenCalledWith(
        'solana-wallet:/v1/associate/local?association=xyz&port=50000&v=2'
      );
      expect(Linking.openURL).not.toHaveBeenCalled();
    });
  });

  describe('True Transaction Batching Tests', () => {
    it('batches multiple transactions in a single signAndSend call', async () => {
      (ShaheenModule.createSession as jest.Mock).mockResolvedValue({
        success: true,
        sessionId: 'session-batch-1',
        uri: 'solana-wallet://batch',
        port: 50000,
        associationToken: 'tok',
      });

      (ShaheenModule.connectAndAuthorizeSession as jest.Mock).mockResolvedValue({
        success: true,
        authToken: 'auth-batch',
        publicKey: '11111111111111111111111111111111',
        accounts: [],
        error: '',
      });

      (ShaheenModule.signAndSend as jest.Mock).mockResolvedValue({
        success: true,
        signatures: ['sig_batch_1', 'sig_batch_2', 'sig_batch_3'],
        signature: 'sig_batch_1',
        error: '',
      });

      const tx1 = new Uint8Array([1, 2]);
      const tx2 = new Uint8Array([3, 4]);
      const tx3 = new Uint8Array([5, 6]);

      const sigs = await transact(async (wallet) => {
        await wallet.authorize();
        return await wallet.signAndSendTransactions([tx1, tx2, tx3]);
      });

      expect(sigs).toEqual(['sig_batch_1', 'sig_batch_2', 'sig_batch_3']);
      // Must be called EXACTLY ONCE with all 3 transactions batched in JSON
      expect(ShaheenModule.signAndSend).toHaveBeenCalledTimes(1);

      const [calledSessionId, calledPayloadJson] = (ShaheenModule.signAndSend as jest.Mock).mock.calls[0];
      expect(calledSessionId).toBe('session-batch-1');
      const parsed = JSON.parse(calledPayloadJson);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(3);
    });

    it('batches multiple transactions in a single signTransactions call', async () => {
      (ShaheenModule.createSession as jest.Mock).mockResolvedValue({
        success: true,
        sessionId: 'session-batch-2',
        uri: 'solana-wallet://batch',
        port: 50000,
        associationToken: 'tok',
      });

      (ShaheenModule.connectAndAuthorizeSession as jest.Mock).mockResolvedValue({
        success: true,
        authToken: 'auth-batch',
        publicKey: '11111111111111111111111111111111',
        accounts: [],
        error: '',
      });

      // Base64 for [10, 20] is 'ChQ=' and [30, 40] is 'Higg'
      (ShaheenModule.signTransactions as jest.Mock).mockResolvedValue({
        success: true,
        signedTxBase64: 'ChQ=',
        signedTxsBase64: ['ChQ=', 'Higg'],
        error: '',
      });

      const tx1 = new Uint8Array([1, 2]);
      const tx2 = new Uint8Array([3, 4]);

      const signed = await transact(async (wallet) => {
        await wallet.authorize();
        return await wallet.signTransactions({ transactions: [tx1, tx2] });
      });

      expect(signed).toHaveLength(2);
      expect(ShaheenModule.signTransactions).toHaveBeenCalledTimes(1);

      const [calledSessionId, calledPayloadJson] = (ShaheenModule.signTransactions as jest.Mock).mock.calls[0];
      expect(calledSessionId).toBe('session-batch-2');
      const parsed = JSON.parse(calledPayloadJson);
      expect(parsed).toHaveLength(2);
    });
  });
});
