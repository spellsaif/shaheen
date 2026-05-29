"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Mock peer dependencies to prevent ES module resolution issues
jest.mock('@solana/web3.js', () => {
    class MockPublicKey {
        constructor(val) { this._val = val; }
        toBase58() { return this._val; }
        toString() { return this._val; }
    }
    class MockTransaction {
        serialize(opts) {
            return new Uint8Array([1, 2, 3]);
        }
        static from(bytes) {
            return new MockTransaction();
        }
    }
    class MockVersionedTransaction {
        serialize() {
            return new Uint8Array([4, 5, 6]);
        }
        static deserialize(bytes) {
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
    class MockBaseSignerWalletAdapter extends EventEmitter {
    }
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
const index_1 = require("../index");
const NativeShaheenSpec_1 = __importDefault(require("../NativeShaheenSpec"));
const react_native_1 = require("react-native");
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
        global.shaheenGenerateAssociationSync = undefined;
        global.shaheenAuthorizeSync = undefined;
        global.shaheenSignTransactionsSync = undefined;
        react_native_1.Linking.openURL.mockResolvedValue(true);
    });
    it('generateAssociationUri resolves successfully via TurboModule spec', async () => {
        const mockResult = { uri: 'solana-wallet://test', port: 55555 };
        NativeShaheenSpec_1.default.generateAssociationUri.mockResolvedValue(mockResult);
        const res = await NativeShaheenSpec_1.default.generateAssociationUri();
        expect(res.uri).toBe('solana-wallet://test');
        expect(res.port).toBe(55555);
    });
    it('connectAndAuthorize resolves successfully via TurboModule spec', async () => {
        const mockResult = { success: true, publicKey: '37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B', authToken: 'token', error: '' };
        NativeShaheenSpec_1.default.connectAndAuthorize.mockResolvedValue(mockResult);
        const res = await NativeShaheenSpec_1.default.connectAndAuthorize('devnet', 55555);
        expect(res.success).toBe(true);
        expect(res.publicKey).toBe('37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B');
        expect(res.authToken).toBe('token');
    });
    it('connectAndSign resolves successfully via TurboModule spec', async () => {
        const mockResult = { success: true, signature: 'test_sig', signedTxHex: 'aabbcc', error: '' };
        NativeShaheenSpec_1.default.connectAndSign.mockResolvedValue(mockResult);
        const res = await NativeShaheenSpec_1.default.connectAndSign('devnet', 55555, 'aabbcc', 'token');
        expect(res.success).toBe(true);
        expect(res.signature).toBe('test_sig');
        expect(res.signedTxHex).toBe('aabbcc');
    });
    describe('ShaheenMobileWalletAdapter Class Tests', () => {
        let adapter;
        beforeEach(() => {
            adapter = new index_1.ShaheenMobileWalletAdapter();
        });
        it('initializes with default unconnected state', () => {
            expect(adapter.connected).toBe(false);
            expect(adapter.connecting).toBe(false);
            expect(adapter.publicKey).toBeNull();
        });
        it('connect() completes successfully and sets keys', async () => {
            NativeShaheenSpec_1.default.generateAssociationUri.mockResolvedValue({
                uri: 'solana-wallet://associate',
                port: 12345
            });
            NativeShaheenSpec_1.default.connectAndAuthorize.mockResolvedValue({
                success: true,
                publicKey: '37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B',
                authToken: 'auth_token_mock',
                error: ''
            });
            const connectEventPromise = new Promise((resolve) => {
                adapter.on('connect', (publicKey) => {
                    expect(publicKey.toBase58()).toBe('37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B');
                    resolve();
                });
            });
            await adapter.connect();
            expect(adapter.connected).toBe(true);
            expect(adapter.publicKey).not.toBeNull();
            expect(adapter.publicKey.toBase58()).toBe('37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B');
            expect(react_native_1.Linking.openURL).toHaveBeenCalledWith('solana-wallet://associate');
            await connectEventPromise;
        });
        it('connect() throws and cleans up state on native authorize failure', async () => {
            NativeShaheenSpec_1.default.generateAssociationUri.mockResolvedValue({
                uri: 'solana-wallet://associate',
                port: 12345
            });
            NativeShaheenSpec_1.default.connectAndAuthorize.mockResolvedValue({
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
            NativeShaheenSpec_1.default.generateAssociationUri.mockResolvedValue({
                uri: 'solana-wallet://associate',
                port: 12345
            });
            let resolveAuthorize;
            const authorizePromise = new Promise((resolve) => {
                resolveAuthorize = resolve;
            });
            NativeShaheenSpec_1.default.connectAndAuthorize.mockReturnValue(authorizePromise);
            const connectPromise = adapter.connect();
            expect(adapter.connecting).toBe(true);
            expect(adapter.connected).toBe(false);
            resolveAuthorize({
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
            NativeShaheenSpec_1.default.generateAssociationUri.mockRejectedValue(new Error('Association Failed'));
            await expect(adapter.connect()).rejects.toThrow('Association Failed');
            expect(adapter.connecting).toBe(false);
            expect(adapter.connected).toBe(false);
        });
        it('connect() throws and resets connecting if Linking.openURL fails', async () => {
            NativeShaheenSpec_1.default.generateAssociationUri.mockResolvedValue({
                uri: 'solana-wallet://associate',
                port: 12345
            });
            react_native_1.Linking.openURL.mockRejectedValue(new Error('Linking Failed'));
            await expect(adapter.connect()).rejects.toThrow('Linking Failed');
            expect(adapter.connecting).toBe(false);
            expect(adapter.connected).toBe(false);
        });
        it('signTransaction() throws on native sign failure', async () => {
            // Connect first
            NativeShaheenSpec_1.default.generateAssociationUri.mockResolvedValue({
                uri: 'solana-wallet://associate',
                port: 12345
            });
            NativeShaheenSpec_1.default.connectAndAuthorize.mockResolvedValue({
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
            NativeShaheenSpec_1.default.connectAndSign.mockResolvedValue({
                success: false,
                signature: '',
                signedTxHex: '',
                error: 'User Denied Signature'
            });
            await expect(adapter.signTransaction(mockTx)).rejects.toThrow('Shaheen Native Signing Error: User Denied Signature');
        });
        it('signTransaction() signs a legacy transaction correctly', async () => {
            // Connect first
            NativeShaheenSpec_1.default.generateAssociationUri.mockResolvedValue({
                uri: 'solana-wallet://associate',
                port: 12345
            });
            NativeShaheenSpec_1.default.connectAndAuthorize.mockResolvedValue({
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
            NativeShaheenSpec_1.default.connectAndSign.mockResolvedValue({
                success: true,
                signature: 'tx_signature',
                signedTxHex: '0102030405',
                error: ''
            });
            const signedTx = await adapter.signTransaction(mockTx);
            expect(signedTx).toBeDefined();
            expect(NativeShaheenSpec_1.default.connectAndSign).toHaveBeenCalledWith('mainnet-beta', 12345, '010203', 'auth_token_mock');
        });
        it('signTransaction() signs a versioned transaction correctly', async () => {
            // Connect first
            NativeShaheenSpec_1.default.generateAssociationUri.mockResolvedValue({
                uri: 'solana-wallet://associate',
                port: 12345
            });
            NativeShaheenSpec_1.default.connectAndAuthorize.mockResolvedValue({
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
            NativeShaheenSpec_1.default.connectAndSign.mockResolvedValue({
                success: true,
                signature: 'versioned_signature',
                signedTxHex: '0405060708',
                error: ''
            });
            const signedTx = await adapter.signTransaction(mockVersionedTx);
            expect(signedTx).toBeDefined();
            expect(NativeShaheenSpec_1.default.connectAndSign).toHaveBeenCalledWith('mainnet-beta', 12345, '040506', 'auth_token_mock');
        });
        it('signTransaction() throws if not connected', async () => {
            const mockTx = {};
            await expect(adapter.signTransaction(mockTx)).rejects.toThrow('Wallet not connected');
        });
        it('signAllTransactions() signs multiple transactions sequentially', async () => {
            // Connect first
            NativeShaheenSpec_1.default.generateAssociationUri.mockResolvedValue({
                uri: 'solana-wallet://associate',
                port: 12345
            });
            NativeShaheenSpec_1.default.connectAndAuthorize.mockResolvedValue({
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
            NativeShaheenSpec_1.default.connectAndSign.mockResolvedValue({
                success: true,
                signature: 'signature',
                signedTxHex: '00',
                error: ''
            });
            const signedTxs = await adapter.signAllTransactions(mockTxs);
            expect(signedTxs.length).toBe(2);
            expect(NativeShaheenSpec_1.default.connectAndSign).toHaveBeenCalledTimes(2);
        });
        it('disconnect() cleans up credentials', async () => {
            // Connect first
            NativeShaheenSpec_1.default.generateAssociationUri.mockResolvedValue({
                uri: 'solana-wallet://associate',
                port: 12345
            });
            NativeShaheenSpec_1.default.connectAndAuthorize.mockResolvedValue({
                success: true,
                publicKey: '37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B',
                authToken: 'auth_token_mock',
                error: ''
            });
            await adapter.connect();
            const disconnectEventPromise = new Promise((resolve) => {
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
