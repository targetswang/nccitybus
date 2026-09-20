#!/usr/bin/env python3
"""Independently verify the checked-in IVY test-only crypto vector.
Requires cryptography; never reads production configuration or secrets.
"""
from pathlib import Path
import base64, hashlib, json, struct
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

p = Path(__file__).parent / 'fixtures' / 'ivy-python-golden.json'
v = json.loads(p.read_text())
key = base64.b64decode(v['aesKey'] + '=')
message = v['message'].encode('utf-8')
plain = bytes.fromhex(v['prefixHex']) + struct.pack('!I', len(message)) + message + v['appKey'].encode('utf-8')
amount = 32 - len(plain) % 32
plain += bytes([amount]) * amount
encryptor = Cipher(algorithms.AES(key), modes.CBC(key[:16])).encryptor()
ciphertext = base64.b64encode(encryptor.update(plain) + encryptor.finalize()).decode('ascii')
values = [v['appKey'], v['appSecret'], v['timestamp'], v['nonce'], ciphertext]
signature = hashlib.sha1(''.join(sorted(values)).encode('utf-8')).hexdigest()
assert ciphertext == v['ciphertext']
assert signature == v['signature']
print(json.dumps({'independentPythonVector': 'passed', 'fixture': p.name, 'supplierLiveTest': False}))
