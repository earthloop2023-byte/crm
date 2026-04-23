param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$KeyPath = "C:\Users\induk\Desktop\pemkey\crm-key.pem",
  [string]$RemoteHost = "ubuntu@54.180.39.208",
  [string]$RemoteAppDir = "/opt/crm/site1",
  [string]$ReleaseId = "",
  [string]$DeployedBy = $env:USERNAME,
  [string]$Notes = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$stateFile = Join-Path (Join-Path $PSScriptRoot ".state") "live-release-base.json"
if (-not (Test-Path $stateFile)) {
  throw "Missing local release base file. Run deploy\\live-sync-release.ps1 first."
}

$baseState = Get-Content $stateFile -Raw | ConvertFrom-Json
$baseReleaseId = [string]$baseState.releaseId
if (-not $baseReleaseId) {
  throw "Local release base file does not contain releaseId."
}

if (-not $ReleaseId) {
  $ReleaseId = Get-Date -Format "yyyyMMdd-HHmmss"
}

$archiveName = "dist-$ReleaseId.tgz"
$archivePath = Join-Path $ProjectRoot $archiveName
$remoteArchive = "/tmp/$archiveName"
$remoteScript = "$RemoteAppDir/deploy/guarded-live-deploy.sh"
$localScript = Join-Path $PSScriptRoot "guarded-live-deploy.sh"

if (-not (Test-Path $localScript)) {
  throw "Missing local deploy script: $localScript"
}

Push-Location $ProjectRoot
try {
  if (-not $SkipBuild) {
    npm run build
  }

  if (Test-Path $archivePath) {
    Remove-Item $archivePath -Force
  }

  tar -czf $archivePath -C $ProjectRoot dist

  scp -i $KeyPath $localScript "${RemoteHost}:/tmp/guarded-live-deploy.sh" | Out-Null
  scp -i $KeyPath $archivePath "${RemoteHost}:$remoteArchive" | Out-Null

  $remoteCommand = @"
set -e
mkdir -p '$RemoteAppDir/deploy'
install -m 755 /tmp/guarded-live-deploy.sh '$remoteScript'
bash '$remoteScript' '$ReleaseId' '$baseReleaseId' '$remoteArchive' '$DeployedBy' '$Notes'
"@

  ssh -i $KeyPath $RemoteHost $remoteCommand | Out-Null
}
finally {
  Pop-Location
}

& (Join-Path $PSScriptRoot "live-sync-release.ps1") -KeyPath $KeyPath -RemoteHost $RemoteHost | Out-Null
Write-Output $stateFile
