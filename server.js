import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Bitrix24 API Proxy to handle potential CORS issues from client
app.post('/api/bitrix-proxy', async (req, res) => {
  const { webhookUrl, method, params } = req.body;
  if (!webhookUrl || !method) {
    return res.status(400).json({ error: 'webhookUrl and method are required' });
  }

  try {
    const cleanHook = String(webhookUrl).trim().replace(/\/+$/, '').replace(/\/[a-z0-9_.]+\.json.*$/i, '');
    const targetUrl = `${cleanHook}/${method}.json`;
    
    const startTime = Date.now();
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'AtlasGR-MesaSDR/1.0'
      },
      body: JSON.stringify(params || {})
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
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal proxy error'
    });
  }
});

// Serve Mesa HTML at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Mesa_Tratamento_Joao_Bitrix_Pomodoro_AtlasGR_v1_0.html'));
});

// Serve static assets from directory
app.use(express.static(__dirname));

// Fallback for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'Mesa_Tratamento_Joao_Bitrix_Pomodoro_AtlasGR_v1_0.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AtlasGR Mesa SDR Server running on http://0.0.0.0:${PORT}`);
});

