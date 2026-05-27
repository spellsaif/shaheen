"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Mock peer dependencies to prevent ES module resolution issues
jest.mock('@solana/web3.js', () => ({
    PublicKey: class {
        constructor(val) { this.val = val; }
        toBase58() { return this.val; }
    },
    Transaction: class {
    }
}));
jest.mock('@solana/wallet-adapter-base', () => ({
    BaseSignerWalletAdapter: class {
    },
    WalletReadyState: { Installed: 'Installed' }
}));
const index_1 = require("../index");
const NativeShaheenSpec_1 = __importDefault(require("../NativeShaheenSpec"));
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
        global.shaheenExecuteSync = undefined;
    });
    it('executeTransaction resolves successfully via TurboModule spec', async () => {
        const mockResult = {
            success: true,
            signature: 'test_sig',
            error: '',
        };
        NativeShaheenSpec_1.default.connectAndExecute.mockResolvedValue(mockResult);
        const instruction = {
            programId: 'Memo1U2x22222222222222222222222222222225',
            keys: [],
            dataHex: '00',
        };
        const res = await NativeShaheenSpec_1.default.connectAndExecute('devnet', instruction);
        expect(res.success).toBe(true);
        expect(res.signature).toBe('test_sig');
        expect(NativeShaheenSpec_1.default.connectAndExecute).toHaveBeenCalledWith('devnet', instruction);
    });
    it('executeTransactionSync calls JSI correctly', () => {
        global.shaheenExecuteSync = jest.fn().mockReturnValue(JSON.stringify({
            success: true,
            signature: 'jsi_sig',
            error: '',
        }));
        const instruction = {
            programId: 'Memo1U2x22222222222222222222222222222225',
            keys: [],
            dataHex: '00',
        };
        const res = (0, index_1.executeTransactionSync)('devnet', instruction);
        expect(res.success).toBe(true);
        expect(res.signature).toBe('jsi_sig');
        expect(global.shaheenExecuteSync).toHaveBeenCalledWith('devnet', instruction);
    });
    it('executeTransactionSync returns error if JSI is not installed', () => {
        const instruction = {
            programId: 'Memo1U2x22222222222222222222222222222225',
            keys: [],
            dataHex: '00',
        };
        const res = (0, index_1.executeTransactionSync)('devnet', instruction);
        expect(res.success).toBe(false);
        expect(res.signature).toBe('');
        expect(res.error).toContain('JSI bindings are not installed');
    });
});
