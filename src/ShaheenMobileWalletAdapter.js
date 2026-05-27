"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShaheenMobileWalletAdapter = exports.ShaheenWalletName = void 0;
const wallet_adapter_base_1 = require("@solana/wallet-adapter-base");
const web3_js_1 = require("@solana/web3.js");
const react_native_1 = require("react-native");
const NativeShaheenSpec_1 = __importDefault(require("./NativeShaheenSpec"));
exports.ShaheenWalletName = 'Solana Mobile (Shaheen)';
function toHexString(byteArray) {
    return Array.from(byteArray, (byte) => {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
}
function fromHexString(hexString) {
    const matches = hexString.match(/.{1,2}/g);
    if (!matches)
        return new Uint8Array(0);
    return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
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
        this._authToken = null;
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
            const assoc = await NativeShaheenSpec_1.default.generateAssociationUri();
            await react_native_1.Linking.openURL(assoc.uri);
            const authResult = await NativeShaheenSpec_1.default.connectAndAuthorize('mainnet-beta', assoc.port);
            if (!authResult.success) {
                throw new Error(`Shaheen Native Authorization Error: ${authResult.error}`);
            }
            this._publicKey = new web3_js_1.PublicKey(authResult.publicKey);
            this._authToken = authResult.authToken;
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
        this._authToken = null;
        this.emit('disconnect');
    }
    async signTransaction(transaction) {
        if (!this.connected || !this._authToken)
            throw new Error('Wallet not connected');
        const tx = transaction;
        const isVersioned = 'version' in tx;
        const txBytes = isVersioned
            ? tx.serialize()
            : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const txHex = toHexString(txBytes);
        const assoc = await NativeShaheenSpec_1.default.generateAssociationUri();
        await react_native_1.Linking.openURL(assoc.uri);
        const result = await NativeShaheenSpec_1.default.connectAndSign('mainnet-beta', assoc.port, txHex, this._authToken);
        if (!result.success) {
            throw new Error(`Shaheen Native Signing Error: ${result.error}`);
        }
        const signedTxBytes = fromHexString(result.signedTxHex);
        const signedTx = isVersioned
            ? web3_js_1.VersionedTransaction.deserialize(signedTxBytes)
            : web3_js_1.Transaction.from(signedTxBytes);
        return signedTx;
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
