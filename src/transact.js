"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtocolError = exports.CapabilityError = exports.WalletUnavailableError = exports.AuthorizationError = exports.HandshakeError = exports.TimeoutError = exports.UserRejectedError = exports.ShaheenError = void 0;
exports.transact = transact;
const react_native_1 = require("react-native");
const NativeShaheenSpec_1 = __importDefault(require("./NativeShaheenSpec"));
// ---------------------------------------------------------------------------
// ERROR TAXONOMY
// ---------------------------------------------------------------------------
class ShaheenError extends Error {
    constructor(message, code = 'SHAHEEN_ERROR') {
        super(message);
        this.code = code;
        this.name = 'ShaheenError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.ShaheenError = ShaheenError;
class UserRejectedError extends ShaheenError {
    constructor(message = 'User rejected the wallet request') {
        super(message, 'USER_REJECTED');
        this.name = 'UserRejectedError';
    }
}
exports.UserRejectedError = UserRejectedError;
class TimeoutError extends ShaheenError {
    constructor(message = 'Wallet operation timed out') {
        super(message, 'TIMEOUT_ERROR');
        this.name = 'TimeoutError';
    }
}
exports.TimeoutError = TimeoutError;
class HandshakeError extends ShaheenError {
    constructor(message = 'MWA 2.0 handshake verification failed') {
        super(message, 'HANDSHAKE_ERROR');
        this.name = 'HandshakeError';
    }
}
exports.HandshakeError = HandshakeError;
class AuthorizationError extends ShaheenError {
    constructor(message = 'Wallet authorization failed') {
        super(message, 'AUTHORIZE_ERROR');
        this.name = 'AuthorizationError';
    }
}
exports.AuthorizationError = AuthorizationError;
class WalletUnavailableError extends ShaheenError {
    constructor(message = 'Wallet unavailable or intent launch failed') {
        super(message, 'WALLET_UNAVAILABLE');
        this.name = 'WalletUnavailableError';
    }
}
exports.WalletUnavailableError = WalletUnavailableError;
class CapabilityError extends ShaheenError {
    constructor(message = 'Wallet does not support this requested capability') {
        super(message, 'CAPABILITY_ERROR');
        this.name = 'CapabilityError';
    }
}
exports.CapabilityError = CapabilityError;
class ProtocolError extends ShaheenError {
    constructor(message = 'MWA protocol or sequence mismatch error') {
        super(message, 'PROTOCOL_ERROR');
        this.name = 'ProtocolError';
    }
}
exports.ProtocolError = ProtocolError;
function mapError(rawError, fallbackCode = 'SHAHEEN_ERROR') {
    if (rawError instanceof ShaheenError) {
        return rawError;
    }
    const message = rawError?.message || (typeof rawError === 'string' ? rawError : 'Unknown error');
    const code = rawError?.code || fallbackCode;
    const lower = message.toLowerCase();
    if (code === 'USER_REJECTED' || lower.includes('user rejected') || lower.includes('rejected by user') || lower.includes('declined')) {
        return new UserRejectedError(message);
    }
    if (code === 'TIMEOUT_ERROR' || lower.includes('timeout') || lower.includes('timed out')) {
        return new TimeoutError(message);
    }
    if (code === 'HANDSHAKE_ERROR' || lower.includes('handshake')) {
        return new HandshakeError(message);
    }
    if (code === 'AUTHORIZE_ERROR' || lower.includes('auth')) {
        return new AuthorizationError(message);
    }
    if (code === 'ACTIVITY_NULL' || code === 'INTENT_LAUNCH_ERROR' || lower.includes('wallet intent') || lower.includes('activity')) {
        return new WalletUnavailableError(message);
    }
    if (code === 'SEQUENCE_MISMATCH' || code === 'PROTOCOL_ERROR') {
        return new ProtocolError(message);
    }
    return new ShaheenError(message, code);
}
// ---------------------------------------------------------------------------
// BYTE & BASE64 ENCODING HELPERS
// ---------------------------------------------------------------------------
function uint8ArrayToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    if (typeof btoa === 'function') {
        return btoa(binary);
    }
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    for (let i = 0; i < len; i += 3) {
        const b1 = bytes[i];
        const b2 = i + 1 < len ? bytes[i + 1] : 0;
        const b3 = i + 2 < len ? bytes[i + 2] : 0;
        result += chars[b1 >> 2];
        result += chars[((b1 & 3) << 4) | (b2 >> 4)];
        result += i + 1 < len ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '=';
        result += i + 2 < len ? chars[b3 & 63] : '=';
    }
    return result;
}
function base64ToUint8Array(base64) {
    if (typeof atob === 'function') {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let bufferLength = base64.length * 0.75;
    if (base64[base64.length - 1] === '=') {
        bufferLength--;
        if (base64[base64.length - 2] === '=') {
            bufferLength--;
        }
    }
    const bytes = new Uint8Array(bufferLength);
    let p = 0;
    for (let i = 0; i < base64.length; i += 4) {
        const enc1 = chars.indexOf(base64[i]);
        const enc2 = chars.indexOf(base64[i + 1]);
        const enc3 = chars.indexOf(base64[i + 2]);
        const enc4 = chars.indexOf(base64[i + 3]);
        bytes[p++] = (enc1 << 2) | (enc2 >> 4);
        if (enc3 !== 64 && enc3 !== -1) {
            bytes[p++] = ((enc2 & 15) << 4) | (enc3 >> 2);
        }
        if (enc4 !== 64 && enc4 !== -1) {
            bytes[p++] = ((enc3 & 3) << 6) | enc4;
        }
    }
    return bytes;
}
function stringToUint8Array(str) {
    if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(str);
    }
    const utf8 = [];
    for (let i = 0; i < str.length; i++) {
        let charcode = str.charCodeAt(i);
        if (charcode < 0x80)
            utf8.push(charcode);
        else if (charcode < 0x800) {
            utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
            utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
        }
        else {
            i++;
            charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
            utf8.push(0xf0 | (charcode >> 18), 0x80 | ((charcode >> 12) & 0x3f), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
        }
    }
    return new Uint8Array(utf8);
}
function normalizeTransactions(args) {
    if (Array.isArray(args)) {
        return args;
    }
    if (args && Array.isArray(args.transactions)) {
        return args.transactions;
    }
    throw new ShaheenError('Invalid arguments: expected array of transactions or { transactions: [...] }', 'INVALID_ARGUMENTS');
}
function serializeTx(item) {
    if (item instanceof Uint8Array) {
        return item;
    }
    if (item && typeof item.serialize === 'function') {
        if ('version' in item) {
            return item.serialize();
        }
        return item.serialize({ requireAllSignatures: false, verifySignatures: false });
    }
    if (Array.isArray(item)) {
        return new Uint8Array(item);
    }
    throw new ShaheenError('Invalid transaction payload: expected Uint8Array or Transaction object', 'INVALID_PAYLOAD');
}
function normalizeMessages(args) {
    let msgs = [];
    let addrs = [];
    if (Array.isArray(args)) {
        msgs = args;
    }
    else if (args && Array.isArray(args.messages)) {
        msgs = args.messages;
        if (Array.isArray(args.addresses)) {
            addrs = args.addresses;
        }
    }
    else {
        throw new ShaheenError('Invalid arguments: expected array of messages or { messages: [...] }', 'INVALID_ARGUMENTS');
    }
    const normalizedMsgs = msgs.map((m) => {
        if (m instanceof Uint8Array)
            return m;
        if (typeof m === 'string')
            return stringToUint8Array(m);
        throw new ShaheenError('Invalid message payload: expected Uint8Array or string', 'INVALID_PAYLOAD');
    });
    return { messages: normalizedMsgs, addresses: addrs };
}
/**
 * Modern Android MWA 2.0 transact pattern:
 * - Local loopback WebSocket + Android Intent
 * - Automatic session lifecycle management
 * - Capability-aware batching
 * - Native zero-polyfill Rust execution
 */
async function transact(callback, options) {
    let session;
    try {
        session = await NativeShaheenSpec_1.default.createSession(options?.port || 0);
    }
    catch (err) {
        throw mapError(err, 'SESSION_CREATE_ERROR');
    }
    if (!session || !session.success) {
        throw mapError(session?.error || 'Failed to create MWA session', session?.errorCode || 'SESSION_CREATE_ERROR');
    }
    try {
        // Launch wallet app intent
        if (session.uri) {
            if (react_native_1.Platform.OS === 'android' && typeof NativeShaheenSpec_1.default.launchWalletIntent === 'function') {
                try {
                    await NativeShaheenSpec_1.default.launchWalletIntent(session.uri);
                }
                catch (_) {
                    await react_native_1.Linking.openURL(session.uri);
                }
            }
            else {
                await react_native_1.Linking.openURL(session.uri);
            }
        }
        const wsUrl = options?.relayUrl || '';
        let authorizedAccountAddress = '';
        let cachedCapabilities = null;
        const wallet = {
            async authorize(opts) {
                let chain = opts?.chain;
                if (!chain && opts?.cluster) {
                    chain = (opts.cluster === 'mainnet-beta' ? 'solana:mainnet' : `solana:${opts.cluster}`);
                }
                if (!chain) {
                    chain = 'solana:mainnet';
                }
                const identityName = opts?.identity?.name || '';
                const identityUri = opts?.identity?.uri || '';
                const identityIcon = opts?.identity?.icon || '';
                try {
                    const res = await NativeShaheenSpec_1.default.connectAndAuthorizeSession(session.sessionId, wsUrl, chain, opts?.authToken || '', identityName, identityUri, identityIcon);
                    if (!res.success) {
                        throw mapError(res.error || 'Authorization failed', res.errorCode || 'AUTHORIZE_ERROR');
                    }
                    if (res.accounts && res.accounts.length > 0) {
                        authorizedAccountAddress = res.accounts[0].address;
                    }
                    return res;
                }
                catch (err) {
                    throw mapError(err, 'AUTHORIZE_ERROR');
                }
            },
            async getCapabilities() {
                try {
                    const res = await NativeShaheenSpec_1.default.getCapabilities(session.sessionId);
                    if (!res.success) {
                        throw mapError(res.error || 'Failed to get wallet capabilities', res.errorCode || 'GET_CAPABILITIES_ERROR');
                    }
                    cachedCapabilities = res;
                    return res;
                }
                catch (err) {
                    throw mapError(err, 'GET_CAPABILITIES_ERROR');
                }
            },
            async signMessages(args) {
                const { messages, addresses } = normalizeMessages(args);
                if (messages.length === 0) {
                    return [];
                }
                const effectiveAddresses = addresses.length > 0
                    ? addresses
                    : messages.map(() => authorizedAccountAddress);
                const b64Messages = messages.map((m) => uint8ArrayToBase64(m));
                try {
                    const res = await NativeShaheenSpec_1.default.signMessages(session.sessionId, JSON.stringify(effectiveAddresses), JSON.stringify(b64Messages));
                    if (!res.success) {
                        throw mapError(res.error || 'Sign messages failed', res.errorCode || 'SIGN_MESSAGES_ERROR');
                    }
                    const rawPayloads = res.signedPayloads || (res.signedPayload ? [res.signedPayload] : []);
                    return rawPayloads.map((b64) => base64ToUint8Array(b64));
                }
                catch (err) {
                    throw mapError(err, 'SIGN_MESSAGES_ERROR');
                }
            },
            async signAndSendTransactions(args) {
                const txList = normalizeTransactions(args);
                if (txList.length === 0) {
                    return [];
                }
                // Capability-aware batch slicing if maxTransactionsPerRequest is defined
                let maxBatch = cachedCapabilities?.maxTransactionsPerRequest;
                if (!maxBatch || maxBatch <= 0) {
                    maxBatch = txList.length;
                }
                const allSignatures = [];
                for (let i = 0; i < txList.length; i += maxBatch) {
                    const chunk = txList.slice(i, i + maxBatch);
                    const b64List = chunk.map((item) => {
                        const rawBytes = serializeTx(item);
                        return uint8ArrayToBase64(rawBytes);
                    });
                    try {
                        const res = await NativeShaheenSpec_1.default.signAndSend(session.sessionId, JSON.stringify(b64List));
                        if (!res.success) {
                            throw mapError(res.error || 'Sign and send transaction failed', res.errorCode || 'SIGN_AND_SEND_ERROR');
                        }
                        const sigs = res.signatures || (res.signature ? [res.signature] : []);
                        allSignatures.push(...sigs);
                    }
                    catch (err) {
                        throw mapError(err, 'SIGN_AND_SEND_ERROR');
                    }
                }
                return allSignatures;
            },
            async signTransactions(args) {
                const txList = normalizeTransactions(args);
                if (txList.length === 0) {
                    return [];
                }
                const b64List = txList.map((item) => {
                    const rawBytes = serializeTx(item);
                    return uint8ArrayToBase64(rawBytes);
                });
                try {
                    const res = await NativeShaheenSpec_1.default.signTransactions(session.sessionId, JSON.stringify(b64List));
                    if (!res.success) {
                        throw mapError(res.error || 'Sign transaction failed', res.errorCode || 'SIGN_TRANSACTIONS_ERROR');
                    }
                    const signedB64List = res.signedTxsBase64 || (res.signedTxBase64 ? [res.signedTxBase64] : []);
                    const signedList = [];
                    for (let i = 0; i < txList.length; i++) {
                        const item = txList[i];
                        const b64 = signedB64List[i] || '';
                        const signedBytes = base64ToUint8Array(b64);
                        if (item?.constructor?.deserialize) {
                            signedList.push(item.constructor.deserialize(signedBytes));
                        }
                        else if (item?.constructor?.from) {
                            signedList.push(item.constructor.from(signedBytes));
                        }
                        else {
                            signedList.push(signedBytes);
                        }
                    }
                    return signedList;
                }
                catch (err) {
                    throw mapError(err, 'SIGN_TRANSACTIONS_ERROR');
                }
            },
            async deauthorize() {
                try {
                    const res = await NativeShaheenSpec_1.default.deauthorize(session.sessionId);
                    if (!res.success) {
                        throw mapError(res.error || 'Deauthorize failed', res.errorCode || 'DEAUTHORIZE_ERROR');
                    }
                    authorizedAccountAddress = '';
                }
                catch (err) {
                    throw mapError(err, 'DEAUTHORIZE_ERROR');
                }
            },
        };
        return await callback(wallet);
    }
    finally {
        await NativeShaheenSpec_1.default.closeSession(session.sessionId).catch(() => { });
    }
}
