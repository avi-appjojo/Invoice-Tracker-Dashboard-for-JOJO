# Start frontend on http://localhost:3000
$frontendRoot = Join-Path $PSScriptRoot ".." "frontend"
Set-Location $frontendRoot
npm run dev
