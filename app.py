"""
Sustainable Futures Training App — video proof, trade assessment, and certification.
"""

from __future__ import annotations

import base64
import io
import json
import os
import re
import secrets
import ssl
import uuid
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from flask import (
    Flask,
    abort,
    jsonify,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)

from certificate import OUTPUT_DIR, generate_certificate_pdf
from config import (
    APP_BRAND,
    ASSESSMENT_QUESTIONS,
    ASSESSMENT_SUBTITLE,
    ASSESSMENT_TITLE,
    DEFAULT_COURSE,
    FEATURED_COURSES,
    PASS_PERCENTAGE,
    TRAINING_STEPS,
    VIDEO_MAX_SECONDS,
    VIDEO_MAX_UPLOAD_BYTES,
    VIDEO_MIN_SECONDS,
    CERTIFICATE_WAIT_SECONDS,
)
from db import (
    ADMISSION_COURSES,
    admit_student,
    get_student_by_certificate,
    get_student_by_email_and_certificate,
    get_student_by_uid,
    init_db,
    list_students,
    save_student_certificate,
    seed_students,
    update_student_status,
    upsert_student,
    mark_student_milestone,
)
from template_registry import TEMPLATES_DIR, list_available_courses

BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
DATA_DIR = BASE_DIR / "data"
CERTIFICATES_FILE = DATA_DIR / "certificates.json"
PATHWAY_FILE = DATA_DIR / "assessment_path.json"
TRAINING_SETUP_FILE = DATA_DIR / "training_setup.json"
PATHWAY_ASSETS_DIR = BASE_DIR / "static" / "pathway"
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
TEMPLATES_PDF_DIR = TEMPLATES_DIR if TEMPLATES_DIR.is_dir() else (BASE_DIR / "templates_pdf")

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
TEMPLATES_PDF_DIR.mkdir(parents=True, exist_ok=True)
PATHWAY_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

ADMIN_UID = os.environ.get("ADMIN_UID", "21ADMIN2021").strip().upper()
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "sft@admin.com").strip().lower()
CERTIFICATE_API_URL = (
    os.environ.get("CERTIFICATE_API_URL")
    or os.environ.get("VITE_CERTIFICATE_API_URL")
    or "https://damnart-ai-guladab.n8n-wsk.com/webhook-test/certificate"
).rstrip("/")
PLUMBING_COURSE_NAME = "Professional Plumbing Training Program"
PLUMBING_TEMPLATE_FILE = "Professional plumbing tarining program.pdf"
CERTIFICATE_API_FALLBACK = "https://certificate-generation-navy.vercel.app/generate-certificate"
SFTLMS_VERIFY_URL = os.environ.get("SFTLMS_VERIFY_URL", "https://sftlms.com/certificates/verify").rstrip("/")
# Passport photo box on the plumbing landscape template (PDF points, origin bottom-left).
PLUMBING_PHOTO_BOX = {"x": 1193.0, "y": 552.0, "w": 159.0, "h": 238.0}
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
STUDENT_PHOTOS_DIR = BASE_DIR / "static" / "students"
STUDENT_PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_STEP_IMAGE = "/static/images/week1-plumbing-tools.jpg"

# Ensure SQLite student database exists and plumbing batch is loaded
init_db()
seed_students()

SAFE_FILENAME = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$",
    re.I,
)
ALLOWED_VIDEO_EXTENSIONS = {".webm", ".mp4", ".mov", ".mkv", ".m4v", ".3gp", ".qt"}
VIDEO_MIME_TO_EXT = {
    "video/webm": ".webm",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/x-m4v": ".m4v",
    "video/3gpp": ".3gp",
    "video/3gpp2": ".3gp",
}

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))
app.config["MAX_CONTENT_LENGTH"] = VIDEO_MAX_UPLOAD_BYTES
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SECURE"] = os.environ.get("PUBLIC_BASE_URL", "").startswith("https")


@app.after_request
def _cors_sftlms_headers(resp):
    origin = str(request.headers.get("Origin") or "").rstrip("/")
    if origin in {"https://sftlms.com", "https://www.sftlms.com"}:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Vary"] = "Origin"
        resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


def _load_certificates() -> dict:
    if not CERTIFICATES_FILE.is_file():
        return {}
    try:
        return json.loads(CERTIFICATES_FILE.read_text())
    except json.JSONDecodeError:
        return {}


def _save_certificates(data: dict) -> None:
    CERTIFICATES_FILE.write_text(json.dumps(data, indent=2))


def _find_certificate(uid: str) -> dict | None:
    key = str(uid or "").strip()
    if not key:
        return None
    certs = _load_certificates()
    for candidate in (key, key.upper(), key.lower()):
        rec = certs.get(candidate)
        if rec:
            return rec
    wanted = key.upper()
    for rec in certs.values():
        if not isinstance(rec, dict):
            continue
        stored = str(rec.get("uid") or rec.get("certificateId") or "").strip().upper()
        if stored == wanted:
            return rec
    return None


def _store_certificate_record(uid: str, record: dict) -> dict:
    certs = _load_certificates()
    certs[str(uid).strip()] = record
    _save_certificates(certs)
    return record


def _local_verify_url(cert_id: str, email: str = "", certificate_number: str = "") -> str:
    """QR / share link opens the official SFT LMS verify page with cert + Gmail prefilled."""
    number = str(certificate_number or cert_id or "").strip()
    params: dict[str, str] = {}
    if number:
        params["number"] = number
        params["q"] = number
    mail = str(email or "").strip().lower()
    if mail:
        params["email"] = mail
    if params:
        return f"{SFTLMS_VERIFY_URL}?{urllib.parse.urlencode(params)}"
    return SFTLMS_VERIFY_URL


def _uid_upload_dir(uid: str) -> Path:
    token = re.sub(r"[^A-Za-z0-9_-]+", "-", str(uid or "")).strip("-").lower()
    return UPLOADS_DIR / token


def _step_video_path(uid: str, step_id: int) -> Path | None:
    user_dir = _uid_upload_dir(uid)
    if not user_dir.is_dir():
        return None
    for ext in ALLOWED_VIDEO_EXTENSIONS:
        candidate = user_dir / f"step_{step_id}{ext}"
        if candidate.is_file():
            return candidate
    return None


def _certificate_public(record: dict) -> dict:
    filename = str(record.get("filename") or "").strip()
    cert_id = str(record.get("certificateId") or record.get("uid") or "").strip()
    pdf_url = f"/generated/{filename}" if filename else str(record.get("pdfUrl") or "")
    return {
        "success": True,
        "certificateId": cert_id,
        "uid": record.get("uid") or cert_id,
        "filename": filename,
        "pdfUrl": pdf_url,
        "downloadUrl": f"/generated/{filename}?download=1" if filename else pdf_url,
        "verifyUrl": _local_verify_url(
            cert_id,
            email=str(record.get("email") or ""),
            certificate_number=str(record.get("certificateNumber") or cert_id),
        ),
        "qrUrl": f"/qr/{urllib.parse.quote(cert_id, safe='')}.png",
        "candidateName": record.get("candidateName") or "",
        "courseName": record.get("courseName") or "",
        "grade": record.get("grade") or "Excellent",
        "certificateNumber": record.get("certificateNumber") or "",
        "issueDate": record.get("issueDate") or "",
    }


