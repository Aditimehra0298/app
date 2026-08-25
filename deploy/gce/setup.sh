#!/usr/bin/env bash
# Run on a fresh Ubuntu 24.04 GCE VM (as root or with sudo).
# Prerequisite: project files in /opt/sft-app (git clone or scp).
set -euo pipefail

APP_DIR=/opt/sft-app
DOMAIN="${DOMAIN:-}"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y \
  python3 python3-venv python3-pip \
  nginx certbot python3-certbot-nginx \
  git curl \
  libjpeg-dev zlib1g-dev \
  mysql-client

if [ ! -f "$APP_DIR/app.py" ]; then
  echo "Missing $APP_DIR/app.py — clone the repo first:"
  echo "  sudo mkdir -p $APP_DIR && sudo git clone YOUR_REPO $APP_DIR"
  exit 1
fi

cd "$APP_DIR"
python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Node for frontend build
if ! command -v npm >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

cd "$APP_DIR/frontend"
npm ci
npm run build
cd "$APP_DIR"

mkdir -p generated uploads data static/students
chown -R www-data:www-data generated uploads data static/students 2>/dev/null || true

if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/deploy/gce/env.example" "$APP_DIR/.env"
  echo "Edit $APP_DIR/.env (DATABASE_URL, SECRET_KEY, PUBLIC_BASE_URL) then re-run:"
  echo "  sudo systemctl restart sft-app"
fi

cp "$APP_DIR/deploy/gce/sft-app.service" /etc/systemd/system/sft-app.service
cp "$APP_DIR/deploy/gce/nginx.conf" /etc/nginx/sites-available/sft-app
ln -sfn /etc/nginx/sites-available/sft-app /etc/nginx/sites-enabled/sft-app
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable sft-app
systemctl restart sft-app
nginx -t
systemctl reload nginx

echo ""
echo "App running on port 5001 (via nginx :80)"
echo "Health: curl http://localhost/health"
echo "Verify: http://YOUR_IP/verify"
if [ -n "$DOMAIN" ]; then
  echo "SSL: certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m you@email.com"
fi
