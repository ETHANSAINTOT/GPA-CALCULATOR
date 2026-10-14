import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { sha256 } from './crypto.js';
import { db } from './db.js';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const SESSION_COOKIE = 'sid';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_OPTIONS = { httpOnly: true, sameSite: 'lax', path: '/' };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

// Only a hash of each session token is stored: a leaked database cannot be used to hijack a session.
const insertSession = db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
const selectSessionUserId = db.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?');
const deleteSessionByHash = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
const deleteExpiredSessions = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

export function createSession(userId) {
  deleteExpiredSessions.run(Date.now());
  const token = randomBytes(32).toString('base64url');
  insertSession.run(sha256(token), userId, Date.now() + SESSION_TTL_MS);
  return token;
}

export function findSessionUserId(token) {
  return token ? selectSessionUserId.get(sha256(token), Date.now())?.user_id : undefined;
}

export function deleteSession(token) {
  if (token) deleteSessionByHash.run(sha256(token));
}

export function readSessionToken(req) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return value.join('=');
  }
  return undefined;
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
}
