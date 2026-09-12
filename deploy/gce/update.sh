#!/usr/bin/env bash
# Run on the GCE VM to pull latest code and rebuild the live app.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sft-app}"
cd "$APP_DIR"

echo "==> Fetching latest from GitHub..."
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
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

echo "==> Updating gunicorn timeout for large video uploads..."
cp "$APP_DIR/deploy/gce/sft-app.service" /etc/systemd/system/sft-app.service
systemctl daemon-reload

# Raise upload limits on the live nginx site without wiping SSL/certbot settings
NGINX_SITE="/etc/nginx/sites-available/sft-app"
if [[ -f "$NGINX_SITE" ]]; then
  echo "==> Raising nginx upload limits on live site..."
  if grep -q "client_max_body_size" "$NGINX_SITE"; then
    sed -i 's/client_max_body_size[^;]*;/client_max_body_size 320M;/' "$NGINX_SITE"
  else
    sed -i '/server_name/a\    client_max_body_size 320M;' "$NGINX_SITE"
  fi
  if grep -q "proxy_read_timeout" "$NGINX_SITE"; then
    sed -i 's/proxy_read_timeout[^;]*;/proxy_read_timeout 600s;/' "$NGINX_SITE"
  else
    sed -i '/proxy_pass/a\        proxy_read_timeout 600s;' "$NGINX_SITE"
  fi
  if ! grep -q "proxy_send_timeout" "$NGINX_SITE"; then
    sed -i '/proxy_read_timeout/a\        proxy_send_timeout 600s;' "$NGINX_SITE"
  else
    sed -i 's/proxy_send_timeout[^;]*;/proxy_send_timeout 600s;/' "$NGINX_SITE"
  fi
  if ! grep -q "proxy_request_buffering" "$NGINX_SITE"; then
    sed -i '/proxy_pass/a\        proxy_request_buffering off;' "$NGINX_SITE"
  fi
  nginx -t
  systemctl reload nginx
fi

echo "==> Fixing ownership..."
chown -R www-data:www-data "$APP_DIR" || true

echo "==> Restarting sft-app..."
systemctl restart sft-app
systemctl is-active sft-app

echo "==> Done. Live: https://assessment.sftlms.com/"
echo "Hard-refresh the app/browser after deploy."
