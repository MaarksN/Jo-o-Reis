import express from 'express';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { authorizeBitrixRequest } from './lib/bitrix-authorization.js';
import { buildBitrixTargetUrl, validateBitrixMethod } from './lib/bitrix-security.js';
import {
  SESSION_COOKIE,
  authenticateUser,
  buildClearSessionCookie,
  buildSessionCookie,
  getAuthConfig,
  parseCookies,
  signSession,
  verifySession
} from './lib/auth.js';
import { transformRuntimeHtml } from './lib/runtime-html.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LEGACY_HTML_NAME = 'Mesa_Tratamento_Joao_Bitrix_Pomodoro_AtlasGR_v1_0.html';
const LEGACY_HTML_PATH = path.join(__dirname, LEGACY_HTML_NAME);

// Fail closed: if the known legacy auth signatures drift, do not serve the raw HTML.
const SECURE_APP_HTML = transformRuntimeHtml(readFileSync(LEGACY_HTML_PATH, 'utf8'));

const app = express();
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const SERVER_BITRIX_WEBHOOK = String(process.env.BITRIX24_WEBHOOK_URL || '').trim();
const AUTH_CONFIG = getAuthConfig(process.env);
const BITRIX_TIMEOUT_MS = Math.min(
  30000,
  Math.max(1000, Number.parseInt(process.env.BITRIX_PROXY_TIMEOUT_MS || '12000', 10) || 12000)
);
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(self)');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://atlasgr.bitrix24.com.br; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  next();
});
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

function isSecureRequest(req) {
  return Boolean(req.secure || String(req.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https');
}

function requireSameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    if (new URL(origin).host !== req.get('host')) {
      return res.status(403).json({ error: 'Cross-origin request rejected' });
    }
  } catch {
    return res.status(403).json({ error: 'Invalid Origin header' });
  }
  return next();
}

function sessionUser(req) {
  const cookies = parseCookies(req.get('cookie') || '');
  return verifySession(cookies[SESSION_COOKIE], AUTH_CONFIG.secret);
}

function requireAuth(req, res, next) {
  const user = sessionUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  req.user = user;
  return next();
}

function loginKey(req, email) {
  return `${req.ip}|${String(email || '').trim().toLowerCase()}`;
}

function isLoginRateLimited(key) {
  const now = Date.now();
  const state = loginAttempts.get(key);
  if (!state || state.resetAt <= now) {
    loginAttempts.set(key, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  return state.count >= LOGIN_MAX_ATTEMPTS;
}

function recordFailedLogin(key) {
  const now = Date.now();
  const state = loginAttempts.get(key);
  if (!state || state.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  state.count += 1;
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'atlasgr-mesa-sdr',
    authConfigured: AUTH_CONFIG.configured,
    bitrixConfigured: Boolean(SERVER_BITRIX_WEBHOOK)
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    authConfigured: AUTH_CONFIG.configured,
    bitrixProxy: true,
    bitrixConfigured: Boolean(SERVER_BITRIX_WEBHOOK),
    legacyDirectBitrixDefault: false
  });
});

app.post('/api/auth/login', requireSameOrigin, (req, res) => {
  if (!AUTH_CONFIG.configured) {
    return res.status(503).json({ error: 'Server authentication is not configured' });
  }

  const { email, password } = req.body || {};
  const key = loginKey(req, email);
  if (isLoginRateLimited(key)) {
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }

  const result = authenticateUser(email, password, process.env);
  if (!result.user) {
    recordFailedLogin(key);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  loginAttempts.delete(key);
  const token = signSession(result.user, AUTH_CONFIG.secret);
  res.setHeader('Set-Cookie', buildSessionCookie(token, { secure: isSecureRequest(req) }));
  return res.json({ ok: true, user: result.user });
});

app.get('/api/auth/session', (req, res) => {
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ error: 'No active session' });
  return res.json({
    ok: true,
    user: { email: user.email, role: user.role, nome: user.nome }
  });
});

app.post('/api/auth/logout', requireSameOrigin, (req, res) => {
  res.setHeader('Set-Cookie', buildClearSessionCookie({ secure: isSecureRequest(req) }));
  return res.json({ ok: true });
});

// Bitrix24 API proxy. Server configuration takes precedence so the browser
// does not need to know or persist the production webhook secret.
app.post('/api/bitrix-proxy', requireSameOrigin, requireAuth, async (req, res) => {
  const { webhookUrl, method, params } = req.body || {};
  const effectiveWebhook = SERVER_BITRIX_WEBHOOK || webhookUrl;

  let targetUrl;
  try {
    const safeMethod = validateBitrixMethod(method);
    authorizeBitrixRequest(req.user, safeMethod, params || {});
    targetUrl = buildBitrixTargetUrl(effectiveWebhook, safeMethod);
  } catch (error) {
    return res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Invalid Bitrix24 request'
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BITRIX_TIMEOUT_MS);
  const startTime = Date.now();

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'AtlasGR-MesaSDR/1.0'
      },
      body: JSON.stringify(params || {}),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    const latency = Date.now() - startTime;

    if (!response.ok || data.error) {
      return res.status(response.status >= 400 ? response.status : 400).json({
        success: false,
        error: data.error_description || data.error || `HTTP ${response.status}`,
        latency,
        status: response.status
      });
    }

    return res.json({
      success: true,
      result: data.result,
      next: data.next,
      total: data.total,
      latency,
      status: response.status
    });
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return res.status(timedOut ? 504 : 502).json({
      success: false,
      error: timedOut ? 'Bitrix24 request timed out' : 'Bitrix24 proxy request failed'
    });
  } finally {
    clearTimeout(timeout);
  }
});

function serveApp(req, res) {
  res.type('html').send(SECURE_APP_HTML);
}

app.get('/', serveApp);
app.get(`/${LEGACY_HTML_NAME}`, serveApp);

// Serve only the browser modules the application actually needs.
app.use('/js', express.static(path.join(__dirname, 'js'), { index: false, dotfiles: 'deny' }));

app.get('*', serveApp);

export { app };

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AtlasGR Mesa SDR Server running on http://0.0.0.0:${PORT}`);
  });
}
