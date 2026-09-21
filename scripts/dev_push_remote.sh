#!/usr/bin/env bash
#
# Builds and pushes Tender to a remote Linux machine or Steam Deck over SSH.
#
# Usage:
#   ./scripts/dev_push_remote.sh [TARGET] [OPTIONS]
#
# Arguments:
#   TARGET              Remote host: [user@]hostname-or-ip (e.g., "192.168.86.31" or "deck@192.168.86.31")
#
# Options:
#   --frontend          Build and push only the frontend (dist/)
#   --backend           Push only the backend, bin launcher, and defaults
#   --dest <dir>        Remote destination directory (default: ~/romm-tender)
#   --user <user>       Default SSH user if not specified in TARGET (default: deck)
#   --port <port>       SSH port (default: 22)
#   --skip-build        Skip frontend build step and push existing dist/ files
#   --setup-remote      Run one-time setup on remote host (CEF debugging + directory creation)
#

set -euo pipefail

TARGET=""
PUSH_FRONTEND=false
PUSH_BACKEND=false
DEST="~/romm-tender"
DEFAULT_USER="deck"
PORT=22
SKIP_BUILD=false
SETUP_REMOTE=false
RESTART_STEAM=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --frontend)
      PUSH_FRONTEND=true
      shift
      ;;
    --backend)
      PUSH_BACKEND=true
      shift
      ;;
    --dest)
      DEST="$2"
      shift 2
      ;;
    --user)
      DEFAULT_USER="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --setup-remote)
      SETUP_REMOTE=true
      shift
      ;;
    --restart-steam)
      RESTART_STEAM=true
      shift
      ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# *//'
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      if [[ -z "$TARGET" ]]; then
        TARGET="$1"
      else
        echo "Unexpected argument: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  read -rp "Enter remote host IP address or hostname: " TARGET
fi

# Parse target into user and host
if [[ "$TARGET" == *"@"* ]]; then
  REMOTE_USER="${TARGET%%@*}"
  REMOTE_HOST="${TARGET##*@}"
else
  REMOTE_USER="$DEFAULT_USER"
  REMOTE_HOST="$TARGET"
fi

# If neither --frontend nor --backend was explicitly passed, push both by default
if [[ "$PUSH_FRONTEND" = false && "$PUSH_BACKEND" = false ]]; then
  PUSH_FRONTEND=true
  PUSH_BACKEND=true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGE_DIR="$REPO_ROOT/.dev_stage"

# -------------------------------------------------------------------------
# Step 0: Optional Remote Host Setup
# -------------------------------------------------------------------------
if [[ "$SETUP_REMOTE" = true ]]; then
  echo "==> Configuring remote target (${REMOTE_USER}@${REMOTE_HOST})..."
  ssh -p "$PORT" -t "${REMOTE_USER}@${REMOTE_HOST}" "
mkdir -p ~/.steam/steam
touch ~/.steam/steam/.cef-enable-remote-debugging
mkdir -p $DEST/dist
echo 'Remote host setup complete: CEF remote debugging enabled, directories ready.'
"
fi

# -------------------------------------------------------------------------
# Step 1: Build Frontend (if requested)
# -------------------------------------------------------------------------
if [[ "$PUSH_FRONTEND" = true && "$SKIP_BUILD" = false ]]; then
  echo "==> Building frontend desktop bundle (rollup.desktop.config.js)..."
  if command -v pnpm >/dev/null 2>&1; then
    pnpm -C "$REPO_ROOT/frontend" run build:desktop
  else
    npx pnpm -C "$REPO_ROOT/frontend" run build:desktop
  fi
fi

if [[ "$PUSH_FRONTEND" = true && ! -f "$REPO_ROOT/dist/index.js" ]]; then
  echo "Error: dist/index.js not found. Run without --skip-build to compile first." >&2
  exit 1
fi

# -------------------------------------------------------------------------
# Step 2: Stage files for atomic, single-transfer SCP push
# -------------------------------------------------------------------------
echo "==> Staging files for push..."
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

if [[ "$PUSH_FRONTEND" = true ]]; then
  mkdir -p "$STAGE_DIR/dist"
  # Copy all dist files
  cp -r "$REPO_ROOT/dist/"* "$STAGE_DIR/dist/"
fi

if [[ "$PUSH_BACKEND" = true ]]; then
  mkdir -p "$STAGE_DIR/backend"
  cp -r "$REPO_ROOT/backend/"* "$STAGE_DIR/backend/"

  if [[ -d "$REPO_ROOT/bin" ]]; then
    mkdir -p "$STAGE_DIR/bin"
    cp -r "$REPO_ROOT/bin/"* "$STAGE_DIR/bin/"
  fi

  if [[ -d "$REPO_ROOT/defaults" ]]; then
    mkdir -p "$STAGE_DIR/defaults"
    cp -r "$REPO_ROOT/defaults/"* "$STAGE_DIR/defaults/"
  fi

  # Decky compatibility layout if deploying directly to homebrew/plugins
  if [[ "$DEST" == *"homebrew/plugins"* ]]; then
    mkdir -p "$STAGE_DIR/py_modules"
    cp -r "$REPO_ROOT/backend/"* "$STAGE_DIR/py_modules/"
    rm -f "$STAGE_DIR/py_modules/main.py"
    cp "$REPO_ROOT/backend/main.py" "$STAGE_DIR/main.py"
  fi
