import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readEncryptedCredentials } from './read-encrypted-credentials.mjs';

const name = 'FXEMBED_ENCRYPTED_CREDENTIALS';
test('single and numbered build secrets reconstruct the same encrypted JSON', () => {
  const json = JSON.stringify({ ciphertext: 'abc', iv: 'def' });
  assert.equal(readEncryptedCredentials({ [name]: json }), json);
  assert.equal(
    readEncryptedCredentials({
      [name]: json.slice(0, 10),
      [`${name}_2`]: json.slice(20),
      [`${name}_1`]: json.slice(10, 20)
    }),
    json
  );
});
test('missing, empty, and malformed fragment names fail explicitly', () => {
  for (const env of [
    { [name]: '' },
    { [`${name}_1`]: 'x' },
    { [name]: 'x', [`${name}_2`]: 'y' },
    { [name]: 'x', [`${name}_1`]: '' },
    { [name]: 'x', [`${name}_oops`]: 'y' }
  ]) {
    assert.throws(() => readEncryptedCredentials(env), /FXEMBED_ENCRYPTED_CREDENTIALS/);
  }
});
test('unset build secrets still load the local encrypted file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fxembed-credentials-test-'));
  try {
    const file = join(dir, 'credentials.enc.json');
    writeFileSync(file, 'local-encrypted-json');
    assert.equal(readEncryptedCredentials({}, file), 'local-encrypted-json');
    assert.throws(() => readEncryptedCredentials({}, join(dir, 'missing')), { code: 'ENOENT' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
