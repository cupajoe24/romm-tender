<#
.SYNOPSIS
    Builds and pushes Tender to a remote Linux machine or Steam Deck over SSH.

.DESCRIPTION
    By default builds and deploys both the frontend and backend.
    Use -Frontend or -Backend to deploy only one component.
    At the end of deployment, prints instructions to start and run the backend on the remote machine.

.PARAMETER Target
    The remote address: [user@]hostname-or-ip (e.g., "192.168.86.31" or "deck@192.168.86.31").

.PARAMETER Frontend
    Build and push only the frontend (dist/).

.PARAMETER Backend
    Push only the backend, bin launcher, and defaults.

.PARAMETER Dest
    Remote destination directory (default: "~/romm-tender").

.PARAMETER User
    Default SSH user if not specified in Target (default: "deck").

.PARAMETER Port
    SSH port (default: 22).

.PARAMETER SkipBuild
    Skip frontend build step and push existing dist/ files.

.PARAMETER SetupRemote
    Run one-time setup on remote host (create directories, enable CEF remote debugging, and optionally authorize SSH key).

.EXAMPLE
    .\scripts\dev_push_remote.ps1 192.168.86.31
    .\scripts\dev_push_remote.ps1 deck@192.168.86.31 -Frontend
    .\scripts\dev_push_remote.ps1 192.168.86.31 -Backend
    .\scripts\dev_push_remote.ps1 192.168.86.31 -Dest "~/homebrew/plugins/romm-tender"
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0, Mandatory = $true)]
    [string]$Target,

    [switch]$Frontend,
    [switch]$Backend,

    [string]$Dest = "~/romm-tender",
    [string]$User = "deck",
    [string]$Port = 22,
    [switch]$SkipBuild,
    [switch]$SetupRemote,
    [switch]$RestartSteam
)

$ErrorActionPreference = "Stop"

# Parse Target into User and Host
$RemoteUser = $User
$RemoteHost = $Target

if ($Target -match "^([^@]+)@(.+)$") {
    $RemoteUser = $Matches[1]
    $RemoteHost = $Matches[2]
}

# Determine what to build and push
$PushFrontend = $false
$PushBackend = $false

if ($Frontend -and -not $Backend) {
    $PushFrontend = $true
} elseif ($Backend -and -not $Frontend) {
    $PushBackend = $true
} else {
    # Default: both frontend and backend
    $PushFrontend = $true
    $PushBackend = $true
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$stageDir = Join-Path $repoRoot ".dev_stage"

# -------------------------------------------------------------------------
# Step 0: Optional Remote Host Setup
# -------------------------------------------------------------------------
if ($SetupRemote) {
    Write-Host "`n[Setup] Configuring remote target (${RemoteUser}@${RemoteHost})..." -ForegroundColor Cyan

    $pubKeyFile = "$HOME\.ssh\id_ed25519.pub"
    if (-not (Test-Path $pubKeyFile)) {
        $pubKeyFile = "$HOME\.ssh\id_rsa.pub"
    }

    $keySetupCmd = ""
    if (Test-Path $pubKeyFile) {
        $keyContent = (Get-Content $pubKeyFile -Raw).Trim()
        $keySetupCmd = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && grep -qxF '$keyContent' ~/.ssh/authorized_keys 2>/dev/null || echo '$keyContent' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
        Write-Host "Found SSH public key: $pubKeyFile" -ForegroundColor Cyan
    }

    $setupCmd = @"
mkdir -p ~/.steam/steam
touch ~/.steam/steam/.cef-enable-remote-debugging
mkdir -p $Dest/dist
$keySetupCmd
echo "Remote host setup complete: CEF remote debugging enabled, directories ready."
"@
    ssh -p $Port -t "${RemoteUser}@${RemoteHost}" $setupCmd
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Setup commands returned non-zero exit code ($LASTEXITCODE)."
    } else {
        Write-Host "Setup finished successfully." -ForegroundColor Green
    }
}