def _save_student_upload(file_storage, prefix: str) -> str:
    filename = (file_storage.filename or "").strip()
    if not filename:
        raise ValueError("Please choose an image file.")
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError("Photo must be JPG, PNG, or WebP.")
    safe = re.sub(r"[^A-Za-z0-9_-]+", "-", prefix).strip("-").lower() or "file"
    dest_name = f"{safe}-{uuid.uuid4().hex[:8]}{ext}"
    dest = STUDENT_PHOTOS_DIR / dest_name
    file_storage.save(dest)
    return f"/static/students/{dest_name}"


def _normalize_step(raw: dict, index: int) -> dict:
    title = str(raw.get("title", "")).strip() or f"Module {index}"
    description = str(raw.get("description", "")).strip() or "Record a short video for this step."
    try:
        min_seconds = int(raw.get("min_seconds", VIDEO_MIN_SECONDS))
    except (TypeError, ValueError):
        min_seconds = VIDEO_MIN_SECONDS
    try:
        max_seconds = int(raw.get("max_seconds", VIDEO_MAX_SECONDS))
    except (TypeError, ValueError):
        max_seconds = VIDEO_MAX_SECONDS
    min_seconds = VIDEO_MIN_SECONDS
    max_seconds = VIDEO_MAX_SECONDS
    image = str(raw.get("image", "")).strip() or DEFAULT_STEP_IMAGE
    if not image.startswith("/static/"):
        image = DEFAULT_STEP_IMAGE
    return {
        "id": index,
        "title": title,
        "description": description,
        "min_seconds": min_seconds,
        "max_seconds": max_seconds,
        "icon": f"{index:02d}",
        "image": image,
    }


def _load_pathway_steps() -> list[dict]:
    """Trainer-configured assessment pathway steps (learners upload videos to these)."""
    if PATHWAY_FILE.is_file():
        try:
            data = json.loads(PATHWAY_FILE.read_text())
            steps = data.get("steps") if isinstance(data, dict) else data
            if isinstance(steps, list) and steps:
                return [_normalize_step(s, i) for i, s in enumerate(steps, start=1)]
        except (json.JSONDecodeError, OSError, TypeError, ValueError):
            pass
    return [_normalize_step(s, i) for i, s in enumerate(TRAINING_STEPS, start=1)]


def _save_pathway_steps(steps: list[dict]) -> list[dict]:
    normalized = [_normalize_step(s, i) for i, s in enumerate(steps, start=1)]
    PATHWAY_FILE.write_text(json.dumps({"steps": normalized}, indent=2))
    return normalized


def _default_training_setup() -> dict:
    return {
        "course_name": DEFAULT_COURSE,
        "batch_months": 1,
        "pathway_weeks": 4,
    }


def _load_training_setup() -> dict:
    if not TRAINING_SETUP_FILE.is_file():
        return _default_training_setup()
    try:
        data = json.loads(TRAINING_SETUP_FILE.read_text())
        if not isinstance(data, dict):
            return _default_training_setup()
    except (json.JSONDecodeError, OSError):
        return _default_training_setup()
    setup = _default_training_setup()
    setup["course_name"] = str(data.get("course_name") or setup["course_name"]).strip() or setup["course_name"]
    try:
        setup["batch_months"] = max(1, int(data.get("batch_months", setup["batch_months"])))
    except (TypeError, ValueError):
        pass
    try:
        setup["pathway_weeks"] = max(1, int(data.get("pathway_weeks", setup["pathway_weeks"])))
    except (TypeError, ValueError):
        pass
    return setup


def _save_training_setup(data: dict) -> dict:
    current = _load_training_setup()
    next_setup = {
        "course_name": str(data.get("course_name") or current["course_name"]).strip() or current["course_name"],
        "batch_months": max(1, int(data.get("batch_months") or current["batch_months"])),
        "pathway_weeks": max(1, int(data.get("pathway_weeks") or current["pathway_weeks"])),
    }
    TRAINING_SETUP_FILE.write_text(json.dumps(next_setup, indent=2))
    return next_setup


def _default_session() -> dict:
    return {
        "candidate_name": "",
        "course_name": DEFAULT_COURSE,
        "student_uid": None,
        "father_name": "",
        "image_path": None,
        "completed_steps": [],
        "assessment_passed": False,
        "assessment_score": 0,
        "certificate_id": None,
        "pdf_filename": None,
        "videos_completed_at": None,
        "assessment_completed_at": None,
    }


