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

import {
  transact,
  ShaheenError,
  UserRejectedError,
  TimeoutError,
  AuthorizationError,
} from '../index';
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
    signMessages: jest.fn(),
    getCapabilities: jest.fn(),
    deauthorize: jest.fn(),
    closeSession: jest.fn(),
  },
}));

describe('Shaheen MWA 2.0 Native Protocol Engine Tests (v1.1.0)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Linking.openURL as jest.Mock).mockResolvedValue(true);
    Platform.OS = 'ios';
  });

  describe('MWA 2.0 transact() Core Lifecycle & Backward Compatibility', () => {
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
        errorCode: 'USER_REJECTED',
        error: 'User rejected the request',
      });

      await expect(
        transact(async (wallet) => {
          await wallet.authorize();
        })
      ).rejects.toThrow(UserRejectedError);

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

    it('maps legacy cluster parameter to chain in authorize()', async () => {
      (ShaheenModule.createSession as jest.Mock).mockResolvedValue({
        success: true,
        sessionId: 'session-cluster-1',
        uri: 'solana-wallet://devnet',
        port: 50000,
        associationToken: 'tok',
      });

      (ShaheenModule.connectAndAuthorizeSession as jest.Mock).mockResolvedValue({
        success: true,
        authToken: 'auth-cluster',
        publicKey: '11111111111111111111111111111111',
        accounts: [],
        error: '',
      });
      (ShaheenModule.closeSession as jest.Mock).mockResolvedValue(undefined);

      await transact(async (wallet) => {
        await wallet.authorize({ cluster: 'devnet' });
      });

      expect(ShaheenModule.connectAndAuthorizeSession).toHaveBeenCalledWith(
        'session-cluster-1',
        '',
        'solana:devnet',
        '',
        '',
        '',
        ''
      );
    });
  });

  describe('New MWA 2.0 Features in 1.1.0', () => {
    it('queries wallet capabilities via getCapabilities()', async () => {
      (ShaheenModule.createSession as jest.Mock).mockResolvedValue({
        success: true,
        sessionId: 'session-caps-1',
        uri: 'solana-wallet://caps',
        port: 50000,
        associationToken: 'tok',
      });

      (ShaheenModule.getCapabilities as jest.Mock).mockResolvedValue({
        success: true,
        maxTransactionsPerRequest: 5,
        maxMessagesPerRequest: 10,
        supportedTransactionVersions: ['legacy', '0'],
        features: ['solana:signMessages'],
        error: '',
      });

      const caps = await transact(async (wallet) => {
        return await wallet.getCapabilities();
      });

      expect(caps.maxTransactionsPerRequest).toBe(5);
      expect(caps.maxMessagesPerRequest).toBe(10);
      expect(caps.supportedTransactionVersions).toContain('0');
      expect(ShaheenModule.getCapabilities).toHaveBeenCalledWith('session-caps-1');
    });

    it('signs arbitrary messages via signMessages()', async () => {
      (ShaheenModule.createSession as jest.Mock).mockResolvedValue({
        success: true,
        sessionId: 'session-msg-1',
        uri: 'solana-wallet://msg',
        port: 50000,
        associationToken: 'tok',
      });

      (ShaheenModule.connectAndAuthorizeSession as jest.Mock).mockResolvedValue({
        success: true,
        authToken: 'auth-msg',
        publicKey: '11111111111111111111111111111111',
        accounts: [{ address: 'dGVzdF9hZGRyZXNzXzMyYnl0ZXNfbG9uZw==' }],
        error: '',
      });

      // Base64 of [42, 43] is 'Kis='
      (ShaheenModule.signMessages as jest.Mock).mockResolvedValue({
        success: true,
        signedPayloads: ['Kis='],
        signedPayload: 'Kis=',
        error: '',
      });

      const signed = await transact(async (wallet) => {
        await wallet.authorize();
        return await wallet.signMessages(['Sign in to Shaheen']);
      });

      expect(signed).toHaveLength(1);
      expect(signed[0]).toEqual(new Uint8Array([42, 43]));
      expect(ShaheenModule.signMessages).toHaveBeenCalledWith(
        'session-msg-1',
        JSON.stringify(['dGVzdF9hZGRyZXNzXzMyYnl0ZXNfbG9uZw==']),
        expect.any(String)
      );
    });

    it('deauthorizes session via deauthorize()', async () => {
      (ShaheenModule.createSession as jest.Mock).mockResolvedValue({
        success: true,
        sessionId: 'session-deauth-1',
        uri: 'solana-wallet://deauth',
        port: 50000,
        associationToken: 'tok',
      });

      (ShaheenModule.deauthorize as jest.Mock).mockResolvedValue({
        success: true,
        error: '',
      });

      await transact(async (wallet) => {
        await wallet.deauthorize();
      });

      expect(ShaheenModule.deauthorize).toHaveBeenCalledWith('session-deauth-1');
    });
  });

  describe('Capability-Aware Batching Tests', () => {
    it('automatically chunks transactions according to maxTransactionsPerRequest', async () => {
      (ShaheenModule.createSession as jest.Mock).mockResolvedValue({
        success: true,
        sessionId: 'session-batch-chunk',
        uri: 'solana-wallet://batch',
        port: 50000,
        associationToken: 'tok',
      });

      (ShaheenModule.getCapabilities as jest.Mock).mockResolvedValue({
        success: true,
        maxTransactionsPerRequest: 2, // Wallet limit is 2 per request!
        maxMessagesPerRequest: 5,
        supportedTransactionVersions: ['legacy', '0'],
        features: [],
        error: '',
      });

      (ShaheenModule.signAndSend as jest.Mock)
        .mockResolvedValueOnce({
          success: true,
          signatures: ['sig_1', 'sig_2'],
          signature: 'sig_1',
          error: '',
        })
        .mockResolvedValueOnce({
          success: true,
          signatures: ['sig_3', 'sig_4'],
          signature: 'sig_3',
          error: '',
        })
        .mockResolvedValueOnce({
          success: true,
          signatures: ['sig_5'],
          signature: 'sig_5',
          error: '',
        });

      const txs = [
        new Uint8Array([1]),
        new Uint8Array([2]),
        new Uint8Array([3]),
        new Uint8Array([4]),
        new Uint8Array([5]),
      ];

      const sigs = await transact(async (wallet) => {
        await wallet.getCapabilities();
        return await wallet.signAndSendTransactions(txs);
      });

      // 5 transactions with limit=2 must be sent in 3 calls: [2, 2, 1]
      expect(sigs).toEqual(['sig_1', 'sig_2', 'sig_3', 'sig_4', 'sig_5']);
      expect(ShaheenModule.signAndSend).toHaveBeenCalledTimes(3);

      const firstCallParsed = JSON.parse((ShaheenModule.signAndSend as jest.Mock).mock.calls[0][1]);
      expect(firstCallParsed).toHaveLength(2);

      const secondCallParsed = JSON.parse((ShaheenModule.signAndSend as jest.Mock).mock.calls[1][1]);
      expect(secondCallParsed).toHaveLength(2);

      const thirdCallParsed = JSON.parse((ShaheenModule.signAndSend as jest.Mock).mock.calls[2][1]);
      expect(thirdCallParsed).toHaveLength(1);
    });
  });

  describe('Typed Error Taxonomy Tests', () => {
    it('throws UserRejectedError when wallet indicates rejection', async () => {
      (ShaheenModule.createSession as jest.Mock).mockResolvedValue({
        success: true,
        sessionId: 'session-err-reject',
        uri: 'solana-wallet://err',
        port: 50000,
        associationToken: 'tok',
      });

      (ShaheenModule.connectAndAuthorizeSession as jest.Mock).mockResolvedValue({
        success: false,
        errorCode: 'USER_REJECTED',
        error: 'User declined transaction request',
      });

      await expect(
        transact(async (wallet) => {
          await wallet.authorize();
        })
      ).rejects.toThrow(UserRejectedError);
    });

    it('throws TimeoutError when connection times out', async () => {
      (ShaheenModule.createSession as jest.Mock).mockResolvedValue({
        success: true,
        sessionId: 'session-err-timeout',
        uri: 'solana-wallet://err',
        port: 50000,
        associationToken: 'tok',
      });

      (ShaheenModule.connectAndAuthorizeSession as jest.Mock).mockResolvedValue({
        success: false,
        errorCode: 'TIMEOUT_ERROR',
        error: 'Failed to connect to wallet socket within 15s',
      });

      await expect(
        transact(async (wallet) => {
          await wallet.authorize();
        })
      ).rejects.toThrow(TimeoutError);
    });
  });
});
