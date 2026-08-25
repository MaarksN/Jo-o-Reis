const DATA_BLOCK_PATTERN = /<script\s+type=["']application\/json["']\s+id=["']data["']>[\s\S]*?<\/script>/i;
const USERS_DECLARATION_PATTERN = /const USERS=\[([\s\S]*?)\];/;
const PASSWORD_PROPERTY_PATTERN = /pass:'[^']*',/g;

export const SANITIZED_DATASET = Object.freeze({
  meta: {
    versao: 'SANITIZED',
    fonte: 'runtime-authenticated',
    observacao: 'Dados operacionais devem ser carregados de fonte privada autenticada.'
  },
  resumo: {},
  seguranca: {},
  zero_rules: [],
  decisoes: [],
  pendencias: []
});

export function sanitizeLegacyHtml(html) {
  let output = String(html || '');

  if (!DATA_BLOCK_PATTERN.test(output)) {
    throw new Error('Sanitization failed: embedded CRM dataset block not found');
  }

  const sanitizedDataBlock = `<script type="application/json" id="data">${JSON.stringify(SANITIZED_DATASET)}</script>`;
  output = output.replace(DATA_BLOCK_PATTERN, sanitizedDataBlock);

  if (!USERS_DECLARATION_PATTERN.test(output)) {
    throw new Error('Sanitization failed: USERS declaration not found');
  }

  output = output.replace(USERS_DECLARATION_PATTERN, (full, body) => {
    const sanitizedBody = body.replace(PASSWORD_PROPERTY_PATTERN, '');
    return `const USERS=[${sanitizedBody}];`;
  });

  if (/"TELEFONES"\s*:/.test(output) || /"EMAILS"\s*:/.test(output)) {
    throw new Error('Sanitization failed: CRM contact fields remained in output');
  }
  if (/const USERS=\[[^\n]*pass:/.test(output)) {
    throw new Error('Sanitization failed: client-side password remained in USERS declaration');
  }

  return output;
}
