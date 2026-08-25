/**
 * AtlasGR • Bitrix24 Service
 * Client service for the SDR desk.
 * Secure default: use the same-origin server proxy. Direct browser calls are legacy opt-in only.
 */

class BitrixService {
  constructor() {
    this.sdrId = '392';
    this.proxyEndpoint = '/api/bitrix-proxy';
    this.requestTimeoutMs = 12000;
    this.webhookStorageKey = 'atlas-extrator-bitrix-webhook';
    this.legacyDirectModeKey = 'atlas-bitrix-legacy-direct-mode';
  }

  getWebhookUrl() {
    const el = document.getElementById('hook');
    const inputVal = el ? el.value.trim() : '';
    const storedVal = localStorage.getItem(this.webhookStorageKey) || '';
    return inputVal || storedVal;
  }

  setWebhook(url) {
    const raw = String(url || '').trim();
    const el = document.getElementById('hook');

    if (!raw) {
      localStorage.removeItem(this.webhookStorageKey);
      if (el) el.value = '';
      return '';
    }

    const normalized = this.normalizeWebhook(raw);
    localStorage.setItem(this.webhookStorageKey, normalized);
    if (el) el.value = normalized;
    return normalized;
  }

  normalizeWebhook(url) {
    const raw = String(url || '').trim().replace(/\/+$/, '').replace(/\/[a-z0-9_.]+\.json.*$/i, '');
    if (!raw) {
      throw new Error('Nenhum webhook do Bitrix24 configurado. Use o servidor com BITRIX24_WEBHOOK_URL ou configure o webhook explicitamente.');
    }
    if (!/^https:\/\/atlasgr\.bitrix24\.com\.br\/rest\/\d+\/[A-Za-z0-9_-]{8,}$/i.test(raw)) {
      throw new Error('Webhook inválido. O cliente aceita apenas o portal AtlasGR via HTTPS.');
    }
    return raw;
  }

  validateMethod(method) {
    const normalized = String(method || '').trim();
    if (!/^[A-Za-z][A-Za-z0-9_.]{1,80}$/.test(normalized)) {
      throw new Error('Método Bitrix24 inválido.');
    }
    return normalized;
  }

  isLegacyDirectModeEnabled() {
    return localStorage.getItem(this.legacyDirectModeKey) === 'true';
  }

  async fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  async call(method, params = {}) {
    const safeMethod = this.validateMethod(method);
    const rawWebhook = this.getWebhookUrl();
    const webhook = rawWebhook ? this.normalizeWebhook(rawWebhook) : '';
    const startTime = Date.now();
    let result = null;
    let error = null;
    let latency = 0;

    // Strategy 1 (default): same-origin proxy. If BITRIX24_WEBHOOK_URL exists on the
    // server, no webhook secret needs to be sent or persisted by the browser.
    try {
      const body = { method: safeMethod, params };
      if (webhook) body.webhookUrl = webhook;

      const proxyResponse = await this.fetchWithTimeout(this.proxyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const proxyData = await proxyResponse.json().catch(() => ({}));
      latency = Date.now() - startTime;

      if (proxyResponse.ok && proxyData.success) {
        result = proxyData;
      } else {
        throw new Error(proxyData.error || `Proxy Bitrix indisponível (HTTP ${proxyResponse.status})`);
      }
    } catch (proxyErr) {
      // Strategy 2: compatibility only. Disabled by default because it exposes the
      // webhook token to browser runtime, extensions and XSS.
      if (!this.isLegacyDirectModeEnabled() || !webhook) {
        error = proxyErr;
      } else {
        try {
          const targetUrl = `${webhook}/${safeMethod}.json`;
          const response = await this.fetchWithTimeout(targetUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify(params)
          });

          const data = await response.json().catch(() => ({}));
          latency = Date.now() - startTime;

          if (response.ok && !data.error) {
            result = data;
          } else {
            error = new Error(data.error_description || data.error || `HTTP ${response.status}`);
          }
        } catch (directErr) {
          latency = Date.now() - startTime;
          error = directErr;
        }
      }
    }

    const logEntry = {
      method: safeMethod,
      status: error ? 'ERRO' : 'SUCESSO',
      latency,
      details: params && typeof params === 'object' ? `campos: ${Object.keys(params).slice(0, 12).join(', ')}` : '',
      error: error ? error.message : null
    };
    if (window.storageManager) {
      window.storageManager.addBitrixLog(logEntry);
    }

    if (error) {
      throw error;
    }

    return result;
  }

