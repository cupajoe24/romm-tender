<#
.SYNOPSIS
    Builds the Tender desktop dev bundle and pushes it to your Steam Deck.

.DESCRIPTION
    Builds frontend/src/desktop into dist/index.js using rollup.desktop.config.js,
    then copies the bundle and sourcemap over SCP to ~/homebrew/plugins/romm-tender/dist/
    on the target Steam Deck. Decky Loader's file watcher will automatically reload
    the plugin within 1-2 seconds if the "debug" flag is active in plugin.json.

.PARAMETER DeckHost
    IP address or hostname of the Steam Deck (e.g. 192.168.1.50 or steamdeck.local).
    Can also be provided via the STEAM_DECK_HOST environment variable.

.PARAMETER DeckUser
    SSH username on the Steam Deck (default: "deck").

.PARAMETER SkipBuild
    Skip building and only push the existing dist/ files.

.PARAMETER PushBackend
    Also push backend/ files and main.py to the Steam Deck.

.PARAMETER SetupDeck
    Run one-time setup on the Steam Deck over SSH (disables tamper guard and adds "debug" flag).

.EXAMPLE
    .\scripts\dev_push_deck.ps1 -DeckHost 192.168.1.50
    .\scripts\dev_push_deck.ps1 -DeckHost steamdeck.local -PushBackend
    .\scripts\dev_push_deck.ps1 -DeckHost 192.168.1.50 -SetupDeck
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$DeckHost = $env:STEAM_DECK_HOST,

    [Parameter()]
    [string]$DeckUser = "deck",

    [Parameter()]
    [switch]$SkipBuild,

    [Parameter()]
    [switch]$PushBackend,

    [Parameter()]
    [switch]$SetupDeck,

    [Parameter()]
    [switch]$SetupKey
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($DeckHost)) {
    $DeckHost = Read-Host "Enter Steam Deck IP address or hostname (e.g. 192.168.1.50)"
    if ([string]::IsNullOrWhiteSpace($DeckHost)) {
        Write-Error "Steam Deck host is required."
        exit 1
    }
}

$PluginDest = "/home/$DeckUser/homebrew/plugins/romm-tender"

# -------------------------------------------------------------------------
# Step 0: Optional One-Time Deck Setup & SSH Key Installation
# -------------------------------------------------------------------------
if ($SetupDeck -or $SetupKey) {
    Write-Host "`n[Setup] Configuring Steam Deck ($DeckHost)..." -ForegroundColor Cyan

    # Install SSH key if available so future runs require 0 passwords
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

    if ($SetupDeck) {
        $SetupCmd = @"
sudo install -d /etc/systemd/system/plugin_loader.service.d
printf '[Service]\nEnvironment=CHOWN_PLUGIN_PATH=0\n' | sudo tee /etc/systemd/system/plugin_loader.service.d/10-dev-loop.conf >/dev/null
sudo systemctl daemon-reload
sudo systemctl restart plugin_loader
mkdir -p ~/homebrew/plugins/romm-tender/dist
sudo chown -R deck:deck ~/homebrew/plugins/romm-tender
touch ~/.steam/steam/.cef-enable-remote-debugging
$keySetupCmd
echo "Setup completed successfully."
"@
        ssh -t "${DeckUser}@${DeckHost}" $SetupCmd
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Setup commands returned non-zero exit code ($LASTEXITCODE)."
        } else {
            Write-Host "Steam Deck setup complete. Tamper guard disabled, directories ready, SSH key authorized." -ForegroundColor Green
        }
    } elseif ($keySetupCmd) {
        ssh -t "${DeckUser}@${DeckHost}" $keySetupCmd
        Write-Host "SSH public key installed to Steam Deck authorized_keys. Future runs won't require a password!" -ForegroundColor Green
    }
}

# -------------------------------------------------------------------------
# Step 1: Build Desktop Dev Bundle
# -------------------------------------------------------------------------
if (-not $SkipBuild) {
    Write-Host "`n==> Building desktop dev bundle (rollup.desktop.config.js)..." -ForegroundColor Cyan
    
    # Try pnpm directly, fall back to npx pnpm
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        pnpm run build:desktop
    } else {
        npx pnpm run build:desktop
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
    Write-Host "Build complete: dist/index.js + dist/index.js.map" -ForegroundColor Green
}

# Verify output files exist
if (-not (Test-Path "dist/index.js")) {
    Write-Error "dist/index.js not found. Run without -SkipBuild to compile first."
    exit 1
}

# -------------------------------------------------------------------------
# Step 2: Push to Steam Deck (Single SCP command -> Prompts for password once)
# -------------------------------------------------------------------------
Write-Host "`n==> Pushing bundle to Steam Deck (${DeckUser}@${DeckHost})..." -ForegroundColor Cyan

if ($PushBackend) {
    Write-Host "Staging frontend and backend files for single-transfer push..." -ForegroundColor Cyan
    $stageDir = Join-Path $PSScriptRoot "..\.dev_stage"
    if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force }
    New-Item -ItemType Directory -Path (Join-Path $stageDir "dist") -Force | Out-Null
    Copy-Item "dist/*" (Join-Path $stageDir "dist/") -Force

    New-Item -ItemType Directory -Path (Join-Path $stageDir "py_modules") -Force | Out-Null
    Copy-Item "backend/*" (Join-Path $stageDir "py_modules/") -Recurse -Force
    Remove-Item (Join-Path $stageDir "py_modules/main.py") -ErrorAction SilentlyContinue
    Copy-Item "backend/main.py" $stageDir -Force

    # Single recursive SCP copy for both frontend and backend
    $stageItems = Get-Item "$stageDir\*"
    scp -r $stageItems "${DeckUser}@${DeckHost}:${PluginDest}/"
    Remove-Item $stageDir -Recurse -Force
} else {
    # Single SCP copy with both index.js.map and index.js
    # (index.js lands last so Decky detects modification and hot-reloads)
    $distFiles = @()
    if (Test-Path "dist/index.js.map") {
        $distFiles += "dist/index.js.map"
    }
    $distFiles += "dist/index.js"

    scp $distFiles "${DeckUser}@${DeckHost}:${PluginDest}/dist/"
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "SCP push failed. Make sure ~/homebrew/plugins/romm-tender is owned by $DeckUser (run with -SetupDeck if needed)."
    exit 1
}

# -------------------------------------------------------------------------
# Success Summary
# -------------------------------------------------------------------------
Write-Host "`n[OK] Deployed to Steam Deck successfully!" -ForegroundColor Green
Write-Host "Decky Loader will hot-reload dist/index.js within ~1-2 seconds."
Write-Host "To test: Open Steam in Desktop Mode on the Deck and select a RomM game shortcut."
Write-Host "Remote DevTools: http://${DeckHost}:8081 (SharedJSContext)" -ForegroundColor Yellow
