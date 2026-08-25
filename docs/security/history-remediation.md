# Remediação de dados sensíveis no histórico Git

## Estado

Este runbook prepara a remoção do arquivo abaixo de **todo o histórico Git**, preservando o restante do histórico e restaurando somente uma versão sanitizada do shell da aplicação:

`Mesa_Tratamento_Joao_Bitrix_Pomodoro_AtlasGR_v1_0.html`

O arquivo contém um snapshot operacional de CRM embutido no HTML. A estratégia escolhida é remover o arquivo inteiro de todos os refs históricos e restaurar apenas a versão atual sanitizada. Isso é mais seguro do que tentar substituir milhares de valores individuais.

## Regra de segurança

**Não reescreva nem force-push o histórico enquanto o repositório estiver PUBLIC.**

O script `scripts/Prepare-Sensitive-History-Cleanup.ps1` consulta a visibilidade via GitHub CLI e aborta automaticamente se o resultado não for `PRIVATE`.

O script também **nunca executa push**. Mesmo com `-ExecuteLocalRewrite`, ele altera somente o clone local depois de criar um Git bundle de backup.

---

## 1. Tornar o repositório privado primeiro

A conexão GitHub usada pelo agente não possui a ação de alterar visibilidade. Faça este passo na interface do GitHub:

1. Abra `maarkss1/Jo-o-Reis`.
2. Entre em **Settings**.
3. Na seção **Danger Zone**, localize **Change repository visibility**.
4. Clique em **Change visibility**.
5. Selecione **Private**.
6. Confirme o repositório e os efeitos apresentados pelo GitHub.
7. Conclua em **Make this repository private**.

### Atenção a forks públicos

Ao converter um repositório público em privado, forks públicos existentes não se tornam privados automaticamente. O GitHub os separa da rede original. Se houver forks contendo o snapshot, eles precisam ser tratados separadamente com os respectivos proprietários.

---

## 2. Pré-requisitos locais

Use um clone dedicado exclusivamente à remediação. Não faça a reescrita no clone diário de desenvolvimento.

Necessário:

- Git;
- GitHub CLI (`gh`) autenticado como administrador do repositório;
- Node.js;
- `git-filter-repo` recente com suporte a `--sensitive-data-removal` (GitHub recomenda versão 2.47 ou superior).

Antes de continuar, confirme:

```powershell
gh repo view maarkss1/Jo-o-Reis --json visibility -q '.visibility'
git filter-repo --version
```

O primeiro comando precisa retornar:

```text
PRIVATE
```

---

## 3. Dry run obrigatório

Dentro do clone dedicado:

```powershell
.\scripts\Prepare-Sensitive-History-Cleanup.ps1
```

O dry run:

- verifica a visibilidade do GitHub;
- verifica se o working tree está limpo;
- verifica Git, `gh`, Node e `git-filter-repo`;
- gera uma cópia sanitizada temporária do HTML;
- informa o arquivo-alvo e o local planejado para backup;
- **não altera o histórico**.

Se qualquer proteção falhar, o processo é abortado.

---

## 4. Reescrita somente local

Depois de revisar o dry run:

```powershell
.\scripts\Prepare-Sensitive-History-Cleanup.ps1 -ExecuteLocalRewrite
```

A execução local realiza, nesta ordem:

1. cria um Git bundle contendo todos os refs atuais;
2. gera em diretório temporário uma cópia sanitizada do HTML atual;
3. executa `git filter-repo --sensitive-data-removal --invert-paths` para retirar o arquivo sensível de todos os refs;
4. restaura somente a cópia sanitizada atual;
5. cria um commit local `security: restore sanitized application shell`;
6. encerra **sem executar push**.

O Git bundle contém o histórico antigo e, portanto, também contém os dados que estamos removendo. Trate esse backup como confidencial: mantenha-o offline/protegido e destrua-o após o encerramento da remediação.

---

## 5. Validações obrigatórias antes do push

### Validar o shell restaurado

```powershell
npm install --ignore-scripts --no-audit --no-fund
npm run check
```

