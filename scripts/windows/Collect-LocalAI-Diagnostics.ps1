# LOCALAI Diagnostics Collector — PowerShell wrapper
# ===================================================
# Runs the Node-based diagnostics collector and zips the output.
# Use this from a normal PowerShell session (no admin needed).
#
# Usage:
#   .\scripts\windows\Collect-LocalAI-Diagnostics.ps1
#   .\scripts\windows\Collect-LocalAI-Diagnostics.ps1 -NoNetwork
#   .\scripts\windows\Collect-LocalAI-Diagnostics.ps1 -RedactPaths

param(
  [switch]$NoNetwork,
  [switch]$RedactPaths,
  [switch]$NoZip
)

$ErrorActionPreference = "Stop"

# Locate repo root by walking up from this script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")
$collector = Join-Path $repoRoot "scripts\collect-diagnostics.mjs"

if (-not (Test-Path $collector)) {
  Write-Host "ERROR: Collector not found at $collector" -ForegroundColor Red
  exit 1
}

# Verify Node is available
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "ERROR: Node.js not found on PATH. Install Node 20+ first." -ForegroundColor Red
  exit 1
}

Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  LOCALAI Diagnostics Collector" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan

# Build arg list for collector
$collectorArgs = @($collector)
if ($NoNetwork)   { $collectorArgs += "--no-network" }
if ($RedactPaths) { $collectorArgs += "--redact-paths" }

# Run from repo root so the collector can find package.json
Push-Location $repoRoot
try {
  & node @collectorArgs
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}

if ($exitCode -ne 0) {
  Write-Host "Collector exited with code $exitCode" -ForegroundColor Yellow
  exit $exitCode
}

# Zip the most recent bundle folder unless suppressed
if (-not $NoZip) {
  $diagRoot = Join-Path $env:USERPROFILE "LocalAI-Tools\diagnostics"
  if (Test-Path $diagRoot) {
    $latestDir = Get-ChildItem $diagRoot -Directory |
      Where-Object { $_.Name -like "localai-diagnostics-*" } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($latestDir) {
      $zipPath = "$($latestDir.FullName).zip"
      Write-Host ""
      Write-Host "Zipping bundle..." -ForegroundColor Cyan
      try {
        if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
        Compress-Archive -Path $latestDir.FullName -DestinationPath $zipPath
        Write-Host "Bundle zip: $zipPath" -ForegroundColor Green
      } catch {
        Write-Host "Could not create zip: $_" -ForegroundColor Yellow
      }
    }
  }
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
