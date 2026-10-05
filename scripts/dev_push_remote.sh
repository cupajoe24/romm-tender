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
#   --restart-steam     Shut Steam down on the remote and start it again after the push
#   --password <pass>   Specify the SSH password or key passphrase for this execution
#   --set-password      Prompt for SSH password/key passphrase and save in user environment (~/.tender_ssh_env)
#   --session-only      When used with --set-password, only set for this session rather than saving to ~/.tender_ssh_env
#   --clear-password    Remove cached SSH password from user environment
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
PASSWORD=""
SET_PASSWORD=false
SESSION_ONLY=false
CLEAR_PASSWORD=false

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
    --password)
      PASSWORD="$2"
      shift 2
      ;;
    --set-password|--save-password)
      SET_PASSWORD=true
      shift
      ;;
    --session-only)
      SESSION_ONLY=true
      shift
      ;;
    --clear-password)
      CLEAR_PASSWORD=true
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

# -------------------------------------------------------------------------
# Password and Environment Management
# -------------------------------------------------------------------------
ENV_FILE="$HOME/.tender_ssh_env"

if [[ "$CLEAR_PASSWORD" = true ]]; then
  rm -f "$ENV_FILE"
  unset TENDER_SSH_PASSWORD || true
  echo "Cleared cached SSH password from user environment ($ENV_FILE)."
  if [[ -z "$TARGET" ]]; then
    exit 0
  fi
fi

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE" 2>/dev/null || true
fi

EFFECTIVE_PASSWORD="${PASSWORD:-${TENDER_SSH_PASSWORD:-${SSH_PASSWORD:-}}}"

if [[ "$SET_PASSWORD" = true ]]; then
  if [[ -z "$EFFECTIVE_PASSWORD" ]]; then
    read -r -s -p "Enter SSH password or key passphrase to store in user environment: " INPUT_PASS
    echo ""
    EFFECTIVE_PASSWORD="$INPUT_PASS"
  fi
  if [[ -n "$EFFECTIVE_PASSWORD" ]]; then
    export TENDER_SSH_PASSWORD="$EFFECTIVE_PASSWORD"
    if [[ "$SESSION_ONLY" = false ]]; then
      mkdir -p "$HOME"
      cat << EOF > "$ENV_FILE"
export TENDER_SSH_PASSWORD='$EFFECTIVE_PASSWORD'
EOF
      chmod 600 "$ENV_FILE"
      echo "SSH password/passphrase saved to user environment ($ENV_FILE)."
      echo "Future runs will use this password automatically. Run with --clear-password to remove it."
    else
      echo "SSH password/passphrase set in current session environment."
    fi
  fi
elif [[ -n "$PASSWORD" ]]; then
  export TENDER_SSH_PASSWORD="$PASSWORD"
fi

if [[ -z "$TARGET" ]]; then
  read -rp "Enter remote host IP address or hostname: " TARGET
fi

if [[ -z "$TARGET" ]]; then
  echo "Error: Target remote host is required." >&2
  exit 1
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
# Step 2: Stage files and configure batched deployment
# -------------------------------------------------------------------------
echo "==> Staging files for push..."
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

ASKPASS_TMP=""
cleanup() {
  rm -rf "$STAGE_DIR"
  if [[ -n "$ASKPASS_TMP" && -f "$ASKPASS_TMP" ]]; then
    rm -f "$ASKPASS_TMP"
  fi
}
trap cleanup EXIT

# Configure SSH_ASKPASS if an environment or supplied password exists
if [[ -n "$EFFECTIVE_PASSWORD" ]]; then
  ASKPASS_TMP=$(mktemp)
  cat << 'EOF' > "$ASKPASS_TMP"
#!/usr/bin/env bash
echo "$TENDER_SSH_PASSWORD"
EOF
  chmod 700 "$ASKPASS_TMP"
  export TENDER_SSH_PASSWORD="$EFFECTIVE_PASSWORD"
  export SSH_ASKPASS="$ASKPASS_TMP"
  export SSH_ASKPASS_REQUIRE="force"
fi

if [[ "$PUSH_FRONTEND" = true ]]; then
  mkdir -p "$STAGE_DIR/dist"
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
fi

# Generate remote deployment script to run post-extract operations in the same SSH session
REMOTE_DEPLOY_SCRIPT="$STAGE_DIR/.tender_remote_deploy.sh"
cat << 'EOF' > "$REMOTE_DEPLOY_SCRIPT"
#!/usr/bin/env bash
set -e
DEST_DIR="$1"
EOF

if [[ "$SETUP_REMOTE" = true ]]; then
  PUB_KEY_FILE="$HOME/.ssh/id_ed25519.pub"
  if [[ ! -f "$PUB_KEY_FILE" ]]; then
    PUB_KEY_FILE="$HOME/.ssh/id_rsa.pub"
  fi
  KEY_SETUP=""
  if [[ -f "$PUB_KEY_FILE" ]]; then
    KEY_CONTENT=$(cat "$PUB_KEY_FILE")
    KEY_SETUP="mkdir -p ~/.ssh && chmod 700 ~/.ssh && grep -qxF '$KEY_CONTENT' ~/.ssh/authorized_keys 2>/dev/null || echo '$KEY_CONTENT' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
  fi
  cat << EOF >> "$REMOTE_DEPLOY_SCRIPT"
echo "==> Configuring remote host..."
mkdir -p ~/.steam/steam
touch ~/.steam/steam/.cef-enable-remote-debugging
$KEY_SETUP
echo "Remote host setup complete: CEF remote debugging enabled, directories ready."
EOF
fi

if [[ "$PUSH_BACKEND" = true ]]; then
  cat << 'EOF' >> "$REMOTE_DEPLOY_SCRIPT"
if [ -d "$DEST_DIR/bin" ]; then
  sed -i 's/\r$//' "$DEST_DIR/bin/"* 2>/dev/null || true
  chmod +x "$DEST_DIR/bin/"* 2>/dev/null || true
fi
EOF
fi

if [[ "$RESTART_STEAM" = true ]]; then
  cat << 'EOF' >> "$REMOTE_DEPLOY_SCRIPT"
echo "==> Restarting Steam on remote host..."
if pgrep -x steam >/dev/null; then
  if command -v systemd-run >/dev/null 2>&1; then
    systemd-run --user --collect --quiet --wait -- steam -shutdown >/dev/null 2>&1 || true
  else
    steam -shutdown >/dev/null 2>&1 || true
  fi
  for i in $(seq 1 30); do
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
EOF
fi
chmod +x "$REMOTE_DEPLOY_SCRIPT"

# -------------------------------------------------------------------------
# Step 3: Single Batched Transfer and Remote Execution
# -------------------------------------------------------------------------
echo "==> Pushing and deploying to ${REMOTE_USER}@${REMOTE_HOST}:${DEST}/ (single batched session)..."
tar -czf - -C "$STAGE_DIR" . | ssh -p "$PORT" "${REMOTE_USER}@${REMOTE_HOST}" "
eval DEST_DIR=$DEST
mkdir -p \"\$DEST_DIR\"
tar -xzf - -C \"\$DEST_DIR\"
if [ -f \"\$DEST_DIR/.tender_remote_deploy.sh\" ]; then
  bash \"\$DEST_DIR/.tender_remote_deploy.sh\" \"\$DEST_DIR\"
  rm -f \"\$DEST_DIR/.tender_remote_deploy.sh\"
fi
"

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
echo ""
echo "Remote DevTools URL (SharedJSContext):"
echo -e "   \033[33mhttp://${REMOTE_HOST}:8081\033[0m"
echo ""
