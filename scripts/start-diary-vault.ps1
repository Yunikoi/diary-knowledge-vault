$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "Starting Diary Knowledge Vault..." -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js not found. Please install Node.js first." -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit 1
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dependencies..."
  npm install
}

# Open browser after short delay
Start-Job -ScriptBlock {
  Start-Sleep -Seconds 3
  Start-Process "http://localhost:5173/"
} | Out-Null

npm run dev
