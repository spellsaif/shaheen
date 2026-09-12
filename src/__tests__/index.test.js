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
const index_1 = require("../index");
const NativeShaheenSpec_1 = __importDefault(require("../NativeShaheenSpec"));
const react_native_1 = require("react-native");
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
        react_native_1.Linking.openURL.mockResolvedValue(true);
        react_native_1.Platform.OS = 'ios';
    });
    describe('MWA 2.0 transact() Core Lifecycle', () => {
        it('executes authorize with custom identity and signAndSend in a single session', async () => {
            NativeShaheenSpec_1.default.createSession.mockResolvedValue({
                success: true,
                sessionId: 'session-uuid-123',
                uri: 'solana-wallet:/v1/associate/local?association=xyz&port=50000&v=2',
                port: 50000,
                associationToken: 'xyz',
            });
            NativeShaheenSpec_1.default.connectAndAuthorizeSession.mockResolvedValue({
                success: true,
                authToken: 'auth-tok-123',
                publicKey: '11111111111111111111111111111111',
                accounts: [{ address: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', label: 'Main' }],
                error: '',
            });
            NativeShaheenSpec_1.default.signAndSend.mockResolvedValue({
                success: true,
                signatures: ['signature123'],
                signature: 'signature123',
                error: '',
            });
            NativeShaheenSpec_1.default.closeSession.mockResolvedValue(undefined);
            const result = await (0, index_1.transact)(async (wallet) => {
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
            expect(react_native_1.Linking.openURL).toHaveBeenCalledWith('solana-wallet:/v1/associate/local?association=xyz&port=50000&v=2');
            expect(NativeShaheenSpec_1.default.connectAndAuthorizeSession).toHaveBeenCalledWith('session-uuid-123', '', 'solana:mainnet', '', 'Super Dapp', 'https://superdapp.com', 'icon.png');
            expect(NativeShaheenSpec_1.default.signAndSend).toHaveBeenCalledTimes(1);
            expect(NativeShaheenSpec_1.default.closeSession).toHaveBeenCalledWith('session-uuid-123');
        });
        it('cleans up session in finally block even on authorization error', async () => {
            NativeShaheenSpec_1.default.createSession.mockResolvedValue({
                success: true,
                sessionId: 'session-fail-1',
                uri: 'solana-wallet://fail',
                port: 50001,
                associationToken: 'tok',
            });
            NativeShaheenSpec_1.default.connectAndAuthorizeSession.mockResolvedValue({
                success: false,
                authToken: '',
                publicKey: '',
                accounts: [],
                error: 'User rejected',
            });
            await expect((0, index_1.transact)(async (wallet) => {
                await wallet.authorize();
            })).rejects.toThrow('User rejected');
            expect(NativeShaheenSpec_1.default.closeSession).toHaveBeenCalledWith('session-fail-1');
        });
        it('invokes launchWalletIntent on Android when available', async () => {
            react_native_1.Platform.OS = 'android';
            NativeShaheenSpec_1.default.launchWalletIntent.mockResolvedValue(true);
            NativeShaheenSpec_1.default.createSession.mockResolvedValue({
                success: true,
                sessionId: 'session-android-1',
                uri: 'solana-wallet:/v1/associate/local?association=xyz&port=50000&v=2',
                port: 50000,
                associationToken: 'xyz',
            });
            NativeShaheenSpec_1.default.connectAndAuthorizeSession.mockResolvedValue({
                success: true,
                authToken: 'auth-android',
                publicKey: '11111111111111111111111111111111',
                accounts: [],
                error: '',
            });
            NativeShaheenSpec_1.default.closeSession.mockResolvedValue(undefined);
            await (0, index_1.transact)(async (wallet) => {
                await wallet.authorize();
            });
            expect(NativeShaheenSpec_1.default.launchWalletIntent).toHaveBeenCalledWith('solana-wallet:/v1/associate/local?association=xyz&port=50000&v=2');
            expect(react_native_1.Linking.openURL).not.toHaveBeenCalled();
        });
    });
    describe('True Transaction Batching Tests', () => {
        it('batches multiple transactions in a single signAndSend call', async () => {
            NativeShaheenSpec_1.default.createSession.mockResolvedValue({
                success: true,
                sessionId: 'session-batch-1',
                uri: 'solana-wallet://batch',
                port: 50000,
                associationToken: 'tok',
            });
            NativeShaheenSpec_1.default.connectAndAuthorizeSession.mockResolvedValue({
                success: true,
                authToken: 'auth-batch',
                publicKey: '11111111111111111111111111111111',
                accounts: [],
                error: '',
            });
            NativeShaheenSpec_1.default.signAndSend.mockResolvedValue({
                success: true,
                signatures: ['sig_batch_1', 'sig_batch_2', 'sig_batch_3'],
                signature: 'sig_batch_1',
                error: '',
            });
            const tx1 = new Uint8Array([1, 2]);
            const tx2 = new Uint8Array([3, 4]);
            const tx3 = new Uint8Array([5, 6]);
            const sigs = await (0, index_1.transact)(async (wallet) => {
                await wallet.authorize();
                return await wallet.signAndSendTransactions([tx1, tx2, tx3]);
            });
            expect(sigs).toEqual(['sig_batch_1', 'sig_batch_2', 'sig_batch_3']);
            // Must be called EXACTLY ONCE with all 3 transactions batched in JSON
            expect(NativeShaheenSpec_1.default.signAndSend).toHaveBeenCalledTimes(1);
            const [calledSessionId, calledPayloadJson] = NativeShaheenSpec_1.default.signAndSend.mock.calls[0];
            expect(calledSessionId).toBe('session-batch-1');
            const parsed = JSON.parse(calledPayloadJson);
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed).toHaveLength(3);
        });
        it('batches multiple transactions in a single signTransactions call', async () => {
            NativeShaheenSpec_1.default.createSession.mockResolvedValue({
                success: true,
                sessionId: 'session-batch-2',
                uri: 'solana-wallet://batch',
                port: 50000,
                associationToken: 'tok',
            });
            NativeShaheenSpec_1.default.connectAndAuthorizeSession.mockResolvedValue({
                success: true,
                authToken: 'auth-batch',
                publicKey: '11111111111111111111111111111111',
                accounts: [],
                error: '',
            });
            // Base64 for [10, 20] is 'ChQ=' and [30, 40] is 'Higg'
            NativeShaheenSpec_1.default.signTransactions.mockResolvedValue({
                success: true,
                signedTxBase64: 'ChQ=',
                signedTxsBase64: ['ChQ=', 'Higg'],
                error: '',
            });
            const tx1 = new Uint8Array([1, 2]);
            const tx2 = new Uint8Array([3, 4]);
            const signed = await (0, index_1.transact)(async (wallet) => {
                await wallet.authorize();
                return await wallet.signTransactions({ transactions: [tx1, tx2] });
            });
            expect(signed).toHaveLength(2);
            expect(NativeShaheenSpec_1.default.signTransactions).toHaveBeenCalledTimes(1);
            const [calledSessionId, calledPayloadJson] = NativeShaheenSpec_1.default.signTransactions.mock.calls[0];
            expect(calledSessionId).toBe('session-batch-2');
            const parsed = JSON.parse(calledPayloadJson);
            expect(parsed).toHaveLength(2);
        });
    });
});
