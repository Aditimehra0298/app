# Deploy on Google Compute Engine (GCE)

One Ubuntu VM runs **both**:

- Institute **app** (also opened by the Play Store Android app) → `https://assessment.sftlms.com/`
- Verify **website** → `https://assessment.sftlms.com/verify`

Same Flask app + same MySQL database `sft_lms`.  
Use your existing subdomain `assessment.sftlms.com` (no new DNS setup needed — only point it to the GCE VM IP if not already).

Publish order: **GCE first** → then upload Android AAB to Play Store.

---

## 1. Create the VM

Google Cloud Console → **Compute Engine → VM instances → Create**

1. Name: `sft-app`
2. Region: `asia-south1` (Mumbai)
3. Machine: `e2-medium` (2 vCPU / 4 GB)
4. Boot disk: **Ubuntu 24.04 LTS**, 40 GB
5. Firewall: enable **Allow HTTP** and **Allow HTTPS**
6. Create

Reserve a **static external IP** for the VM, then make sure your existing subdomain `assessment.sftlms.com` points to that IP.

---

## 2. Upload project to the VM

SSH into the VM, then:

```bash
sudo mkdir -p /opt/sft-app
sudo chown $USER:$USER /opt/sft-app
cd /opt/sft-app
git clone https://github.com/Aditimehra0298/app.git .
```

Or from your Mac (no git):

```bash
gcloud compute scp --recurse --zone=asia-south1-a \
  "/Users/aditimehra/Documents/eurocert app/" \
  sft-app:/opt/sft-app/
```

Also copy photos/videos/PDFs if needed:

- `static/students/`
- `uploads/`
- `generated/`

---

## 3. MySQL (`sft_lms`)

### Option A — MySQL on the same VM (simple)

```bash
sudo apt update
sudo apt install -y mysql-server
sudo mysql <<'SQL'
CREATE DATABASE IF NOT EXISTS sft_lms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'MyNewPass123!';
FLUSH PRIVILEGES;
SQL
```

Export local DB from your Mac:

```bash
mysqldump -u root -p'MyNewPass123!' sft_lms > sft_lms_backup.sql
gcloud compute scp --zone=asia-south1-a sft_lms_backup.sql sft-app:/tmp/
```

Import on VM:

```bash
sudo mysql -u root -p'MyNewPass123!' sft_lms < /tmp/sft_lms_backup.sql
```

### Option B — Cloud SQL

Create MySQL 8, database `sft_lms`, allow your VM IP, then use:

```text
DATABASE_URL=mysql://root:MyNewPass123!@CLOUD_SQL_IP:3306/sft_lms
```

---

## 4. Configure `.env`

```bash
cd /opt/sft-app
cp deploy/gce/env.example .env
nano .env
```

Use this:

```env
SECRET_KEY=put-a-long-random-secret-here
DATABASE_URL=mysql://root:MyNewPass123!@127.0.0.1:3306/sft_lms
LMS_DATABASE_URL=mysql://root:MyNewPass123!@127.0.0.1:3306/sft_lms
LMS_MYSQL_DATABASE=sft_lms
PUBLIC_BASE_URL=https://assessment.sftlms.com
VERIFY_PUBLIC_URL=https://assessment.sftlms.com
CERTIFICATE_API_URL=https://damnart-ai-guladab.n8n-wsk.com/webhook-test/certificate
ADMIN_UID=21EUROTECH001
ADMIN_EMAIL=eurotech@gmail.com
INSTITUTE_NAME=Eurotech
```

---

## 5. Install app + website (one command)

```bash
cd /opt/sft-app
sudo DOMAIN=assessment.sftlms.com bash deploy/gce/setup.sh
```

This installs Python, Node, builds the frontend, starts gunicorn + nginx.

Check:

```bash
curl http://localhost/health
sudo systemctl status sft-app
```

---

## 6. HTTPS

```bash
sudo certbot --nginx -d assessment.sftlms.com --non-interactive --agree-tos -m info@sftrainings.org
```

Then open:

| What | URL |
|---|---|
| Institute **app** (login) | https://assessment.sftlms.com/ |
| Verify **website** | https://assessment.sftlms.com/verify |
| Play Store Android app opens | https://assessment.sftlms.com/ |

Login: `21EUROTECH001` / `eurotech@gmail.com`

---

## 7. Sync app data into Admin LMS tables

After first deploy:

```bash
cd /opt/sft-app
sudo -u www-data bash -c 'cd /opt/sft-app && .venv/bin/python -c "from db import sync_all_app_data_to_lms; print(sync_all_app_data_to_lms())"'
```

Or after institute login, call:

`POST /api/admin/sync-lms`

---

## 8. Play Store (Android app)

Your Android project is in `android-app/` (`com.sft.training`).  
It is a WebView wrapper — it opens the live GCE app URL.

1. Finish GCE + HTTPS first (steps 1–6).
2. `app_url` is already set to `https://assessment.sftlms.com/`.
3. Open `android-app/` in Android Studio.
4. Build → Generate Signed Bundle / APK → **Android App Bundle (.aab)**.
5. Upload the AAB to [Google Play Console](https://play.google.com/console).
6. Add store listing, screenshots, privacy policy, then submit for review.

| Surface | Where users open it |
|---|---|
| Institute training **app** | Play Store Android app |
| Certificate verify **website** | Browser → `/verify` |

Website + Play Store app both use the same GCE backend. After a web update (`npm run build` + restart), the Play Store app shows it automatically — rebuild AAB only when Android version/code changes.

---

## 9. Later updates

```bash
cd /opt/sft-app
git pull
cd frontend && npm ci && npm run build && cd ..
sudo systemctl restart sft-app
```

---

## Firewall note

If the site does not load, in GCP create a firewall rule allowing `tcp:80` and `tcp:443` to the VM.
