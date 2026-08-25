import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/bitrix-service.js', import.meta.url), 'utf8');

function createStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}

function bootClient({ inputWebhook = '', storage = {}, fetchImpl }) {
  const hook = { value: inputWebhook };
  const localStorage = createStorage(storage);
  const context = {
    window: {},
    document: {
      getElementById(id) {
        return id === 'hook' ? hook : null;
      }
    },
    localStorage,
    fetch: fetchImpl,
    AbortController,
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Object,
    String,
    Number,
    Error
  };

  vm.runInNewContext(source, context, { filename: 'bitrix-service.js' });
  return { service: context.window.bitrixService, localStorage, hook };
}

function response({ ok = true, status = 200, json = {} } = {}) {
  return {
    ok,
    status,
    async json() {
      return json;
    }
  };
}

test('setWebhook exists, validates AtlasGR host and persists normalized value', () => {
  const { service, localStorage, hook } = bootClient({
    fetchImpl: async () => response()
  });

  const normalized = service.setWebhook(
    'https://atlasgr.bitrix24.com.br/rest/392/abcdefgh1234/'
  );

  assert.equal(normalized, 'https://atlasgr.bitrix24.com.br/rest/392/abcdefgh1234');
  assert.equal(localStorage.getItem('atlas-extrator-bitrix-webhook'), normalized);
  assert.equal(hook.value, normalized);
  assert.throws(
    () => service.setWebhook('https://evil.example/rest/392/abcdefgh1234'),
    /apenas o portal AtlasGR/
  );
});

test('uses same-origin proxy first and does not require a browser webhook', async () => {
  const calls = [];
  const { service } = bootClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({ json: { success: true, result: { items: [] } } });
    }
  });

  const result = await service.call('crm.status.list', { filter: { ENTITY_ID: 'STATUS' } });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/bitrix-proxy');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.method, 'crm.status.list');
  assert.equal('webhookUrl' in body, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.result)), { items: [] });
});

test('does not fall back to direct browser call by default', async () => {
  const calls = [];
  const { service } = bootClient({
    inputWebhook: 'https://atlasgr.bitrix24.com.br/rest/392/abcdefgh1234',
    fetchImpl: async (url) => {
      calls.push(url);
      return response({ ok: false, status: 503, json: { error: 'proxy down' } });
    }
  });

  await assert.rejects(() => service.call('crm.status.list', {}), /proxy down/);
  assert.deepEqual(calls, ['/api/bitrix-proxy']);
});

test('legacy direct mode is explicit opt-in and only uses validated AtlasGR webhook', async () => {
  const calls = [];
  const { service } = bootClient({
    storage: {
      'atlas-bitrix-legacy-direct-mode': 'true',
      'atlas-extrator-bitrix-webhook': 'https://atlasgr.bitrix24.com.br/rest/392/abcdefgh1234'
    },
    fetchImpl: async (url) => {
      calls.push(url);
      if (url === '/api/bitrix-proxy') {
        return response({ ok: false, status: 404, json: {} });
      }
      return response({ json: { result: { ok: true } } });
    }
  });

  const result = await service.call('crm.status.list', {});

  assert.equal(calls.length, 2);
  assert.equal(calls[0], '/api/bitrix-proxy');
  assert.equal(
    calls[1],
    'https://atlasgr.bitrix24.com.br/rest/392/abcdefgh1234/crm.status.list.json'
  );
  assert.deepEqual(JSON.parse(JSON.stringify(result.result)), { ok: true });
});
