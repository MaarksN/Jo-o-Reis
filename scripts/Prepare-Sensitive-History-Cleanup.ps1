param(
  [switch]$ExecuteLocalRewrite,
  [string]$Repository = 'maarkss1/Jo-o-Reis',
  [string]$Target = 'Mesa_Tratamento_Joao_Bitrix_Pomodoro_AtlasGR_v1_0.html'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando obrigatório não encontrado: $Name"
  }
}

Require-Command git
Require-Command gh
Require-Command node

$repoRoot = (git rev-parse --show-toplevel).Trim()
if (-not $repoRoot) { throw 'Execute este script dentro do clone Git do repositório.' }
Set-Location $repoRoot

$visibility = (gh repo view $Repository --json visibility -q '.visibility').Trim().ToUpperInvariant()
if ($visibility -ne 'PRIVATE') {
  throw "ABORTADO: $Repository está com visibilidade '$visibility'. Torne o repositório PRIVATE antes de qualquer reescrita de histórico."
}

$status = git status --porcelain
if ($status) {
  throw 'ABORTADO: a árvore de trabalho possui alterações. Faça commit/stash e tente novamente.'
}

$filterRepoAvailable = $false
try {
  git filter-repo --help *> $null
  $filterRepoAvailable = $true
} catch {}
if (-not $filterRepoAvailable) {
  throw 'git-filter-repo não está disponível. Instale-o antes de continuar.'
}

$targetPath = Join-Path $repoRoot $Target
if (-not (Test-Path $targetPath)) {
  throw "Arquivo alvo não encontrado: $Target"
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$parent = Split-Path $repoRoot -Parent
$backup = Join-Path $parent "Jo-o-Reis-sensitive-backup-$timestamp.bundle"
$tempSanitized = Join-Path ([System.IO.Path]::GetTempPath()) "Jo-o-Reis-sanitized-$timestamp.html"
$originUrl = (git remote get-url origin).Trim()

node scripts/sanitize-legacy-html.mjs $Target $tempSanitized
if (-not (Test-Path $tempSanitized)) { throw 'Falha ao criar a cópia sanitizada temporária.' }

Write-Host ''
Write-Host 'Pré-condições aprovadas:' -ForegroundColor Green
Write-Host "  Repositório: $Repository ($visibility)"
Write-Host "  Arquivo a remover de todo o histórico: $Target"
Write-Host "  Backup offline planejado: $backup"
Write-Host "  Cópia sanitizada temporária: $tempSanitized"
Write-Host ''

if (-not $ExecuteLocalRewrite) {
  Write-Host 'DRY RUN concluído. Nenhum histórico foi alterado.' -ForegroundColor Yellow
  Write-Host 'Para executar SOMENTE a reescrita local, rode:'
  Write-Host '  .\scripts\Prepare-Sensitive-History-Cleanup.ps1 -ExecuteLocalRewrite'
  exit 0
}

Write-Host 'Criando backup Git bundle com todos os refs...' -ForegroundColor Yellow
git bundle create $backup --all
if (-not (Test-Path $backup)) { throw 'O backup Git bundle não foi criado.' }

Write-Host 'Reescrevendo o clone local para remover o arquivo sensível de todo o histórico...' -ForegroundColor Yellow
git filter-repo --sensitive-data-removal --invert-paths --path $Target --force

Copy-Item -LiteralPath $tempSanitized -Destination $targetPath -Force
git add -- $Target
git commit -m 'security: restore sanitized application shell'

Write-Host ''
Write-Host 'REESCRITA LOCAL CONCLUÍDA. NENHUM PUSH FOI EXECUTADO.' -ForegroundColor Green
Write-Host "Backup sensível: $backup"
Write-Host "Remote anterior: $originUrl"
Write-Host ''
Write-Host 'Revise o histórico e o arquivo sanitizado. Somente depois, execute manualmente os passos do runbook em docs/security/history-remediation.md.'
Write-Host 'O git-filter-repo pode remover o remote origin de propósito. Não o restaure até concluir a revisão.'
