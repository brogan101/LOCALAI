@echo off
setlocal
cd /d "%~dp0"

set "PSHOST="
where pwsh.exe >nul 2>nul
if %ERRORLEVEL%==0 set "PSHOST=pwsh.exe"

if not defined PSHOST (
  where powershell.exe >nul 2>nul
  if %ERRORLEVEL%==0 set "PSHOST=powershell.exe"
)

if not defined PSHOST (
  echo [X] No PowerShell host found. Install PowerShell 7 or repair Windows PowerShell.
  pause
  exit /b 1
)

"%PSHOST%" -NoLogo -NoExit -NoProfile -ExecutionPolicy Bypass -File "%~dp0LAUNCH_OS.ps1" %*
endlocal
