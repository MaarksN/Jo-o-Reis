import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeLegacyHtml, SANITIZED_DATASET } from '../lib/sanitize-legacy-html.js';
import { transformRuntimeHtml } from '../lib/runtime-html.js';

const legacyHtml = readFileSync(
  new URL('../Mesa_Tratamento_Joao_Bitrix_Pomodoro_AtlasGR_v1_0.html', import.meta.url),
  'utf8'
);

test('sanitizer removes embedded CRM dataset and client-side passwords', () => {
  const sanitized = sanitizeLegacyHtml(legacyHtml);

  assert.match(sanitized, /"versao":"SANITIZED"/);
  assert.equal(sanitized.includes("pass:'00000000'"), false);
  assert.equal(/"TELEFONES"\s*:/.test(sanitized), false);
  assert.equal(/"EMAILS"\s*:/.test(sanitized), false);
  assert.equal(sanitized.includes(JSON.stringify(SANITIZED_DATASET)), true);
});

test('sanitized shell remains compatible with server runtime hardening', () => {
  const sanitized = sanitizeLegacyHtml(legacyHtml);
  const runtime = transformRuntimeHtml(sanitized);

  assert.match(runtime, /\/api\/auth\/login/);
  assert.match(runtime, /\/api\/auth\/session/);
  assert.equal(runtime.includes("pass:'00000000'"), false);
});

test('sanitizer fails closed when the expected dataset block is missing', () => {
  assert.throws(
    () => sanitizeLegacyHtml('<html><body>unexpected</body></html>'),
    /embedded CRM dataset block not found/
  );
});
