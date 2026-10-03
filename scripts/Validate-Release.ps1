$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Portable = Join-Path $Root '.runtime\node-v24.21.0-win-x64'
if (Test-Path -LiteralPath (Join-Path $Portable 'node.exe')) {
    $env:PATH = $Portable + ';' + $env:PATH
}
$Npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$Node = (Get-Command node.exe -ErrorAction Stop).Source
$Tracked = @('DATABASE_URL','DB_HOST','DB_PORT','DB_SSL','REDIS_URL','REDIS_HOST','REDIS_PORT','OPERATIONS_REPORT_WORKER','LUCY_RELIABILITY_MONITOR','PAYOUT_LOCAL_SANDBOX','NODE_ENV')
$Previous = @{}
foreach ($Name in $Tracked) { $Previous[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process') }
function Run-Npm([string]$Component, [string[]]$Arguments) {
    Push-Location -LiteralPath (Join-Path $Root $Component)
    try {
        & $Npm @Arguments
        if ($LASTEXITCODE -ne 0) { throw "$Component command failed: npm $($Arguments -join ' ')" }
    } finally { Pop-Location }
}
try {
    $env:DATABASE_URL = 'postgresql://release_test:unused@127.0.0.1:1/release_test'
    $env:DB_HOST = '127.0.0.1'; $env:DB_PORT = '1'; $env:DB_SSL = 'false'
    $env:REDIS_URL = 'redis://127.0.0.1:1'; $env:REDIS_HOST = '127.0.0.1'; $env:REDIS_PORT = '1'
    $env:OPERATIONS_REPORT_WORKER = 'false'; $env:LUCY_RELIABILITY_MONITOR = 'false'
    $env:PAYOUT_LOCAL_SANDBOX = ''; $env:NODE_ENV = 'test'
    foreach ($Component in @('backend','web','mobile')) {
        Run-Npm $Component @('ci','--no-audit','--no-fund')
        if ($Component -eq 'mobile') {
            Push-Location -LiteralPath (Join-Path $Root 'mobile')
            try {
                $AuditJson = (& $Npm 'audit' '--omit=dev' '--json') -join "`n"
                $AuditJson | & $Node 'scripts/auditPatchedDependencies.cjs'
                if ($LASTEXITCODE -ne 0) { throw 'Mobile dependency audit differs from the reviewed, patched advisory.' }
                & $Node '--test' 'tests/node-forge-patch.test.cjs'
                if ($LASTEXITCODE -ne 0) { throw 'Mobile certificate-verification regression failed.' }
            } finally { Pop-Location }
        } else {
            Run-Npm $Component @('audit','--omit=dev','--audit-level=low')
        }
    }
    Run-Npm 'backend' @('run','test:release')
    Run-Npm 'web' @('run','build')
    Push-Location -LiteralPath (Join-Path $Root 'mobile')
    try {
        & $Node 'node_modules\typescript\bin\tsc' '--noEmit'
        if ($LASTEXITCODE -ne 0) { throw 'Mobile TypeScript validation failed.' }
        foreach ($Platform in @('android','ios')) {
            & $Node 'node_modules\expo\bin\cli' 'export' '--platform' $Platform '--output-dir' (Join-Path $Root ('release-output\' + $Platform))
            if ($LASTEXITCODE -ne 0) { throw "$Platform JavaScript bundle validation failed." }
        }
    } finally { Pop-Location }
    & $Node (Join-Path $Root 'backend\scripts\release-fingerprint.cjs') 'record'
    if ($LASTEXITCODE -ne 0) { throw 'Could not record validated source fingerprint.' }
    Write-Host 'Release validation passed. This command did not deploy or modify a store catalog.'
} finally {
    foreach ($Name in $Tracked) { [Environment]::SetEnvironmentVariable($Name, $Previous[$Name], 'Process') }
}
