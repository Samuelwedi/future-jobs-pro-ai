$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ConfigFile = Join-Path $Root 'local-launch.json'
$RuntimeDirectory = Join-Path $Root 'local-runtime'
$StateFile = Join-Path $RuntimeDirectory 'backend-process.json'

if (-not (Test-Path -LiteralPath $ConfigFile -PathType Leaf)) { throw 'Run scripts\Install-App.ps1 first.' }
$Config = Get-Content -LiteralPath $ConfigFile -Raw | ConvertFrom-Json
$Port = [int]$Config.port
$Version = [string]$Config.version
$NodePath = [string]$Config.nodePath
if (-not $NodePath -or -not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
  $NodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $NodeCommand) { throw 'The Node.js runtime recorded during installation is unavailable.' }
  $NodePath = $NodeCommand.Source
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  throw "Port $Port is already in use. Stop the known app or reinstall with another -Port."
}

New-Item -ItemType Directory -Path $RuntimeDirectory -Force | Out-Null
$Backend = Join-Path $Root 'backend'
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$StandardOutput = Join-Path $RuntimeDirectory "backend-$Timestamp.stdout.log"
$StandardError = Join-Path $RuntimeDirectory "backend-$Timestamp.stderr.log"

$PreviousEnvironment = @{
  PORT = [Environment]::GetEnvironmentVariable('PORT','Process')
  HOST = [Environment]::GetEnvironmentVariable('HOST','Process')
  APP_VERSION = [Environment]::GetEnvironmentVariable('APP_VERSION','Process')
  FRONTEND_URL = [Environment]::GetEnvironmentVariable('FRONTEND_URL','Process')
  CORS_ORIGINS = [Environment]::GetEnvironmentVariable('CORS_ORIGINS','Process')
}

try {
  $env:PORT = [string]$Port
  $env:HOST = '127.0.0.1'
  $env:APP_VERSION = $Version
  $env:FRONTEND_URL = "http://localhost:$Port"
  $env:CORS_ORIGINS = "http://localhost:$Port"
  $Process = Start-Process `
    -FilePath $NodePath `
    -ArgumentList 'dist/index.js' `
    -WorkingDirectory $Backend `
    -RedirectStandardOutput $StandardOutput `
    -RedirectStandardError $StandardError `
    -WindowStyle Hidden `
    -PassThru
}
finally {
  foreach ($Name in $PreviousEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($Name,$PreviousEnvironment[$Name],'Process')
  }
}

$Ready = $false
for ($Attempt=0; $Attempt -lt 45; $Attempt++) {
  if ($Process.HasExited) { break }
  try {
    $Health = Invoke-RestMethod -Uri "http://localhost:$Port/api/health" -TimeoutSec 2
    if ($Health.status -eq 'healthy' -and $Health.version -eq $Version) { $Ready=$true; break }
  }
  catch {}
  Start-Sleep -Seconds 1
}
if (-not $Ready) {
  if (-not $Process.HasExited) { Stop-Process -Id $Process.Id -ErrorAction SilentlyContinue }
  throw "The backend did not become healthy. Inspect '$StandardError' and '$StandardOutput'."
}

@{
  processId = $Process.Id
  port = $Port
  version = $Version
  nodePath = $NodePath
  startedAt = (Get-Date).ToUniversalTime().ToString('o')
  standardOutput = $StandardOutput
  standardError = $StandardError
} | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding UTF8

Start-Process "http://localhost:$Port/login"
[pscustomobject]@{
  Result = 'LOCAL BACKEND READY'
  ProcessId = $Process.Id
  Port = $Port
  Version = $Version
  Health = $Health.status
  StandardOutput = $StandardOutput
  StandardError = $StandardError
  StopCommand = '.\scripts\Stop-App.ps1'
}
