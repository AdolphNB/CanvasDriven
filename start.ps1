param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5174,
    [switch]$Restart,
    [switch]$OpenBrowser
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$BackendLog = Join-Path $Root "backend-dev.log"
$FrontendLog = Join-Path $Root "frontend-dev.log"

function Get-ListenerProcessId {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($connection) {
        return $connection.OwningProcess
    }
    return $null
}

function Stop-PortListener {
    param([int]$Port)
    $processId = Get-ListenerProcessId -Port $Port
    if ($processId) {
        Write-Host "Stopping process $processId on port $Port..."
        Stop-Process -Id $processId -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 600
    }
}

function Start-BackgroundCommand {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [string]$Command,
        [string]$LogPath
    )
    if (Test-Path $LogPath) {
        Clear-Content -Path $LogPath
    } else {
        New-Item -ItemType File -Path $LogPath | Out-Null
    }

    $process = Start-Process `
        -FilePath powershell `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "cd '$WorkingDirectory'; $Command *> '$LogPath'") `
        -WindowStyle Hidden `
        -PassThru

    Write-Host "$Name started. PID: $($process.Id)"
}

function Wait-HttpOk {
    param(
        [string]$Name,
        [string]$Url,
        [int]$TimeoutSeconds = 20
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                Write-Host "$Name ready: $Url"
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    Write-Warning "$Name did not become ready in $TimeoutSeconds seconds: $Url"
    return $false
}

if ($Restart) {
    Stop-PortListener -Port $BackendPort
    Stop-PortListener -Port $FrontendPort
}

$backendPid = Get-ListenerProcessId -Port $BackendPort
if ($backendPid) {
    Write-Host "Backend already listening on port $BackendPort. PID: $backendPid"
} else {
    Start-BackgroundCommand `
        -Name "Backend" `
        -WorkingDirectory $BackendDir `
        -Command "uv run uvicorn canvasdriven.main:app --host 127.0.0.1 --port $BackendPort" `
        -LogPath $BackendLog
}

$frontendPid = Get-ListenerProcessId -Port $FrontendPort
if ($frontendPid) {
    Write-Host "Frontend already listening on port $FrontendPort. PID: $frontendPid"
} else {
    Start-BackgroundCommand `
        -Name "Frontend" `
        -WorkingDirectory $FrontendDir `
        -Command "npm run dev -- --host 127.0.0.1 --port $FrontendPort --strictPort" `
        -LogPath $FrontendLog
}

$backendUrl = "http://127.0.0.1:$BackendPort"
$frontendUrl = "http://127.0.0.1:$FrontendPort"

Wait-HttpOk -Name "Backend" -Url "$backendUrl/health" | Out-Null
Wait-HttpOk -Name "Frontend" -Url $frontendUrl | Out-Null

Write-Host ""
Write-Host "CanvasDriven is starting/running:"
Write-Host "  Frontend: $frontendUrl"
Write-Host "  Backend:  $backendUrl"
Write-Host "  Logs:     backend-dev.log, frontend-dev.log"
Write-Host ""
Write-Host "Use '.\start.ps1 -Restart' if a stale process is holding a port."

if ($OpenBrowser) {
    Start-Process $frontendUrl
}
