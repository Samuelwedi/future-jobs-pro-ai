$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$StateFile = Join-Path $Root 'local-runtime\backend-process.json'
if (-not (Test-Path -LiteralPath $StateFile -PathType Leaf)) {
  throw 'No RC3 backend process state was found.'
}

$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
$ProcessId = [int]$State.processId
$Port = [int]$State.port
$ExpectedNode = [string]$State.nodePath
$Process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue

if ($Process) {
  $ActualPath = $null
  try { $ActualPath = $Process.Path } catch {}
  if ($ActualPath -and $ExpectedNode -and -not [string]::Equals($ActualPath,$ExpectedNode,[StringComparison]::OrdinalIgnoreCase)) {
    throw "Safety stop: PID $ProcessId is no longer the recorded Node.js process."
  }
  Stop-Process -Id $ProcessId
  Wait-Process -Id $ProcessId -Timeout 15 -ErrorAction SilentlyContinue
}

for ($Attempt=0; $Attempt -lt 20; $Attempt++) {
  if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 250
}
$PortAvailable = -not [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if (-not $PortAvailable) { throw "The recorded process stopped, but port $Port is still in use by another process." }

Remove-Item -LiteralPath $StateFile -Force
[pscustomobject]@{
  Result = 'RC3 BACKEND STOPPED SAFELY'
  ProcessId = $ProcessId
  Port = $Port
  PortAvailable = $PortAvailable
  DatabaseChanged = $false
}
