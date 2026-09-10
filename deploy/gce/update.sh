#!/usr/bin/env bash
# Run on the GCE VM to pull latest code and rebuild the live site.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sft-app}"
cd "$APP_DIR"

echo "==> Fetching latest from GitHub..."
git fetch origin
git reset --hard origin/main

echo "==> Building frontend..."
cd frontend
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm run build
cd "$APP_DIR"

echo "==> Fixing ownership..."
chown -R www-data:www-data "$APP_DIR" || true

echo "==> Restarting sft-app..."
systemctl restart sft-app
systemctl is-active sft-app

echo "==> Done. Live: https://assessment.sftlms.com/"
echo "Hard-refresh the browser (Cmd+Shift+R) after deploy."
