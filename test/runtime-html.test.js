import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformRuntimeHtml } from '../lib/runtime-html.js';

const legacyHtml = readFileSync(
  new URL('../Mesa_Tratamento_Joao_Bitrix_Pomodoro_AtlasGR_v1_0.html', import.meta.url),
  'utf8'
);

test('runtime HTML removes hardcoded passwords and switches to server auth', () => {
  const secureHtml = transformRuntimeHtml(legacyHtml);

  assert.equal(secureHtml.includes("pass:'00000000'"), false);
  assert.equal(secureHtml.includes("x.pass===pass"), false);
  assert.match(secureHtml, /\/api\/auth\/login/);
  assert.match(secureHtml, /\/api\/auth\/session/);
  assert.match(secureHtml, /credentials:'same-origin'/);
});

test('runtime transform fails closed if the legacy signature drifts', () => {
  assert.throws(
    () => transformRuntimeHtml('<html><body>unexpected build</body></html>'),
    /Secure HTML transform failed/
  );
});
