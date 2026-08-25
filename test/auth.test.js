import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticateUser,
  buildClearSessionCookie,
  buildSessionCookie,
  getAuthConfig,
  parseCookies,
  signSession,
  verifySession
} from '../lib/auth.js';

const env = {
  APP_SESSION_SECRET: 'this-is-a-test-session-secret-with-32-plus-chars',
  APP_JOAO_PASSWORD: 'joao-password-strong',
  APP_SUPERVISOR_PASSWORD: 'supervisor-password-strong'
};

test('authentication is fail-closed when secure environment is incomplete', () => {
  assert.equal(getAuthConfig({}).configured, false);
  assert.deepEqual(authenticateUser('joao.reis@atlasgr.com.br', 'anything', {}), {
    configured: false,
    user: null
  });
});

test('authenticates configured user without returning password', () => {
  const result = authenticateUser('JOAO.REIS@ATLASGR.COM.BR', 'joao-password-strong', env);
  assert.equal(result.configured, true);
  assert.deepEqual(result.user, {
    email: 'joao.reis@atlasgr.com.br',
    role: 'USUARIO',
    nome: 'João Reis'
  });
  assert.equal('password' in result.user, false);
});

test('rejects wrong password', () => {
  const result = authenticateUser('joao.reis@atlasgr.com.br', 'wrong-password', env);
  assert.equal(result.configured, true);
  assert.equal(result.user, null);
});

test('signed sessions verify, expire and reject tampering', () => {
  const now = 1_800_000_000_000;
  const user = {
    email: 'marcelo.nascimento@atlasgr.com.br',
    role: 'ADM_SUPERVISOR',
    nome: 'Marcelo Nascimento'
  };
  const token = signSession(user, env.APP_SESSION_SECRET, now);
  const verified = verifySession(token, env.APP_SESSION_SECRET, now + 1000);
  assert.equal(verified.email, user.email);
  assert.equal(verified.role, user.role);
  assert.equal(verifySession(`${token}x`, env.APP_SESSION_SECRET, now + 1000), null);
  assert.equal(verifySession(token, env.APP_SESSION_SECRET, now + 9 * 60 * 60 * 1000), null);
});

test('session cookies are HttpOnly, strict and clearable', () => {
  const cookie = buildSessionCookie('abc.def', { secure: true });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.equal(parseCookies('a=1; atlas_session=abc.def').atlas_session, 'abc.def');
  assert.match(buildClearSessionCookie({ secure: true }), /Max-Age=0/);
});