  async testConnection(leadId = null) {
    const start = Date.now();
    try {
      let res;
      if (leadId) {
        res = await this.call('crm.item.get', { entityTypeId: 1, id: Number(leadId) });
      } else {
        res = await this.call('crm.status.list', { filter: { ENTITY_ID: 'STATUS' } });
      }
      const latency = Date.now() - start;
      return { ok: true, latency, data: res.result };
    } catch (e) {
      return { ok: false, error: e.message, latency: Date.now() - start };
    }
  }

  async getLead(leadId) {
    const res = await this.call('crm.item.get', { entityTypeId: 1, id: Number(leadId) });
    return res.result?.item || null;
  }

  async listSdrLeads(sdrId = this.sdrId) {
    let start = 0;
    const out = [];
    while (true) {
      const res = await this.call('crm.item.list', {
        entityTypeId: 1,
        select: ['id', 'stageId', 'assignedById', 'updatedTime', 'movedTime', 'lastActivityTime'],
        filter: { assignedById: Number(sdrId) },
        order: { id: 'ASC' },
        start
      });
      const items = res.result?.items || [];
      out.push(...items);
      if (!res.next || !items.length) break;
      start = res.next;
    }
    return out;
  }

  async updateLead(leadId, fields) {
    return await this.call('crm.item.update', {
      entityTypeId: 1,
      id: Number(leadId),
      fields
    });
  }

  async addActivity(leadId, { title, datetime, type = 'TODO', responsibleId = this.sdrId }) {
    const iso = new Date(datetime).toISOString();
    return await this.call('crm.activity.add', {
      fields: {
        OWNER_ID: Number(leadId),
        OWNER_TYPE_ID: 1,
        TYPE_ID: 6,
        PROVIDER_ID: 'CRM_TODO',
        PROVIDER_TYPE_ID: 'TODO',
        SUBJECT: title,
        START_TIME: iso,
        END_TIME: iso,
        DEADLINE: iso,
        COMPLETED: 'N',
        RESPONSIBLE_ID: Number(responsibleId)
      }
    });
  }

  async addTimelineComment(leadId, comment, files = []) {
    const fields = {
      ENTITY_ID: Number(leadId),
      ENTITY_TYPE: 'lead',
      COMMENT: comment
    };
    if (files && files.length > 0) {
      fields.FILES = files;
    }
    return await this.call('crm.timeline.comment.add', { fields });
  }

  async addDeal(fields) {
    return await this.call('crm.deal.add', { fields });
  }

  async getLeadStages() {
    const res = await this.call('crm.status.list', { filter: { ENTITY_ID: 'STATUS' } });
    return (res.result || []).slice().sort((a, b) => Number(a.SORT || 0) - Number(b.SORT || 0));
  }

  async getDealCategories() {
    const res = await this.call('crm.category.list', { entityTypeId: 2 });
    return res.result?.categories || [];
  }

  async getDealStages(categoryId = '0') {
    const entityId = categoryId === '0' || !categoryId ? 'DEAL_STAGE' : `DEAL_STAGE_${categoryId}`;
    const res = await this.call('crm.status.list', { filter: { ENTITY_ID: entityId } });
    return (res.result || []).slice().sort((a, b) => Number(a.SORT || 0) - Number(b.SORT || 0));
  }

  async getDisqualifyReasons() {
    const res = await this.call('crm.lead.fields', {});
    const field = (res.result || {})['UF_CRM_1770065854148'];
    return field?.items || [];
  }

  async getUsers() {
    let start = 0;
    const out = [];
    while (true) {
      const res = await this.call('user.get', { FILTER: { ACTIVE: true }, start });
      const items = res.result || [];
      out.push(...items);
      if (!res.next || !items.length) break;
      start = res.next;
    }
    return out;
  }
}

window.bitrixService = new BitrixService();
