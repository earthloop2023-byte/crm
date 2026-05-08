param(
  [string]$KeyPath = "C:\Users\earthloop\Desktop\pemkey\crm-key.pem",
  [string]$RemoteHost = "ubuntu@54.180.39.208",
  [string]$RemoteReleaseFile = "/opt/crm/site1/deploy/current-release.json"
)

$ErrorActionPreference = "Stop"

$stateDir = Join-Path $PSScriptRoot ".state"
$stateFile = Join-Path $stateDir "live-release-base.json"
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

$remoteJson = ssh -i $KeyPath $RemoteHost "cat $RemoteReleaseFile"
if (-not $remoteJson) {
  throw "Remote release file is empty or missing: $RemoteReleaseFile"
}

$release = $remoteJson | ConvertFrom-Json
if (-not $release.releaseId) {
  throw "Remote release file does not contain releaseId."
}

$payload = [ordered]@{
  releaseId = $release.releaseId
  syncedAtKst = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
  remoteHost = $RemoteHost
  remoteReleaseFile = $RemoteReleaseFile
  remote = $release
}

$payload | ConvertTo-Json -Depth 8 | Set-Content -Path $stateFile -Encoding UTF8
Write-Output $stateFile
