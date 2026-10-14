import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, test } from 'node:test';

process.env.DATABASE_URL = ':memory:';
process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
const { createApp } = await import('../src/app.js');
const { execute } = await import('../src/db.js');

let server;
let baseUrl;
let cookie = '';

async function call(method, path, body) {
  const response = await fetch(baseUrl + path, {
    method,
    redirect: 'manual',
    headers: { ...(body && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const data = response.headers.get('content-type')?.includes('json') ? await response.json() : null;
  return { status: response.status, location: response.headers.get('location'), data };
}

const account = { firstName: 'Augusta', lastName: 'Lovelace', email: 'Ada@Example.com', password: 'motdepasse', credits: '10', gpa: '3.00' };

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => server.close());

test('account creation validates its input', async () => {
  assert.equal((await call('POST', '/api/accounts', { ...account, gpa: '4.5' })).status, 400);
  assert.equal((await call('POST', '/api/accounts', { ...account, gpa: '3.123' })).status, 400);
  assert.equal((await call('POST', '/api/accounts', { ...account, credits: '' })).status, 400);
  assert.equal((await call('POST', '/api/accounts', { ...account, password: 'court' })).status, 400);
  assert.equal((await call('POST', '/api/accounts', { ...account, email: 'pas-un-mail' })).status, 400);
});

test('an account can be created once per email', async () => {
  assert.equal((await call('POST', '/api/accounts', account)).status, 201);
  assert.equal((await call('POST', '/api/accounts', { ...account, email: 'ada@example.com' })).status, 409);
});

test('the calculator requires a session', async () => {
  const page = await call('GET', '/calculator');
  assert.equal(page.status, 302);
  assert.equal(page.location, '/connection');
  assert.equal((await call('GET', '/api/me')).status, 401);
});

test('login rejects a wrong password, then accepts the right one', async () => {
  assert.equal((await call('POST', '/api/login', { email: account.email, password: 'mauvais!!' })).status, 401);
  assert.equal(cookie, '');
  assert.equal((await call('POST', '/api/login', { email: 'ada@example.com', password: account.password })).status, 200);
  assert.match(cookie, /^sid=/);

  const me = await call('GET', '/api/me');
  assert.equal(me.data.user.firstName, 'Augusta');
  assert.deepEqual(me.data.summary, { gpa: 3, credits: 10 });
});

test('UEs can be added, edited and deleted, and the GPA follows', async () => {
  let { status, data } = await call('POST', '/api/ues', { name: 'B-PRO-300', credits: '4', grade: 'C' });
  assert.equal(status, 201);
  assert.equal(data.summary.credits, 14);
  assert.equal(data.summary.gpa.toFixed(2), '2.71');

  const id = data.ues[0].id;
  ({ data } = await call('PUT', `/api/ues/${id}`, { name: 'B-PRO-300', credits: '4', grade: 'E' }));
  assert.equal(data.summary.credits, 10);
  assert.equal(data.summary.gpa.toFixed(2), '2.14');

  assert.equal((await call('POST', '/api/ues', { name: 'X', credits: '4', grade: 'F' })).status, 400);
  assert.equal((await call('PUT', '/api/ues/9999', { name: 'X', credits: '4', grade: 'A' })).status, 404);

  ({ data } = await call('DELETE', `/api/ues/${id}`));
  assert.deepEqual(data.ues, []);
  assert.deepEqual(data.summary, { gpa: 3, credits: 10 });
});

test('nothing sensitive is stored in clear in the database', async () => {
  await call('POST', '/api/ues', { name: 'B-PRO-300', credits: '4', grade: 'A' });
  const token = cookie.split('=')[1];
  const tables = await Promise.all(['users', 'ues', 'sessions'].map((table) => execute(`SELECT * FROM ${table}`)));
  const dump = JSON.stringify(tables.map(({ rows }) => rows));

  for (const secret of ['Augusta', 'Lovelace', 'ada@example.com', account.password, 'B-PRO-300', '"A"', token]) {
    assert.ok(!dump.includes(secret), `${secret} est stocké en clair`);
  }
  assert.equal((await call('GET', '/api/me')).data.ues[0].name, 'B-PRO-300');
});

test('deleting the account needs the exact confirmation and removes all its data', async () => {
  assert.equal((await call('DELETE', '/api/account', { confirmation: 'deletemyaccount-force' })).status, 400);
  assert.equal((await call('DELETE', '/api/account', { confirmation: 'DELETEMYACCOUNT-FORCE' })).status, 204);
  cookie = '';
  assert.equal((await call('POST', '/api/login', { email: account.email, password: account.password })).status, 401);

  for (const table of ['users', 'ues', 'sessions']) {
    assert.equal((await execute(`SELECT count(*) AS n FROM ${table}`)).rows[0].n, 0, `${table} n'est pas vide`);
  }
});