def _parse_iso_dt(value) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = datetime.strptime(raw[:19], "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _certificate_wait_info(progress: dict, total_steps: int | None = None) -> dict:
    """Certificate unlocks 1 hour after videos AND assessment are both complete."""
    steps_total = total_steps if total_steps is not None else len(_load_pathway_steps())
    videos_done = len(progress.get("completed_steps") or []) >= steps_total
    assessment_done = bool(progress.get("assessment_passed"))
    videos_at = _parse_iso_dt(progress.get("videos_completed_at"))
    assess_at = _parse_iso_dt(progress.get("assessment_completed_at"))
    if videos_done and videos_at is None:
        videos_at = _now_utc()
        progress["videos_completed_at"] = _iso(videos_at)
    if assessment_done and assess_at is None:
        assess_at = _now_utc()
        progress["assessment_completed_at"] = _iso(assess_at)

    ready = False
    ready_at = None
    wait_seconds = CERTIFICATE_WAIT_SECONDS
    if videos_done and assessment_done and videos_at and assess_at:
        start = max(videos_at, assess_at)
        ready_dt = start + timedelta(seconds=CERTIFICATE_WAIT_SECONDS)
        ready_at = _iso(ready_dt)
        wait_seconds = max(0, int((ready_dt - _now_utc()).total_seconds()))
        ready = wait_seconds == 0
    elif not videos_done or not assessment_done:
        wait_seconds = CERTIFICATE_WAIT_SECONDS

    return {
        "certificate_ready": ready,
        "certificate_ready_at": ready_at,
        "wait_seconds": wait_seconds,
        "videos_done": videos_done,
        "assessment_done": assessment_done,
    }


def _get_progress() -> dict:
    if "progress" not in session:
        session["progress"] = _default_session()
    return session["progress"]


def _public_base_url() -> str:
    base = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    if base:
        return base
    try:
        return request.host_url.rstrip("/")
    except RuntimeError:
        # Fallback for non-request contexts (scripts/tests).
        return "http://127.0.0.1:5001"


def _to_dd_mm_yyyy(value) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    iso = raw[:10]
    parts = iso.split("-")
    if len(parts) == 3 and len(parts[0]) == 4:
        return f"{parts[2]}-{parts[1]}-{parts[0]}"
    return raw


def _training_duration_months(start, end) -> str:
    start_raw = str(start or "")[:10]
    if len(start_raw) < 8:
        return ""
    try:
        start_d = datetime.strptime(start_raw, "%Y-%m-%d").date()
    except ValueError:
        return ""
    end_raw = str(end or "")[:10]
    try:
        end_d = datetime.strptime(end_raw, "%Y-%m-%d").date() if len(end_raw) >= 8 else date.today()
    except ValueError:
        end_d = date.today()
    months = (end_d.year - start_d.year) * 12 + (end_d.month - start_d.month)
    if end_d.day < start_d.day:
        months -= 1
    return str(max(1, months))


def _student_photo_file(image_path: str | None) -> Path | None:
    raw = str(image_path or "").strip()
    if not raw:
        return None
    if raw.startswith(("http://", "https://")):
        path_part = urllib.parse.urlparse(raw).path
        raw = path_part or raw
    if raw.startswith("/static/"):
        candidate = BASE_DIR / raw.lstrip("/")
    else:
        candidate = Path(raw)
        if not candidate.is_file():
            candidate = STUDENT_PHOTOS_DIR / Path(raw).name
    return candidate if candidate.is_file() else None


def _student_photo_data_uri(image_path: str | None) -> str:
    photo = _student_photo_file(image_path)
    if not photo:
        return ""
    mime = "image/png" if photo.suffix.lower() == ".png" else "image/jpeg"
    encoded = base64.b64encode(photo.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def _crop_photo_to_box(photo_path: Path, box_w: float, box_h: float) -> Path:
    from PIL import Image

    img = Image.open(photo_path).convert("RGB")
    target_ratio = box_w / box_h if box_h else 1
    w, h = img.size
    if w <= 0 or h <= 0:
        return photo_path
    current = w / h
    if current > target_ratio:
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        img = img.crop((left, 0, left + new_w, h))
    else:
        new_h = int(w / target_ratio)
        top = (h - new_h) // 2
        img = img.crop((0, top, w, top + new_h))
    out = OUTPUT_DIR / f"photo-crop-{uuid.uuid4().hex[:10]}.jpg"
    img.save(out, "JPEG", quality=90)
    return out


def _stamp_student_photo_on_pdf(pdf_bytes: bytes, image_path: str | None) -> bytes:
    photo = _student_photo_file(image_path)
    if not photo:
        return pdf_bytes

    from pypdf import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas as pdf_canvas

    reader = PdfReader(io.BytesIO(pdf_bytes))
    page = reader.pages[0]
    page_w = float(page.mediabox.width)
    page_h = float(page.mediabox.height)
    box = dict(PLUMBING_PHOTO_BOX)
    if abs(page_w - 1492) > 80 or abs(page_h - 1054) > 80:
        # Scale the plumbing box if the page is a similar landscape certificate.
        box["x"] *= page_w / 1492.0
        box["y"] *= page_h / 1054.0
        box["w"] *= page_w / 1492.0
        box["h"] *= page_h / 1054.0

    cropped = _crop_photo_to_box(photo, box["w"], box["h"])
    overlay_buf = io.BytesIO()
    c = pdf_canvas.Canvas(overlay_buf, pagesize=(page_w, page_h))
    c.drawImage(
        str(cropped),
        box["x"],
        box["y"],
        width=box["w"],
        height=box["h"],
        preserveAspectRatio=True,
        mask="auto",
        anchor="c",
    )
    c.save()
    overlay_buf.seek(0)
    overlay_page = PdfReader(overlay_buf).pages[0]
    page.merge_page(overlay_page)
    writer = PdfWriter()
    writer.add_page(page)
    for extra in reader.pages[1:]:
        writer.add_page(extra)
    out = io.BytesIO()
    writer.write(out)
    try:
        cropped.unlink(missing_ok=True)
    except OSError:
        pass
    return out.getvalue()


def _download_pdf_bytes(pdf_url: str) -> bytes:
    url = str(pdf_url or "").strip()
    if not url:
        raise ValueError("Certificate API did not return a PDF URL.")
    if url.startswith("/"):
        url = f"https://certificate-generation-navy.vercel.app{url}"
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=60, context=_ssl_context()) as resp:
        return resp.read()


def _certificate_payload_from_student(student: dict, grade: str | None = None) -> dict:
    uid = str(student.get("uid") or "").strip()
    course = str(student.get("course_name") or "").strip()

    # Certificate number rule:
    # ET/PPT/<last-3-digits-of-uid>/<year>
    # Example: ET/PPT/001/2026
    def _cert_number_from_uid(_uid: str, issue_date: str | None) -> str:
        m = re.search(r"(\d{3})$", _uid or "")
        last3 = m.group(1) if m else ""
        year_raw = str(issue_date or "")[:4]
        year = year_raw if year_raw.isdigit() and len(year_raw) == 4 else str(datetime.now().year)
        return f"ET/PPT/{last3}/{year}"

    derived_certificate_number = _cert_number_from_uid(uid, student.get("issue_date"))
    photo_data = _student_photo_data_uri(student.get("image_path"))
    payload = {
        "certificateId": uid,
        "candidateName": str(student.get("name") or "").strip(),
        "courseName": course,
        "templateFile": "",
        "grade": (grade or "").strip() or "Excellent",
        "certificateNumber": derived_certificate_number,
        "delegateNumber": uid,
        "uid": uid,
        "verifyUrl": _local_verify_url(
            uid,
            email=str(student.get("email") or ""),
            certificate_number=derived_certificate_number,
        ),
        "issueDate": _to_dd_mm_yyyy(student.get("issue_date")) or _to_dd_mm_yyyy(date.today().isoformat()),
        "startDate": _to_dd_mm_yyyy(student.get("batch_start")),
        "trainingDuration": _training_duration_months(student.get("batch_start"), student.get("batch_end")),
    }
    if photo_data:
        # n8n/HTML templates typically bind <img src> to `photo` / `image`.
        payload["photo"] = photo_data
        payload["image"] = photo_data
        payload["candidatePhoto"] = photo_data
        payload["photoUrl"] = photo_data
        payload["candidatePhotoUrl"] = photo_data
        payload["imageUrl"] = photo_data
    if "plumb" in course.lower():
        payload["courseName"] = PLUMBING_COURSE_NAME
        payload["templateFile"] = PLUMBING_TEMPLATE_FILE
    return payload


def _ssl_context():
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl._create_unverified_context()


def _post_certificate_api(url: str, payload: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90, context=_ssl_context()) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(detail)
            message = parsed.get("error") or parsed.get("message") or detail
        except json.JSONDecodeError:
            message = detail or str(exc)
        raise ValueError(message) from exc
    except urllib.error.URLError as exc:
        raise ValueError(f"Certificate API unreachable: {exc.reason}") from exc
    if not body.get("success") or not body.get("pdfUrl"):
        raise ValueError(body.get("error") or "Certificate API did not return a PDF.")
    return body


def _call_certificate_api(payload: dict) -> dict:
    urls = [CERTIFICATE_API_URL]
    if CERTIFICATE_API_FALLBACK.rstrip("/") not in {u.rstrip("/") for u in urls}:
        urls.append(CERTIFICATE_API_FALLBACK)
    last_error: Exception | None = None
    photo_keys = {"photo", "image", "candidatePhoto", "photoUrl", "candidatePhotoUrl", "imageUrl"}
    for url in urls:
        send = payload
        if "vercel.app" in url:
            send = {k: v for k, v in payload.items() if k not in photo_keys}
        try:
            return _post_certificate_api(url, send)
        except ValueError as exc:
            last_error = exc
            continue
    raise ValueError(str(last_error) if last_error else "Certificate API failed.")


def _generate_cert_number() -> str:
    year = datetime.now(timezone.utc).year
    seq = secrets.randbelow(900) + 100
    return f"{year}-05-101-001/{seq}"


def _generate_delegate_number() -> str:
    year = datetime.now(timezone.utc).year
    seq = secrets.randbelow(9000) + 1000
    return f"{year}-{seq:04d}-123"


def _programme_courses() -> list[dict[str, str]]:
    """Return courses with Sustainable Futures programmes listed first."""
    all_courses = list_available_courses(TEMPLATES_PDF_DIR)
    by_name = {c["courseName"]: c for c in all_courses}
    ordered: list[dict[str, str]] = []

    for name in FEATURED_COURSES:
        if name in by_name:
            ordered.append(by_name.pop(name))

    remaining = sorted(by_name.values(), key=lambda c: c["courseName"].lower())
    return ordered + remaining


def _public_questions() -> list[dict]:
    """Return assessment questions without correct answers (client-safe)."""
    return [
        {"id": q["id"], "question": q["question"], "options": q["options"]}
        for q in ASSESSMENT_QUESTIONS
    ]


def _app_config() -> dict:
    return {
        "brand": APP_BRAND,
        "steps": _load_pathway_steps(),
        "trainingSetup": _load_training_setup(),
        "questions": _public_questions(),
        "assessmentTitle": ASSESSMENT_TITLE,
        "assessmentSubtitle": ASSESSMENT_SUBTITLE,
        "passPercentage": PASS_PERCENTAGE,
        "courses": _programme_courses(),
        "defaultCourse": DEFAULT_COURSE,
        "admissionCourses": ADMISSION_COURSES,
        "images": {
            "hero": "/static/images/hero-plumbing.jpg",
            "splash": "/static/images/splash-forest.jpg",
            "assessment": "/static/images/assessment-desk.jpg",
            "certificate": "/static/images/certificate-still.jpg",
        },
    }


@app.route("/api/config", methods=["GET"])
def app_config():
    return jsonify(_app_config())


@app.route("/api/verify/<path:cert_id>", methods=["GET"])
def verify_api(cert_id: str):
    payload = _verify_lookup(cert_id)
    return jsonify(payload)


def _cors_sftlms(resp):
    origin = str(request.headers.get("Origin") or "").rstrip("/")
    if origin in {"https://sftlms.com", "https://www.sftlms.com"}:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Vary"] = "Origin"
        resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


@app.route("/api/certificates/verify", methods=["GET", "OPTIONS"])
def lms_certificates_verify():
    """Same contract as https://sftlms.com/api/certificates/verify — reads this app's MySQL."""
    if request.method == "OPTIONS":
        return _cors_sftlms(app.make_response(("", 204)))

    email = str(request.args.get("email") or "").strip().lower()
    number = str(
        request.args.get("number")
        or request.args.get("q")
        or request.args.get("id")
        or request.args.get("delegate")
        or ""
    ).strip()
    if not email or "@" not in email:
        return _cors_sftlms(jsonify({"ok": False, "verified": False, "message": "Email address is required."})), 400
    if not number:
        return _cors_sftlms(
            jsonify({"ok": False, "verified": False, "message": "Certificate number is required."})
        ), 400

    student = get_student_by_email_and_certificate(email, number)
    if not student:
        return _cors_sftlms(
            jsonify(
                {
                    "ok": False,
                    "verified": False,
                    "message": "No certificate matches this email and certificate number.",
                }
            )
        )

    pack = _verify_lookup(student["uid"])
    issued = pack.get("cert") or {}
    issue_raw = str(issued.get("issueDate") or student.get("issue_date") or "")[:10]
    issued_at = issue_raw
    try:
        issued_at = datetime.strptime(issue_raw, "%Y-%m-%d").date().isoformat()
    except ValueError:
        pass

    cert_no = str(issued.get("certificateNumber") or student.get("certificate_number") or number)
    base = _public_base_url()
    pdf_path = f"/api/certificates/public-pdf?number={urllib.parse.quote(cert_no)}&download=1"
    pdf_url = f"{base}{pdf_path}" if pack.get("pdfUrl") or pack.get("downloadUrl") else None

    videos = []
    for item in pack.get("videos") or []:
        row = dict(item)
        video_url = str(row.get("videoUrl") or "")
        image_url = str(row.get("image") or "")
        if video_url.startswith("/"):
            row["videoUrl"] = f"{base}{video_url}"
        if image_url.startswith("/"):
            row["image"] = f"{base}{image_url}"
        videos.append(row)

    body = {
        "ok": True,
        "verified": bool(pack.get("approved")),
        "certificate": {
            "learnerName": student.get("name"),
            "courseTitle": issued.get("courseName") or student.get("course_name"),
            "certificateNumber": cert_no,
            "issuedAt": issued_at,
            "scorePercent": 100 if pack.get("assessmentPassed") else None,
            "holderType": "individual",
            "companyName": None,
            "pdfReady": bool(pdf_url),
            "pdfUrl": pdf_url,
            "delegateNumber": student.get("uid"),
            "email": student.get("email"),
        },
        "proofs": {
            "videos": videos,
            "videosComplete": pack.get("videosComplete"),
            "assessmentPassed": pack.get("assessmentPassed"),
            "certificateApproved": pack.get("certificateApproved"),
            "approved": pack.get("approved"),
            "uploadedSteps": pack.get("uploadedSteps"),
            "expectedSteps": pack.get("expectedSteps"),
        },
        "student": pack.get("student") or student,
    }
    return _cors_sftlms(jsonify(body))


@app.route("/api/certificates/public-pdf", methods=["GET"])
def lms_public_pdf():
    number = str(request.args.get("number") or "").strip()
    student = get_student_by_certificate(number) or get_student_by_uid(number)
    if not student:
        abort(404)
    pack = _verify_lookup(student["uid"])
    filename = str((pack.get("cert") or {}).get("filename") or "")
    existing = _find_certificate(student["uid"])
    filename = str((existing or {}).get("filename") or filename)
    if not filename or not (OUTPUT_DIR / filename).is_file():
        abort(404)
    as_attachment = str(request.args.get("download") or "").lower() in ("1", "true", "yes")
    return send_from_directory(
        OUTPUT_DIR,
        filename,
        mimetype="application/pdf",
        as_attachment=as_attachment,
        download_name="SFT-certificate.pdf",
    )


def _serve_spa():
    """Serve the React production build (student login lives here)."""
    index = FRONTEND_DIST / "index.html"
    if index.is_file():
        resp = send_from_directory(FRONTEND_DIST, "index.html")
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        resp.headers["Pragma"] = "no-cache"
        return resp
    abort(503)


@app.route("/")
def index():
    return _serve_spa()


@app.route("/assets/<path:filename>")
def frontend_assets(filename: str):
    if FRONTEND_DIST.is_dir():
        return send_from_directory(FRONTEND_DIST / "assets", filename)
    abort(404)


@app.route("/<path:path>")
def spa_fallback(path: str):
    if path.startswith(("api/", "static/", "generated/", "qr/", "verify/", "health", "manifest.json", "sw.js")):
        abort(404)
    if FRONTEND_DIST.is_dir() and (FRONTEND_DIST / path).is_file():
        return send_from_directory(FRONTEND_DIST, path)
    return _serve_spa()


@app.route("/manifest.json")
def manifest():
    return send_from_directory(BASE_DIR / "static", "manifest.json", mimetype="application/manifest+json")


@app.route("/sw.js")
def service_worker():
    return send_from_directory(BASE_DIR / "static", "sw.js", mimetype="application/javascript")


@app.route("/api/progress", methods=["GET"])
def get_progress():
    progress = _get_progress()
    steps = _load_pathway_steps()
    total_steps = len(steps)
    completed = len(progress.get("completed_steps", []))
    assessment_done = progress.get("assessment_passed", False)
    wait_info = _certificate_wait_info(progress, total_steps)
    session["progress"] = progress
    session.modified = True

    phase = "registration"
    if progress.get("candidate_name"):
        if completed < total_steps:
            phase = "training"
        elif not assessment_done:
            phase = "assessment"
        else:
            phase = "certificate"

    return jsonify(
        {
            "progress": progress,
            "total_steps": total_steps,
            "completed_count": completed,
            "phase": phase,
            "all_steps_done": completed >= total_steps,
            "certificate_ready": wait_info["certificate_ready"],
            "certificate_ready_at": wait_info["certificate_ready_at"],
            "wait_seconds": wait_info["wait_seconds"],
        }
    )


@app.route("/api/register", methods=["POST"])
def register():
    """Legacy name+course register — prefer /api/login with UID."""
    data = request.get_json(silent=True) or {}
    name = str(data.get("candidateName", "")).strip()
    course = str(data.get("courseName", DEFAULT_COURSE)).strip() or DEFAULT_COURSE

    if not name or len(name) < 2:
        return jsonify({"success": False, "error": "Please enter your full name."}), 400

    progress = _default_session()
    progress["candidate_name"] = name
    progress["course_name"] = course
    session["progress"] = progress
    session.modified = True

    return jsonify({"success": True, "progress": progress})


@app.route("/api/login", methods=["POST"])
def login_with_uid():
    """Student logs in with UID and registered Gmail."""
    data = request.get_json(silent=True) or {}
    uid = str(data.get("uid", "")).strip().upper()
    email = str(data.get("email", "")).strip().lower()
    if not uid:
        return jsonify({"success": False, "error": "Enter your UID / Roll No."}), 400
    if not email:
        return jsonify({"success": False, "error": "Enter your registered Gmail."}), 400
    if "@" not in email:
        return jsonify({"success": False, "error": "Enter a valid Gmail address."}), 400

    if secrets.compare_digest(uid, ADMIN_UID) and secrets.compare_digest(email, ADMIN_EMAIL):
        session["is_admin"] = True
        session.modified = True
        return jsonify({"success": True, "role": "admin"})

    student = get_student_by_uid(uid)
    if not student:
        return jsonify(
            {
                "success": False,
                "error": "UID not found. Complete admission first or check your Roll No.",
            }
        ), 404

    registered = str(student.get("email") or "").strip().lower()
    if not registered:
        return jsonify(
            {
                "success": False,
                "error": "No Gmail is saved for this UID. Complete admission with your Gmail first.",
            }
        ), 400
    if registered != email:
        return jsonify(
            {
                "success": False,
                "error": "UID and Gmail do not match. Use the Gmail registered with this UID.",
            }
        ), 401

    progress = _default_session()
    progress["candidate_name"] = student["name"]
    progress["course_name"] = student["course_name"]
    progress["student_uid"] = student["uid"]
    progress["father_name"] = student.get("father_name") or ""
    progress["image_path"] = student.get("image_path")
    if student.get("videos_completed_at"):
        progress["videos_completed_at"] = str(student["videos_completed_at"])
        progress["completed_steps"] = [s["id"] for s in _load_pathway_steps()]
    if student.get("assessment_completed_at"):
        progress["assessment_completed_at"] = str(student["assessment_completed_at"])
        progress["assessment_passed"] = True
    existing_cert = _find_certificate(student["uid"])
    if existing_cert:
        progress["certificate_id"] = existing_cert.get("certificateId") or student["uid"]
        progress["pdf_filename"] = existing_cert.get("filename")
    session["progress"] = progress
    session["session_token"] = re.sub(r"[^A-Za-z0-9_-]+", "-", student["uid"]).lower()
    session.modified = True

    update_student_status(student["uid"], "in_training")

    return jsonify({"success": True, "student": student, "progress": progress})


@app.route("/api/admission", methods=["POST"])
def public_admission():
    """Students fill admission form → saved into MySQL with a new UID."""
    data = request.form.to_dict() if request.form else (request.get_json(silent=True) or {})

    photo = request.files.get("image")
    if photo is None or not (photo.filename or "").strip():
        return jsonify({"success": False, "error": "Please upload your photo."}), 400

    try:
        image_path = _save_student_upload(photo, "photo")
        student = admit_student(
            {
                "name": data.get("name"),
                "father_name": data.get("father_name"),
                "course_name": data.get("course_name"),
                "batch_start": data.get("batch_start"),
                "image_path": image_path,
                "email": data.get("email"),
            }
        )
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    return jsonify(
        {
            "success": True,
            "student": student,
            "message": f"Admission saved. Your UID is {student['uid']}. Use it to log in and start video modules.",
        }
    )


@app.route("/api/steps/<int:step_id>/upload", methods=["POST"])
def upload_step_video(step_id: int):
    progress = _get_progress()
    if not progress.get("candidate_name"):
        return jsonify({"success": False, "error": "Please register first."}), 400

    steps = _load_pathway_steps()
    step = next((s for s in steps if s["id"] == step_id), None)
    if not step:
        return jsonify({"success": False, "error": "Invalid step."}), 404

    # Enforce sequential completion
    expected_next = len(progress.get("completed_steps", [])) + 1
    if step_id > expected_next:
        return jsonify({"success": False, "error": "Complete previous steps first."}), 400
    if step_id < expected_next:
        return jsonify({"success": True, "message": "Step already completed.", "progress": progress})

    if "video" not in request.files:
        return jsonify({"success": False, "error": "No video file uploaded."}), 400

    video = request.files["video"]
    filename = (video.filename or "").strip()
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        ext = VIDEO_MIME_TO_EXT.get((video.mimetype or "").lower(), "")
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        return jsonify(
            {
                "success": False,
                "error": "Unsupported video. Use the phone camera or upload MP4 / MOV.",
            }
        ), 400

    video.stream.seek(0, os.SEEK_END)
    file_size = video.stream.tell()
    video.stream.seek(0)
    if file_size > VIDEO_MAX_UPLOAD_BYTES:
        return jsonify(
            {
                "success": False,
                "error": "Video file is too large. Maximum upload size is 300 MB.",
            }
        ), 400

    duration = request.form.get("duration", type=float)
    duration_unknown = request.form.get("durationUnknown") in ("1", "true", "yes")

    # iOS often cannot report video duration; use file size as a fallback check.
    if duration_unknown or duration is None or duration <= 0 or duration == float("inf"):
        if file_size < 500 * 1024:
            return jsonify(
                {"success": False, "error": "Video is too small. Record at least 1 minute."}
            ), 400
    else:
        if duration < VIDEO_MIN_SECONDS:
            return jsonify(
                {
                    "success": False,
                    "error": f"Video too short. Minimum {VIDEO_MIN_SECONDS} seconds (1 minute) required.",
                }
            ), 400
        if duration > VIDEO_MAX_SECONDS:
            return jsonify(
                {
                    "success": False,
                    "error": f"Video too long. Maximum {VIDEO_MAX_SECONDS} seconds (2 minutes) allowed.",
                }
            ), 400

    if not session.get("session_token"):
        session["session_token"] = secrets.token_hex(8)
    user_dir = UPLOADS_DIR / session["session_token"]
    user_dir.mkdir(parents=True, exist_ok=True)

    filename = f"step_{step_id}{ext}"
    video.save(user_dir / filename)

    completed = progress.get("completed_steps", [])
    if step_id not in completed:
        completed.append(step_id)
        completed.sort()
    progress["completed_steps"] = completed
    all_done = len(completed) >= len(steps)
    if all_done and not progress.get("videos_completed_at"):
        stamp = _iso(_now_utc())
        progress["videos_completed_at"] = stamp
        uid = str(progress.get("student_uid") or "").strip()
        if uid:
            mark_student_milestone(uid, videos_completed_at=stamp)
    session["progress"] = progress
    session.modified = True

    return jsonify(
        {
            "success": True,
            "step_id": step_id,
            "completed_steps": completed,
            "all_steps_done": all_done,
        }
    )


@app.route("/api/assessment/submit", methods=["POST"])
def submit_assessment():
    progress = _get_progress()
    if not progress.get("candidate_name"):
        return jsonify({"success": False, "error": "Please register first."}), 400

    if len(progress.get("completed_steps", [])) < len(_load_pathway_steps()):
        return jsonify({"success": False, "error": "Complete all training steps first."}), 400

    data = request.get_json(silent=True) or {}
    answers = data.get("answers", {})
    if not isinstance(answers, dict):
        return jsonify({"success": False, "error": "Invalid answers format."}), 400

    correct = 0
    total = len(ASSESSMENT_QUESTIONS)
    for q in ASSESSMENT_QUESTIONS:
        user_answer = answers.get(q["id"])
        if user_answer is not None and int(user_answer) == q["correct"]:
            correct += 1

    score = round((correct / total) * 100) if total else 0
    passed = score >= PASS_PERCENTAGE

    progress["assessment_score"] = score
    progress["assessment_passed"] = passed
    if passed and not progress.get("assessment_completed_at"):
        stamp = _iso(_now_utc())
        progress["assessment_completed_at"] = stamp
        uid = str(progress.get("student_uid") or "").strip()
        if uid:
            mark_student_milestone(uid, assessment_completed_at=stamp)
            update_student_status(uid, "assessment_passed")
    session["progress"] = progress
    session.modified = True

    wait_info = _certificate_wait_info(progress)

    return jsonify(
        {
            "success": True,
            "passed": passed,
            "score": score,
            "correct": correct,
            "total": total,
            "pass_percentage": PASS_PERCENTAGE,
            "wait_seconds": wait_info["wait_seconds"] if passed else 0,
            "certificate_ready": wait_info["certificate_ready"] if passed else False,
        }
    )


def _issue_certificate_for_student(student: dict, grade: str = "Excellent") -> dict:
    uid = str(student.get("uid") or "").strip()
    payload = _certificate_payload_from_student(student, grade)
    result = _call_certificate_api(payload)
    pdf_bytes = _download_pdf_bytes(str(result.get("pdfUrl") or ""))
    stamped = _stamp_student_photo_on_pdf(pdf_bytes, student.get("image_path"))
    filename = f"{uuid.uuid4()}.pdf"
    (OUTPUT_DIR / filename).write_bytes(stamped)
    record = {
        "certificateId": result.get("certificateId") or uid,
        "uid": uid,
        "candidateName": payload["candidateName"],
        "courseName": result.get("courseName") or payload["courseName"],
        "grade": payload["grade"],
        "certificateNumber": payload["certificateNumber"],
        "delegateNumber": payload["delegateNumber"],
        "verifyUrl": payload["verifyUrl"],
        "issueDate": payload["issueDate"],
        "filename": filename,
        "created_at": _iso(_now_utc()),
        "email": str(student.get("email") or ""),
    }
    save_student_certificate(uid, payload["certificateNumber"], date.today().isoformat())
    return _store_certificate_record(uid, record)


@app.route("/api/certificate", methods=["GET"])
def get_certificate():
    """Return the student's saved certificate, or issue it when the wait is over."""
    progress = _get_progress()
    uid = str(progress.get("student_uid") or "").strip()
    if not uid:
        return jsonify({"success": False, "error": "Log in with your UID first."}), 400

    existing = _find_certificate(uid)
    filename = str((existing or {}).get("filename") or progress.get("pdf_filename") or "").strip()
    if filename and (OUTPUT_DIR / filename).is_file():
        record = existing or {
            "certificateId": progress.get("certificate_id") or uid,
            "uid": uid,
            "filename": filename,
            "candidateName": progress.get("candidate_name"),
            "courseName": progress.get("course_name"),
        }
        return jsonify(_certificate_public(record))

    wait_info = _certificate_wait_info(progress)
    if not wait_info["videos_done"] or not wait_info["assessment_done"] or not wait_info["certificate_ready"]:
        return jsonify(
            {
                "success": False,
                "pending": True,
                "wait_seconds": wait_info["wait_seconds"],
                "certificate_ready_at": wait_info["certificate_ready_at"],
            }
        )

    student = get_student_by_uid(uid)
    if not student:
        return jsonify({"success": False, "error": f"Student {uid} not found."}), 404
    try:
        record = _issue_certificate_for_student(student)
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 502

    progress["certificate_id"] = record.get("certificateId") or uid
    progress["pdf_filename"] = record.get("filename")
    session["progress"] = progress
    session.modified = True
    return jsonify(_certificate_public(record))


@app.route("/api/certificate/generate", methods=["POST"])
def generate_certificate():
    """Load student from MySQL and POST to the external certificate PDF API."""
    data = request.get_json(silent=True) or {}
    requested_uid = str(data.get("uid") or "").strip()
    progress = _get_progress()

    if requested_uid:
        denied = _require_admin()
        if denied:
            session_uid = str(progress.get("student_uid") or "").strip()
            if requested_uid.lower() != session_uid.lower():
                return denied
        uid = requested_uid
    else:
        uid = str(progress.get("student_uid") or "").strip()

    if not uid:
        return jsonify({"success": False, "error": "Log in with a student UID first."}), 400

    student = get_student_by_uid(uid)
    if not student:
        return jsonify({"success": False, "error": f"Student {uid} not found."}), 404

    existing = _find_certificate(uid)
    filename = str((existing or {}).get("filename") or "").strip()
    if filename and (OUTPUT_DIR / filename).is_file() and not bool(session.get("is_admin")):
        record = existing or {"certificateId": uid, "uid": uid, "filename": filename}
        progress["certificate_id"] = record.get("certificateId") or uid
        progress["pdf_filename"] = filename
        session["progress"] = progress
        session.modified = True
        return jsonify(_certificate_public(record))

    is_admin = bool(session.get("is_admin"))
    if not is_admin:
        wait_info = _certificate_wait_info(progress)
        if not wait_info["videos_done"]:
            return jsonify({"success": False, "error": "Upload all training videos first."}), 400
        if not wait_info["assessment_done"]:
            return jsonify({"success": False, "error": "Pass the assessment first."}), 400
        if not wait_info["certificate_ready"]:
            mins = max(1, (wait_info["wait_seconds"] + 59) // 60)
            return jsonify(
                {
                    "success": False,
                    "pending": True,
                    "error": f"Certificate will be ready in {mins} minute(s). Please wait 1 hour after videos and assessment.",
                    "wait_seconds": wait_info["wait_seconds"],
                    "certificate_ready_at": wait_info["certificate_ready_at"],
                }
            ), 403

    grade = str(data.get("grade") or "").strip() or "Excellent"
    try:
        record = _issue_certificate_for_student(student, grade)
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 502

    progress["certificate_id"] = record.get("certificateId") or uid
    progress["pdf_filename"] = record.get("filename")
    session["progress"] = progress
    session.modified = True
    return jsonify(_certificate_public(record))


@app.route("/verify")
@app.route("/verify/<path:cert_id>")
def verify_certificate(cert_id: str | None = None):
    return _serve_spa()


@app.route("/qr/<path:cert_id>.png")
def qr_code(cert_id: str):
    import io

    import qrcode
    from flask import Response

    student = get_student_by_uid(cert_id) or get_student_by_certificate(cert_id)
    email = str((student or {}).get("email") or "")
    number = str((student or {}).get("certificate_number") or cert_id)
    verify_url = _local_verify_url(cert_id, email=email, certificate_number=number)
    qr = qrcode.QRCode(version=1, box_size=8, border=2)
    qr.add_data(verify_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color=APP_BRAND["theme_color"], back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return Response(buffer.getvalue(), mimetype="image/png")


@app.route("/generated/<path:filename>")
def serve_generated(filename: str):
    if not SAFE_FILENAME.match(filename):
        abort(404)
    file_path = OUTPUT_DIR / filename
    if not file_path.is_file():
        abort(404)
    as_attachment = str(request.args.get("download") or "").lower() in ("1", "true", "yes")
    return send_from_directory(
        OUTPUT_DIR,
        filename,
        mimetype="application/pdf",
        as_attachment=as_attachment,
        download_name="SFT-certificate.pdf",
    )


@app.route("/api/reset", methods=["POST"])
def reset_progress():
    session.pop("progress", None)
    session.pop("session_token", None)
    return jsonify({"success": True})


def _require_admin():
    if not session.get("is_admin"):
        return jsonify({"success": False, "error": "Admin login required."}), 401
    return None


def _save_step_image(file_storage) -> str | None:
    if not file_storage or not (file_storage.filename or "").strip():
        return None
    ext = Path(file_storage.filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError("Cover image must be JPG, PNG, or WebP.")
    name = f"step-{uuid.uuid4().hex[:12]}{ext}"
    dest = PATHWAY_ASSETS_DIR / name
    file_storage.save(dest)
    return f"/static/pathway/{name}"


@app.route("/api/admin/status", methods=["GET"])
def admin_status():
    return jsonify({"authenticated": bool(session.get("is_admin"))})


@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True) or {}
    uid = str(data.get("uid") or "").strip().upper()
    email = str(data.get("email") or "").strip().lower()

    if not uid or not email:
        return jsonify({"success": False, "error": "Enter admin UID and email."}), 400

    if not secrets.compare_digest(uid, ADMIN_UID) or not secrets.compare_digest(email, ADMIN_EMAIL):
        return jsonify({"success": False, "error": "Invalid admin UID or email."}), 401

    session["is_admin"] = True
    session.modified = True
    return jsonify({"success": True})


@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("is_admin", None)
    session.modified = True
    return jsonify({"success": True})


@app.route("/api/admin/steps", methods=["GET"])
def admin_list_steps():
    """Trainer view: assessment pathway steps learners will record videos for."""
    denied = _require_admin()
    if denied:
        return denied
    return jsonify({"success": True, "steps": _load_pathway_steps()})


@app.route("/api/admin/steps", methods=["POST"])
def admin_add_step():
    """Trainer adds a pathway step. Learners later upload a video for it."""
    denied = _require_admin()
    if denied:
        return denied

    title = str(request.form.get("title") or (request.get_json(silent=True) or {}).get("title", "")).strip()
    description = str(
        request.form.get("description") or (request.get_json(silent=True) or {}).get("description", "")
    ).strip()
    if not title:
        return jsonify({"success": False, "error": "Step title is required."}), 400
    if not description:
        return jsonify({"success": False, "error": "Tell learners what video to record."}), 400

    try:
        min_seconds = int(request.form.get("min_seconds") or (request.get_json(silent=True) or {}).get("min_seconds", 60))
        max_seconds = int(request.form.get("max_seconds") or (request.get_json(silent=True) or {}).get("max_seconds", 120))
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Invalid video length."}), 400

    image = DEFAULT_STEP_IMAGE
    if "image" in request.files:
        try:
            saved = _save_step_image(request.files["image"])
            if saved:
                image = saved
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc)}), 400

    steps = _load_pathway_steps()
    steps.append(
        {
            "title": title,
            "description": description,
            "min_seconds": min_seconds,
            "max_seconds": max_seconds,
            "image": image,
        }
    )
    saved_steps = _save_pathway_steps(steps)
    return jsonify(
        {
            "success": True,
            "steps": saved_steps,
            "message": "Step added. Learners will record a video for this step.",
        }
    )


