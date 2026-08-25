# Segurança — modo servidor

A Mesa SDR deve ser operada pelo servidor Node. O GitHub Pages não fornece autenticação server-side e não deve ser usado para operar dados reais.

## Configuração obrigatória de autenticação

Defina no ambiente do servidor, nunca no repositório:

- `APP_SESSION_SECRET`: segredo aleatório com pelo menos 32 caracteres.
- `APP_JOAO_PASSWORD`: senha do perfil operacional, com pelo menos 12 caracteres.
- `APP_SUPERVISOR_PASSWORD`: senha do perfil supervisor, com pelo menos 12 caracteres.

O servidor falha fechado para login quando essa configuração está incompleta.

## Bitrix24

Preferencialmente defina `BITRIX24_WEBHOOK_URL` somente no ambiente do servidor. O navegador usa `/api/bitrix-proxy` no mesmo domínio e não precisa receber o token do webhook.

Opções adicionais:

- `BITRIX24_ALLOWED_HOSTS`: hosts permitidos, separados por vírgula. O portal AtlasGR já é permitido por padrão.
- `BITRIX_PROXY_TIMEOUT_MS`: timeout do proxy; padrão de 12000 ms, limitado entre 1000 e 30000 ms.

O proxy exige sessão válida, valida host/método e aplica uma allowlist das operações usadas pela aplicação. Mudança de responsável de Lead exige perfil `ADM_SUPERVISOR`.

## GitHub Pages e artefato legado

O `index.html` está neutralizado para não redirecionar usuários ao modo estático legado. Entretanto, o arquivo monolítico histórico ainda existe no repositório e contém snapshot operacional. Enquanto ele permanecer versionado em repositório público, trate `ITEM-0008` como bloqueio de segurança.

A correção completa exige uma decisão sobre onde o dataset real ficará armazenado e como o histórico Git já publicado será tratado.
