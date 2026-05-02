#Requires -Version 5.1
# Sovereign AI OS - Master Launcher
param(
  [switch]$NoBrowser,
  [switch]$NoOllama,
  [switch]$NoWait,
  [switch]$CheckOnly
)

$root = $PSScriptRoot
$ErrorActionPreference = "Continue"
$logsRoot = Join-Path $env:USERPROFILE "LocalAI-Tools\logs"
$launcherLog = Join-Path $logsRoot "launcher.log"
$serviceLauncher = Join-Path $root "scripts\windows\Start-LocalAI-Service.ps1"

function Write-Step { param($msg, $color = "Cyan") Write-Host "  $msg" -ForegroundColor $color }
function Write-Ok   { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "  [X]  $msg" -ForegroundColor Red }
function Write-LaunchLog {
    param([string]$Message)
    if (-not (Test-Path $logsRoot)) { New-Item -ItemType Directory -Force -Path $logsRoot | Out-Null }
    Add-Content -LiteralPath $launcherLog -Value ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message)
}

function Find-ShellHost {
    foreach ($candidate in @("pwsh.exe", "powershell.exe")) {
        $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }
    return $null
}

function Stop-LocalAIJobs {
    param([object[]]$Jobs)
    foreach ($job in $Jobs) {
        if ($null -ne $job -and $job.State -eq "Running") {
            Stop-Job -Job $job -ErrorAction SilentlyContinue
            Write-LaunchLog "Stopped job $($job.Name) id=$($job.Id)"
        }
    }
}

function Test-LocalUrl {
    param([string]$Url, [int]$TimeoutSec = 2)
    try {
        Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSec -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Wait-LocalUrl {
    param([string]$Name, [string]$Url, [int]$Seconds = 25)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-LocalUrl -Url $Url -TimeoutSec 2) {
            Write-Ok "$Name is online"
            Write-LaunchLog "$Name online at $Url"
            return $true
        }
        Start-Sleep -Seconds 1
    }
    Write-Warn "$Name did not answer at $Url within $Seconds seconds"
    Write-LaunchLog "$Name did not answer at $Url within $Seconds seconds"
    return $false
}

