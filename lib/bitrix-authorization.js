const ALLOWED_METHODS = new Set([
  'crm.status.list',
  'crm.category.list',
  'crm.deal.fields',
  'crm.lead.fields',
  'crm.item.get',
  'crm.item.list',
  'crm.item.update',
  'crm.activity.list',
  'crm.activity.add',
  'crm.timeline.comment.add',
  'crm.company.get',
  'crm.contact.list',
  'crm.deal.add',
  'user.get'
]);

export class BitrixAuthorizationError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.name = 'BitrixAuthorizationError';
    this.status = status;
  }
}

function normalizedFieldKeys(fields = {}) {
  return new Set(Object.keys(fields || {}).map((key) => key.toLowerCase()));
}

export function authorizeBitrixRequest(user, method, params = {}) {
  if (!user?.email || !user?.role) {
    throw new BitrixAuthorizationError('Authentication required', 401);
  }

  if (!ALLOWED_METHODS.has(method)) {
    throw new BitrixAuthorizationError(`Bitrix24 method is not allowed: ${method}`);
  }

  if (method.startsWith('crm.item.')) {
    const entityTypeId = Number(params?.entityTypeId);
    if (entityTypeId !== 1) {
      throw new BitrixAuthorizationError('Only Lead entity operations are allowed through crm.item.*');
    }
  }

  if (method === 'crm.item.update' && user.role !== 'ADM_SUPERVISOR') {
    const fields = normalizedFieldKeys(params?.fields);
    if (fields.has('assignedbyid') || fields.has('assigned_by_id')) {
      throw new BitrixAuthorizationError('Only a supervisor can change lead ownership');
    }
  }

  return true;
}

export function listAllowedBitrixMethods() {
  return [...ALLOWED_METHODS].sort();
}
