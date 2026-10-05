<#
.SYNOPSIS
    Builds and pushes Tender to a remote Linux machine or Steam Deck over SSH.

.DESCRIPTION
    By default builds and deploys both the frontend and backend in a single batched SSH session.
    Use -Frontend or -Backend to deploy only one component.
    All remote operations (setup, directory creation, extraction, permissions, Steam restart)
    are batched so SSH authentication is required at most once per execution.
    Supports caching the SSH password/passphrase in the user environment so you don't have to retype it.

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

.PARAMETER RestartSteam
    Shut Steam down on the remote and start it again after the push.

.PARAMETER Password
    Specify the SSH password or key passphrase for this execution.

.PARAMETER SetPassword
    Prompt for the SSH password or key passphrase and store it in the user environment (TENDER_SSH_PASSWORD)
    so future runs don't require typing it.

.PARAMETER SessionOnly
    When used with -SetPassword, only store the password in the current PowerShell session rather than
    persisting to the Windows user registry.

.PARAMETER ClearPassword
    Remove any cached SSH password from the user and process environment.

.EXAMPLE
    .\scripts\dev_push_remote.ps1 192.168.86.31
    .\scripts\dev_push_remote.ps1 192.168.86.31 -Frontend -RestartSteam
    .\scripts\dev_push_remote.ps1 192.168.86.31 -SetPassword
    .\scripts\dev_push_remote.ps1 -ClearPassword
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0, Mandatory = $false)]
    [string]$Target,

    [switch]$Frontend,
    [switch]$Backend,

    [string]$Dest = "~/romm-tender",
    [string]$User = "deck",
    [string]$Port = 22,
    [switch]$SkipBuild,
    [switch]$SetupRemote,
    [switch]$RestartSteam,

    [Alias("Pass", "KeyPassword")]
    [string]$Password,

    [Alias("SavePassword", "StorePassword", "CachePassword")]
    [switch]$SetPassword,

    [switch]$SessionOnly,

    [Alias("UnsetPassword", "ResetPassword")]
    [switch]$ClearPassword
)

$ErrorActionPreference = "Stop"

# -------------------------------------------------------------------------
# Password and Environment Management
# -------------------------------------------------------------------------
if ($ClearPassword) {
    [System.Environment]::SetEnvironmentVariable("TENDER_SSH_PASSWORD", $null, [System.EnvironmentVariableTarget]::User)
    [System.Environment]::SetEnvironmentVariable("TENDER_SSH_PASSWORD", $null, [System.EnvironmentVariableTarget]::Process)
    $env:TENDER_SSH_PASSWORD = $null
    Write-Host "Cleared cached SSH password from user environment (TENDER_SSH_PASSWORD)." -ForegroundColor Green
    if (-not $Target) {
        exit 0
    }
}

$effectivePassword = $Password
if (-not $effectivePassword) {
    $effectivePassword = $env:TENDER_SSH_PASSWORD
}
if (-not $effectivePassword) {
    $effectivePassword = $env:SSH_PASSWORD
}
if (-not $effectivePassword) {
    $effectivePassword = [System.Environment]::GetEnvironmentVariable("TENDER_SSH_PASSWORD", [System.EnvironmentVariableTarget]::User)
}
if (-not $effectivePassword) {
    $effectivePassword = [System.Environment]::GetEnvironmentVariable("SSH_PASSWORD", [System.EnvironmentVariableTarget]::User)
}

if ($SetPassword) {
    if (-not $effectivePassword) {
        $sec = Read-Host "Enter SSH password or key passphrase to store in user environment" -AsSecureString
        $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
        $effectivePassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    if ($effectivePassword) {
        $env:TENDER_SSH_PASSWORD = $effectivePassword
        if (-not $SessionOnly) {
            [System.Environment]::SetEnvironmentVariable("TENDER_SSH_PASSWORD", $effectivePassword, [System.EnvironmentVariableTarget]::User)
            Write-Host "SSH password/passphrase saved to user environment (TENDER_SSH_PASSWORD)." -ForegroundColor Green
            Write-Host "Future runs will use this password automatically. Use -ClearPassword to remove it." -ForegroundColor Gray
        } else {
            Write-Host "SSH password/passphrase stored in current session environment." -ForegroundColor Green
        }
    }
} elseif ($Password) {
    $env:TENDER_SSH_PASSWORD = $effectivePassword
}

# Require Target for push operations
if (-not $Target) {
    $Target = Read-Host "Enter remote host IP address or hostname"
    if (-not $Target) {
        Write-Error "Target remote host is required."
        exit 1
    }
}

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

function ConvertTo-UnixEncoding {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath
    )

    if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
        return
    }

    $bytes = [System.IO.File]::ReadAllBytes($FilePath)
    if ($bytes.Length -eq 0) {
        return
    }

    # Detect & strip UTF-8 BOM if present (0xEF, 0xBB, 0xBF)
    $offset = 0
    $hasBom = $false
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $hasBom = $true
        $offset = 3
    }

    # Check for carriage returns (CR / 0x0D / ASCII 13)
    $hasCr = $false
    for ($i = $offset; $i -lt $bytes.Length; $i++) {
        if ($bytes[$i] -eq 13) {
            $hasCr = $true
            break
        }
    }

    if ($hasBom -or $hasCr) {
        $text = [System.Text.Encoding]::UTF8.GetString($bytes, $offset, $bytes.Length - $offset)
        $text = $text.Replace("`r`n", "`n").Replace("`r", "`n")
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($FilePath, $text, $utf8NoBom)
    }
}

