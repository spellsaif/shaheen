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
Object.defineProperty(exports, "__esModule", { value: true });
exports.useShaheenWallet = useShaheenWallet;
const react_1 = require("react");
const transact_1 = require("./transact");
__exportStar(require("./transact"), exports);
__exportStar(require("./NativeShaheenSpec"), exports);
function hexToUint8Array(hexString) {
    const matches = hexString.match(/.{1,2}/g);
    if (!matches)
        return new Uint8Array(0);
    return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}
function useShaheenWallet() {
    const [loading, setLoading] = (0, react_1.useState)(false);
    /**
     * Executes a transaction using a single, persistent MWA 2.0 session.
     * Eliminates the double-intent bug and keeps the Hermes JS thread unblocked.
     */
    const executeTransaction = async (cluster, txHex) => {
        setLoading(true);
        try {
            const chain = cluster === 'devnet' ? 'solana:devnet' : 'solana:mainnet';
            const txBytes = hexToUint8Array(txHex);
            const result = await (0, transact_1.transact)(async (wallet) => {
                await wallet.authorize({ chain });
                const signatures = await wallet.signAndSendTransactions([txBytes]);
                return signatures[0] || '';
            });
            return {
                success: true,
                signature: result,
                signedTxHex: txHex,
                error: '',
            };
        }
        catch (e) {
            return {
                success: false,
                signature: '',
                signedTxHex: '',
                error: e.message || 'Unknown Native Error',
            };
        }
        finally {
            setLoading(false);
        }
    };
    return { executeTransaction, loading };
}
