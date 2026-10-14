import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { decrypt, encrypt } from './crypto.js';

const DB_PATH = process.env.DB_PATH ?? path.join(import.meta.dirname, '..', 'data', 'gpa.sqlite');
const KEY_CHECK_VALUE = 'gpa-calculator';

if (DB_PATH !== ':memory:') mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

// Columns marked "encrypted" hold encrypt() output, never plaintext.
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    email_hash    TEXT    NOT NULL UNIQUE, -- blindIndex(email), used for lookups
    email         TEXT    NOT NULL,        -- encrypted
    first_name    TEXT    NOT NULL,        -- encrypted
    last_name     TEXT    NOT NULL,        -- encrypted
    password_hash TEXT    NOT NULL,        -- scrypt
    base_credits  TEXT    NOT NULL,        -- encrypted
    base_gpa      TEXT    NOT NULL,        -- encrypted
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ues (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       TEXT    NOT NULL, -- encrypted
    credits    TEXT    NOT NULL, -- encrypted
    grade      TEXT    NOT NULL, -- encrypted
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS ues_user_id ON ues (user_id);

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT    PRIMARY KEY, -- sha256(session token)
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
`);

// Refuse to start with a key that cannot read the existing data.
const keyCheck = db.prepare("SELECT value FROM meta WHERE key = 'key_check'").get();
if (!keyCheck) {
  db.prepare("INSERT INTO meta (key, value) VALUES ('key_check', ?)").run(encrypt(KEY_CHECK_VALUE));
} else {
  let readable = false;
  try {
    readable = decrypt(keyCheck.value) === KEY_CHECK_VALUE;
  } catch {}
  if (!readable) throw new Error(`ENCRYPTION_KEY ne correspond pas à celle qui a chiffré la base ${DB_PATH}.`);
}
