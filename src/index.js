"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useShaheenWallet = useShaheenWallet;
exports.executeTransactionSync = executeTransactionSync;
const react_1 = require("react");
const NativeShaheenSpec_1 = __importDefault(require("./NativeShaheenSpec"));
__exportStar(require("./ShaheenMobileWalletAdapter"), exports);
function useShaheenWallet() {
    const [loading, setLoading] = (0, react_1.useState)(false);
    const executeTransaction = async (cluster, instruction) => {
        setLoading(true);
        try {
            const result = await NativeShaheenSpec_1.default.connectAndExecute(cluster, instruction);
            return result;
        }
        catch (e) {
            return { success: false, signature: '', error: e.message || 'Unknown Native Error' };
        }
        finally {
            setLoading(false);
        }
    };
    return { executeTransaction, loading };
}
/**
 * Synchronous transaction execution using the C++ JSI direct binding.
 * Intercepts execution synchronously from Hermes runtime memory references.
 */
function executeTransactionSync(cluster, instruction) {
    const g = globalThis;
    if (typeof g.shaheenExecuteSync === 'function') {
        try {
            const resultJson = g.shaheenExecuteSync(cluster, instruction);
            return JSON.parse(resultJson);
        }
        catch (e) {
            return { success: false, signature: '', error: e.message || 'JSI Execution Error' };
        }
    }
    else {
        return {
            success: false,
            signature: '',
            error: 'Shaheen JSI bindings are not installed in the runtime. Ensure Native Module is initialized.'
        };
    }
}