function Format-UnixShellScripts {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Directory
    )

    if (-not (Test-Path -LiteralPath $Directory)) {
        return
    }

    Get-ChildItem -LiteralPath $Directory -Recurse -File | ForEach-Object {
        $file = $_.FullName
        $isShellScript = $false

        if ($_.Extension -eq ".sh") {
            $isShellScript = $true
        } elseif ($_.Directory.Name -eq "bin") {
            $isShellScript = $true
        } else {
            # Check for shebang (#! or [BOM]#!)
            try {
                $fs = [System.IO.File]::OpenRead($file)
                $buf = New-Object byte[] 5
                $read = $fs.Read($buf, 0, 5)
                $fs.Close()
                if ($read -ge 2 -and $buf[0] -eq 0x23 -and $buf[1] -eq 0x21) {
                    $isShellScript = $true
                } elseif ($read -ge 5 -and $buf[0] -eq 0xEF -and $buf[1] -eq 0xBB -and $buf[2] -eq 0xBF -and $buf[3] -eq 0x23 -and $buf[4] -eq 0x21) {
                    $isShellScript = $true
                }
            } catch {
                # Ignore unreadable / locked files
            }
        }

        if ($isShellScript) {
            ConvertTo-UnixEncoding -FilePath $file
        }
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
    Write-Host "Build complete: dist/" -ForegroundColor Green
}

if ($PushFrontend -and -not (Test-Path (Join-Path $repoRoot "dist/index.js"))) {
    Write-Error "dist/index.js not found. Run without -SkipBuild to compile first."
    exit 1
}

# -------------------------------------------------------------------------
# Step 2: Stage files and configure batched deployment
# -------------------------------------------------------------------------
Write-Host "`n==> Staging files for push..." -ForegroundColor Cyan

