// Every read and write of user data goes through here, so nothing sensitive reaches SQLite unencrypted.
import { blindIndex, decrypt, encrypt } from './crypto.js';
import { db } from './db.js';

const emailIndex = (email) => blindIndex(email.trim().toLowerCase());

const selectUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const selectUserByEmailHash = db.prepare('SELECT * FROM users WHERE email_hash = ?');
const insertUserRow = db.prepare(`
  INSERT INTO users (email_hash, email, first_name, last_name, password_hash, base_credits, base_gpa)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const deleteUserRow = db.prepare('DELETE FROM users WHERE id = ?');
const selectUeRows = db.prepare('SELECT id, name, credits, grade FROM ues WHERE user_id = ? ORDER BY id');
const insertUeRow = db.prepare('INSERT INTO ues (user_id, name, credits, grade) VALUES (?, ?, ?, ?)');
const updateUeRow = db.prepare('UPDATE ues SET name = ?, credits = ?, grade = ? WHERE id = ? AND user_id = ?');
const deleteUeRow = db.prepare('DELETE FROM ues WHERE id = ? AND user_id = ?');

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

export function findUserById(id) {
  return toUser(selectUserById.get(id));
}

export function findUserByEmail(email) {
  return toUser(selectUserByEmailHash.get(emailIndex(email)));
}

export function createUser({ email, firstName, lastName, passwordHash, baseCredits, baseGpa }) {
  insertUserRow.run(
    emailIndex(email),
    encrypt(email),
    encrypt(firstName),
    encrypt(lastName),
    passwordHash,
    encrypt(baseCredits),
    encrypt(baseGpa),
  );
}

export function deleteUser(id) {
  deleteUserRow.run(id);
}

export function listUes(userId) {
  return selectUeRows.all(userId).map((row) => ({
    id: row.id,
    name: decrypt(row.name),
    credits: Number(decrypt(row.credits)),
    grade: decrypt(row.grade),
  }));
}

export function createUe(userId, { name, credits, grade }) {
  insertUeRow.run(userId, encrypt(name), encrypt(credits), encrypt(grade));
}

// The update and delete helpers return false when the UE does not exist or belongs to someone else.
export function updateUe(userId, id, { name, credits, grade }) {
  return updateUeRow.run(encrypt(name), encrypt(credits), encrypt(grade), id, userId).changes > 0;
}

export function deleteUe(userId, id) {
  return deleteUeRow.run(id, userId).changes > 0;
}
