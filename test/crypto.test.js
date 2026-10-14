import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const newKey = () => randomBytes(32).toString('base64');

process.env.ENCRYPTION_KEY = newKey();
const { blindIndex, decrypt, encrypt } = await import('../src/crypto.js');

// Runs `code` as an ES module in a fresh Node process with the given environment.
function runWith(code, env) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

const moduleUrl = (module) => JSON.stringify(new URL(module, import.meta.url).href);
const importCrypto = (env) => runWith(`await import(${moduleUrl('../src/crypto.js')})`, env);
const openDb = (env) => runWith(`const db = await import(${moduleUrl('../src/db.js')}); await db.initDb(); await db.closeDb();`, env);

test('encrypted values decrypt back to the original', () => {
  for (const value of ['Ada', 'éèà ç 🎓', '3.2', '']) {
    assert.equal(decrypt(encrypt(value)), value);
  }
});

test('the same value never encrypts the same way twice', () => {
  const value = 'ada@example.com';
  assert.notEqual(encrypt(value), encrypt(value));
  assert.ok(!encrypt(value).includes(value));
});

test('a tampered ciphertext is rejected', () => {
  const [version, iv, tag, ciphertext] = encrypt('3.20').split(':');
  const flipped = Buffer.from(ciphertext, 'base64');
  flipped[0] ^= 1;
  assert.throws(() => decrypt([version, iv, tag, flipped.toString('base64')].join(':')));
});

test('the blind index is deterministic and hides the value', () => {
  assert.equal(blindIndex('ada@example.com'), blindIndex('ada@example.com'));
  assert.notEqual(blindIndex('ada@example.com'), blindIndex('bob@example.com'));
  assert.match(blindIndex('ada@example.com'), /^[0-9a-f]{64}$/);
});

test('a missing or malformed key stops the app', () => {
  for (const ENCRYPTION_KEY of ['', 'trop-courte', randomBytes(16).toString('base64')]) {
    const result = importCrypto({ ENCRYPTION_KEY });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ENCRYPTION_KEY/);
  }
});

test('a key that did not encrypt the database stops the app', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gpa-test-'));
  try {
    const DATABASE_URL = pathToFileURL(path.join(dir, 'gpa.sqlite')).href;
    const key = newKey();
    assert.equal(openDb({ DATABASE_URL, ENCRYPTION_KEY: key }).status, 0);
    assert.equal(openDb({ DATABASE_URL, ENCRYPTION_KEY: key }).status, 0);

    const wrongKey = openDb({ DATABASE_URL, ENCRYPTION_KEY: newKey() });
    assert.notEqual(wrongKey.status, 0);
    assert.match(wrongKey.stderr, /ne correspond pas/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