function Start-LocalAIService {
    param(
        [string]$Name,
        [string]$Directory,
        [string]$Command,
        [string]$LogFile
    )

    try {
        $jobName = ($Name -replace "[^A-Za-z0-9_-]", "-").ToLowerInvariant()
        Get-Job -Name $jobName -ErrorAction SilentlyContinue | Stop-Job -ErrorAction SilentlyContinue
        Get-Job -Name $jobName -ErrorAction SilentlyContinue | Remove-Job -Force -ErrorAction SilentlyContinue
        $job = Start-Job -Name $jobName -ArgumentList @($Name, $Directory, $Command, $LogFile) -ScriptBlock {
            param($JobServiceName, $JobWorkingDirectory, $JobCommand, $JobLogPath)

            function Write-JobLog {
                param([string]$Message)
                $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
                Write-Output $line
                Add-Content -LiteralPath $JobLogPath -Value $line
            }

            $logDir = Split-Path -Parent $JobLogPath
            if ($logDir -and -not (Test-Path -LiteralPath $logDir)) {
                New-Item -ItemType Directory -Force -Path $logDir | Out-Null
            }

            Write-JobLog "$JobServiceName starting"
            Write-JobLog "Working directory: $JobWorkingDirectory"
            Write-JobLog "Command: $JobCommand"
            if (-not (Test-Path -LiteralPath $JobWorkingDirectory)) {
                Write-JobLog "ERROR: Working directory does not exist."
                exit 1
            }

            Push-Location $JobWorkingDirectory
            try {
                Invoke-Expression $JobCommand 2>&1 | Tee-Object -FilePath $JobLogPath -Append
                $exitCode = if ($null -ne $global:LASTEXITCODE) { $global:LASTEXITCODE } else { 0 }
                Write-JobLog "$JobServiceName exited with code $exitCode"
                exit $exitCode
            } catch {
                Write-JobLog "ERROR: $($_.Exception.Message)"
                exit 1
            } finally {
                Pop-Location
            }
        }
        Write-Ok "$Name launched as isolated PowerShell job (job id $($job.Id))"
        Write-LaunchLog "$Name launched as job id=$($job.Id) name=$jobName log=$LogFile"
        return $job
    } catch {
        Write-Fail "Failed to launch ${Name}: $($_.Exception.Message)"
        Write-LaunchLog "Failed to launch ${Name}: $($_.Exception.Message)"
        return $null
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "   SOVEREIGN AI OS  -  Master Launcher  " -ForegroundColor White
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""
Write-LaunchLog "Launcher started from $root"

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
    if (Test-LocalUrl -Url "http://127.0.0.1:11434/api/tags" -TimeoutSec 3) {
        $ollamaRunning = $true
        Write-Ok "Ollama already running on port 11434"
    }

    if (-not $ollamaRunning) {
        $ollamaExe = Get-Command ollama -ErrorAction SilentlyContinue
        if ($ollamaExe) {
            Write-Step "Starting Ollama..." Yellow
            try {
                Start-Process -FilePath $ollamaExe.Source -ArgumentList "serve" -WindowStyle Hidden | Out-Null
                Write-LaunchLog "Ollama start requested"
            } catch {
                Write-Warn "Ollama start failed: $($_.Exception.Message)"
                Write-LaunchLog "Ollama start failed: $($_.Exception.Message)"
            }
            Start-Sleep -Seconds 3
            if (Test-LocalUrl -Url "http://127.0.0.1:11434/api/tags" -TimeoutSec 5) {
                Write-Ok "Ollama started successfully"
            } else {
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

if ($CheckOnly) {
    Write-Host ""
    Write-Ok "Launcher preflight passed. CheckOnly mode did not start API, UI, Ollama, or browser."
    Write-Host "  Service launcher: $serviceLauncher" -ForegroundColor DarkGray
    Write-Host "  Launcher log:     $launcherLog" -ForegroundColor DarkGray
    Write-LaunchLog "CheckOnly preflight completed without starting services"
    exit 0
}

# ── 5. Launch backend ─────────────────────────────────────────────────────────
Write-Step "Starting API server (port 3001)..." Cyan
$backendDir = Join-Path $root "artifacts\api-server"
$apiLog = Join-Path $logsRoot "api-server.launch.log"
$apiProc = Start-LocalAIService -Name "LocalAI API" -Directory $backendDir -Command "pnpm run dev" -LogFile $apiLog
if (-not $NoWait) { $apiOnline = Wait-LocalUrl -Name "API Server" -Url "http://127.0.0.1:3001/api/health" -Seconds 25 } else { $apiOnline = $false }

# ── 6. Launch frontend ────────────────────────────────────────────────────────
Write-Step "Starting Control Center (port 5173)..." Cyan
$frontendDir = Join-Path $root "artifacts\localai-control-center"
$uiLog = Join-Path $logsRoot "ui-dev.launch.log"
$uiProc = Start-LocalAIService -Name "LocalAI Control Center" -Directory $frontendDir -Command "pnpm run dev -- --host 127.0.0.1" -LogFile $uiLog
if (-not $NoWait) { $uiOnline = Wait-LocalUrl -Name "Control Center" -Url "http://127.0.0.1:5173" -Seconds 25 } else { $uiOnline = $false }

# ── 7. Status table ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  STATUS TABLE" -ForegroundColor White
Write-Host "  ─────────────────────────────────────────────" -ForegroundColor DarkGray

$checks = @(
    @{ name = "API Server";      url = "http://127.0.0.1:3001/api/health"; label = "port 3001" },
    @{ name = "Control Center";  url = "http://127.0.0.1:5173";            label = "port 5173" },
    @{ name = "Ollama";          url = "http://127.0.0.1:11434/api/tags";  label = "port 11434" }
)

foreach ($check in $checks) {
    $status = "starting..."
    $color  = "Yellow"
    if (Test-LocalUrl -Url $check.url -TimeoutSec 4) {
        $status = "ONLINE"
        $color  = "Green"
    }
    Write-Host ("  {0,-18} {1,-10} {2}" -f $check.name, $check.label, $status) -ForegroundColor $color
}

Write-Host "  ─────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

# ── 8. Open browser ──────────────────────────────────────────────────────────
if (-not $NoBrowser) {
    if (Test-LocalUrl -Url "http://127.0.0.1:5173" -TimeoutSec 4) {
        Write-Step "Opening browser..." Green
        Start-Sleep -Seconds 2
        Start-Process "http://127.0.0.1:5173"
    } else {
        Write-Warn "Control Center is not online yet; browser not opened."
        Write-Host "    API log: $apiLog" -ForegroundColor Gray
        Write-Host "    UI log:  $uiLog" -ForegroundColor Gray
        Write-LaunchLog "Browser not opened because UI was not online"
    }
}

Write-Host ""
$apiReady = Test-LocalUrl -Url "http://127.0.0.1:3001/api/health" -TimeoutSec 2
$uiReady = Test-LocalUrl -Url "http://127.0.0.1:5173" -TimeoutSec 2
if ($apiReady -and $uiReady) {
    Write-Host "  Sovereign AI OS is running." -ForegroundColor Green
} else {
    Write-Host "  Sovereign AI OS launch attempted, but one or more core services are not online yet." -ForegroundColor Yellow
}
Write-Host "  Control Center: http://127.0.0.1:5173" -ForegroundColor Cyan
Write-Host "  API Server:     http://127.0.0.1:3001" -ForegroundColor Cyan
Write-Host "  Launcher log:   $launcherLog" -ForegroundColor DarkGray
Write-Host "  API log:        $apiLog" -ForegroundColor DarkGray
Write-Host "  UI log:         $uiLog" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Options: .\LAUNCH_OS.ps1 -NoBrowser -NoOllama -NoWait -CheckOnly" -ForegroundColor DarkGray
Write-Host ""

if (-not $NoWait) {
    Write-Host "  Launcher supervisor is keeping service jobs alive." -ForegroundColor Yellow
    Write-Host "  Press Enter to stop API/UI jobs and close this launcher." -ForegroundColor DarkGray
    Read-Host | Out-Null
    Stop-LocalAIJobs -Jobs @($apiProc, $uiProc)
}
