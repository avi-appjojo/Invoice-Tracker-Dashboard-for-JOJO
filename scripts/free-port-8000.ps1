# Free port 8000 by killing the process using it.
# Run this if the backend fails with "address already in use".
$port = 8000
$connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
$pids = $connections.OwningProcess | Sort-Object -Unique
foreach ($p in $pids) {
    try {
        $proc = Get-Process -Id $p -ErrorAction Stop
        Write-Host "Stopping process $p ($($proc.ProcessName)) using port $port..."
        Stop-Process -Id $p -Force
        Write-Host "Done."
    } catch {
        Write-Host "PID $p not found (may already have exited). Port may free after a moment."
    }
}
if (-not $pids.Count) { Write-Host "No process found listening on port $port." }
