import { createHash, createCipheriv, createDecipheriv, timingSafeEqual, randomBytes } from 'node:crypto';
import { invariant, object, text } from '../contracts/index.mjs';
/** IVY V1.2.5 PDF pp66-76. This is value sorting + SHA-1, NOT HMAC. */
export function signature({ appKey, appSecret }, timestamp, nonce, content) {
    return createHash('sha1').update([
        appKey,
        appSecret,
        String(timestamp),
        nonce,
        content ?? ''
    ].sort().join(''), 'utf8').digest('hex');
}
export function verifySignature(config, timestamp, nonce, content, given) {
    invariant(typeof given === 'string' && /^[a-f0-9]{40}$/.test(given), 'BAD_SIGNATURE', 'Invalid signature format', 401);
    const expected = signature(config, timestamp, nonce, content);
    invariant(timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(given, 'hex')), 'BAD_SIGNATURE', 'Signature mismatch', 401);
}
export function nonce16() {
    return randomBytes(12).toString('base64url').replace(/[-_]/g, 'A');
}
function aesKey(encoded) {
    invariant(typeof encoded === 'string' && /^[A-Za-z0-9+/]{43}$/.test(encoded), 'INVALID_AES_KEY', 'IVY AES key must contain 43 Base64 characters', 503);
    const b = Buffer.from(encoded + '=', 'base64');
    invariant(b.length === 32, 'INVALID_AES_KEY', 'AES key is not 32 bytes', 503);
    return b;
}
export function encrypt(config, message, random = randomBytes(16)) {
    invariant(Buffer.isBuffer(random) && random.length === 16, 'INVALID_RANDOM', 'AES random prefix must be 16 bytes');
    const msg = Buffer.from(message ?? '', 'utf8'), len = Buffer.alloc(4);
    len.writeUInt32BE(msg.length);
    const raw = Buffer.concat([
        random,
        len,
        msg,
        Buffer.from(config.appKey, 'utf8')
    ]);
    // The supplier Java code pads to 32 bytes, not the AES block size of 16.
    const padding = 32 - raw.length % 32, padded = Buffer.concat([
        raw,
        Buffer.alloc(padding, padding)
    ]);
    const key = aesKey(config.aesKey), cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16));
    cipher.setAutoPadding(false);
    return Buffer.concat([
        cipher.update(padded),
        cipher.final()
    ]).toString('base64');
}
export function decrypt(config, ciphertext) {
    invariant(typeof ciphertext === 'string' && ciphertext.length <= 4 * 1024 * 1024 && /^[A-Za-z0-9+/]+={0,2}$/.test(ciphertext), 'BAD_CIPHERTEXT', 'Invalid ciphertext');
    const bytes = Buffer.from(ciphertext, 'base64');
    invariant(bytes.length > 0 && bytes.length % 16 === 0, 'BAD_CIPHERTEXT', 'Invalid AES block length');
    const key = aesKey(config.aesKey), d = createDecipheriv('aes-256-cbc', key, key.subarray(0, 16));
    d.setAutoPadding(false);
    const padded = Buffer.concat([
        d.update(bytes),
        d.final()
    ]), n = padded[padded.length - 1];
    invariant(n >= 1 && n <= 32 && padded.length >= n + 20, 'BAD_PADDING', 'Invalid PKCS#7 padding');
    for (const b of padded.subarray(padded.length - n))
        invariant(b === n, 'BAD_PADDING', 'Invalid PKCS#7 bytes');
    const raw = padded.subarray(0, padded.length - n), len = raw.readUInt32BE(16);
    invariant(len <= raw.length - 20, 'BAD_LENGTH', 'Invalid message byte length');
    const appKey = raw.subarray(20 + len), expected = Buffer.from(config.appKey, 'utf8');
    invariant(appKey.length === expected.length && timingSafeEqual(appKey, expected), 'BAD_APP_KEY', 'Encrypted appKey mismatch', 401);
    return new TextDecoder('utf-8', {
        fatal: true
    }).decode(raw.subarray(20, 20 + len));
}
export function signedEnvelope(config, plaintext, now = Date.now()) {
    const timestamp = String(now), nonce = nonce16(), encrypted = encrypt(config, plaintext);
    return {
        timestamp,
        nonce,
        encrypt: encrypted,
        signature: signature(config, timestamp, nonce, encrypted)
    };
}
export function decodeEnvelope(config, wire, now = Date.now()) {
    const data = object(wire, 'signed envelope');
    text(data.nonce, 'nonce');
    invariant(/^[A-Za-z0-9]{16}$/.test(data.nonce), 'BAD_NONCE', 'nonce must be 16 alphanumeric characters', 401);
    const stamp = Number(data.timestamp);
    invariant(Number.isSafeInteger(stamp) && Math.abs(now - stamp) <= config.signatureMaxAgeMs, 'SIGNATURE_EXPIRED', 'Push signature timestamp outside accepted window', 401);
    verifySignature(config, data.timestamp, data.nonce, data.encrypt, data.signature);
    return decrypt(config, data.encrypt);
}

