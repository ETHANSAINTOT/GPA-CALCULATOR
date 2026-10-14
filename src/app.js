import path from 'node:path';
import express from 'express';
import { GRADES, computeSummary } from '../shared/gpa.js';
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  findSessionUser,
  hashPassword,
  readSessionToken,
  setSessionCookie,
  verifyPassword,
} from './auth.js';
import {
  createUe,
  createUser,
  deleteUe,
  deleteUser,
  findUserByEmail,
  listUes,
  updateUe,
} from './store.js';

const ROOT = path.join(import.meta.dirname, '..');
const DELETE_CONFIRMATION = 'DELETEMYACCOUNT-FORCE';
const MAX_BASE_CREDITS = 1000;
const MAX_UE_CREDITS = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const badRequest = (message) => new HttpError(400, message);

function parseText(value, label, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw badRequest(`${label} est obligatoire.`);
  if (text.length > maxLength) throw badRequest(`${label} ne doit pas dépasser ${maxLength} caractères.`);
  return text;
}

function parseCredits(value, label, max) {
  const credits = typeof value === 'string' && /^\s*\d+\s*$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(credits) || credits < 0 || credits > max) {
    throw badRequest(`${label} doit être un nombre entier entre 0 et ${max}.`);
  }
  return credits;
}

function parseGpa(value) {
  const text = typeof value === 'number' ? String(value) : String(value ?? '').trim().replace(',', '.');
  if (!/^\d(\.\d{1,2})?$/.test(text) || Number(text) > 4) {
    throw badRequest('Le GPA actuel doit être compris entre 0 et 4, avec au plus deux chiffres après la virgule.');
  }
  return Number(text);
}

function parseUe(body = {}) {
  const grade = typeof body.grade === 'string' ? body.grade.trim().toUpperCase() : '';
  if (!GRADES.includes(grade)) throw badRequest(`Le grade doit être l'un de : ${GRADES.join(', ')}.`);
  return {
    name: parseText(body.name, "Le nom de l'UE", 100),
    credits: parseCredits(body.credits, 'Le nombre de crédits', MAX_UE_CREDITS),
    grade,
  };
}

function parseUeId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(404, 'UE introuvable.');
  return id;
}

async function userState(user) {
  const { firstName, lastName, email, baseCredits, baseGpa } = user;
  const ues = await listUes(user.id);
  return {
    user: { firstName, lastName, email, baseCredits, baseGpa },
    ues,
    summary: computeSummary(baseGpa, baseCredits, ues),
  };
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Behind Vercel's proxy: trust X-Forwarded-Proto so req.secure reflects HTTPS.
  if (process.env.VERCEL) app.set('trust proxy', true);

  // Static assets (served by Vercel's CDN in production, so they never reach this function there)
  app.use(express.static(path.join(ROOT, 'public')));
  app.use('/shared', express.static(path.join(ROOT, 'shared')));

  app.use(express.json({ limit: '10kb' }));
  app.use(async (req, res, next) => {
    req.user = await findSessionUser(readSessionToken(req));
    next();
  });

  // Pages
  const page = (name) => (req, res) => res.sendFile(path.join(ROOT, 'views', `${name}.html`));
  const signedInOnly = (req, res, next) => (req.user ? next() : res.redirect('/connection'));
  const guestOnly = (req, res, next) => (req.user ? res.redirect('/calculator') : next());

  app.get('/', page('index'));
  app.get('/account-creation', page('account-creation'));
  app.get('/account-creation-success', page('account-creation-success'));
  app.get('/connection', guestOnly, page('connection'));
  app.get('/calculator', signedInOnly, page('calculator'));

  // API
  const requireUser = (req, res, next) => {
    if (!req.user) throw new HttpError(401, 'Tu dois être connecté.');
    next();
  };

  app.post('/api/accounts', async (req, res) => {
    const body = req.body ?? {};
    const firstName = parseText(body.firstName, 'Le prénom', 50);
    const lastName = parseText(body.lastName, 'Le nom', 50);
    const email = parseText(body.email, "L'adresse mail", 254).toLowerCase();
    if (!EMAIL_PATTERN.test(email)) throw badRequest("L'adresse mail n'est pas valide.");
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 8 || password.length > 200) {
      throw badRequest('Le mot de passe doit contenir entre 8 et 200 caractères.');
    }
    const credits = parseCredits(body.credits, 'Le nombre de crédits', MAX_BASE_CREDITS);
    const gpa = parseGpa(body.gpa);

    const passwordHash = await hashPassword(password);
    if (!(await createUser({ email, firstName, lastName, passwordHash, baseCredits: credits, baseGpa: gpa }))) {
      throw new HttpError(409, 'Un compte existe déjà avec cette adresse mail.');
    }
    res.status(201).json({ ok: true });
  });

  app.post('/api/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    const user = typeof email === 'string' ? await findUserByEmail(email) : undefined;
    if (!user || typeof password !== 'string' || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, 'Adresse mail ou mot de passe incorrect.');
    }
    setSessionCookie(req, res, await createSession(user.id));
    res.json({ ok: true });
  });

  app.post('/api/logout', async (req, res) => {
    await deleteSession(readSessionToken(req));
    clearSessionCookie(res);
    res.status(204).end();
  });

  app.delete('/api/account', requireUser, async (req, res) => {
    if (req.body?.confirmation !== DELETE_CONFIRMATION) {
      throw badRequest(`Écris exactement ${DELETE_CONFIRMATION} pour confirmer.`);
    }
    await deleteUser(req.user.id);
    clearSessionCookie(res);
    res.status(204).end();
  });

  app.get('/api/me', requireUser, async (req, res) => {
    res.json(await userState(req.user));
  });

  app.post('/api/ues', requireUser, async (req, res) => {
    await createUe(req.user.id, parseUe(req.body));
    res.status(201).json(await userState(req.user));
  });

  app.put('/api/ues/:id', requireUser, async (req, res) => {
    if (!(await updateUe(req.user.id, parseUeId(req), parseUe(req.body)))) throw new HttpError(404, 'UE introuvable.');
    res.json(await userState(req.user));
  });

  app.delete('/api/ues/:id', requireUser, async (req, res) => {
    if (!(await deleteUe(req.user.id, parseUeId(req)))) throw new HttpError(404, 'UE introuvable.');
    res.json(await userState(req.user));
  });

  app.use('/api', () => {
    throw new HttpError(404, 'Route inconnue.');
  });

  app.use((err, req, res, next) => {
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    const message = err instanceof HttpError ? err.message : status >= 500 ? 'Erreur interne du serveur.' : 'Requête invalide.';
    res.status(status).json({ error: message });
  });

  return app;
}