@app.route("/api/admin/steps/<int:step_id>", methods=["PUT"])
def admin_update_step(step_id: int):
    denied = _require_admin()
    if denied:
        return denied

    steps = _load_pathway_steps()
    target = next((s for s in steps if s["id"] == step_id), None)
    if not target:
        return jsonify({"success": False, "error": "Step not found."}), 404

    title = str(request.form.get("title") or "").strip() or target["title"]
    description = str(request.form.get("description") or "").strip() or target["description"]
    try:
        min_seconds = int(request.form.get("min_seconds") or target["min_seconds"])
        max_seconds = int(request.form.get("max_seconds") or target["max_seconds"])
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Invalid video length."}), 400

    image = target["image"]
    if "image" in request.files and (request.files["image"].filename or "").strip():
        try:
            saved = _save_step_image(request.files["image"])
            if saved:
                image = saved
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc)}), 400

    updated = []
    for s in steps:
        if s["id"] == step_id:
            updated.append(
                {
                    "title": title,
                    "description": description,
                    "min_seconds": min_seconds,
                    "max_seconds": max_seconds,
                    "image": image,
                }
            )
        else:
            updated.append(s)

    saved_steps = _save_pathway_steps(updated)
    return jsonify({"success": True, "steps": saved_steps, "message": "Step updated."})


