[CmdletBinding()]
param(
  [string]$ExistingEnv,
  [switch]$ApplyMigration,
  [switch]$AllowRemoteDatabaseMigration,
  [switch]$IncludeMobile,
  [switch]$IncludeSupportPortal,
  [ValidateRange(1024,65535)][int]$Port = 8181
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ReleaseVersion = '1.2.0-rc.4'

$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
$NpmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $NodeCommand -or -not $NpmCommand) {
  throw 'Install Node.js 22.12+ or Node.js 24, reopen PowerShell, then rerun.'
}
$NodePath = $NodeCommand.Source
$NpmPath = $NpmCommand.Source
$NodeVersion = (& $NodePath --version).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Node.js could not be started.' }
$ParsedNode = [version]($NodeVersion.TrimStart('v'))
if ($ParsedNode -lt [version]'22.12.0') { throw 'This release requires Node.js 22.12+ or Node.js 24.' }

function Invoke-Npm([string]$Folder,[string[]]$Arguments) {
  Push-Location (Join-Path $Root $Folder)
  try {
    & $script:NpmPath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "npm failed in $Folder. Read the error above." }
  }
  finally { Pop-Location }
}

function Get-EnvironmentValue([string]$Path,[string]$Name) {
  $Line = Get-Content -LiteralPath $Path |
    Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
    Select-Object -Last 1
  if (-not $Line) { return $null }
  return (($Line -replace '^\s*[^=]+\s*=\s*','').Trim().Trim('"').Trim("'"))
}

$BackendEnv = Join-Path $Root 'backend\.env'
if ($ExistingEnv) {
  if (-not (Test-Path -LiteralPath $ExistingEnv -PathType Leaf)) { throw "Environment file not found: $ExistingEnv" }
  if (Test-Path -LiteralPath $BackendEnv) { throw 'backend\.env already exists. Keep it or explicitly remove it before copying a different configuration.' }
  Copy-Item -LiteralPath $ExistingEnv -Destination $BackendEnv
}
if (-not (Test-Path -LiteralPath $BackendEnv)) {
  Copy-Item -LiteralPath (Join-Path $Root 'backend\.env.example') -Destination $BackendEnv
  throw 'Created backend\.env from the example. Configure an existing compatible staging database and JWT secret, then rerun. This upgrade package does not create the original application database.'
}

if ($ApplyMigration) {
  $DatabaseUrl = Get-EnvironmentValue $BackendEnv 'DATABASE_URL'
  $DatabaseHost = Get-EnvironmentValue $BackendEnv 'DB_HOST'
  if ($DatabaseUrl) {
    try { $DatabaseHost = ([Uri]$DatabaseUrl).Host }
    catch { throw 'DATABASE_URL in backend\.env is not a valid URL.' }
  }
  $LocalHosts = @('localhost','127.0.0.1','::1','host.docker.internal','postgres')
  $IsRemote = $DatabaseHost -and $LocalHosts -notcontains $DatabaseHost.ToLowerInvariant()
  if ($IsRemote -and -not $AllowRemoteDatabaseMigration) {
    throw "Safety stop: migration target '$DatabaseHost' is remote. Test locally first. A reviewed production change requires -AllowRemoteDatabaseMigration and a verified backup."
  }
}

Write-Host 'Installing locked backend and web dependencies...'
Invoke-Npm 'backend' @('ci','--no-audit','--no-fund')
Invoke-Npm 'web' @('ci','--no-audit','--no-fund')
if ($IncludeMobile) {
  Invoke-Npm 'mobile' @('ci','--no-audit','--no-fund')
  Invoke-Npm 'mobile' @('exec','--','tsc','--noEmit')
}
if ($IncludeSupportPortal) {
  Invoke-Npm 'webdash' @('ci','--no-audit','--no-fund')
  Invoke-Npm 'webdash' @('run','build')
}

Push-Location (Join-Path $Root 'backend')
try {
  if ($ApplyMigration) { & $NodePath scripts/command-release-db.cjs --apply }
  else { & $NodePath scripts/command-release-db.cjs }
  if ($LASTEXITCODE -ne 0) { throw 'Database validation failed. See the installation guide. No app was launched.' }
}
finally { Pop-Location }

# Local preview must send requests to this release, not the live Railway backend.
$env:VITE_API_URL = "http://localhost:$Port"
$env:VITE_API_BASE = $env:VITE_API_URL
Invoke-Npm 'backend' @('run','build')
Invoke-Npm 'backend' @('run','test:release')
Invoke-Npm 'web' @('run','build')

@{
  port = $Port
  version = $ReleaseVersion
  nodePath = $NodePath
  installedAt = (Get-Date).ToUniversalTime().ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Root 'local-launch.json') -Encoding UTF8

Write-Host 'Locked installs, migrations, backend tests, and production builds passed.'
& (Join-Path $PSScriptRoot 'Start-App.ps1')
