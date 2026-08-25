import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeBitrixRequest } from '../lib/bitrix-authorization.js';

const user = { email: 'joao.reis@atlasgr.com.br', role: 'USUARIO' };
const supervisor = { email: 'marcelo.nascimento@atlasgr.com.br', role: 'ADM_SUPERVISOR' };

test('allows methods used by the SDR application', () => {
  assert.equal(authorizeBitrixRequest(user, 'crm.status.list', { filter: {} }), true);
  assert.equal(
    authorizeBitrixRequest(user, 'crm.item.get', { entityTypeId: 1, id: 123 }),
    true
  );
  assert.equal(authorizeBitrixRequest(user, 'crm.activity.add', { fields: {} }), true);
});

test('blocks arbitrary or destructive Bitrix methods', () => {
  assert.throws(
    () => authorizeBitrixRequest(user, 'crm.item.delete', { entityTypeId: 1, id: 123 }),
    /method is not allowed/
  );
  assert.throws(
    () => authorizeBitrixRequest(user, 'user.update', { ID: 1 }),
    /method is not allowed/
  );
});

test('restricts generic crm.item API to Lead entity type', () => {
  assert.throws(
    () => authorizeBitrixRequest(user, 'crm.item.get', { entityTypeId: 2, id: 123 }),
    /Only Lead entity operations/
  );
});

test('normal user cannot reassign lead ownership', () => {
  assert.throws(
    () => authorizeBitrixRequest(user, 'crm.item.update', {
      entityTypeId: 1,
      id: 123,
      fields: { assignedById: 450 }
    }),
    /Only a supervisor/
  );
});

test('supervisor can reassign lead ownership', () => {
  assert.equal(
    authorizeBitrixRequest(supervisor, 'crm.item.update', {
      entityTypeId: 1,
      id: 123,
      fields: { assignedById: 450 }
    }),
    true
  );
});