@app.route("/api/admin/steps/<int:step_id>", methods=["DELETE"])
def admin_delete_step(step_id: int):
    denied = _require_admin()
    if denied:
        return denied

    steps = _load_pathway_steps()
    if not any(s["id"] == step_id for s in steps):
        return jsonify({"success": False, "error": "Step not found."}), 404
    if len(steps) <= 1:
        return jsonify({"success": False, "error": "Keep at least one pathway step."}), 400

    remaining = [s for s in steps if s["id"] != step_id]
    saved_steps = _save_pathway_steps(remaining)
    return jsonify({"success": True, "steps": saved_steps, "message": "Step removed."})


@app.route("/api/admin/steps/reset", methods=["POST"])
def admin_reset_steps():
    denied = _require_admin()
    if denied:
        return denied
    if PATHWAY_FILE.is_file():
        PATHWAY_FILE.unlink()
    return jsonify({"success": True, "steps": _load_pathway_steps(), "message": "Restored default pathway steps."})


@app.route("/api/admin/training-setup", methods=["GET"])
def admin_get_training_setup():
    denied = _require_admin()
    if denied:
        return denied
    return jsonify({"success": True, "setup": _load_training_setup()})


@app.route("/api/admin/training-setup", methods=["PUT"])
def admin_update_training_setup():
    denied = _require_admin()
    if denied:
        return denied
    data = request.get_json(silent=True) or {}
    try:
        setup = _save_training_setup(data)
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Invalid training setup values."}), 400
    return jsonify({"success": True, "setup": setup, "message": "Training setup updated."})


