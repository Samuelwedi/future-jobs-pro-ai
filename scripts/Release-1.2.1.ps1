[CmdletBinding()]
param(
    [ValidateSet('Validate','Check','Backup','DryRun','Migrate','CatalogPreview','CatalogCreate','DeployWeb','BuildMobile','SubmitAndroid','SubmitIos')]
    [string]$Stage = 'Check',
    [string]$BuildId
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$PreviousNoVcs = [Environment]::GetEnvironmentVariable('EAS_NO_VCS','Process')
$Portable = Join-Path $Root '.runtime\node-v24.21.0-win-x64'
if (-not (Test-Path -LiteralPath (Join-Path $Portable 'node.exe'))) {
    $Portable = Join-Path $env:USERPROFILE 'Projects\FJ-RC3-20260924-202102\Future-Jobs-Pro-AI-1.2.0-rc.3\.runtime\node-v24.21.0-win-x64'
}
if (Test-Path -LiteralPath (Join-Path $Portable 'node.exe')) { $env:PATH = $Portable + ';' + $env:PATH }
$Node = (Get-Command node.exe -ErrorAction Stop).Source
$Npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$Npx = (Get-Command npx.cmd -ErrorAction Stop).Source
function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed (exit $LASTEXITCODE). Resolve the reported problem before continuing." }
}
function Link-Railway {
    Get-Command railway -ErrorAction Stop | Out-Null
    Invoke-Checked 'railway' @('link','--project','93063049-945f-4b00-a4f4-9b3a2729fe05','--environment','production','--service','future-jobs-pro-ai')
}
function Check-Configuration {
    $Raw = @(railway variable list --service future-jobs-pro-ai --environment production --json)
    if ($LASTEXITCODE -ne 0) { throw 'Could not retrieve Railway configuration.' }
    try {
        ($Raw -join "`n") | & $Node (Join-Path $Root 'backend\scripts\release-readiness.cjs') '--stdin'
        if ($LASTEXITCODE -ne 0) { throw 'Production configuration is incomplete. See failed checks above; values were not displayed.' }
    } finally { $Raw = $null }
}
function Invoke-Database([string]$Mode) {
    # Child process receives Postgres credentials; values are neither printed nor written to an env file.
    Invoke-Checked 'railway' @('run','--service','Postgres','--environment','production', $Node, (Join-Path $Root 'backend\scripts\release-database.cjs'), $Mode)
}
Push-Location -LiteralPath $Root
try {
    if ($Stage -eq 'Validate') { & (Join-Path $PSScriptRoot 'Validate-Release.ps1'); return }
    if (-not (Test-Path -LiteralPath (Join-Path $Root 'backend\dist\config\billingPlans.js'))) {
        Push-Location -LiteralPath (Join-Path $Root 'backend')
        try { Invoke-Checked $Npm @('ci','--no-audit','--no-fund'); Invoke-Checked $Npm @('run','build') } finally { Pop-Location }
    }
    if ($Stage -in @('BuildMobile','SubmitAndroid','SubmitIos')) {
        $env:EAS_NO_VCS = '1'
        Push-Location -LiteralPath (Join-Path $Root 'mobile')
        try {
            Invoke-Checked $Npx @('--yes','eas-cli@24.8.0','whoami')
            if ($Stage -eq 'BuildMobile') {
                Invoke-Checked $Node @((Join-Path $Root 'backend\scripts\release-fingerprint.cjs'),'verify')
                Invoke-Checked $Npx @('--yes','eas-cli@24.8.0','build:version:get','--platform','android','--profile','production')
                Invoke-Checked $Npx @('--yes','eas-cli@24.8.0','build:version:get','--platform','ios','--profile','production')
                Invoke-Checked $Npx @('--yes','eas-cli@24.8.0','build','--platform','all','--profile','production')
            } else {
                $Parsed = [guid]::Empty
                if (-not [guid]::TryParse($BuildId,[ref]$Parsed)) { throw 'Pass the exact successful EAS build UUID with -BuildId. Do not submit an unspecified latest build.' }
                $Platform = if ($Stage -eq 'SubmitAndroid') { 'android' } else { 'ios' }
                $Profile = if ($Stage -eq 'SubmitAndroid') { 'closed-test' } else { 'production' }
                Invoke-Checked $Npx @('--yes','eas-cli@24.8.0','submit','--platform',$Platform,'--profile',$Profile,'--id',$BuildId)
            }
        } finally { Pop-Location }
        return
    }
    Link-Railway
    switch ($Stage) {
        'Check' { Check-Configuration }
        'Backup' { Invoke-Database 'backup' }
        'DryRun' { Invoke-Database 'dry-run' }
        'Migrate' { Invoke-Database 'dry-run'; Invoke-Database 'apply' }
        'CatalogPreview' { Invoke-Checked $Node @((Join-Path $Root 'backend\scripts\provision-billing.cjs')) }
        'CatalogCreate' {
            Invoke-Checked 'railway' @('run','--service','future-jobs-pro-ai','--environment','production',$Node,(Join-Path $Root 'backend\scripts\provision-billing.cjs'),'--apply','--live')
            Write-Host 'Apply billing-price-mappings.txt in Railway Variables before Check. Existing subscriptions retain their prices.'
        }
        'DeployWeb' {
            Check-Configuration
            Invoke-Database 'verify'
            Invoke-Checked $Node @((Join-Path $Root 'backend\scripts\release-fingerprint.cjs'),'verify')
            Write-Host 'Railway service must use repository root and its Dockerfile, with no backend-only start/build override.'
            Invoke-Checked 'railway' @('up','--service','future-jobs-pro-ai','--environment','production')
            $Health = Invoke-RestMethod -Uri 'https://future-jobs-pro-ai-production.up.railway.app/api/health' -TimeoutSec 30
            if (($Health | ConvertTo-Json -Depth 10) -notmatch '1\.2\.1') { throw 'Deployment submitted, but live health did not confirm version 1.2.1. Inspect Railway logs.' }
            Write-Host 'Web health reports 1.2.1. Complete the store purchase/device checks in RELEASE-1.2.1.md.'
        }
    }
} finally { Pop-Location; [Environment]::SetEnvironmentVariable('EAS_NO_VCS',$PreviousNoVcs,'Process') }
