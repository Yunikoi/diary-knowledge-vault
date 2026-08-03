@echo off
chcp 65001 >nul
title Diary Knowledge Vault
cd /d "%~dp0.."

echo Starting Diary Knowledge Vault...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js first.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
)

start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:5173/"

call npm run dev

pause