ORG_LOGO_PATH = BASE_DIR / "static" / "org-logo.png"


@app.route("/api/admin/logo", methods=["GET"])
def admin_get_logo():
    if ORG_LOGO_PATH.is_file():
        return jsonify({"success": True, "logoUrl": "/static/org-logo.png"})
    return jsonify({"success": True, "logoUrl": None})


@app.route("/api/admin/logo", methods=["POST"])
def admin_upload_logo():
    denied = _require_admin()
    if denied:
        return denied
    f = request.files.get("logo")
    if not f or not f.filename:
        return jsonify({"success": False, "error": "No file provided."}), 400
    ORG_LOGO_PATH.parent.mkdir(parents=True, exist_ok=True)
    f.save(ORG_LOGO_PATH)
    return jsonify({"success": True, "logoUrl": "/static/org-logo.png", "message": "Logo uploaded."})


def _student_video_proof(uid: str, expected_steps: int | None = None) -> dict:
    steps = _load_pathway_steps()
    expected = expected_steps if expected_steps is not None else len(steps)
    uploaded = 0
    videos = []
    safe_uid = urllib.parse.quote(str(uid or "").strip(), safe="")
    for step in steps:
        path = _step_video_path(uid, step["id"])
        ok = path is not None
        if ok:
            uploaded += 1
        videos.append(
            {
                "id": step["id"],
                "title": step["title"],
                "description": step.get("description") or "",
                "image": step.get("image") or DEFAULT_STEP_IMAGE,
                "uploaded": ok,
                "videoUrl": f"/api/proof/{safe_uid}/videos/{step['id']}" if ok else None,
            }
        )
    return {
        "uploaded_steps": uploaded,
        "expected_steps": expected,
        "video_proof": f"{uploaded}/{expected}",
        "videos": videos,
        "videos_complete": expected > 0 and uploaded >= expected,
    }


