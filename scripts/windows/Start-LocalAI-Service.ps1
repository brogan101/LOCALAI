#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)]
  [string]$Name,

  [Parameter(Mandatory = $true)]
  [string]$WorkingDirectory,

  [Parameter(Mandatory = $true)]
  [string]$Command,

  [Parameter(Mandatory = $true)]
  [string]$LogPath
)

$ErrorActionPreference = "Continue"

function Write-LogLine {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Host $line
  Add-Content -LiteralPath $LogPath -Value $line
}

$logDir = Split-Path -Parent $LogPath
if ($logDir -and -not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}

Write-LogLine "$Name starting"
Write-LogLine "Working directory: $WorkingDirectory"
Write-LogLine "Command: $Command"

if (-not (Test-Path -LiteralPath $WorkingDirectory)) {
  Write-LogLine "ERROR: Working directory does not exist."
  Read-Host "Press Enter to close this failed $Name window"
  exit 1
}

Push-Location $WorkingDirectory
try {
  Invoke-Expression $Command 2>&1 | Tee-Object -FilePath $LogPath -Append
  $exitCode = if ($null -ne $global:LASTEXITCODE) { $global:LASTEXITCODE } else { 0 }
  Write-LogLine "$Name exited with code $exitCode"
  if ($exitCode -ne 0) {
    Read-Host "Press Enter to close this failed $Name window"
  }
  exit $exitCode
} catch {
  Write-LogLine "ERROR: $($_.Exception.Message)"
  Read-Host "Press Enter to close this failed $Name window"
  exit 1
} finally {
  Pop-Location
}
