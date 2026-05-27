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
exports.generateAssociationSync = generateAssociationSync;
exports.authorizeSync = authorizeSync;
exports.signTransactionsSync = signTransactionsSync;
const react_1 = require("react");
const react_native_1 = require("react-native");
const NativeShaheenSpec_1 = __importDefault(require("./NativeShaheenSpec"));
__exportStar(require("./ShaheenMobileWalletAdapter"), exports);
function useShaheenWallet() {
    const [loading, setLoading] = (0, react_1.useState)(false);
    const executeTransaction = async (cluster, txHex) => {
        setLoading(true);
        try {
            const assoc = await NativeShaheenSpec_1.default.generateAssociationUri();
            await react_native_1.Linking.openURL(assoc.uri);
            const auth = await NativeShaheenSpec_1.default.connectAndAuthorize(cluster, assoc.port);
            if (!auth.success) {
                return { success: false, signature: '', signedTxHex: '', error: auth.error };
            }
            const assoc2 = await NativeShaheenSpec_1.default.generateAssociationUri();
            await react_native_1.Linking.openURL(assoc2.uri);
            const result = await NativeShaheenSpec_1.default.connectAndSign(cluster, assoc2.port, txHex, auth.authToken);
            return result;
        }
        catch (e) {
            return { success: false, signature: '', signedTxHex: '', error: e.message || 'Unknown Native Error' };
        }
        finally {
            setLoading(false);
        }
    };
    return { executeTransaction, loading };
}
function generateAssociationSync() {
    const g = globalThis;
    if (typeof g.shaheenGenerateAssociationSync === 'function') {
        return JSON.parse(g.shaheenGenerateAssociationSync());
    }
    throw new Error('Shaheen JSI bindings are not installed');
}
function authorizeSync(cluster) {
    const g = globalThis;
    if (typeof g.shaheenAuthorizeSync === 'function') {
        return JSON.parse(g.shaheenAuthorizeSync(cluster));
    }
    throw new Error('Shaheen JSI bindings are not installed');
}
function signTransactionsSync(cluster, txHex, authToken) {
    const g = globalThis;
    if (typeof g.shaheenSignTransactionsSync === 'function') {
        return JSON.parse(g.shaheenSignTransactionsSync(cluster, txHex, authToken));
    }
    throw new Error('Shaheen JSI bindings are not installed');
}
