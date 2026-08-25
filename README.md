# Sustainable Futures Training Platform

Professional assessment & certification app for training firms — built with industry-standard technology.

## Tech Stack

| Layer | Technology | Used by |
|-------|-----------|---------|
| **Frontend** | React 18 + TypeScript | Meta, Airbnb, Netflix |
| **Build** | Vite | Modern web apps |
| **Styling** | Tailwind CSS | Stripe, GitHub, Vercel |
| **Routing** | React Router | SPAs worldwide |
| **Icons** | Lucide React | Professional UI kits |
| **Backend** | Python Flask | APIs & certificate generation |
| **PDF** | ReportLab + pypdf | Certificate engine |
| **Mobile** | PWA (installable iOS/Android) | App-like experience |

## Run locally

### 1. Backend
```bash
cd "eurocert app"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
PORT=5003 python app.py
```

### 2. Frontend (development)
```bash
cd frontend
npm install
npm run dev
```
Open **http://127.0.0.1:5173** — proxies API to Flask.

### 3. Production build
```bash
cd frontend && npm run build
cd .. && PORT=5003 python app.py
```
Open **http://127.0.0.1:5003** — Flask serves the React app.

## App flow

1. **Home** — Register & select programme
2. **Modules** — Video evidence (1–2 min each)
3. **Assessment** — Trade competency quiz
4. **Certificate** — QR verify, download, share

## Customize

Edit `config.py` for branding, modules, assessment questions, and programmes.

## Deploy

One process serves both the **institute app** and the **public verify website**.
Both read the same `DATABASE_URL` (MySQL or SQLite).

1. Build frontend: `cd frontend && npm run build`
2. Set production env:
   - `DATABASE_URL` — app MySQL/SQLite (students + certificates)
   - `PUBLIC_BASE_URL` — HTTPS URL of this deployment (QR + PDF + verify links)
   - `SECRET_KEY` — strong random secret
   - optional `VERIFY_CORS_ORIGINS` — comma-separated extra origins for the verify API
3. Start: `gunicorn --bind 0.0.0.0:$PORT --workers 2 --threads 4 --timeout 120 app:app`  
   (or Docker / `Procfile`)

Verify endpoints (same host as the app):
- Website: `/verify`
- API: `/api/certificates/verify?uid=21PLM001&number=ET/PPT/001/2026`
- Health: `/health`
