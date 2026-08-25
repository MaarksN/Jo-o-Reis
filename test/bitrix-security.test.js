import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBitrixTargetUrl,
  normalizeBitrixWebhook,
  validateBitrixMethod
} from '../lib/bitrix-security.js';

const hosts = new Set(['atlasgr.bitrix24.com.br']);

test('normalizes the AtlasGR Bitrix webhook', () => {
  assert.equal(
    normalizeBitrixWebhook('https://atlasgr.bitrix24.com.br/rest/392/abcdefgh1234/', hosts),
    'https://atlasgr.bitrix24.com.br/rest/392/abcdefgh1234'
  );
});

test('accepts a copied Bitrix method endpoint and strips the method suffix', () => {
  assert.equal(
    normalizeBitrixWebhook('https://atlasgr.bitrix24.com.br/rest/392/abcdefgh1234/crm.item.get.json', hosts),
    'https://atlasgr.bitrix24.com.br/rest/392/abcdefgh1234'
  );
});

test('rejects non-HTTPS webhook URLs', () => {
  assert.throws(
    () => normalizeBitrixWebhook('http://atlasgr.bitrix24.com.br/rest/392/abcdefgh1234', hosts),
    /must use HTTPS/
  );
});

test('rejects arbitrary hosts to prevent SSRF', () => {
  assert.throws(
    () => normalizeBitrixWebhook('https://127.0.0.1/rest/392/abcdefgh1234', hosts),
    /host is not allowed/
  );
  assert.throws(
    () => normalizeBitrixWebhook('https://169.254.169.254/rest/392/abcdefgh1234', hosts),
    /host is not allowed/
  );
});

test('rejects custom ports and embedded URL credentials', () => {
  assert.throws(
    () => normalizeBitrixWebhook('https://atlasgr.bitrix24.com.br:8443/rest/392/abcdefgh1234', hosts),
    /custom port/
  );
  assert.throws(
    () => normalizeBitrixWebhook('https://user:pass@atlasgr.bitrix24.com.br/rest/392/abcdefgh1234', hosts),
    /credentials/
  );
});

test('rejects methods containing slash or path traversal', () => {
  assert.throws(() => validateBitrixMethod('../admin'), /Invalid Bitrix24 method/);
  assert.throws(() => validateBitrixMethod('crm/item/get'), /Invalid Bitrix24 method/);
});

test('builds a safe Bitrix endpoint', () => {
  assert.equal(
    buildBitrixTargetUrl(
      'https://atlasgr.bitrix24.com.br/rest/392/abcdefgh1234',
      'crm.item.get',
      hosts
    ),
    'https://atlasgr.bitrix24.com.br/rest/392/abcdefgh1234/crm.item.get.json'
  );
});
