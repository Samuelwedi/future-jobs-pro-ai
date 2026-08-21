param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$PackageRoot = $PSScriptRoot
$Source = Join-Path $PackageRoot "future-jobs-update"

if (-not (Test-Path (Join-Path $ProjectRoot ".git"))) {
    throw "ProjectRoot must be the Future Jobs Pro AI Git repository."
}

Set-Location $ProjectRoot
$dirtyTracked = git status --short | Where-Object { $_ -notmatch '^\?\?' }
if ($dirtyTracked) {
    throw "Tracked changes exist. Commit or stash them before applying this update."
}

$backup = "backup-before-self-hosted-lucy-$(Get-Date -Format yyyyMMdd-HHmmss)"
git branch $backup

$files = @(
    "backend/src/routes/voiceRoutes.ts",
    "backend/src/services/voiceService.ts",
    "mobile/App.tsx",
    "mobile/src/screens/HomeScreen.tsx",
    "mobile/src/screens/DemoScreen.tsx",
    "mobile/src/screens/AIAssistantScreen.tsx",
    "mobile/src/services/LucyWakeAudio.ts",
    "mobile/src/services/wakeWordService.ts",
    "web/src/pages/AskLucy.tsx",
    "web/src/components/LucyWakeControl.tsx",
    "web/src/services/lucyWakeClient.ts"
)

foreach ($relative in $files) {
    $from = Join-Path $Source $relative
    $to = Join-Path $ProjectRoot $relative
    New-Item (Split-Path $to) -ItemType Directory -Force | Out-Null
    Copy-Item -LiteralPath $from -Destination $to -Force
}

$moduleSource = Join-Path $Source "mobile/modules/lucy-wake-audio"
$moduleTarget = Join-Path $ProjectRoot "mobile/modules/lucy-wake-audio"
New-Item $moduleTarget -ItemType Directory -Force | Out-Null
Copy-Item -Path (Join-Path $moduleSource "*") -Destination $moduleTarget -Recurse -Force

Write-Host "Source copied. Backup branch: $backup" -ForegroundColor Green
Write-Host "Next: deploy lucy-self-hosted, configure URLs, install the mobile module, and run builds."
