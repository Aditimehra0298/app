#!/usr/bin/env bash
# Run on a Hostinger Ubuntu VPS as root.
# Usage: DOMAIN=verify.yourdomain.com bash deploy/hostinger/setup.sh
set -euo pipefail

APP_DIR=/var/www/sft-verify
DOMAIN="${DOMAIN:-assessment.sftlms.com}"

apt-get update
apt-get install -y python3 python3-venv python3-pip nginx git build-essential libjpeg-dev zlib1g-dev mysql-client

mkdir -p "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ] && [ ! -f "$APP_DIR/app.py" ]; then
  echo "Copy the project into $APP_DIR first, then run this script again."
  echo "Example: git clone YOUR_REPO $APP_DIR"
  exit 1
fi

cd "$APP_DIR"
python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

cd frontend
if command -v npm >/dev/null 2>&1; then
  npm ci
  npm run build
else
  echo "Install Node 22, then run: cd $APP_DIR/frontend && npm ci && npm run build"
fi
cd "$APP_DIR"

if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<EOF
SECRET_KEY=change-this-to-a-long-random-string
DATABASE_URL=mysql://USER:PASSWORD@127.0.0.1:3306/sft
PUBLIC_BASE_URL=https://${DOMAIN}
ADMIN_UID=21EUROTECH001
ADMIN_EMAIL=eurotech@gmail.com
INSTITUTE_NAME=Eurotech
EOF
  echo "Edit $APP_DIR/.env with your MySQL user, password, and SECRET_KEY"
fi

cp "$APP_DIR/deploy/hostinger/sft-verify.service" /etc/systemd/system/sft-verify.service
sed "s/YOUR_DOMAIN/${DOMAIN}/g" "$APP_DIR/deploy/hostinger/nginx.conf" > /etc/nginx/sites-available/sft-verify
ln -sfn /etc/nginx/sites-available/sft-verify /etc/nginx/sites-enabled/sft-verify
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable --now sft-verify
nginx -t
systemctl reload nginx

echo
echo "Site should be at http://${DOMAIN}/verify"
echo "Then add SSL in Hostinger hPanel or run: certbot --nginx -d ${DOMAIN}"
