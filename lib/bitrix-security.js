const DEFAULT_ALLOWED_HOSTS = ['atlasgr.bitrix24.com.br'];

export function getAllowedBitrixHosts(raw = process.env.BITRIX24_ALLOWED_HOSTS || '') {
  const configured = String(raw)
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_HOSTS, ...configured]);
}

export function normalizeBitrixWebhook(rawUrl, allowedHosts = getAllowedBitrixHosts()) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('webhookUrl is required');
  }

  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error('Invalid Bitrix24 webhook URL');
  }

  if (url.protocol !== 'https:') {
    throw new Error('Bitrix24 webhook must use HTTPS');
  }

  if (url.username || url.password || url.port) {
    throw new Error('Bitrix24 webhook cannot include credentials or a custom port');
  }

  const hostname = url.hostname.toLowerCase();
  if (!allowedHosts.has(hostname)) {
    throw new Error(`Bitrix24 host is not allowed: ${hostname}`);
  }

  const match = url.pathname.match(/^\/rest\/(\d+)\/([A-Za-z0-9_-]{8,})(?:\/[A-Za-z0-9_.]+\.json)?\/?$/);
  if (!match) {
    throw new Error('Invalid Bitrix24 webhook path');
  }

  const [, userId, token] = match;
  return `https://${hostname}/rest/${userId}/${token}`;
}

export function validateBitrixMethod(method) {
  const normalized = String(method || '').trim();
  if (!/^[A-Za-z][A-Za-z0-9_.]{1,80}$/.test(normalized)) {
    throw new Error('Invalid Bitrix24 method');
  }
  return normalized;
}

export function buildBitrixTargetUrl(webhookUrl, method, allowedHosts = getAllowedBitrixHosts()) {
  const webhook = normalizeBitrixWebhook(webhookUrl, allowedHosts);
  const safeMethod = validateBitrixMethod(method);
  return `${webhook}/${safeMethod}.json`;
}
