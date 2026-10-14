// Every read and write of user data goes through here, so nothing sensitive reaches the database unencrypted.
import { blindIndex, decrypt, encrypt } from './crypto.js';
import { batch, execute } from './db.js';

const emailIndex = (email) => blindIndex(email.trim().toLowerCase());

function toUser(row) {
  return row && {
    id: row.id,
    email: decrypt(row.email),
    firstName: decrypt(row.first_name),
    lastName: decrypt(row.last_name),
    passwordHash: row.password_hash,
    baseCredits: Number(decrypt(row.base_credits)),
    baseGpa: Number(decrypt(row.base_gpa)),
  };
}

async function findUserWhere(condition, args) {
  const { rows } = await execute(`SELECT * FROM users WHERE ${condition}`, args);
  return toUser(rows[0]);
}

export function findUserByEmail(email) {
  return findUserWhere('email_hash = ?', [emailIndex(email)]);
}

// One round trip per request: the session check and the user load are a single query.
export function findUserBySessionHash(tokenHash) {
  return findUserWhere('id = (SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?)', [tokenHash, Date.now()]);
}

// Returns false when an account already uses this email.
export async function createUser({ email, firstName, lastName, passwordHash, baseCredits, baseGpa }) {
  const { rowsAffected } = await execute(
    `INSERT INTO users (email_hash, email, first_name, last_name, password_hash, base_credits, base_gpa)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (email_hash) DO NOTHING`,
    [emailIndex(email), encrypt(email), encrypt(firstName), encrypt(lastName), passwordHash, encrypt(baseCredits), encrypt(baseGpa)],
  );
  return rowsAffected > 0;
}

export async function deleteUser(id) {
  await batch([
    { sql: 'DELETE FROM sessions WHERE user_id = ?', args: [id] },
    { sql: 'DELETE FROM ues WHERE user_id = ?', args: [id] },
    { sql: 'DELETE FROM users WHERE id = ?', args: [id] },
  ]);
}

export async function listUes(userId) {
  const { rows } = await execute('SELECT id, name, credits, grade FROM ues WHERE user_id = ? ORDER BY id', [userId]);
  return rows.map((row) => ({
    id: row.id,
    name: decrypt(row.name),
    credits: Number(decrypt(row.credits)),
    grade: decrypt(row.grade),
  }));
}

export async function createUe(userId, { name, credits, grade }) {
  await execute('INSERT INTO ues (user_id, name, credits, grade) VALUES (?, ?, ?, ?)', [
    userId,
    encrypt(name),
    encrypt(credits),
    encrypt(grade),
  ]);
}

// The update and delete helpers return false when the UE does not exist or belongs to someone else.
export async function updateUe(userId, id, { name, credits, grade }) {
  const { rowsAffected } = await execute('UPDATE ues SET name = ?, credits = ?, grade = ? WHERE id = ? AND user_id = ?', [
    encrypt(name),
    encrypt(credits),
    encrypt(grade),
    id,
    userId,
  ]);
  return rowsAffected > 0;
}

export async function deleteUe(userId, id) {
  const { rowsAffected } = await execute('DELETE FROM ues WHERE id = ? AND user_id = ?', [id, userId]);
  return rowsAffected > 0;
}
