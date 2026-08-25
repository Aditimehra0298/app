#!/usr/bin/env bash
# After vite --mode verify: make Hostinger-ready static files.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$ROOT/deploy/hostinger-static"

if [ -f "$DEST/verify.html" ]; then
  mv "$DEST/verify.html" "$DEST/index.html"
fi

mkdir -p "$DEST/static/images" "$DEST/static/icons"
cp -f "$ROOT/static/images/verify-hero-bg.png" "$DEST/static/images/" 2>/dev/null || true
cp -f "$ROOT/static/images/sft-logo.png" "$DEST/static/images/" 2>/dev/null || true
cp -f "$ROOT/static/images/sft-logo-full.png" "$DEST/static/images/" 2>/dev/null || true
cp -f "$ROOT/static/icons/icon-192.png" "$DEST/static/icons/" 2>/dev/null || true
cp -f "$ROOT/deploy/hostinger/.htaccess" "$DEST/.htaccess"

echo "Hostinger upload folder: $DEST"
echo "Upload ALL files inside that folder to assessment.sftlms.com public_html"