# -------------------------------------------------------------------------
# Step 1: Build Frontend (if requested)
# -------------------------------------------------------------------------
if ($PushFrontend -and -not $SkipBuild) {
    Write-Host "`n==> Building frontend desktop bundle (rollup.desktop.config.js)..." -ForegroundColor Cyan

    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        pnpm -C frontend run build:desktop
    } else {
        npx pnpm -C frontend run build:desktop
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
    Write-Host "Build complete: dist/index.js + dist/index.js.map" -ForegroundColor Green
}

if ($PushFrontend -and -not (Test-Path (Join-Path $repoRoot "dist/index.js"))) {
    Write-Error "dist/index.js not found. Run without -SkipBuild to compile first."
    exit 1
}

# -------------------------------------------------------------------------
# Step 2: Stage files for atomic, single-transfer SCP push
# -------------------------------------------------------------------------
Write-Host "`n==> Staging files for push..." -ForegroundColor Cyan

if (Test-Path $stageDir) {
    Remove-Item $stageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

try {
    if ($PushFrontend) {
        $stageDist = Join-Path $stageDir "dist"
        New-Item -ItemType Directory -Path $stageDist -Force | Out-Null

        # Copy dist files, ensuring index.js lands last so file watchers trigger cleanly
        Get-ChildItem -Path (Join-Path $repoRoot "dist") | ForEach-Object {
            if ($_.Name -ne "index.js") {
                Copy-Item $_.FullName -Destination $stageDist -Recurse -Force
            }
        }
        if (Test-Path (Join-Path $repoRoot "dist/index.js")) {
            Copy-Item (Join-Path $repoRoot "dist/index.js") -Destination $stageDist -Force
        }
    }

    if ($PushBackend) {
        # Backend directory
        $stageBackend = Join-Path $stageDir "backend"
        New-Item -ItemType Directory -Path $stageBackend -Force | Out-Null
        Copy-Item (Join-Path $repoRoot "backend/*") -Destination $stageBackend -Recurse -Force

        # Bin directory (rom-launcher)
        if (Test-Path (Join-Path $repoRoot "bin")) {
            $stageBin = Join-Path $stageDir "bin"
            New-Item -ItemType Directory -Path $stageBin -Force | Out-Null
            Copy-Item (Join-Path $repoRoot "bin/*") -Destination $stageBin -Recurse -Force
        }

        # Defaults directory
        if (Test-Path (Join-Path $repoRoot "defaults")) {
            $stageDefaults = Join-Path $stageDir "defaults"
            New-Item -ItemType Directory -Path $stageDefaults -Force | Out-Null
            Copy-Item (Join-Path $repoRoot "defaults/*") -Destination $stageDefaults -Recurse -Force
        }

        # Decky compatibility layout if deploying directly to homebrew/plugins
        if ($Dest -match "homebrew/plugins") {
            $stagePyModules = Join-Path $stageDir "py_modules"
            New-Item -ItemType Directory -Path $stagePyModules -Force | Out-Null
            Copy-Item (Join-Path $repoRoot "backend/*") -Destination $stagePyModules -Recurse -Force
            Remove-Item (Join-Path $stagePyModules "main.py") -ErrorAction SilentlyContinue
            Copy-Item (Join-Path $repoRoot "backend/main.py") -Destination $stageDir -Force
        }
    }

    # Ensure remote destination directories exist
    Write-Host "==> Ensuring remote directory ($Dest) exists on ${RemoteUser}@${RemoteHost}..." -ForegroundColor Cyan
    $mkdirCmd = "mkdir -p $Dest"
    if ($PushFrontend) { $mkdirCmd += " $Dest/dist" }
    if ($PushBackend) { $mkdirCmd += " $Dest/backend $Dest/bin $Dest/defaults" }
    ssh -p $Port "${RemoteUser}@${RemoteHost}" "$mkdirCmd"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to connect or create remote directories on ${RemoteUser}@${RemoteHost}"
        exit $LASTEXITCODE
    }

    # Push all staged items in a single recursive SCP command
    Write-Host "==> Pushing files to ${RemoteUser}@${RemoteHost}:${Dest}/..." -ForegroundColor Cyan
    $stageItems = (Get-ChildItem -Path "$stageDir\*").FullName
    scp -P $Port -r $stageItems "${RemoteUser}@${RemoteHost}:${Dest}/"

    if ($LASTEXITCODE -ne 0) {
        Write-Error "SCP push failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }

    if ($PushBackend) {
        # Ensure executable permissions on launcher
        ssh -p $Port "${RemoteUser}@${RemoteHost}" "chmod +x $Dest/bin/rom-launcher 2>/dev/null || true"
    }

    if ($RestartSteam) {
        Write-Host "==> Restarting Steam on ${RemoteUser}@${RemoteHost}..." -ForegroundColor Cyan
        $restartCmd = 'if pgrep -x steam >/dev/null; then if command -v systemd-run >/dev/null 2>&1; then systemd-run --user --collect --quiet --wait -- steam -shutdown >/dev/null 2>&1 || true; else steam -shutdown >/dev/null 2>&1 || true; fi; for i in $(seq 1 30); do if ! pgrep -x steam >/dev/null; then break; fi; sleep 1; done; fi; if command -v systemd-run >/dev/null 2>&1; then systemd-run --user --collect --quiet -- steam >/dev/null 2>&1 & else nohup steam >/dev/null 2>&1 & fi'
        ssh -p $Port "${RemoteUser}@${RemoteHost}" "$restartCmd"
        Write-Host "Steam restarted. The backend will detect the fresh context and inject the panel." -ForegroundColor Green
    }
}
finally {
    if (Test-Path $stageDir) {
        Remove-Item $stageDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# -------------------------------------------------------------------------
# Summary & How to Start Backend on Remote
# -------------------------------------------------------------------------
Write-Host "`n=================================================================" -ForegroundColor Green
Write-Host " [OK] Deployment to ${RemoteUser}@${RemoteHost} completed successfully!" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green

Write-Host "`nTo run and test Tender on the remote host:" -ForegroundColor Cyan

Write-Host "`n1. Verify Steam CEF Remote Debugging is enabled:" -ForegroundColor White
Write-Host "   ssh ${RemoteUser}@${RemoteHost} `"touch ~/.steam/steam/.cef-enable-remote-debugging`"" -ForegroundColor Yellow
Write-Host "   (If this was just created, restart Steam once to open port 8080)" -ForegroundColor Gray

Write-Host "`n2. Start the Tender Backend (Standalone mode):" -ForegroundColor White
Write-Host "   ssh -t ${RemoteUser}@${RemoteHost} `"cd $Dest && python3 backend/main.py`"" -ForegroundColor Yellow
Write-Host "   - Or if using mise / a virtual environment:" -ForegroundColor Gray
Write-Host "   ssh -t ${RemoteUser}@${RemoteHost} `"cd $Dest && source .venv/bin/activate && python backend/main.py`"" -ForegroundColor Gray
Write-Host "   The backend binds loopback, connects to Steam on port 8080, and injects the panel." -ForegroundColor Gray

if ($Dest -match "homebrew/plugins") {
    Write-Host "`n3. Decky Loader mode:" -ForegroundColor White
    Write-Host "   Decky Loader will hot-reload dist/index.js automatically within ~1-2 seconds." -ForegroundColor Gray
    Write-Host "   To restart Decky's backend loader process manually:" -ForegroundColor Gray
    Write-Host "   ssh -t ${RemoteUser}@${RemoteHost} `"sudo systemctl restart plugin_loader`"" -ForegroundColor Yellow
}

Write-Host "`nRemote DevTools URL (SharedJSContext):" -ForegroundColor White
Write-Host "   http://${RemoteHost}:8080 (Standalone) or http://${RemoteHost}:8081 (Decky)" -ForegroundColor Yellow
Write-Host ""