fi

# Ensure remote destination directories exist
echo "==> Ensuring remote directory ($DEST) exists on ${REMOTE_USER}@${REMOTE_HOST}..."
MKDIR_CMD="mkdir -p $DEST"
if [[ "$PUSH_FRONTEND" = true ]]; then
  MKDIR_CMD="$MKDIR_CMD $DEST/dist"
fi
if [[ "$PUSH_BACKEND" = true ]]; then
  MKDIR_CMD="$MKDIR_CMD $DEST/backend $DEST/bin $DEST/defaults"
fi
ssh -p "$PORT" "${REMOTE_USER}@${REMOTE_HOST}" "$MKDIR_CMD"

# Push all staged items in a single recursive SCP command
echo "==> Pushing files to ${REMOTE_USER}@${REMOTE_HOST}:${DEST}/..."
scp -P "$PORT" -r "$STAGE_DIR"/* "${REMOTE_USER}@${REMOTE_HOST}:${DEST}/"

if [[ "$PUSH_BACKEND" = true ]]; then
  ssh -p "$PORT" "${REMOTE_USER}@${REMOTE_HOST}" "chmod +x $DEST/bin/rom-launcher 2>/dev/null || true"
fi

if [[ "$RESTART_STEAM" = true ]]; then
  echo "==> Restarting Steam on ${REMOTE_USER}@${REMOTE_HOST}..."
  RESTART_CMD='if pgrep -x steam >/dev/null; then if command -v systemd-run >/dev/null 2>&1; then systemd-run --user --collect --quiet --wait -- steam -shutdown >/dev/null 2>&1 || true; else steam -shutdown >/dev/null 2>&1 || true; fi; for i in $(seq 1 30); do if ! pgrep -x steam >/dev/null; then break; fi; sleep 1; done; fi; if command -v systemd-run >/dev/null 2>&1; then systemd-run --user --collect --quiet -- steam >/dev/null 2>&1 & else nohup steam >/dev/null 2>&1 & fi'
  ssh -p "$PORT" "${REMOTE_USER}@${REMOTE_HOST}" "$RESTART_CMD"
  echo "Steam restarted. The backend will detect the fresh context and inject the panel."
fi

# -------------------------------------------------------------------------
# Summary & How to Start Backend on Remote
# -------------------------------------------------------------------------
echo ""
echo -e "\033[32m=================================================================\033[0m"
echo -e "\033[32m [OK] Deployment to ${REMOTE_USER}@${REMOTE_HOST} completed successfully!\033[0m"
echo -e "\033[32m=================================================================\033[0m"
echo ""
echo -e "\033[36mTo run and test Tender on the remote host:\033[0m"
echo ""
echo "1. Verify Steam CEF Remote Debugging is enabled:"
echo -e "   \033[33mssh ${REMOTE_USER}@${REMOTE_HOST} \"touch ~/.steam/steam/.cef-enable-remote-debugging\"\033[0m"
echo "   (If this was just created, restart Steam once to open port 8080)"
echo ""
echo "2. Start the Tender Backend (Standalone mode):"
echo -e "   \033[33mssh -t ${REMOTE_USER}@${REMOTE_HOST} \"cd $DEST && python3 backend/main.py\"\033[0m"
echo "   - Or if using mise / a virtual environment:"
echo "   ssh -t ${REMOTE_USER}@${REMOTE_HOST} \"cd $DEST && source .venv/bin/activate && python backend/main.py\""
echo "   The backend will serve $DEST/dist over loopback, connect to Steam on port 8080,"
echo "   and inject the panel directly into Steam's Quick Access Menu and Desktop Client."

if [[ "$DEST" == *"homebrew/plugins"* ]]; then
  echo ""
  echo "3. Decky Loader mode:"
  echo "   Decky Loader will hot-reload dist/index.js automatically within ~1-2 seconds."
  echo "   To restart Decky's backend loader process manually:"
  echo -e "   \033[33mssh -t ${REMOTE_USER}@${REMOTE_HOST} \"sudo systemctl restart plugin_loader\"\033[0m"
fi

echo ""
echo "Remote DevTools URL (SharedJSContext):"
echo -e "   \033[33mhttp://${REMOTE_HOST}:8080 (Standalone) or http://${REMOTE_HOST}:8081 (Decky)\033[0m"
echo ""
