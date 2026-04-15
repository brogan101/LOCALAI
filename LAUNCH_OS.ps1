# Sovereign AI OS - Master Launcher
$root = $PSScriptRoot

Write-Host "Starting Sovereign AI OS Backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\artifacts\api-server'; pnpm run dev"

Start-Sleep -Seconds 5

Write-Host "Starting Sovereign AI OS Frontend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\artifacts\localai-control-center'; pnpm run dev"

Write-Host "System Launching... Open your browser to http://localhost:5173" -ForegroundColor Yellow
