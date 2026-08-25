/**
 * AtlasGR • Bitrix24 Service
 * Dedicated client service for connecting SDR table data with Bitrix24 REST API.
 * Supports direct REST calls and server-side fallback proxy to bypass CORS.
 */

class BitrixService {
  constructor() {
    this.sdrId = '392';
  }

  getWebhookUrl() {
    const el = document.getElementById('hook');
    const inputVal = el ? el.value.trim() : '';
    const storedVal = localStorage.getItem('atlas-extrator-bitrix-webhook') || '';
    return inputVal || storedVal;
  }

  normalizeWebhook(url) {
    const raw = String(url || '').trim().replace(/\/+$/, '').replace(/\/[a-z0-9_.]+\.json.*$/i, '');
    if (!raw) {
      throw new Error('Nenhum webhook do Bitrix24 configurado. Insira o webhook no topo da tela.');
    }
    if (!/^https:\/\/[^/]+\/rest\/\d+\/[^/]+$/i.test(raw)) {
      throw new Error('Webhook com formato inválido. Deve seguir o padrão: https://portal.bitrix24.../rest/USUARIO/TOKEN/');
    }
    return raw;
  }

  async call(method, params = {}) {
    const webhook = this.normalizeWebhook(this.getWebhookUrl());
    const startTime = Date.now();
    let result = null;
    let error = null;
    let latency = 0;

    // Strategy 1: Direct fetch from browser
    try {
      const targetUrl = `${webhook}/${method}.json`;
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(params)
      });

      const data = await response.json().catch(() => ({}));
      latency = Date.now() - startTime;

      if (response.ok && !data.error) {
        result = data;
      } else {
        throw new Error(data.error_description || data.error || `HTTP ${response.status}`);
      }
    } catch (directErr) {
      // Strategy 2: Fallback to local server proxy (/api/bitrix-proxy)
      try {
        const proxyResponse = await fetch('/api/bitrix-proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            webhookUrl: webhook,
            method,
            params
          })
        });

        const proxyData = await proxyResponse.json().catch(() => ({}));
        latency = Date.now() - startTime;

        if (proxyResponse.ok && proxyData.success) {
          result = proxyData;
        } else {
          error = new Error(proxyData.error || directErr.message || 'Falha na requisição Bitrix24');
        }
      } catch (proxyErr) {
        latency = Date.now() - startTime;
        error = directErr;
      }
    }

    // Log to Storage Manager
    const logEntry = {
      method,
      status: error ? 'ERRO' : 'SUCESSO',
      latency,
      details: params ? JSON.stringify(params).slice(0, 150) : '',
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
      // Test by reading lead or user profile
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