if (Test-Path $stageDir) {
    Remove-Item $stageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

$archiveFile = $null
$askpassScript = $null
$origAskPass = $env:SSH_ASKPASS
$origAskPassReq = $env:SSH_ASKPASS_REQUIRE

try {
    # Configure SSH_ASKPASS if an environment/provided password exists
    if ($effectivePassword) {
        $askpassScript = Join-Path ([System.IO.Path]::GetTempPath()) "tender_askpass_$PID.cmd"
        "@echo off
setlocal EnableDelayedExpansion
echo(!TENDER_SSH_PASSWORD!
" | Set-Content -Path $askpassScript -Encoding ASCII
        $env:TENDER_SSH_PASSWORD = $effectivePassword
        $env:SSH_ASKPASS = $askpassScript
        $env:SSH_ASKPASS_REQUIRE = "force"
    }

    if ($PushFrontend) {
        $stageDist = Join-Path $stageDir "dist"
        New-Item -ItemType Directory -Path $stageDist -Force | Out-Null
        Copy-Item (Join-Path $repoRoot "dist/*") -Destination $stageDist -Recurse -Force
    }

    if ($PushBackend) {
        # Backend directory
        $stageBackend = Join-Path $stageDir "backend"
        New-Item -ItemType Directory -Path $stageBackend -Force | Out-Null
        Copy-Item (Join-Path $repoRoot "backend/*") -Destination $stageBackend -Recurse -Force

        # Bin directory (tender-rom-launcher)
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
    }

    # Ensure shell scripts in staged files and local bin are properly Unix encoded (UTF-8 without BOM, LF line endings)
    Format-UnixShellScripts -Directory $stageDir
    if (Test-Path (Join-Path $repoRoot "bin")) {
        Format-UnixShellScripts -Directory (Join-Path $repoRoot "bin")
    }

    # Generate remote deployment script to run post-extract operations in the same SSH session
    $setupSection = ""
    if ($SetupRemote) {
        $pubKeyFile = "$HOME\.ssh\id_ed25519.pub"
        if (-not (Test-Path $pubKeyFile)) {
            $pubKeyFile = "$HOME\.ssh\id_rsa.pub"
        }
        $keySetupBash = ""
        if (Test-Path $pubKeyFile) {
            $keyContent = (Get-Content $pubKeyFile -Raw).Trim()
            $keySetupBash = @"
mkdir -p ~/.ssh && chmod 700 ~/.ssh
grep -qxF '$keyContent' ~/.ssh/authorized_keys 2>/dev/null || echo '$keyContent' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
echo "SSH public key authorized in ~/.ssh/authorized_keys."
"@
        }
        $setupSection = @"
echo "==> Configuring remote host..."
mkdir -p ~/.steam/steam
touch ~/.steam/steam/.cef-enable-remote-debugging
$keySetupBash
echo "Remote host setup complete: CEF remote debugging enabled, directories ready."
"@
    }

    $backendSection = ""
    if ($PushBackend) {
        $backendSection = @"
if [ -d "`$DEST_DIR/bin" ]; then
    sed -i 's/\r$//' "`$DEST_DIR/bin/"* 2>/dev/null || true
    chmod +x "`$DEST_DIR/bin/"* 2>/dev/null || true
fi
"@
    }

    $restartSection = ""
    if ($RestartSteam) {
        $restartSection = @"
echo "==> Restarting Steam on remote host..."
if pgrep -x steam >/dev/null; then
    if command -v systemd-run >/dev/null 2>&1; then
        systemd-run --user --collect --quiet --wait -- steam -shutdown >/dev/null 2>&1 || true
    else
        steam -shutdown >/dev/null 2>&1 || true
    fi
    for i in `$(seq 1 30); do
        if ! pgrep -x steam >/dev/null; then break; fi
        sleep 1
    done
fi
if command -v systemd-run >/dev/null 2>&1; then
    systemd-run --user --collect --quiet -- steam >/dev/null 2>&1 &
else
    nohup steam >/dev/null 2>&1 &
fi
echo "Steam restarted. A backend already running there loads the panel into the fresh context; otherwise start one (below)."
"@
    }

    $deployScript = @"
#!/usr/bin/env bash
set -e
DEST_DIR="`$1"
$setupSection
$backendSection
$restartSection
"@
    $deployScriptPath = Join-Path $stageDir ".tender_remote_deploy.sh"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $deployScriptLF = $deployScript.Replace("`r`n", "`n").Replace("`r", "`n")
    [System.IO.File]::WriteAllText($deployScriptPath, $deployScriptLF, $utf8NoBom)

    # -------------------------------------------------------------------------
    # Step 3: Single Batched Transfer and Remote Execution
    # -------------------------------------------------------------------------
    $archiveFile = Join-Path ([System.IO.Path]::GetTempPath()) "tender_push_$PID.tar.gz"
    Write-Host "==> Compressing staged files for batched push..." -ForegroundColor Cyan
    tar -czf $archiveFile -C $stageDir .

    Write-Host "==> Pushing and deploying to ${RemoteUser}@${RemoteHost}:${Dest}/ (single batched session)..." -ForegroundColor Cyan
    $remoteCmd = "eval DEST_DIR=$Dest; mkdir -p `"`$DEST_DIR`" && tar -xzf - -C `"`$DEST_DIR`" && if [ -f `"`$DEST_DIR/.tender_remote_deploy.sh`" ]; then bash `"`$DEST_DIR/.tender_remote_deploy.sh`" `"`$DEST_DIR`" && rm -f `"`$DEST_DIR/.tender_remote_deploy.sh`"; fi"

    $p = Start-Process -FilePath "ssh" -ArgumentList @("-p", $Port, "${RemoteUser}@${RemoteHost}", $remoteCmd) -RedirectStandardInput $archiveFile -NoNewWindow -Wait -PassThru

    if ($p.ExitCode -ne 0) {
        Write-Error "Deployment to ${RemoteUser}@${RemoteHost} failed with exit code $($p.ExitCode)"
        exit $p.ExitCode
    }
}
finally {
    if (Test-Path $stageDir) {
        Remove-Item $stageDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($archiveFile -and (Test-Path $archiveFile)) {
        Remove-Item $archiveFile -Force -ErrorAction SilentlyContinue
    }
    if ($askpassScript -and (Test-Path $askpassScript)) {
        Remove-Item $askpassScript -Force -ErrorAction SilentlyContinue
    }
    $env:SSH_ASKPASS = $origAskPass
    $env:SSH_ASKPASS_REQUIRE = $origAskPassReq
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

Write-Host "`nRemote DevTools URL (SharedJSContext):" -ForegroundColor White
Write-Host "   http://${RemoteHost}:8081" -ForegroundColor Yellow
Write-Host ""