### Confirmar que a versão restaurada está sanitizada

```powershell
node scripts/sanitize-legacy-html.mjs `
  Mesa_Tratamento_Joao_Bitrix_Pomodoro_AtlasGR_v1_0.html `
  "$env:TEMP\atlasgr-verificacao.html"
```

O comando deve concluir sem acusar campos de contato ou senha no bloco restaurado.

### Revisar refs alterados

O `git-filter-repo` grava um relatório em:

```text
.git/filter-repo/changed-refs
```

Liste PR refs afetados, quando disponível:

```powershell
Select-String -Path .git/filter-repo/changed-refs -Pattern '^refs/pull/.*/head$'
```

Os PRs abertos antes da reescrita podem ficar apontando para commits antigos e precisarão ser recriados depois.

### Registrar First Changed Commit(s)

Guarde a saída do `git-filter-repo`, especialmente:

- `First Changed Commit(s)`;
- quantidade/lista de PR refs afetados;
- eventual aviso sobre objetos LFS órfãos.

Essas informações são importantes caso seja necessário solicitar limpeza de caches e referências ao GitHub Support.

---

## 6. Push destrutivo: somente após revisão manual

O agente e o script **não executam esta etapa automaticamente**.

O `git-filter-repo` normalmente remove o remote `origin` para evitar push acidental. Depois de validar o clone reescrito, restaure explicitamente o remote correto e só então atualize o GitHub.

A orientação atual do GitHub para uma limpeza completa usa mirror/force push para atualizar branches, tags e refs graváveis. Essa etapa descarta os SHAs antigos e deve ser executada apenas quando não houver trabalho concorrente.

Antes do push:

- suspenda commits/pushes de colaboradores;
- confirme que ninguém fará merge a partir de clones antigos;
- tenha o Git bundle protegido disponível para recuperação;
- registre quais PRs serão afetados;
- confirme novamente que o repositório está privado.

Depois dessas verificações, os comandos de atualização remota devem ser executados manualmente conforme a orientação oficial do GitHub para remoção de dados sensíveis.

---

## 7. GitHub ainda pode possuir referências antigas

Reescrever e force-pushar branches/tags não garante sozinho o desaparecimento imediato de todos os objetos antigos. O GitHub alerta que dados podem continuar acessíveis por:

- forks;
- clones existentes;
- SHA antigo conhecido;
- views em cache;
- refs de Pull Requests, que são somente leitura e não podem ser sobrescritos por mirror push.

Após atualizar o repositório, avalie abrir um chamado no **GitHub Support** informando:

- proprietário e repositório;
- quantidade de PRs afetados;
- `First Changed Commit(s)` informado pelo `git-filter-repo`;
- informação sobre LFS órfão, se houver.

O objetivo é solicitar desreferenciamento/limpeza de PR refs e caches quando o caso for aceito como remoção de dados sensíveis.

---

## 8. Clones antigos

Depois da reescrita:

- colaboradores devem preferencialmente fazer um clone novo;
- não faça merge de uma branch baseada no histórico antigo;
- branches que precisarem ser preservadas devem ser rebased/cherry-picked sobre o novo histórico, nunca mergeadas do clone contaminado;
- um merge proveniente do histórico antigo pode reintroduzir os objetos removidos.

---

## 9. Prevenção de recorrência

Depois da limpeza completa:

- o HTML versionado deve permanecer somente como shell sem dados de CRM;
- dados operacionais devem vir de fonte privada/autenticada em runtime;
- o CI deve manter o teste `test/sanitize-legacy-html.test.js`;
- nenhuma exportação de CRM deve ser commitada no repositório de aplicação;
- arquivos de backup/exportação devem permanecer fora do Git e de pastas sincronizadas publicamente.

## Resultado esperado

Ao final da remediação, o código atual é preservado, o shell HTML continua compatível com a autenticação server-side, o snapshot do CRM deixa de existir nos refs normais do repositório e os refs/caches históricos residuais são tratados separadamente.
