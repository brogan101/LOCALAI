#Requires -Version 5.1
# Sovereign AI OS - Master Launcher
param(
  [switch]$NoBrowser,
  [switch]$NoOllama
)

$root = $PSScriptRoot
$ErrorActionPreference = "Continue"

function Write-Step { param($msg, $color = "Cyan") Write-Host "  $msg" -ForegroundColor $color }
function Write-Ok   { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "  [X]  $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "   SOVEREIGN AI OS  -  Master Launcher  " -ForegroundColor White
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# ── 1. Check Node.js ─────────────────────────────────────────────────────────
Write-Step "Checking Node.js..."
try {
    $nodeVer = node --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Node.js $nodeVer"
    } else { throw "not found" }
} catch {
    Write-Fail "Node.js is not installed or not in PATH."
    Write-Host "    Download from: https://nodejs.org/" -ForegroundColor Gray
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# ── 2. Check pnpm ────────────────────────────────────────────────────────────
Write-Step "Checking pnpm..."
try {
    $pnpmVer = pnpm --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "pnpm $pnpmVer"
    } else { throw "not found" }
} catch {
    Write-Warn "pnpm not found. Installing via npm..."
    npm install -g pnpm | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Failed to install pnpm. Install manually: npm install -g pnpm"
        exit 1
    }
    Write-Ok "pnpm installed"
}

# ── 3. Auto-start Ollama ─────────────────────────────────────────────────────
if (-not $NoOllama) {
    Write-Step "Checking Ollama..."
    $ollamaRunning = $false
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 3 -ErrorAction Stop
        $ollamaRunning = $true
        Write-Ok "Ollama already running on port 11434"
    } catch { }

    if (-not $ollamaRunning) {
        $ollamaExe = Get-Command ollama -ErrorAction SilentlyContinue
        if ($ollamaExe) {
            Write-Step "Starting Ollama..." Yellow
            Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
            Start-Sleep -Seconds 3
            try {
                Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 5 -ErrorAction Stop | Out-Null
                Write-Ok "Ollama started successfully"
            } catch {
                Write-Warn "Ollama may not have started in time — will retry later"
            }
        } else {
            Write-Warn "Ollama not found in PATH. Download from: https://ollama.com/download"
        }
    }
}

# ── 4. Install dependencies if needed ────────────────────────────────────────
$lockFile = Join-Path $root "pnpm-lock.yaml"
$nodeModules = Join-Path $root "node_modules"
if (-not (Test-Path $nodeModules) -or -not (Test-Path $lockFile)) {
    Write-Step "Installing dependencies (first run)..." Yellow
    Push-Location $root
    pnpm install | Out-Null
    Pop-Location
    Write-Ok "Dependencies installed"
}

# ── 5. Launch backend ─────────────────────────────────────────────────────────
Write-Step "Starting API server (port 3001)..." Cyan
$backendDir = Join-Path $root "artifacts\api-server"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backendDir'; pnpm run dev"
Start-Sleep -Seconds 5

# ── 6. Launch frontend ────────────────────────────────────────────────────────
Write-Step "Starting Control Center (port 5173)..." Cyan
$frontendDir = Join-Path $root "artifacts\localai-control-center"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendDir'; pnpm run dev"
Start-Sleep -Seconds 3

# ── 7. Status table ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  STATUS TABLE" -ForegroundColor White
Write-Host "  ─────────────────────────────────────────────" -ForegroundColor DarkGray

$checks = @(
    @{ name = "API Server";      url = "http://localhost:3001/api/health"; label = "port 3001" },
    @{ name = "Control Center";  url = "http://localhost:5173";            label = "port 5173" },
    @{ name = "Ollama";          url = "http://localhost:11434/api/tags";  label = "port 11434" }
)

foreach ($check in $checks) {
    $status = "starting..."
    $color  = "Yellow"
    try {
        $r = Invoke-WebRequest -Uri $check.url -TimeoutSec 4 -ErrorAction Stop
        $status = "ONLINE"
        $color  = "Green"
    } catch { }
    Write-Host ("  {0,-18} {1,-10} {2}" -f $check.name, $check.label, $status) -ForegroundColor $color
}

Write-Host "  ─────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

# ── 8. Open browser ──────────────────────────────────────────────────────────
if (-not $NoBrowser) {
    Write-Step "Opening browser..." Green
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:5173"
}

Write-Host ""
Write-Host "  Sovereign AI OS is running." -ForegroundColor Green
Write-Host "  Control Center: http://localhost:5173" -ForegroundColor Cyan
Write-Host "  API Server:     http://localhost:3001" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Options: .\LAUNCH_OS.ps1 -NoBrowser -NoOllama" -ForegroundColor DarkGray
Write-Host ""