def _verify_lookup(cert_id: str) -> dict:
    key = str(cert_id or "").strip()
    student = get_student_by_uid(key) or get_student_by_certificate(key)
    cert = _find_certificate(key)
    if not student and cert:
        student = get_student_by_uid(str(cert.get("uid") or cert.get("certificateId") or ""))
    if not student and not cert:
        return {"found": False, "certId": key}

    uid = str((student or {}).get("uid") or (cert or {}).get("uid") or key).strip()
    proof = _student_video_proof(uid)
    filename = str((cert or {}).get("filename") or "").strip()
    pdf_ok = bool(filename and (OUTPUT_DIR / filename).is_file())
    assessment_passed = bool(student and student.get("assessment_completed_at"))
    certificate_approved = pdf_ok or bool(student and (student.get("certificate_number") or student.get("issue_date")))
    approved = bool(proof["videos_complete"] and assessment_passed and certificate_approved)
    pdf_url = url_for("serve_generated", filename=filename, _external=True) if pdf_ok else None

    public_cert = None
    if cert or certificate_approved:
        public_cert = {
            "certificateId": (cert or {}).get("certificateId") or uid,
            "uid": uid,
            "candidateName": (cert or {}).get("candidateName") or (student or {}).get("name") or "",
            "courseName": (cert or {}).get("courseName") or (student or {}).get("course_name") or "",
            "grade": (cert or {}).get("grade") or "Excellent",
            "certificateNumber": (cert or {}).get("certificateNumber")
            or (student or {}).get("certificate_number")
            or "",
            "issueDate": (cert or {}).get("issueDate") or (student or {}).get("issue_date") or "",
        }

    return {
        "found": True,
        "approved": approved,
        "certId": uid,
        "student": student,
        "cert": public_cert,
        "pdfUrl": pdf_url,
        "downloadUrl": f"/generated/{filename}?download=1" if pdf_ok else None,
        "videos": proof["videos"],
        "videosComplete": proof["videos_complete"],
        "uploadedSteps": proof["uploaded_steps"],
        "expectedSteps": proof["expected_steps"],
        "assessmentPassed": assessment_passed,
        "certificateApproved": certificate_approved,
        "brand": APP_BRAND,
    }


