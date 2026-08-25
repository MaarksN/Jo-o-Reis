import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../server.js';

async function withServer(run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('health endpoint responds without leaking secrets', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, 'atlasgr-mesa-sdr');
    assert.equal('webhookUrl' in body, false);
    assert.equal('sessionSecret' in body, false);
  });
});

test('root serves transformed HTML rather than hardcoded-password legacy auth', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /text\/html/);
    assert.equal(html.includes("pass:'00000000'"), false);
    assert.equal(html.includes('fetch(`${normHook()}/${method}.json`'), false);
    assert.match(html, /\/api\/auth\/login/);
    assert.match(response.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  });
});

test('Bitrix proxy rejects unauthenticated requests before any outbound call', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/bitrix-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'crm.status.list',
        params: { filter: { ENTITY_ID: 'STATUS' } }
      })
    });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.success, false);
    assert.match(body.error, /Authentication required/);
  });
});

test('login fails closed when server credentials are not configured', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'joao.reis@atlasgr.com.br', password: 'guess' })
    });

    assert.equal(response.status, 503);
  });
});
