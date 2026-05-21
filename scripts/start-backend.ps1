# Start backend on http://localhost:8000
# Run from project root: .\scripts\start-backend.ps1
$backendRoot = Join-Path $PSScriptRoot ".." "backend"
Set-Location $backendRoot
& .\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
