import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createDecipheriv} from 'node:crypto';
import {signature,verifySignature,encrypt,decrypt,signedEnvelope,decodeEnvelope} from '../packages/ivy/crypto.mjs';
import {IVY,NOW} from './helpers.mjs';

test('IVY signature sorts VALUES and signs exact UTF-8 body, not parsed object',()=>{
 const body='{"city":"南充", "n":1}',nonce='abcdefghijklmnop',ts=String(NOW);
 const expected=createHash('sha1').update([IVY.appKey,IVY.appSecret,ts,nonce,body].sort().join(''),'utf8').digest('hex');
 assert.equal(signature(IVY,ts,nonce,body),expected);
 assert.throws(()=>verifySignature(IVY,ts,nonce,JSON.stringify(JSON.parse(body)),expected),{code:'BAD_SIGNATURE'});
});
for(const message of ['','a','x'.repeat(12),'x'.repeat(31),'x'.repeat(32),'南充\n清晖阁😊'])test(`AES32 UTF-8 envelope round-trip: ${JSON.stringify(message)}`,()=>{
 const encrypted=encrypt(IVY,message,Buffer.alloc(16,65));assert.equal(decrypt(IVY,encrypted),message);
 const key=Buffer.from(IVY.aesKey+'=','base64'),dec=createDecipheriv('aes-256-cbc',key,key.subarray(0,16));dec.setAutoPadding(false);
 const padded=Buffer.concat([dec.update(Buffer.from(encrypted,'base64')),dec.final()]);
 assert.equal(padded.length%32,0);assert.equal(padded.readUInt32BE(16),Buffer.byteLength(message));
});
test('signed envelope rejects tampering, expiration, wrong nonce and foreign app',()=>{
 const wire=signedEnvelope(IVY,'{"type":"hello"}',NOW);assert.equal(decodeEnvelope(IVY,wire,NOW),'{"type":"hello"}');
 assert.throws(()=>decodeEnvelope(IVY,{...wire,signature:'0'.repeat(40)},NOW),{code:'BAD_SIGNATURE'});
 assert.throws(()=>decodeEnvelope(IVY,wire,NOW+300001),{code:'SIGNATURE_EXPIRED'});
 assert.throws(()=>decodeEnvelope(IVY,{...wire,nonce:'short'},NOW),{code:'BAD_NONCE'});
 assert.throws(()=>decrypt({...IVY,appKey:'another-app'},wire.encrypt),{code:'BAD_APP_KEY'});
});
test('malformed cipher and truncated blocks fail closed',()=>{
 assert.throws(()=>decrypt(IVY,'not base64!'),{code:'BAD_CIPHERTEXT'});
 assert.throws(()=>decrypt(IVY,'AAAA'),{code:'BAD_CIPHERTEXT'});
 const ciphertext=Buffer.from(encrypt(IVY,'hello'),'base64');ciphertext[ciphertext.length-1]^=1;assert.throws(()=>decrypt(IVY,ciphertext.toString('base64')));
});
test('Node implementation matches independent Python cryptography golden vector',async()=>{
 const fs=await import('node:fs/promises');const v=JSON.parse(await fs.readFile(new URL('./fixtures/ivy-python-golden.json',import.meta.url),'utf8'));
 assert.equal(encrypt(v,v.message,Buffer.from(v.prefixHex,'hex')),v.ciphertext);assert.equal(decrypt(v,v.ciphertext),v.message);assert.equal(signature(v,v.timestamp,v.nonce,v.ciphertext),v.signature);
});
