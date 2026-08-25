import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'atlas_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const USER_DEFINITIONS = [
  {
    email: 'joao.reis@atlasgr.com.br',
    role: 'USUARIO',
    nome: 'João Reis',
    passwordEnv: 'APP_JOAO_PASSWORD'
  },
  {
    email: 'marcelo.nascimento@atlasgr.com.br',
    role: 'ADM_SUPERVISOR',
    nome: 'Marcelo Nascimento',
    passwordEnv: 'APP_SUPERVISOR_PASSWORD'
  }
];

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest();
}

function safeTextEqual(left, right) {
  return timingSafeEqual(digest(left), digest(right));
}

export function getPublicUsers() {
  return USER_DEFINITIONS.map(({ passwordEnv, ...user }) => ({ ...user }));
}

export function getAuthConfig(env = process.env) {
  const secret = String(env.APP_SESSION_SECRET || '');
  const users = USER_DEFINITIONS.map(({ passwordEnv, ...user }) => ({
    ...user,
    password: String(env[passwordEnv] || '')
  }));

  const configured =
    secret.length >= 32 &&
    users.every((user) => user.password.length >= 12);

  return { configured, secret, users };
}

export function authenticateUser(email, password, env = process.env) {
  const { configured, users } = getAuthConfig(env);
  if (!configured) return { configured: false, user: null };

  const normalizedEmail = String(email || '').trim().toLowerCase();
  const suppliedPassword = String(password || '');
  const candidate = users.find((user) => user.email === normalizedEmail);
  const comparisonPassword = candidate?.password || 'invalid-password-placeholder';
  const valid = safeTextEqual(suppliedPassword, comparisonPassword);

  if (!candidate || !valid) return { configured: true, user: null };

  const { password: _password, ...publicUser } = candidate;
  return { configured: true, user: publicUser };
}

export function signSession(user, secret, now = Date.now()) {
  if (!secret || String(secret).length < 32) {
    throw new Error('APP_SESSION_SECRET must contain at least 32 characters');
  }

  const payload = base64url(
    JSON.stringify({
      email: user.email,
      role: user.role,
      nome: user.nome,
      exp: now + SESSION_TTL_MS
    })
  );
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySession(token, secret, now = Date.now()) {
  if (!token || !secret || String(secret).length < 32) return null;

  const [payload, signature, extra] = String(token).split('.');
  if (!payload || !signature || extra) return null;

  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (!safeTextEqual(signature, expected)) return null;

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!parsed?.email || !parsed?.role || !parsed?.nome || !Number.isFinite(parsed?.exp)) return null;
  if (parsed.exp <= now) return null;

  const allowed = getPublicUsers().some(
    (user) => user.email === parsed.email && user.role === parsed.role
  );
  if (!allowed) return null;

  return {
    email: parsed.email,
    role: parsed.role,
    nome: parsed.nome,
    exp: parsed.exp
  };
}

export function parseCookies(header = '') {
  return String(header)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf('=');
      if (index <= 0) return cookies;
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

export function buildSessionCookie(token, { secure = false, maxAgeSeconds = SESSION_TTL_MS / 1000 } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(maxAgeSeconds)}`
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearSessionCookie({ secure = false } = {}) {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0'
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
