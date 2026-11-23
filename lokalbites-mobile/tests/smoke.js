'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function main() {
  const users = new Map();
  const credentials = new Map();
  const products = [{
    id: 'catalog-item',
    legacy_id: 'p1',
    name: 'Organic Broccoli',
    price: '90',
    stock: 24,
    active: true
  }];
  const database = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const eq = key => url.searchParams.get(key)?.slice(3);
    function reply(status, data) {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }

    switch (url.pathname) {
      case '/rest/v1/products':
        return reply(200, products);
      case '/rest/v1/users':
        return reply(200, [...users.values()].filter(user =>
          user.email === eq('email') || user.legacy_id === eq('legacy_id')
        ));
      case '/rest/v1/lokalbites_credentials':
        return reply(200, [credentials.get(eq('email'))].filter(Boolean));
      case '/rest/v1/rpc/register_lokalbites_user': {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const record = JSON.parse(Buffer.concat(chunks).toString());
        if (users.has(record.p_email)) {
          return reply(409, { code: '23505', message: 'Duplicate email' });
        }
        users.set(record.p_email, {
          email: record.p_email,
          name: record.p_name,
          legacy_id: record.p_legacy_id,
          role: 'customer'
        });
        credentials.set(record.p_email, {
          password_salt: record.p_password_salt,
          password_hash: record.p_password_hash
        });
        return reply(200, null);
      }
      default:
        return reply(501, { message: 'Unexpected mock Supabase request' });
    }
  });

  let local;
  let deployment;
  try {
    process.env.SUPABASE_URL = await listen(database);
    process.env.SUPABASE_SECRET_KEY = 'mock-secret-key';
    process.env.APP_SECRET = 'test-only-random-secret-do-not-deploy';
    process.env.PORT = '0';
    process.env.GROQ_API_KEY = '';

    local = require('../server').startServer();
    await once(local, 'listening');
    const localUrl = `http://127.0.0.1:${local.address().port}`;
    assert.equal((await fetch(localUrl)).status, 200);
    assert.equal((await fetch(localUrl + '/sw.js')).status, 200);

    deployment = http.createServer(require('../api/handler'));
    const apiUrl = await listen(deployment);
    async function request(path, { method = 'GET', body, token } = {}) {
      const response = await fetch(apiUrl + '/api/handler?__lokalbites_path=' + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      return { status: response.status, data: await response.json() };
    }

    const health = await request('health');
    assert.deepEqual(health, { status: 200, data: { ok: true } });
    assert.equal((await request('products')).data.products[0].price, 90);
    assert.equal((await request('orders')).status, 401);
    assert.equal((await request('does-not-exist')).status, 404);
    assert.equal((await request('auth/register', { method: 'POST', body: null })).status, 400);

    const user = { name: 'Sample customer', email: 'customer@example.test', password: 'TestPassword123!' };
    const register = () => request('auth/register', { method: 'POST', body: user });
    const login = password => request('auth/login', {
      method: 'POST', body: { email: user.email, password }
    });
    const registered = await register();
    assert.equal(registered.status, 201);
    assert.equal(registered.data.user.role, 'customer');
    assert.equal((await register()).status, 409);
    assert.notEqual(credentials.get(user.email).password_hash, user.password);

    assert.equal((await login('WrongPassword123!')).status, 401);
    const signedIn = await login(user.password);
    assert.equal(signedIn.status, 200);
    const token = signedIn.data.token;
    assert.equal((await request('auth/me', { token })).data.user.id, registered.data.user.id);
    assert.equal((await request('farmer/products', { token })).status, 403);

    users.get(user.email).role = 'farmer';
    assert.equal((await request('auth/me', { token })).data.user.role, 'farmer');
    assert.equal((await request('farmer/products', { token })).status, 200);
    assert.equal((await request('ai/chat', { method: 'POST', body: { message: 'Hi' } })).status, 503);

    console.log('PASS: local PWA, Vercel API routing, catalog, registration, sign-in and farmer access');
  } finally {
    deployment?.close();
    local?.close();
    database.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
