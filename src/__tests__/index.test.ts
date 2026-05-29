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

jest.mock('@solana/wallet-adapter-base', () => {
  const { EventEmitter } = require('events');
  class MockBaseSignerWalletAdapter extends EventEmitter {}
  return {
    BaseSignerWalletAdapter: MockBaseSignerWalletAdapter,
    WalletReadyState: { Installed: 'Installed' },
    WalletName: { 'Solana Mobile (Shaheen)': 'Solana Mobile (Shaheen)' },
  };
});

jest.mock('react-native', () => ({
  TurboModuleRegistry: {
    getEnforcing: jest.fn(),
  },
  Linking: {
    openURL: jest.fn().mockResolvedValue(true),
  },
}));

import { ShaheenMobileWalletAdapter } from '../index';
import ShaheenModule from '../NativeShaheenSpec';
import { Linking } from 'react-native';

// Mock the Native Module
jest.mock('../NativeShaheenSpec', () => ({
  __esModule: true,
  default: {
    generateAssociationUri: jest.fn(),
    connectAndAuthorize: jest.fn(),
    connectAndSign: jest.fn(),
  },
}));

describe('Shaheen JS Layer Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).shaheenGenerateAssociationSync = undefined;
    (global as any).shaheenAuthorizeSync = undefined;
    (global as any).shaheenSignTransactionsSync = undefined;
    (Linking.openURL as jest.Mock).mockResolvedValue(true);
  });

  it('generateAssociationUri resolves successfully via TurboModule spec', async () => {
    const mockResult = { uri: 'solana-wallet://test', port: 55555 };
    (ShaheenModule.generateAssociationUri as jest.Mock).mockResolvedValue(mockResult);

    const res = await ShaheenModule.generateAssociationUri();
    expect(res.uri).toBe('solana-wallet://test');
    expect(res.port).toBe(55555);
  });

  it('connectAndAuthorize resolves successfully via TurboModule spec', async () => {
    const mockResult = { success: true, publicKey: '37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B', authToken: 'token', error: '' };
    (ShaheenModule.connectAndAuthorize as jest.Mock).mockResolvedValue(mockResult);

    const res = await ShaheenModule.connectAndAuthorize('devnet', 55555);
    expect(res.success).toBe(true);
    expect(res.publicKey).toBe('37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B');
    expect(res.authToken).toBe('token');
  });

  it('connectAndSign resolves successfully via TurboModule spec', async () => {
    const mockResult = { success: true, signature: 'test_sig', signedTxHex: 'aabbcc', error: '' };
    (ShaheenModule.connectAndSign as jest.Mock).mockResolvedValue(mockResult);

    const res = await ShaheenModule.connectAndSign('devnet', 55555, 'aabbcc', 'token');
    expect(res.success).toBe(true);
    expect(res.signature).toBe('test_sig');
    expect(res.signedTxHex).toBe('aabbcc');
  });

  describe('ShaheenMobileWalletAdapter Class Tests', () => {
    let adapter: ShaheenMobileWalletAdapter;

    beforeEach(() => {
      adapter = new ShaheenMobileWalletAdapter();
    });

    it('initializes with default unconnected state', () => {
      expect(adapter.connected).toBe(false);
      expect(adapter.connecting).toBe(false);
      expect(adapter.publicKey).toBeNull();
    });

    it('connect() completes successfully and sets keys', async () => {
      (ShaheenModule.generateAssociationUri as jest.Mock).mockResolvedValue({
        uri: 'solana-wallet://associate',
        port: 12345
      });
      (ShaheenModule.connectAndAuthorize as jest.Mock).mockResolvedValue({
        success: true,
        publicKey: '37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B',
        authToken: 'auth_token_mock',
        error: ''
      });

      const connectEventPromise = new Promise<void>((resolve) => {
        adapter.on('connect', (publicKey) => {
          expect(publicKey.toBase58()).toBe('37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B');
          resolve();
        });
      });

      await adapter.connect();

      expect(adapter.connected).toBe(true);
      expect(adapter.publicKey).not.toBeNull();
      expect(adapter.publicKey!.toBase58()).toBe('37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B');
      expect(Linking.openURL).toHaveBeenCalledWith('solana-wallet://associate');
      await connectEventPromise;
    });

    it('connect() throws and cleans up state on native authorize failure', async () => {
      (ShaheenModule.generateAssociationUri as jest.Mock).mockResolvedValue({
        uri: 'solana-wallet://associate',
        port: 12345
      });
      (ShaheenModule.connectAndAuthorize as jest.Mock).mockResolvedValue({
        success: false,
        publicKey: '',
        authToken: '',
        error: 'Wallet Rejected Session'
      });

      await expect(adapter.connect()).rejects.toThrow('Shaheen Native Authorization Error: Wallet Rejected Session');
      expect(adapter.connected).toBe(false);
      expect(adapter.publicKey).toBeNull();
    });

    it('connect() sets connecting to true while in-flight and false after completion', async () => {
      (ShaheenModule.generateAssociationUri as jest.Mock).mockResolvedValue({
        uri: 'solana-wallet://associate',
        port: 12345
      });
      
      let resolveAuthorize: (value: any) => void;
      const authorizePromise = new Promise((resolve) => {
        resolveAuthorize = resolve;
      });
      (ShaheenModule.connectAndAuthorize as jest.Mock).mockReturnValue(authorizePromise);

      const connectPromise = adapter.connect();

      expect(adapter.connecting).toBe(true);
      expect(adapter.connected).toBe(false);

      resolveAuthorize!({
        success: true,
        publicKey: '37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B',
        authToken: 'auth_token_mock',
        error: ''
      });

      await connectPromise;

      expect(adapter.connecting).toBe(false);
      expect(adapter.connected).toBe(true);
    });

    it('connect() throws and resets connecting if generateAssociationUri fails', async () => {
      (ShaheenModule.generateAssociationUri as jest.Mock).mockRejectedValue(new Error('Association Failed'));

      await expect(adapter.connect()).rejects.toThrow('Association Failed');
      expect(adapter.connecting).toBe(false);
      expect(adapter.connected).toBe(false);
    });

    it('connect() throws and resets connecting if Linking.openURL fails', async () => {
      (ShaheenModule.generateAssociationUri as jest.Mock).mockResolvedValue({
        uri: 'solana-wallet://associate',
        port: 12345
      });
      (Linking.openURL as jest.Mock).mockRejectedValue(new Error('Linking Failed'));

      await expect(adapter.connect()).rejects.toThrow('Linking Failed');
      expect(adapter.connecting).toBe(false);
      expect(adapter.connected).toBe(false);
    });

    it('signTransaction() throws on native sign failure', async () => {
      // Connect first
      (ShaheenModule.generateAssociationUri as jest.Mock).mockResolvedValue({
        uri: 'solana-wallet://associate',
        port: 12345
      });
      (ShaheenModule.connectAndAuthorize as jest.Mock).mockResolvedValue({
        success: true,
        publicKey: '37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B',
        authToken: 'auth_token_mock',
        error: ''
      });
      await adapter.connect();

      // Sign transaction
      const mockTx = {
        serialize: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
      };

      (ShaheenModule.connectAndSign as jest.Mock).mockResolvedValue({
        success: false,
        signature: '',
        signedTxHex: '',
        error: 'User Denied Signature'
      });

      await expect(adapter.signTransaction(mockTx as any)).rejects.toThrow('Shaheen Native Signing Error: User Denied Signature');
    });

    it('signTransaction() signs a legacy transaction correctly', async () => {
      // Connect first
      (ShaheenModule.generateAssociationUri as jest.Mock).mockResolvedValue({
        uri: 'solana-wallet://associate',
        port: 12345
      });
      (ShaheenModule.connectAndAuthorize as jest.Mock).mockResolvedValue({
        success: true,
        publicKey: '37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B',
        authToken: 'auth_token_mock',
        error: ''
      });
      await adapter.connect();

      // Sign transaction
      const mockTx = {
        serialize: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
      };

      (ShaheenModule.connectAndSign as jest.Mock).mockResolvedValue({
        success: true,
        signature: 'tx_signature',
        signedTxHex: '0102030405',
        error: ''
      });

      const signedTx = await adapter.signTransaction(mockTx as any);
      expect(signedTx).toBeDefined();
      expect(ShaheenModule.connectAndSign).toHaveBeenCalledWith(
        'mainnet-beta',
        12345,
        '010203',
        'auth_token_mock'
      );
    });

    it('signTransaction() signs a versioned transaction correctly', async () => {
      // Connect first
      (ShaheenModule.generateAssociationUri as jest.Mock).mockResolvedValue({
        uri: 'solana-wallet://associate',
        port: 12345
      });
      (ShaheenModule.connectAndAuthorize as jest.Mock).mockResolvedValue({
        success: true,
        publicKey: '37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B',
        authToken: 'auth_token_mock',
        error: ''
      });
      await adapter.connect();

      // Sign versioned transaction
      const mockVersionedTx = {
        version: 0,
        serialize: jest.fn().mockReturnValue(new Uint8Array([4, 5, 6])),
      };

      (ShaheenModule.connectAndSign as jest.Mock).mockResolvedValue({
        success: true,
        signature: 'versioned_signature',
        signedTxHex: '0405060708',
        error: ''
      });

      const signedTx = await adapter.signTransaction(mockVersionedTx as any);
      expect(signedTx).toBeDefined();
      expect(ShaheenModule.connectAndSign).toHaveBeenCalledWith(
        'mainnet-beta',
        12345,
        '040506',
        'auth_token_mock'
      );
    });

    it('signTransaction() throws if not connected', async () => {
      const mockTx = {};
      await expect(adapter.signTransaction(mockTx as any)).rejects.toThrow('Wallet not connected');
    });

    it('signAllTransactions() signs multiple transactions sequentially', async () => {
      // Connect first
      (ShaheenModule.generateAssociationUri as jest.Mock).mockResolvedValue({
        uri: 'solana-wallet://associate',
        port: 12345
      });
      (ShaheenModule.connectAndAuthorize as jest.Mock).mockResolvedValue({
        success: true,
        publicKey: '37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B',
        authToken: 'auth_token_mock',
        error: ''
      });
      await adapter.connect();

      const mockTxs = [
        { serialize: jest.fn().mockReturnValue(new Uint8Array([1])) },
        { serialize: jest.fn().mockReturnValue(new Uint8Array([2])) }
      ];

      (ShaheenModule.connectAndSign as jest.Mock).mockResolvedValue({
        success: true,
        signature: 'signature',
        signedTxHex: '00',
        error: ''
      });

      const signedTxs = await adapter.signAllTransactions(mockTxs as any);
      expect(signedTxs.length).toBe(2);
      expect(ShaheenModule.connectAndSign).toHaveBeenCalledTimes(2);
    });

    it('disconnect() cleans up credentials', async () => {
      // Connect first
      (ShaheenModule.generateAssociationUri as jest.Mock).mockResolvedValue({
        uri: 'solana-wallet://associate',
        port: 12345
      });
      (ShaheenModule.connectAndAuthorize as jest.Mock).mockResolvedValue({
        success: true,
        publicKey: '37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B',
        authToken: 'auth_token_mock',
        error: ''
      });
      await adapter.connect();

      const disconnectEventPromise = new Promise<void>((resolve) => {
        adapter.on('disconnect', () => {
          resolve();
        });
      });

      await adapter.disconnect();

      expect(adapter.connected).toBe(false);
      expect(adapter.publicKey).toBeNull();
      await disconnectEventPromise;
    });
  });
});