@app.route("/api/proof/<uid>/videos/<int:step_id>")
def verify_step_video(uid: str, step_id: int):
    path = _step_video_path(uid, step_id)
    if not path:
        abort(404)
    mime = {
        ".mp4": "video/mp4",
        ".m4v": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".qt": "video/quicktime",
        ".mkv": "video/x-matroska",
        ".3gp": "video/3gpp",
    }.get(path.suffix.lower(), "application/octet-stream")
    return send_from_directory(path.parent, path.name, mimetype=mime, as_attachment=False)


@app.route("/api/students", methods=["GET"])
def api_list_students():
    return jsonify({"success": True, "students": list_students()})


@app.route("/api/students/<uid>", methods=["GET"])
def api_get_student(uid: str):
    student = get_student_by_uid(uid)
    if not student:
        return jsonify({"success": False, "error": "Student not found.", "uid": uid}), 404
    return jsonify({"success": True, "student": student})


@app.route("/api/students/certificate/<path:cert_no>", methods=["GET"])
def api_get_student_by_cert(cert_no: str):
    student = get_student_by_certificate(cert_no)
    if not student:
        return jsonify({"success": False, "error": "Certificate not found.", "certificate_number": cert_no}), 404
    return jsonify({"success": True, "student": student})


@app.route("/api/admin/students", methods=["GET"])
def admin_list_students():
    denied = _require_admin()
    if denied:
        return denied
    steps = _load_pathway_steps()
    expected = len(steps)
    records = []
    for s in list_students():
        proof = _student_video_proof(s.get("uid", ""), expected)
        records.append(
            {
                **s,
                **proof,
                "assessment_recorded": bool(s.get("assessment_completed_at")),
                "certificate_recorded": bool(s.get("certificate_number") or s.get("issue_date")),
            }
        )
    return jsonify({"success": True, "students": records})


@app.route("/api/admin/students", methods=["POST"])
def admin_upsert_student():
    denied = _require_admin()
    if denied:
        return denied

    data = request.form.to_dict() if request.form else (request.get_json(silent=True) or {})
    uid = str(data.get("uid", "")).strip()
    name = str(data.get("name", "")).strip()
    if not uid or not name:
        return jsonify({"success": False, "error": "UID and name are required."}), 400

    image_path = str(data.get("image_path") or "").strip() or None
    if "image" in request.files and (request.files["image"].filename or "").strip():
        photo = request.files["image"]
        ext = Path(photo.filename).suffix.lower()
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            return jsonify({"success": False, "error": "Photo must be JPG, PNG, or WebP."}), 400
        safe_uid = re.sub(r"[^A-Za-z0-9_-]+", "-", uid).strip("-").lower() or "student"
        filename = f"{safe_uid}{ext}"
        dest = BASE_DIR / "static" / "students" / filename
        dest.parent.mkdir(parents=True, exist_ok=True)
        photo.save(dest)
        image_path = f"/static/students/{filename}"

    try:
        student = upsert_student(
            {
                "uid": uid,
                "name": name,
                "father_name": str(data.get("father_name", "")).strip(),
                "course_name": str(data.get("course_name", "")).strip() or "Training Course",
                "batch_start": str(data.get("batch_start", "")).strip() or date.today().isoformat(),
                "batch_end": str(data.get("batch_end", "")).strip() or date.today().isoformat(),
                "certificate_number": str(data.get("certificate_number", "")).strip() or None,
                "issue_date": str(data.get("issue_date", "")).strip() or None,
                "image_path": image_path,
            }
        )
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    return jsonify({"success": True, "student": student, "students": list_students()})


@app.route("/health")
def health():
    return jsonify({"status": "ok", "database": "mysql", "students": len(list_students())})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
