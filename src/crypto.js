import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto';

// Encrypted values are stored as "v1:<iv>:<auth tag>:<ciphertext>" (base64, AES-256-GCM).
const FORMAT_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function loadMasterKey() {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error('ENCRYPTION_KEY est manquante. Génère-la avec `npm run -s key` et mets-la dans le fichier .env.');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32 || key.toString('base64') !== raw) {
    throw new Error('ENCRYPTION_KEY doit être une clé de 32 octets encodée en base64 (générée avec `npm run -s key`).');
  }
  return key;
}

// One master key, two independent sub-keys: one to encrypt, one to build searchable email fingerprints.
const masterKey = loadMasterKey();
const deriveKey = (purpose) => Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), `gpa-calculator/${purpose}`, 32));
const encryptionKey = deriveKey('encryption');
const blindIndexKey = deriveKey('blind-index');

export function encrypt(value) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const parts = [iv, cipher.getAuthTag(), ciphertext].map((buffer) => buffer.toString('base64'));
  return [FORMAT_VERSION, ...parts].join(':');
}

export function decrypt(payload) {
  const [version, iv, authTag, ciphertext] = payload.split(':');
  if (version !== FORMAT_VERSION) throw new Error(`Format de donnée chiffrée inconnu : ${version}`);
  const decipher = createDecipheriv(ALGORITHM, encryptionKey, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

// Deterministic keyed fingerprint, so an encrypted column can still be looked up and kept unique.
export function blindIndex(value) {
  return createHmac('sha256', blindIndexKey).update(value).digest('hex');
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
