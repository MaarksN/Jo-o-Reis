import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildBitrixTargetUrl } from './lib/bitrix-security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const BITRIX_TIMEOUT_MS = Math.min(
  30000,
  Math.max(1000, Number.parseInt(process.env.BITRIX_PROXY_TIMEOUT_MS || '12000', 10) || 12000)
);

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(self)');
  next();
});
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Bitrix24 API proxy. Target validation is intentionally strict to prevent SSRF.
app.post('/api/bitrix-proxy', async (req, res) => {
  const { webhookUrl, method, params } = req.body || {};

  let targetUrl;
  try {
    targetUrl = buildBitrixTargetUrl(webhookUrl, method);
  } catch (error) {
    return res.status(400).json({
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Mesa_Tratamento_Joao_Bitrix_Pomodoro_AtlasGR_v1_0.html'));
});

app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'Mesa_Tratamento_Joao_Bitrix_Pomodoro_AtlasGR_v1_0.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AtlasGR Mesa SDR Server running on http://0.0.0.0:${PORT}`);
});
