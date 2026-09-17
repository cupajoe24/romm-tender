#!/usr/bin/env bash
#
# Builds the Tender desktop dev bundle and pushes it to your Steam Deck.
#
# Usage:
#   ./scripts/dev_push_deck.sh [DECK_HOST] [OPTIONS]
#
# Options:
#   --skip-build     Skip building and only push the existing dist/ files
#   --push-backend   Also push backend/ files and main.py
#   --setup-deck     Run one-time setup on the Steam Deck over SSH

set -euo pipefail

DECK_HOST="${1:-${STEAM_DECK_HOST:-}}"
shift || true

SKIP_BUILD=false
PUSH_BACKEND=false
SETUP_DECK=false
DECK_USER="deck"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=true; shift ;;
    --push-backend) PUSH_BACKEND=true; shift ;;
    --setup-deck) SETUP_DECK=true; shift ;;
    --user) DECK_USER="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$DECK_HOST" ]]; then
  read -rp "Enter Steam Deck IP address or hostname: " DECK_HOST
fi

PLUGIN_DEST="/home/$DECK_USER/homebrew/plugins/romm-tender"

if [[ "$SETUP_DECK" = true ]]; then
  echo "==> Running one-time setup on Steam Deck ($DECK_HOST)..."
  ssh -t "${DECK_USER}@${DECK_HOST}" bash -c "'
sudo install -d /etc/systemd/system/plugin_loader.service.d
printf \"[Service]\nEnvironment=CHOWN_PLUGIN_PATH=0\n\" | sudo tee /etc/systemd/system/plugin_loader.service.d/10-dev-loop.conf >/dev/null
sudo systemctl daemon-reload
sudo systemctl restart plugin_loader
mkdir -p ~/homebrew/plugins/romm-tender/dist
sudo chown -R deck:deck ~/homebrew/plugins/romm-tender
touch ~/.steam/steam/.cef-enable-remote-debugging
echo \"Setup completed successfully.\"
'"
fi

if [[ "$SKIP_BUILD" = false ]]; then
  echo "==> Building desktop dev bundle (rollup.desktop.config.js)..."
  if command -v pnpm >/dev/null 2>&1; then
    pnpm run build:desktop
  else
    npx pnpm run build:desktop
  fi
fi

echo "==> Pushing bundle to Steam Deck (${DECK_USER}@${DECK_HOST})..."
DIST_FILES=()
if [[ -f "dist/index.js.map" ]]; then
  DIST_FILES+=("dist/index.js.map")
fi
DIST_FILES+=("dist/index.js")

scp "${DIST_FILES[@]}" "${DECK_USER}@${DECK_HOST}:${PLUGIN_DEST}/dist/"

if [[ "$PUSH_BACKEND" = true ]]; then
  echo "==> Pushing backend files..."
  ssh "${DECK_USER}@${DECK_HOST}" "mkdir -p ${PLUGIN_DEST}/py_modules"
  scp -r backend/* "${DECK_USER}@${DECK_HOST}:${PLUGIN_DEST}/py_modules/"
  scp backend/main.py "${DECK_USER}@${DECK_HOST}:${PLUGIN_DEST}/main.py"
fi

echo -e "\033[32m[OK] Deployed to Steam Deck successfully!\033[0m"
echo "Decky Loader will hot-reload dist/index.js within ~1-2 seconds."
echo "Remote DevTools: http://${DECK_HOST}:8081 (SharedJSContext)"
