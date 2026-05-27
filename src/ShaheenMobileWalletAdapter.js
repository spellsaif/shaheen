"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShaheenMobileWalletAdapter = exports.ShaheenWalletName = void 0;
const wallet_adapter_base_1 = require("@solana/wallet-adapter-base");
const web3_js_1 = require("@solana/web3.js");
const index_1 = require("./index");
exports.ShaheenWalletName = 'Solana Mobile (Shaheen)';
function toHexString(byteArray) {
    return Array.from(byteArray, (byte) => {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
}
class ShaheenMobileWalletAdapter extends wallet_adapter_base_1.BaseSignerWalletAdapter {
    constructor() {
        super();
        this.name = exports.ShaheenWalletName;
        this.url = 'https://shaheen.dev';
        this.icon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjOTkzMmNjIj48cGF0aCBkPSJNMTIgMkwyIDdsMTAgNSA5LTUtOS01em0wIDE4bC04LTMuNVY5LjVsOCAzLjUgOC0zLjV2Ny41bC04IDMuNXoiLz48L3N2Zz4=';
        this.readyState = wallet_adapter_base_1.WalletReadyState.Installed;
        this.supportedTransactionVersions = new Set(['legacy', 0]);
        this._publicKey = null;
        this._connecting = false;
    }
    get publicKey() {
        return this._publicKey;
    }
    get connected() {
        return !!this._publicKey;
    }
    get connecting() {
        return this._connecting;
    }
    async connect() {
        try {
            this._connecting = true;
            this._publicKey = new web3_js_1.PublicKey("37G1P7u13aJjTq5Z9sFzD36Pq7S9A4xY3vU1M4A5B");
            this.emit('connect', this._publicKey);
        }
        catch (e) {
            this.emit('error', e);
            throw e;
        }
        finally {
            this._connecting = false;
        }
    }
    async disconnect() {
        this._publicKey = null;
        this.emit('disconnect');
    }
    async signTransaction(transaction) {
        if (!this.connected)
            throw new Error('Wallet not connected');
        const tx = transaction;
        // For VersionedTransaction, we retrieve instructions from the message
        const instruction = tx.instructions ? tx.instructions[0] : tx.message?.compiledInstructions?.[0];
        if (!instruction) {
            throw new Error('No instructions found in transaction');
        }
        // Extract keys list safely
        let keys = [];
        if (instruction.keys) {
            keys = instruction.keys.map((k) => ({
                pubkey: k.pubkey.toBase58(),
                isSigner: k.isSigner,
                isWritable: k.isWritable
            }));
        }
        else if (tx.message?.staticAccountKeys) {
            // Versioned transaction fallback mapping
            const accountKeys = tx.message.staticAccountKeys;
            keys = instruction.accountKeyIndexes.map((idx) => ({
                pubkey: accountKeys[idx].toBase58(),
                isSigner: tx.message.isAccountSigner(idx),
                isWritable: tx.message.isAccountWritable(idx)
            }));
        }
        const programId = instruction.programId ? instruction.programId.toBase58() : tx.message.staticAccountKeys[instruction.programIdIndex].toBase58();
        // Hex encode data payload without Node.js Buffer reliance
        const dataHex = instruction.data ? toHexString(new Uint8Array(instruction.data)) : toHexString(new Uint8Array(instruction.data));
        const result = (0, index_1.executeTransactionSync)('mainnet-beta', {
            programId,
            keys,
            dataHex
        });
        if (!result.success) {
            throw new Error(`Shaheen Native Signing Error: ${result.error}`);
        }
        const sigStr = atob(result.signature);
        const signature = new Uint8Array(sigStr.length);
        for (let i = 0; i < sigStr.length; i++) {
            signature[i] = sigStr.charCodeAt(i);
        }
        tx.addSignature(this._publicKey, Buffer.from(signature));
        return transaction;
    }
    async signAllTransactions(transactions) {
        const signed = [];
        for (const tx of transactions) {
            signed.push(await this.signTransaction(tx));
        }
        return signed;
    }
}
exports.ShaheenMobileWalletAdapter = ShaheenMobileWalletAdapter;
