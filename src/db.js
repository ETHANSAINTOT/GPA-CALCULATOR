import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decrypt, encrypt } from './crypto.js';

// Local file by default (npm start, Docker); a remote libSQL/Turso database when DATABASE_URL is set (Vercel).
const LOCAL_DB_PATH = path.join(import.meta.dirname, '..', 'data', 'gpa.sqlite');
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL;
const AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;
const KEY_CHECK_VALUE = 'gpa-calculator';

// Columns marked "encrypted" hold encrypt() output, never plaintext.
// No ON DELETE CASCADE: foreign_keys is a per-connection pragma, so deletions are done explicitly.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    email_hash    TEXT    NOT NULL UNIQUE, -- blindIndex(email), used for lookups
    email         TEXT    NOT NULL,        -- encrypted
    first_name    TEXT    NOT NULL,        -- encrypted
    last_name     TEXT    NOT NULL,        -- encrypted
    password_hash TEXT    NOT NULL,        -- scrypt
    base_credits  TEXT    NOT NULL,        -- encrypted
    base_gpa      TEXT    NOT NULL,        -- encrypted
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS ues (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id),
    name       TEXT    NOT NULL, -- encrypted
    credits    TEXT    NOT NULL, -- encrypted
    grade      TEXT    NOT NULL, -- encrypted
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'CREATE INDEX IF NOT EXISTS ues_user_id ON ues (user_id)',
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT    PRIMARY KEY, -- sha256(session token)
    user_id    INTEGER NOT NULL REFERENCES users (id),
    expires_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions (user_id)',
];

async function connect() {
  let url = DATABASE_URL;
  if (!url) {
    mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
    url = pathToFileURL(LOCAL_DB_PATH).href;
  }

  // Remote databases go through the HTTP-only client: no native module to ship in serverless bundles.
  const isLocal = url.startsWith('file:') || url === ':memory:';
  const { createClient } = isLocal ? await import('@libsql/client') : await import('@libsql/client/web');
  const client = createClient({ url, authToken: AUTH_TOKEN });

  // Schema and key check in a single round trip, which matters on every serverless cold start.
  const results = await client.batch([
    ...SCHEMA,
    { sql: "INSERT OR IGNORE INTO meta (key, value) VALUES ('key_check', ?)", args: [encrypt(KEY_CHECK_VALUE)] },
    "SELECT value FROM meta WHERE key = 'key_check'",
  ], 'write');

  // Refuse to run with a key that cannot read the existing data.
  let readable = false;
  try {
    readable = decrypt(results.at(-1).rows[0].value) === KEY_CHECK_VALUE;
  } catch {}
  if (!readable) {
    client.close();
    throw new Error(`ENCRYPTION_KEY ne correspond pas à celle qui a chiffré la base ${DATABASE_URL ?? LOCAL_DB_PATH}.`);
  }
  return client;
}

let ready;

// Connects once per process (once per cold start on Vercel); a failed attempt is retried on the next call.
export function initDb() {
  ready ??= connect().catch((error) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

export async function execute(sql, args = []) {
  return (await initDb()).execute({ sql, args });
}

// Runs the statements atomically, in one round trip.
export async function batch(statements) {
  return (await initDb()).batch(statements, 'write');
}

export async function closeDb() {
  if (ready) (await ready).close();
}
