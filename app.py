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
from datetime import date, datetime, timezone
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
from template_registry import list_available_courses
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
    PRACTICAL_MAX_SECONDS,
    PRACTICAL_MIN_SECONDS,
)
from db import (
    ADMISSION_COURSES,
    admit_student,
    get_student_by_certificate,
    get_student_by_email_and_certificate,
    get_student_by_uid,
    get_student_by_uid_and_certificate,
    init_db,
    list_students,
    next_uid,
    delete_student,
    save_student_certificate,
    delete_student_certificate,
    seed_students,
    update_student_status,
    upsert_student,
    set_student_image_path,
    mark_student_milestone,
    public_student_view,
    get_video_reviews,
    set_video_review,
    set_all_video_reviews,
    set_trainer_score,
    set_week_score,
    set_trainer_grade,
    clear_videos_verified,
    create_video_access_request,
    get_valid_video_access,
    list_video_access_requests,
    sync_all_app_data_to_lms,
)
from qr_style import qr_png_bytes

BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
DATA_DIR = BASE_DIR / "data"
CERTIFICATES_FILE = DATA_DIR / "certificates.json"
PATHWAY_FILE = DATA_DIR / "assessment_path.json"
TRAINING_SETUP_FILE = DATA_DIR / "training_setup.json"
INSTITUTE_COURSES_FILE = DATA_DIR / "institute_courses.json"
PATHWAY_ASSETS_DIR = BASE_DIR / "static" / "pathway"
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
TEMPLATES_PDF_DIR = BASE_DIR / "templates_pdf"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
TEMPLATES_PDF_DIR.mkdir(parents=True, exist_ok=True)
PATHWAY_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

ADMIN_UID = os.environ.get("ADMIN_UID", "21EUROTECH001").strip().upper()
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "eurotech@gmail.com").strip().lower()
INSTITUTE_NAME = os.environ.get("INSTITUTE_NAME", "Eurotech").strip() or "Eurotech"
CERTIFICATE_API_URL = (
    os.environ.get("CERTIFICATE_API_URL")
    or os.environ.get("VITE_CERTIFICATE_API_URL")
    or "https://damnart-ai-guladab.n8n-wsk.com/webhook-test/certificate"
).rstrip("/")
PLUMBING_COURSE_NAME = "Professional Plumbing Training Program"
PLUMBING_TEMPLATE_FILE = "Professional plumbing tarining program.pdf"
CERTIFICATE_API_FALLBACK = "https://certificate-generation-navy.vercel.app/generate-certificate"
SFTLMS_VERIFY_URL = os.environ.get("SFTLMS_VERIFY_URL", "https://assessment.sftlms.com/verify").rstrip("/")
# Passport photo box on the plumbing landscape template (PDF points, origin bottom-left).
PLUMBING_PHOTO_BOX = {"x": 1193.0, "y": 552.0, "w": 159.0, "h": 238.0}
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
STUDENT_PHOTOS_DIR = BASE_DIR / "static" / "students"
STUDENT_PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_STEP_IMAGE = "/static/images/week1-plumbing-tools.jpg"

# Ensure database exists (sample students are not auto-loaded on startup)
init_db()

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
    if origin in {
        "https://sftlms.com",
        "https://www.sftlms.com",
        "https://assessment.sftlms.com",
        "https://assesment.sftlms.com",
    }:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Vary"] = "Origin"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
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


def _delete_issued_certificate(uid: str) -> None:
    key = str(uid or "").strip()
    if not key:
        return
    existing = _find_certificate(key)
    filename = str((existing or {}).get("filename") or "").strip()
    if filename:
        path = OUTPUT_DIR / Path(filename).name
        if path.is_file():
            path.unlink(missing_ok=True)
    certs = _load_certificates()
    wanted = key.upper()
    for stored_key in list(certs.keys()):
        rec = certs.get(stored_key)
        if str(stored_key).strip().upper() == wanted:
            certs.pop(stored_key, None)
            continue
        if isinstance(rec, dict):
            stored = str(rec.get("uid") or rec.get("certificateId") or "").strip().upper()
            if stored == wanted:
                certs.pop(stored_key, None)
    _save_certificates(certs)
    for extra in OUTPUT_DIR.glob(f"{key}*"):
        if extra.is_file() and extra.suffix.lower() in {".pdf", ".png"}:
            extra.unlink(missing_ok=True)
    delete_student_certificate(key)


def _local_verify_url(cert_id: str, uid: str = "", certificate_number: str = "") -> str:
    """QR / share link opens the public verify website with UID + certificate number."""
    number = str(certificate_number or cert_id or "").strip()
    roll = str(uid or cert_id or "").strip()
    params: dict[str, str] = {}
    if roll:
        params["uid"] = roll
    if number:
        params["number"] = number
        params["q"] = number
    site = os.environ.get("VERIFY_PUBLIC_URL", "").rstrip("/") or _public_base_url()
    base = f"{site}/verify"
    if params:
        return f"{base}?{urllib.parse.urlencode(params)}"
    return base


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


def _practical_video_path(uid: str) -> Path | None:
    user_dir = _uid_upload_dir(uid)
    if not user_dir.is_dir():
        return None
    for ext in ALLOWED_VIDEO_EXTENSIONS:
        candidate = user_dir / f"practical{ext}"
        if candidate.is_file():
            return candidate
    return None


def _pathway_videos_complete(uid: str, expected: int | None = None) -> bool:
    steps = _training_pathway_steps()
    need = expected if expected is not None else len(steps)
    if need <= 0:
        return False
    uploaded = sum(1 for step in steps if _step_video_path(uid, step["id"]))
    return uploaded >= need


def _student_upload_dir(progress: dict) -> Path:
    uid = str(progress.get("student_uid") or "").strip()
    if uid:
        return _uid_upload_dir(uid)
    if not session.get("session_token"):
        session["session_token"] = secrets.token_hex(8)
    return UPLOADS_DIR / str(session["session_token"])


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
            uid=str(record.get("uid") or cert_id),
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
    kind = str(raw.get("kind") or "").strip().lower()
    if kind == "practical" or "final assessment" in title.lower():
        kind = "practical"
        min_seconds = PRACTICAL_MIN_SECONDS
        max_seconds = PRACTICAL_MAX_SECONDS
    else:
        kind = "pathway"
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
        "kind": kind,
    }


def _training_pathway_steps() -> list[dict]:
    return [s for s in _load_pathway_steps() if s.get("kind") != "practical"]


def _practical_pathway_step() -> dict | None:
    return next((s for s in _load_pathway_steps() if s.get("kind") == "practical"), None)


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
        "videos_verified": False,
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


def _review_map(uid: str) -> dict:
    return {str(k): str(v).strip().lower() for k, v in (get_video_reviews(uid) or {}).items()}


def _is_reupload(reviews: dict, key) -> bool:
    return str(reviews.get(str(key), "")).lower() == "reupload"


def _apply_reviews_to_progress(progress: dict) -> list[str]:
    uid = str(progress.get("student_uid") or "").strip()
    if not uid:
        return []
    reviews = _review_map(uid)
    redo = [k for k, status in reviews.items() if status == "reupload"]
    completed = [i for i in (progress.get("completed_steps") or []) if not _is_reupload(reviews, i)]
    if _is_reupload(reviews, "practical"):
        progress["assessment_passed"] = False
        progress["videos_verified"] = False
        practical_step = _practical_pathway_step()
        if practical_step:
            completed = [i for i in completed if i != practical_step["id"]]
    progress["completed_steps"] = completed
    return redo


def _all_videos_approved(uid: str) -> bool:
    proof = _student_video_proof(uid)
    if not proof.get("all_videos_complete"):
        return False
    reviews = _review_map(uid)
    for video in proof.get("videos") or []:
        key = str(video.get("id"))
        if reviews.get(key) != "approved":
            return False
    return True
    """Certificate unlocks after trainer verifies all pathway + practical videos."""
    steps_total = total_steps if total_steps is not None else len(_training_pathway_steps())
    uid = str(progress.get("student_uid") or "").strip()
    videos_done = len(progress.get("completed_steps") or []) >= steps_total
    if uid:
        _apply_reviews_to_progress(progress)
        videos_done = _pathway_videos_complete(uid, steps_total) and not any(
            _is_reupload(_review_map(uid), s["id"]) for s in _training_pathway_steps()
        )
        reviews = _review_map(uid)
        if _practical_video_path(uid) and not _is_reupload(reviews, "practical"):
            progress["assessment_passed"] = True
            if not progress.get("assessment_completed_at"):
                progress["assessment_completed_at"] = _iso(_now_utc())
        elif _is_reupload(reviews, "practical"):
            progress["assessment_passed"] = False
        student = get_student_by_uid(uid)
        if student and student.get("videos_verified_at") and _all_videos_approved(uid):
            progress["videos_verified"] = True
        else:
            progress["videos_verified"] = False
    assessment_done = bool(progress.get("assessment_passed"))
    trainer_verified = bool(progress.get("videos_verified"))
    videos_at = _parse_iso_dt(progress.get("videos_completed_at"))
    assess_at = _parse_iso_dt(progress.get("assessment_completed_at"))
    if videos_done and videos_at is None:
        videos_at = _now_utc()
        progress["videos_completed_at"] = _iso(videos_at)
    if assessment_done and assess_at is None:
        assess_at = _now_utc()
        progress["assessment_completed_at"] = _iso(assess_at)

    ready = bool(videos_done and assessment_done and trainer_verified)
    return {
        "certificate_ready": ready,
        "certificate_ready_at": _iso(_now_utc()) if ready else None,
        "wait_seconds": 0,
        "videos_done": videos_done,
        "assessment_done": assessment_done,
        "trainer_verified": trainer_verified,
        "awaiting_trainer": bool(videos_done and assessment_done and not trainer_verified),
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


def _add_months(start_d: date, months: int) -> date:
    month_index = start_d.month - 1 + int(months)
    year = start_d.year + month_index // 12
    month = month_index % 12 + 1
    days_in_month = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    day = min(start_d.day, days_in_month[month - 1])
    return date(year, month, day)


def _public_student_photo_url(student: dict) -> str | None:
    stored = str(student.get("image_path") or "").strip()
    photo = _student_photo_file(stored)
    if photo:
        return f"/static/students/{photo.name}"
    uid = str(student.get("uid") or "").strip()
    if not uid:
        return None
    safe = re.sub(r"[^A-Za-z0-9_-]+", "-", uid).strip("-").lower() or "student"
    digits = re.search(r"(\d{3})$", uid)
    names: list[str] = []
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        names.append(f"{safe}{ext}")
        if digits:
            names.append(f"plm-{digits.group(1)}{ext}")
    for name in names:
        candidate = STUDENT_PHOTOS_DIR / name
        if candidate.is_file():
            return f"/static/students/{name}"
    return None


def _persist_student_photo_url(uid: str, image_path: str) -> None:
    set_student_image_path(uid, image_path)


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
            uid=uid,
            certificate_number=derived_certificate_number,
        ),
        "issueDate": _to_dd_mm_yyyy(student.get("issue_date") or student.get("batch_end")),
        "startDate": _to_dd_mm_yyyy(student.get("batch_start")),
        "endDate": _to_dd_mm_yyyy(student.get("batch_end")),
        "trainingDuration": _training_duration_months(student.get("batch_start"), student.get("batch_end"))
        or ("1" if "plumb" in course.lower() else ""),
    }
    if photo_data:
        # n8n/HTML templates typically bind <img src> to `photo` / `image`.
        payload["photo"] = photo_data
        payload["image"] = photo_data
        payload["candidatePhoto"] = photo_data
        payload["photoUrl"] = photo_data
        payload["candidatePhotoUrl"] = photo_data
        payload["imageUrl"] = photo_data
    father = str(student.get("father_name") or "").strip()
    phone = str(student.get("phone") or "").strip()
    email = str(student.get("email") or "").strip().lower()
    if father:
        payload["fatherName"] = father
        payload["father_name"] = father
    if phone:
        payload["phone"] = phone
        payload["contact"] = phone
    if email:
        payload["email"] = email
        payload["learnerEmail"] = email
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
        "logoUrl": _org_logo_url(),
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
    if payload.get("found"):
        payload = dict(payload)
        payload["videos"] = _lock_public_videos(payload.get("videos") or [])
    return jsonify(payload)


def _lock_public_videos(videos: list) -> list:
    locked = []
    for item in videos or []:
        row = dict(item)
        row["videoUrl"] = None
        row["locked"] = True
        locked.append(row)
    return locked


def _cors_verify(resp):
    """Allow verify API calls from this app's public origin and known LMS hosts."""
    origin = str(request.headers.get("Origin") or "").rstrip("/")
    allowed = {
        "https://sftlms.com",
        "https://www.sftlms.com",
        "https://assessment.sftlms.com",
        "https://assesment.sftlms.com",
        "http://assessment.sftlms.com",
        "http://assesment.sftlms.com",
    }
    public = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    if public:
        allowed.add(public)
    extra = os.environ.get("VERIFY_CORS_ORIGINS", "")
    for item in extra.split(","):
        item = item.strip().rstrip("/")
        if item:
            allowed.add(item)
    # Same-host browser calls (any scheme) when Origin matches this request host
    try:
        host_origin = request.host_url.rstrip("/")
        if host_origin:
            allowed.add(host_origin)
            if host_origin.startswith("http://"):
                allowed.add("https://" + host_origin[len("http://") :])
            elif host_origin.startswith("https://"):
                allowed.add("http://" + host_origin[len("https://") :])
    except RuntimeError:
        pass
    if origin and origin in allowed:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Vary"] = "Origin"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


@app.route("/api/certificates/verify", methods=["GET", "OPTIONS"])
def lms_certificates_verify():
    """Public verify API — looks up students in this app's DATABASE_URL (MySQL/SQLite)."""
    if request.method == "OPTIONS":
        return _cors_verify(app.make_response(("", 204)))

    uid = str(request.args.get("uid") or request.args.get("delegate") or "").strip()
    email = str(request.args.get("email") or "").strip().lower()
    number = str(
        request.args.get("number")
        or request.args.get("q")
        or request.args.get("id")
        or ""
    ).strip()
    if not number:
        return _cors_verify(
            jsonify({"ok": False, "verified": False, "message": "Certificate number is required."})
        ), 400

    student = None
    try:
        if uid:
            student = get_student_by_uid_and_certificate(uid, number)
        elif email and "@" in email:
            student = get_student_by_email_and_certificate(email, number)
        else:
            return _cors_verify(
                jsonify({"ok": False, "verified": False, "message": "Student UID is required."})
            ), 400
    except Exception as exc:
        app.logger.exception("Verify DB lookup failed: %s", exc)
        return _cors_verify(
            jsonify(
                {
                    "ok": False,
                    "verified": False,
                    "message": "Verification service temporarily unavailable. Please try again.",
                }
            )
        ), 503

    if not student:
        return _cors_verify(
            jsonify(
                {
                    "ok": False,
                    "verified": False,
                    "message": "No certificate matches this UID and certificate number.",
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
        image_url = str(row.get("image") or "")
        if image_url.startswith("/"):
            row["image"] = f"{base}{image_url}"
        row["videoUrl"] = None
        row["locked"] = True
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
        "source": "app_database",
    }
    return _cors_verify(jsonify(body))


@app.route("/api/certificates/verify/video-access", methods=["POST", "OPTIONS"])
def lms_certificates_video_access():
    if request.method == "OPTIONS":
        return _cors_verify(app.make_response(("", 204)))

    payload = request.get_json(silent=True) or {}
    uid = str(payload.get("uid") or "").strip()
    number = str(payload.get("number") or payload.get("certificateNumber") or "").strip()
    visitor_name = str(payload.get("name") or "").strip()
    organisation = str(payload.get("organisation") or payload.get("organization") or "").strip()
    email = str(payload.get("email") or "").strip().lower()
    location = str(payload.get("location") or "").strip()

    if not uid or not number:
        return _cors_verify(jsonify({"ok": False, "message": "UID and certificate number are required."})), 400
    if not visitor_name or not organisation or not email or not location:
        return _cors_verify(
            jsonify({"ok": False, "message": "Name, organisation, email, and location are required."})
        ), 400
    if "@" not in email or "." not in email.split("@")[-1]:
        return _cors_verify(jsonify({"ok": False, "message": "Enter a valid email address."})), 400

    student = get_student_by_uid_and_certificate(uid, number)
    if not student:
        return _cors_verify(jsonify({"ok": False, "message": "Certificate record not found."})), 404

    token = secrets.token_urlsafe(32)
    saved = create_video_access_request(
        uid=student["uid"],
        certificate_number=str(student.get("certificate_number") or number),
        visitor_name=visitor_name,
        organisation=organisation,
        email=email,
        location=location,
        token=token,
    )
    pack = _verify_lookup(student["uid"])
    base = _public_base_url()
    videos = []
    for item in pack.get("videos") or []:
        row = dict(item)
        video_url = str(row.get("videoUrl") or "")
        image_url = str(row.get("image") or "")
        if video_url.startswith("/"):
            video_url = f"{base}{video_url}"
        if video_url:
            sep = "&" if "?" in video_url else "?"
            row["videoUrl"] = f"{video_url}{sep}access={urllib.parse.quote(token)}"
        else:
            row["videoUrl"] = None
        if image_url.startswith("/"):
            row["image"] = f"{base}{image_url}"
        row["locked"] = False
        videos.append(row)

    return _cors_verify(
        jsonify(
            {
                "ok": True,
                "saved": True,
                "token": token,
                "request": {
                    "id": saved.get("id"),
                    "uid": saved.get("uid"),
                    "certificateNumber": saved.get("certificate_number"),
                    "name": saved.get("visitor_name"),
                    "organisation": saved.get("organisation"),
                    "email": saved.get("email"),
                    "location": saved.get("location"),
                    "createdAt": saved.get("created_at"),
                },
                "videos": videos,
                "message": "Details saved. You can now watch the training videos.",
            }
        )
    )


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
    """Serve the React production build (institute login is the start screen)."""
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
    # Never steal real API / asset routes; /verify is handled by dedicated SPA routes.
    if path.startswith(("api/", "static/", "generated/", "qr/")) or path in {
        "health",
        "manifest.json",
        "sw.js",
    }:
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
    redo = _apply_reviews_to_progress(progress)
    training = _training_pathway_steps()
    training_ids = {s["id"] for s in training}
    total_steps = len(training)
    completed_training = [i for i in (progress.get("completed_steps") or []) if i in training_ids]
    completed = len(completed_training)
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
            "trainer_verified": wait_info["trainer_verified"],
            "awaiting_trainer": wait_info["awaiting_trainer"],
            "assessment_done": wait_info["assessment_done"],
            "reupload_steps": [int(k) for k in redo if str(k).isdigit()],
            "practical_reupload": "practical" in redo,
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

    if _is_institute_login(uid, email):
        session["is_admin"] = True
        session["institute_uid"] = uid
        session["institute_name"] = INSTITUTE_NAME
        session.modified = True
        return jsonify({"success": True, "role": "admin"})

    student = get_student_by_uid(uid)
    if not student:
        return jsonify(
            {
                "success": False,
                "error": "UID not found. Check your Roll No.",
            }
        ), 404

    registered = str(student.get("email") or "").strip().lower()
    if not registered:
        return jsonify(
            {
                "success": False,
                "error": "No Gmail is saved for this UID.",
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
    training = _training_pathway_steps()
    reviews = _review_map(student["uid"])
    completed = [
        s["id"]
        for s in training
        if _step_video_path(student["uid"], s["id"]) and not _is_reupload(reviews, s["id"])
    ]
    progress["completed_steps"] = completed
    if student.get("videos_completed_at") or len(completed) >= len(training):
        progress["videos_completed_at"] = str(student.get("videos_completed_at") or _iso(_now_utc()))
    if (student.get("assessment_completed_at") or _practical_video_path(student["uid"])) and not _is_reupload(
        reviews, "practical"
    ):
        progress["assessment_completed_at"] = str(student.get("assessment_completed_at") or _iso(_now_utc()))
        progress["assessment_passed"] = True
        practical_step = _practical_pathway_step()
        if practical_step and practical_step["id"] not in progress["completed_steps"]:
            progress["completed_steps"] = [*progress["completed_steps"], practical_step["id"]]
    if student.get("videos_verified_at") and _all_videos_approved(student["uid"]):
        progress["videos_verified"] = True
    existing_cert = _find_certificate(student["uid"])
    if existing_cert:
        progress["certificate_id"] = existing_cert.get("certificateId") or student["uid"]
        progress["pdf_filename"] = existing_cert.get("filename")
    session["progress"] = progress
    session["session_token"] = re.sub(r"[^A-Za-z0-9_-]+", "-", student["uid"]).lower()
    session.modified = True

    update_student_status(student["uid"], "in_training")

    return jsonify({"success": True, "student": public_student_view(student), "progress": progress})


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
            "message": f"Admission saved. Your UID is {student['uid']}.",
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
    if step.get("kind") == "practical":
        return jsonify({"success": False, "error": "Submit the Final Assessment from the practical screen."}), 400

    training_ids = {s["id"] for s in _training_pathway_steps()}
    uid = str(progress.get("student_uid") or "").strip()
    reviews = _review_map(uid) if uid else {}
    redo = _is_reupload(reviews, step_id)
    completed_training = [i for i in (progress.get("completed_steps") or []) if i in training_ids]
    expected_next = None
    for s in _training_pathway_steps():
        if s["id"] not in completed_training:
            expected_next = s["id"]
            break
    if redo:
        pass
    elif expected_next is not None and step_id != expected_next:
        if step_id in completed_training:
            return jsonify({"success": True, "message": "Step already completed.", "progress": progress})
        return jsonify({"success": False, "error": "Complete previous steps first."}), 400
    elif expected_next is None:
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

    user_dir = _student_upload_dir(progress)
    user_dir.mkdir(parents=True, exist_ok=True)

    filename = f"step_{step_id}{ext}"
    video.save(user_dir / filename)

    completed = progress.get("completed_steps", [])
    if step_id not in completed:
        completed.append(step_id)
        completed.sort()
    progress["completed_steps"] = completed
    uid = str(progress.get("student_uid") or "").strip()
    if uid:
        set_video_review(uid, str(step_id), "pending")
    all_done = _pathway_videos_complete(uid) if uid else len([i for i in completed if i in training_ids]) >= len(training_ids)
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


@app.route("/api/assessment/video", methods=["POST"])
def upload_practical_video():
    progress = _get_progress()
    if not progress.get("candidate_name"):
        return jsonify({"success": False, "error": "Please register first."}), 400
    uid = str(progress.get("student_uid") or "").strip()
    if not uid:
        return jsonify({"success": False, "error": "Log in with your UID first."}), 400
    if len([i for i in (progress.get("completed_steps") or []) if i in {s["id"] for s in _training_pathway_steps()}]) < len(
        _training_pathway_steps()
    ) and not _pathway_videos_complete(uid):
        return jsonify({"success": False, "error": "Complete all training videos first."}), 400

    if "video" not in request.files:
        return jsonify({"success": False, "error": "No video file uploaded."}), 400

    video = request.files["video"]
    filename = (video.filename or "").strip()
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        ext = VIDEO_MIME_TO_EXT.get((video.mimetype or "").lower(), "")
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        return jsonify(
            {"success": False, "error": "Unsupported video. Use the phone camera or upload MP4 / MOV."}
        ), 400

    video.stream.seek(0, os.SEEK_END)
    file_size = video.stream.tell()
    video.stream.seek(0)
    if file_size > VIDEO_MAX_UPLOAD_BYTES:
        return jsonify({"success": False, "error": "Video file is too large. Maximum upload size is 300 MB."}), 400

    duration = request.form.get("duration", type=float)
    duration_unknown = request.form.get("durationUnknown") in ("1", "true", "yes")
    if duration_unknown or duration is None or duration <= 0 or duration == float("inf"):
        if file_size < 700 * 1024:
            return jsonify({"success": False, "error": "Video is too small. Record about 2 minutes."}), 400
    else:
        if duration < PRACTICAL_MIN_SECONDS:
            return jsonify(
                {
                    "success": False,
                    "error": f"Video too short. Record about 2 minutes (minimum {PRACTICAL_MIN_SECONDS} seconds).",
                }
            ), 400
        if duration > PRACTICAL_MAX_SECONDS:
            return jsonify(
                {
                    "success": False,
                    "error": f"Video too long. Maximum {PRACTICAL_MAX_SECONDS} seconds allowed.",
                }
            ), 400

    user_dir = _uid_upload_dir(uid)
    user_dir.mkdir(parents=True, exist_ok=True)
    video.save(user_dir / f"practical{ext}")
    set_video_review(uid, "practical", "pending")

    stamp = _iso(_now_utc())
    progress["assessment_passed"] = True
    progress["assessment_score"] = 100
    practical_step = _practical_pathway_step()
    completed = list(progress.get("completed_steps") or [])
    if practical_step and practical_step["id"] not in completed:
        completed.append(practical_step["id"])
        completed.sort()
        progress["completed_steps"] = completed
    if not progress.get("assessment_completed_at"):
        progress["assessment_completed_at"] = stamp
        mark_student_milestone(uid, assessment_completed_at=stamp)
        update_student_status(uid, "assessment_submitted")
    progress["videos_verified"] = False
    session["progress"] = progress
    session.modified = True
    wait_info = _certificate_wait_info(progress)
    return jsonify(
        {
            "success": True,
            "passed": True,
            "awaiting_trainer": wait_info["awaiting_trainer"],
            "certificate_ready": wait_info["certificate_ready"],
        }
    )


@app.route("/api/assessment/submit", methods=["POST"])
def submit_assessment():
    progress = _get_progress()
    if not progress.get("candidate_name"):
        return jsonify({"success": False, "error": "Please register first."}), 400

    if not _pathway_videos_complete(str(progress.get("student_uid") or "")) and len(
        [i for i in (progress.get("completed_steps") or []) if i in {s["id"] for s in _training_pathway_steps()}]
    ) < len(_training_pathway_steps()):
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
    _delete_issued_certificate(uid)
    student = get_student_by_uid(uid) or student
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
                "wait_seconds": 0,
                "awaiting_trainer": wait_info["awaiting_trainer"],
                "certificate_ready_at": wait_info["certificate_ready_at"],
            }
        )

    student = get_student_by_uid(uid)
    if not student:
        return jsonify({"success": False, "error": f"Trainer {uid} not found."}), 404
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
        return jsonify({"success": False, "error": "Log in with a trainer UID first."}), 400

    student = get_student_by_uid(uid)
    if not student:
        return jsonify({"success": False, "error": f"Trainer {uid} not found."}), 404

    batch_start = str(data.get("batch_start") or data.get("startDate") or student.get("batch_start") or "")[:10]
    batch_end = str(data.get("batch_end") or student.get("batch_end") or "")[:10]
    issue_raw = str(data.get("issue_date") or data.get("issueDate") or student.get("issue_date") or "")[:10]
    student = dict(student)
    if batch_start:
        student["batch_start"] = batch_start
    if batch_end:
        student["batch_end"] = batch_end
    if issue_raw:
        student["issue_date"] = issue_raw

    is_admin = bool(session.get("is_admin"))
    if is_admin and not issue_raw:
        issue_raw = str(student.get("issue_date") or student.get("batch_end") or date.today().isoformat())[:10]
        student["issue_date"] = issue_raw

    existing = _find_certificate(uid)
    filename = str((existing or {}).get("filename") or "").strip()
    if filename and (OUTPUT_DIR / filename).is_file() and not is_admin:
        record = existing or {"certificateId": uid, "uid": uid, "filename": filename}
        progress["certificate_id"] = record.get("certificateId") or uid
        progress["pdf_filename"] = filename
        session["progress"] = progress
        session.modified = True
        return jsonify(_certificate_public(record))

    if is_admin:
        mark_student_milestone(uid, videos_verified_at=_iso(_now_utc()))
        if batch_start or batch_end or issue_raw:
            upsert_student(
                {
                    "uid": uid,
                    "name": student["name"],
                    "course_name": student.get("course_name") or "",
                    "batch_start": student.get("batch_start"),
                    "batch_end": student.get("batch_end"),
                    "issue_date": student.get("issue_date"),
                }
            )
            student = get_student_by_uid(uid) or student
        grade = str(data.get("grade") or student.get("trainer_grade") or "").strip()
        if grade not in CERTIFICATE_GRADES:
            return jsonify({"success": False, "error": "Select Outstanding, Excellent, or Good first, then generate the certificate."}), 400
    if not is_admin:
        wait_info = _certificate_wait_info(progress)
        if not wait_info["videos_done"]:
            return jsonify({"success": False, "error": "Upload all training videos first."}), 400
        if not wait_info["assessment_done"]:
            return jsonify({"success": False, "error": "Upload the 2-minute practical assessment video first."}), 400
        if not wait_info["trainer_verified"]:
            return jsonify(
                {
                    "success": False,
                    "pending": True,
                    "error": "Waiting for your trainer to verify all videos. Certificate download unlocks after approval.",
                    "awaiting_trainer": True,
                }
            ), 403

    if not is_admin:
        grade = str(data.get("grade") or student.get("trainer_grade") or "").strip() or "Excellent"
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
    from flask import Response

    student = get_student_by_uid(cert_id) or get_student_by_certificate(cert_id)
    roll = str((student or {}).get("uid") or cert_id)
    number = str((student or {}).get("certificate_number") or cert_id)
    verify_url = _local_verify_url(cert_id, uid=roll, certificate_number=number)
    png = qr_png_bytes(verify_url)
    return Response(png, mimetype="image/png")


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


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    session.modified = True
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


def _is_institute_login(uid: str, email: str) -> bool:
    allowed = [
        (ADMIN_UID, ADMIN_EMAIL),
        ("21EUROTECH001", "eurotech@gmail.com"),
        ("21ADMIN2021", "sft@admin.com"),
    ]
    for u, e in allowed:
        if uid == u and email == e:
            return True
    return False


def _builtin_institute_courses() -> list[dict]:
    return [
        {
            "id": "plumbing",
            "title": "Professional Plumbing Foundation Course",
            "description": "One-month hands-on foundation: tools & safety, pipe fitting, sanitary drainage, and final site testing — with weekly video proofs and a verified certificate.",
            "image": "/static/images/hero-plumbing.jpg",
            "built": True,
            "duration_months": 1,
        }
    ]


def _load_custom_courses() -> list[dict]:
    if not INSTITUTE_COURSES_FILE.is_file():
        return []
    try:
        data = json.loads(INSTITUTE_COURSES_FILE.read_text())
        raw = data.get("courses") if isinstance(data, dict) else data
        if not isinstance(raw, list):
            return []
    except (json.JSONDecodeError, OSError):
        return []
    courses = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        course_id = str(row.get("id") or "").strip()
        title = str(row.get("title") or "").strip()
        if not course_id or not title or course_id == "plumbing":
            continue
        courses.append(
            {
                "id": course_id,
                "title": title,
                "description": str(row.get("description") or "").strip(),
                "image": str(row.get("image") or "/static/images/assessment-desk.jpg"),
                "built": bool(row.get("built", False)),
                "duration_months": row.get("duration_months"),
                "batch_start": str(row.get("batch_start") or "").strip()[:10],
                "batch_end": str(row.get("batch_end") or "").strip()[:10],
                "steps": row.get("steps") if isinstance(row.get("steps"), list) else [],
            }
        )
    return courses


def _save_custom_courses(courses: list[dict]) -> None:
    INSTITUTE_COURSES_FILE.parent.mkdir(parents=True, exist_ok=True)
    INSTITUTE_COURSES_FILE.write_text(json.dumps({"courses": courses}, indent=2))


def _load_institute_courses() -> list[dict]:
    return _builtin_institute_courses() + _load_custom_courses()


def _course_slug(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return slug or "course"


def _get_course_by_id(course_id: str) -> dict | None:
    cid = str(course_id or "").strip()
    if not cid:
        return None
    for course in _load_institute_courses():
        if course.get("id") == cid:
            return course
    return None


def _course_pathway_steps(course: dict) -> list[dict]:
    if course.get("built") or course.get("id") == "plumbing":
        return _load_pathway_steps()
    raw_steps = course.get("steps") if isinstance(course.get("steps"), list) else []
    steps: list[dict] = []
    for i, row in enumerate(raw_steps, start=1):
        if not isinstance(row, dict):
            continue
        steps.append(_normalize_step({**row, "kind": "pathway"}, i))
    if not steps:
        return _load_pathway_steps()
    steps.append(
        _normalize_step(
            {
                "title": "Final Assessment",
                "description": "Upload a 2-minute final practical assessment video for this student.",
                "kind": "practical",
                "image": "/static/images/assessment-desk.jpg",
            },
            len(steps) + 1,
        )
    )
    return steps


def _course_student_titles(course: dict) -> set[str]:
    title = str(course.get("title") or "").strip()
    names = {title} if title else set()
    if course.get("id") == "plumbing":
        names.update(
            {
                "Professional Plumbing Foundation Course",
                "Plumbing Foundational Course",
                "Plumbing Foundation Course",
                "Basic Plumbing Foundation Course",
            }
        )
    return names


def _students_for_course(course: dict) -> list[dict]:
    names = _course_student_titles(course)
    if not names:
        return []
    return [s for s in list_students() if str(s.get("course_name") or "").strip() in names]


def _student_video_proof_for_steps(uid: str, steps: list[dict]) -> dict:
    pathway = [s for s in steps if s.get("kind") != "practical"]
    expected = len(pathway)
    uploaded = 0
    videos = []
    safe_uid = urllib.parse.quote(str(uid or "").strip(), safe="")
    reviews = _review_map(uid)
    for step in pathway:
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
                "kind": "pathway",
                "reviewStatus": reviews.get(str(step["id"]), "pending" if ok else "missing"),
                "videoUrl": f"/api/proof/{safe_uid}/videos/{step['id']}" if ok else None,
            }
        )
    practical = _practical_video_path(uid)
    videos.append(
        {
            "id": "practical",
            "title": "Final practical assessment (2 minutes)",
            "description": "Trainer uploads the 2-minute practical assessment video for this student.",
            "image": "/static/images/assessment-desk.jpg",
            "uploaded": practical is not None,
            "kind": "practical",
            "reviewStatus": reviews.get("practical", "pending" if practical else "missing"),
            "videoUrl": f"/api/proof/{safe_uid}/videos/practical" if practical else None,
        }
    )
    practical_ok = practical is not None
    return {
        "uploaded_steps": uploaded,
        "expected_steps": expected,
        "video_proof": f"{uploaded}/{expected}",
        "videos": videos,
        "videos_complete": expected > 0 and uploaded >= expected,
        "practical_uploaded": practical_ok,
        "all_videos_complete": expected > 0 and uploaded >= expected and practical_ok,
    }


CERTIFICATE_GRADES = ("Outstanding", "Excellent", "Good")


def _missing_week_score_titles(student: dict, proof: dict | None = None) -> list[str]:
    uid = str(student.get("uid") or "").strip()
    pack = proof or _student_video_proof(uid)
    scores = student.get("week_scores") if isinstance(student.get("week_scores"), dict) else {}
    missing: list[str] = []
    for video in pack.get("videos") or []:
        key = str(video.get("id"))
        if scores.get(key) is None:
            missing.append(str(video.get("title") or f"Week {key}"))
    return missing


def _validate_video_upload(video, *, min_seconds: int, max_seconds: int, min_bytes: int) -> str | None:
    filename = (video.filename or "").strip()
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        ext = VIDEO_MIME_TO_EXT.get((video.mimetype or "").lower(), "")
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        return "Unsupported video. Use MP4 or MOV."
    video.stream.seek(0, os.SEEK_END)
    file_size = video.stream.tell()
    video.stream.seek(0)
    if file_size > VIDEO_MAX_UPLOAD_BYTES:
        return "Video file is too large. Maximum upload size is 300 MB."
    duration = request.form.get("duration", type=float)
    duration_unknown = request.form.get("durationUnknown") in ("1", "true", "yes")
    if duration_unknown or duration is None or duration <= 0 or duration == float("inf"):
        if file_size < min_bytes:
            return "Video is too small."
    else:
        if duration < min_seconds:
            return f"Video too short. Minimum {min_seconds} seconds required."
        if duration > max_seconds:
            return f"Video too long. Maximum {max_seconds} seconds allowed."
    return None


def _admin_save_student_video(uid: str, step_key: str, video) -> dict:
    student = get_student_by_uid(uid)
    if not student:
        raise ValueError("Student not found.")
    err = None
    if step_key == "practical":
        err = _validate_video_upload(
            video,
            min_seconds=PRACTICAL_MIN_SECONDS,
            max_seconds=PRACTICAL_MAX_SECONDS,
            min_bytes=700 * 1024,
        )
    else:
        try:
            step_id = int(step_key)
        except ValueError as exc:
            raise ValueError("Invalid step.") from exc
        err = _validate_video_upload(
            video,
            min_seconds=VIDEO_MIN_SECONDS,
            max_seconds=VIDEO_MAX_SECONDS,
            min_bytes=500 * 1024,
        )
    if err:
        raise ValueError(err)

    filename_src = (video.filename or "").strip()
    ext = Path(filename_src).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        ext = VIDEO_MIME_TO_EXT.get((video.mimetype or "").lower(), ".mp4")

    user_dir = _uid_upload_dir(uid)
    user_dir.mkdir(parents=True, exist_ok=True)

    if step_key == "practical":
        dest_name = f"practical{ext}"
        video.save(user_dir / dest_name)
        stamp = _iso(_now_utc())
        issue_today = date.today().isoformat()
        mark_student_milestone(uid, assessment_completed_at=stamp, issue_date=issue_today)
        set_video_review(uid, "practical", "pending")
    else:
        step_id = int(step_key)
        dest_name = f"step_{step_id}{ext}"
        video.save(user_dir / dest_name)
        set_video_review(uid, str(step_id), "pending")
        pathway = _training_pathway_steps()
        if _pathway_videos_complete(uid, len(pathway)):
            stamp = _iso(_now_utc())
            mark_student_milestone(uid, videos_completed_at=stamp)

    return _student_video_proof(uid)


def _enrich_student_record(student: dict, steps: list[dict]) -> dict:
    uid = str(student.get("uid") or "").strip()
    proof = _student_video_proof_for_steps(uid, steps)
    cert = _find_certificate(uid)
    cert_public = _certificate_public(cert) if cert else None
    photo_url = _public_student_photo_url(student)
    if photo_url and photo_url != str(student.get("image_path") or "").strip():
        _persist_student_photo_url(uid, photo_url)
    week_scores = student.get("week_scores") if isinstance(student.get("week_scores"), dict) else {}
    scored_videos = []
    for video in proof.get("videos") or []:
        key = str(video.get("id"))
        score = week_scores.get(key)
        if score is None:
            score = week_scores.get(video.get("id"))
        scored_videos.append({**video, "privateScore": score})
    return {
        **student,
        **proof,
        "videos": scored_videos,
        "week_scores": week_scores,
        "image_path": photo_url,
        "assessment_recorded": bool(student.get("assessment_completed_at") or proof.get("practical_uploaded")),
        "certificate_recorded": bool(
            student.get("certificate_number") or student.get("issue_date") or cert_public
        ),
        "trainer_verified": bool(student.get("videos_verified_at")),
        "all_videos_complete": proof.get("all_videos_complete"),
        "practical_uploaded": proof.get("practical_uploaded"),
        "trainer_score": student.get("trainer_score"),
        "trainer_grade": student.get("trainer_grade"),
        "certificate": cert_public,
    }


@app.route("/api/admin/status", methods=["GET"])
def admin_status():
    return jsonify(
        {
            "authenticated": bool(session.get("is_admin")),
            "institute": {
                "uid": session.get("institute_uid") or ADMIN_UID,
                "name": session.get("institute_name") or INSTITUTE_NAME,
            }
            if session.get("is_admin")
            else None,
        }
    )


@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True) or {}
    uid = str(data.get("uid") or "").strip().upper()
    email = str(data.get("email") or "").strip().lower()

    if not uid or not email:
        return jsonify({"success": False, "error": "Enter institute UID and email."}), 400

    if not _is_institute_login(uid, email):
        return jsonify({"success": False, "error": "Invalid institute UID or email."}), 401

    session["is_admin"] = True
    session["institute_uid"] = uid
    session["institute_name"] = INSTITUTE_NAME
    session.modified = True
    return jsonify({"success": True, "institute": {"uid": uid, "name": INSTITUTE_NAME}})


@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.clear()
    session.modified = True
    return jsonify({"success": True})


@app.route("/api/admin/courses", methods=["GET"])
def admin_list_courses():
    denied = _require_admin()
    if denied:
        return denied
    return jsonify({"success": True, "courses": _load_institute_courses()})


@app.route("/api/admin/courses", methods=["POST"])
def admin_add_course():
    denied = _require_admin()
    if denied:
        return denied

    if request.content_type and "multipart" in request.content_type:
        title = str(request.form.get("title") or "").strip()
        description = str(request.form.get("description") or "").strip()
        batch_start = str(request.form.get("batch_start") or "").strip()[:10]
        batch_end = str(request.form.get("batch_end") or "").strip()[:10]
        steps_json = request.form.get("steps", "[]")
        image_file = request.files.get("image")
    else:
        data = request.get_json(silent=True) or {}
        title = str(data.get("title") or "").strip()
        description = str(data.get("description") or "").strip()
        batch_start = str(data.get("batch_start") or "").strip()[:10]
        batch_end = str(data.get("batch_end") or "").strip()[:10]
        steps_json = json.dumps(data.get("steps") or [])
        image_file = None

    if len(title) < 2:
        return jsonify({"success": False, "error": "Enter a course name."}), 400

    if not batch_start or not batch_end:
        return jsonify({"success": False, "error": "Select batch start and end dates."}), 400

    try:
        start_d = datetime.strptime(batch_start, "%Y-%m-%d").date()
        end_d = datetime.strptime(batch_end, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"success": False, "error": "Invalid batch dates."}), 400

    if end_d < start_d:
        return jsonify({"success": False, "error": "Batch end date must be on or after start date."}), 400

    dur = max(1, (end_d.year - start_d.year) * 12 + (end_d.month - start_d.month) + 1)

    try:
        steps = json.loads(steps_json) if isinstance(steps_json, str) else steps_json
        if not isinstance(steps, list):
            steps = []
    except (json.JSONDecodeError, TypeError):
        steps = []
    clean_steps = []
    for s in steps:
        if isinstance(s, dict) and str(s.get("title") or "").strip():
            clean_steps.append({
                "title": str(s["title"]).strip(),
                "description": str(s.get("description") or "").strip(),
            })

    course_id = f"{_course_slug(title)}-{uuid.uuid4().hex[:6]}"

    image_url = "/static/images/assessment-desk.jpg"
    if image_file and image_file.filename:
        ext = Path(image_file.filename).suffix.lower()
        if ext in ALLOWED_IMAGE_EXTENSIONS:
            safe_name = f"course-{course_id}{ext}"
            dest = STATIC_DIR / "images" / safe_name
            dest.parent.mkdir(parents=True, exist_ok=True)
            image_file.save(str(dest))
            image_url = f"/static/images/{safe_name}"

    courses = _load_custom_courses()
    courses.append({
        "id": course_id,
        "title": title,
        "description": description,
        "image": image_url,
        "built": False,
        "duration_months": dur,
        "batch_start": batch_start,
        "batch_end": batch_end,
        "steps": clean_steps,
    })
    _save_custom_courses(courses)
    return jsonify({"success": True, "courses": _load_institute_courses(), "message": f"{title} added."})


@app.route("/api/admin/courses/<course_id>", methods=["DELETE"])
def admin_delete_course(course_id: str):
    denied = _require_admin()
    if denied:
        return denied
    if str(course_id) == "plumbing":
        return jsonify({"success": False, "error": "The plumbing course is built in and cannot be removed."}), 400
    courses = [c for c in _load_custom_courses() if c["id"] != course_id]
    _save_custom_courses(courses)
    return jsonify({"success": True, "courses": _load_institute_courses(), "message": "Course removed."})


@app.route("/api/admin/courses/<course_id>", methods=["GET"])
def admin_get_course(course_id: str):
    denied = _require_admin()
    if denied:
        return denied
    course = _get_course_by_id(course_id)
    if not course:
        return jsonify({"success": False, "error": "Training not found."}), 404
    steps = _course_pathway_steps(course)
    students = [_enrich_student_record(s, steps) for s in _students_for_course(course)]
    return jsonify({"success": True, "course": course, "steps": steps, "students": students})


@app.route("/api/admin/courses/<course_id>/students", methods=["POST"])
def admin_add_course_student(course_id: str):
    denied = _require_admin()
    if denied:
        return denied
    course = _get_course_by_id(course_id)
    if not course:
        return jsonify({"success": False, "error": "Training not found."}), 404

    data = request.form.to_dict() if request.form else (request.get_json(silent=True) or {})
    name = str(data.get("name") or "").strip()
    if not name:
        return jsonify({"success": False, "error": "Student name is required."}), 400

    uid = str(data.get("uid") or "").strip()
    if not uid:
        uid = next_uid(course.get("title") or "")

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
    if not image_path:
        return jsonify({"success": False, "error": "Upload the student photo."}), 400

    batch_start = str(data.get("batch_start") or "").strip()[:10]
    batch_end = str(data.get("batch_end") or "").strip()[:10]
    if not batch_start or not batch_end:
        return jsonify({"success": False, "error": "Enter this student's batch start and end dates."}), 400
    try:
        start_d = datetime.strptime(batch_start, "%Y-%m-%d").date()
        end_d = datetime.strptime(batch_end, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"success": False, "error": "Invalid batch dates."}), 400
    if end_d < start_d:
        return jsonify({"success": False, "error": "Batch end date must be on or after start date."}), 400

    try:
        student = upsert_student(
            {
                "uid": uid,
                "name": name,
                "father_name": str(data.get("father_name") or "").strip(),
                "course_name": course.get("title") or "Training Course",
                "batch_start": batch_start,
                "batch_end": batch_end,
                "image_path": image_path,
                "phone": str(data.get("phone") or "").strip(),
                "email": str(data.get("email") or "").strip().lower(),
                "status": "admitted",
                "issue_date": None,
            }
        )
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    steps = _course_pathway_steps(course)
    proof = _student_video_proof_for_steps(student["uid"], steps)
    enriched = _enrich_student_record(student, steps)
    return jsonify(
        {
            "success": True,
            "message": f"{name} added to {course.get('title')}.",
            "student": enriched,
        }
    )


@app.route("/api/admin/students/<uid>", methods=["DELETE"])
def admin_delete_student(uid: str):
    denied = _require_admin()
    if denied:
        return denied
    uid = str(uid or "").strip()
    if not get_student_by_uid(uid):
        return jsonify({"success": False, "error": "Student not found."}), 404
    delete_student(uid)
    upload_dir = _uid_upload_dir(uid)
    if upload_dir.is_dir():
        for item in upload_dir.iterdir():
            if item.is_file():
                item.unlink(missing_ok=True)
    return jsonify({"success": True, "message": "Student removed."})


@app.route("/api/admin/students/<uid>/photo", methods=["POST"])
def admin_upload_student_photo(uid: str):
    denied = _require_admin()
    if denied:
        return denied
    uid = str(uid or "").strip()
    student = get_student_by_uid(uid)
    if not student:
        return jsonify({"success": False, "error": "Student not found."}), 404
    if "image" not in request.files or not (request.files["image"].filename or "").strip():
        return jsonify({"success": False, "error": "Upload the student photo."}), 400
    photo = request.files["image"]
    ext = Path(photo.filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return jsonify({"success": False, "error": "Photo must be JPG, PNG, or WebP."}), 400
    safe_uid = re.sub(r"[^A-Za-z0-9_-]+", "-", uid).strip("-").lower() or "student"
    filename = f"{safe_uid}{ext}"
    dest = STUDENT_PHOTOS_DIR / filename
    dest.parent.mkdir(parents=True, exist_ok=True)
    photo.save(dest)
    image_path = f"/static/students/{filename}"
    updated = set_student_image_path(uid, image_path) or student
    course = _get_course_by_id(str(request.args.get("course_id") or ""))
    steps = _course_pathway_steps(course) if course else _training_pathway_steps()
    return jsonify({"success": True, "message": "Photo saved.", "student": _enrich_student_record(updated, steps)})


@app.route("/api/admin/students/<uid>/videos/<step_id>/upload", methods=["POST"])
def admin_upload_student_video(uid: str, step_id: str):
    denied = _require_admin()
    if denied:
        return denied
    uid = str(uid or "").strip()
    step_key = str(step_id or "").strip().lower()
    if step_key != "practical":
        try:
            step_key = str(int(step_key))
        except ValueError:
            return jsonify({"success": False, "error": "Invalid step."}), 400
    if "video" not in request.files:
        return jsonify({"success": False, "error": "No video file uploaded."}), 400
    try:
        proof = _admin_save_student_video(uid, step_key, request.files["video"])
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    student = get_student_by_uid(uid) or {}
    course = next(
        (c for c in _load_institute_courses() if str(student.get("course_name") or "") in _course_student_titles(c)),
        None,
    )
    steps = _course_pathway_steps(course or {"id": "plumbing", "built": True})
    enriched = _enrich_student_record(student, steps)
    return jsonify(
        {
            "success": True,
            "message": "Video uploaded for student.",
            "student": enriched,
        }
    )


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
DEFAULT_ORG_LOGO_URL = "/static/images/sft-logo-full.png?v=5"


def _org_logo_url(uploaded_only: bool = False) -> str | None:
    if ORG_LOGO_PATH.is_file():
        try:
            return f"/static/org-logo.png?v={int(ORG_LOGO_PATH.stat().st_mtime)}"
        except OSError:
            return "/static/org-logo.png"
    if uploaded_only:
        return None
    return DEFAULT_ORG_LOGO_URL


@app.route("/api/admin/logo", methods=["GET"])
def admin_get_logo():
    return jsonify({"success": True, "logoUrl": _org_logo_url(uploaded_only=True)})


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
    return jsonify({"success": True, "logoUrl": _org_logo_url(), "message": "Logo uploaded."})


def _student_video_proof(uid: str, expected_steps: int | None = None) -> dict:
    steps = _training_pathway_steps()
    expected = expected_steps if expected_steps is not None else len(steps)
    uploaded = 0
    videos = []
    safe_uid = urllib.parse.quote(str(uid or "").strip(), safe="")
    reviews = _review_map(uid)
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
                "kind": "pathway",
                "reviewStatus": reviews.get(str(step["id"]), "pending" if ok else "missing"),
                "videoUrl": f"/api/proof/{safe_uid}/videos/{step['id']}" if ok else None,
            }
        )
    practical = _practical_video_path(uid)
    videos.append(
        {
            "id": "practical",
            "title": "Final practical assessment (2 minutes)",
            "description": "Trainer must watch this 2-minute practical video before issuing the certificate.",
            "image": "/static/images/assessment-still.jpg",
            "uploaded": practical is not None,
            "kind": "practical",
            "reviewStatus": reviews.get("practical", "pending" if practical else "missing"),
            "videoUrl": f"/api/proof/{safe_uid}/videos/practical" if practical else None,
        }
    )
    practical_ok = practical is not None
    return {
        "uploaded_steps": uploaded,
        "expected_steps": expected,
        "video_proof": f"{uploaded}/{expected}",
        "videos": videos,
        "videos_complete": expected > 0 and uploaded >= expected,
        "practical_uploaded": practical_ok,
        "all_videos_complete": expected > 0 and uploaded >= expected and practical_ok,
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
    trainer_verified = bool(student and student.get("videos_verified_at"))
    approved = bool(proof["all_videos_complete"] and trainer_verified and certificate_approved)
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
        "student": public_student_view(student) if student else None,
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


@app.route("/api/proof/<uid>/videos/<step_id>")
def verify_step_video(uid: str, step_id: str):
    if not _can_stream_proof_video(uid):
        abort(403)
    if str(step_id).strip().lower() == "practical":
        path = _practical_video_path(uid)
    else:
        try:
            path = _step_video_path(uid, int(step_id))
        except ValueError:
            abort(404)
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


def _can_stream_proof_video(uid: str) -> bool:
    if session.get("is_admin"):
        return True
    progress = session.get("progress") or {}
    session_uid = str(progress.get("student_uid") or "").strip()
    if session_uid and session_uid.lower() == str(uid or "").strip().lower():
        return True
    token = str(request.args.get("access") or request.args.get("token") or "").strip()
    return bool(get_valid_video_access(token, uid))


@app.route("/api/students", methods=["GET"])
def api_list_students():
    return jsonify({"success": True, "students": [public_student_view(s) for s in list_students()]})


@app.route("/api/students/<uid>", methods=["GET"])
def api_get_student(uid: str):
    student = get_student_by_uid(uid)
    if not student:
        return jsonify({"success": False, "error": "Trainer not found.", "uid": uid}), 404
    return jsonify({"success": True, "student": public_student_view(student)})


@app.route("/api/students/certificate/<path:cert_no>", methods=["GET"])
def api_get_student_by_cert(cert_no: str):
    student = get_student_by_certificate(cert_no)
    if not student:
        return jsonify({"success": False, "error": "Certificate not found.", "certificate_number": cert_no}), 404
    return jsonify({"success": True, "student": public_student_view(student)})


@app.route("/api/admin/sync-lms", methods=["POST"])
def admin_sync_lms():
    denied = _require_admin()
    if denied:
        return denied
    result = sync_all_app_data_to_lms()
    if not result.get("ok"):
        return jsonify({"success": False, "error": result.get("error") or "LMS sync failed.", **result}), 500
    return jsonify(
        {
            "success": True,
            "message": f"Synced {result.get('synced', 0)} certificates to Admin LMS.",
            **result,
        }
    )


@app.route("/api/admin/video-access-requests", methods=["GET"])
def admin_list_video_access_requests():
    denied = _require_admin()
    if denied:
        return denied
    rows = list_video_access_requests()
    return jsonify(
        {
            "success": True,
            "count": len(rows),
            "requests": [
                {
                    "id": r.get("id"),
                    "uid": r.get("uid"),
                    "certificateNumber": r.get("certificate_number"),
                    "name": r.get("visitor_name"),
                    "organisation": r.get("organisation"),
                    "email": r.get("email"),
                    "location": r.get("location"),
                    "createdAt": r.get("created_at"),
                    "expiresAt": r.get("expires_at"),
                }
                for r in rows
            ],
        }
    )


@app.route("/api/admin/students", methods=["GET"])
def admin_list_students():
    denied = _require_admin()
    if denied:
        return denied
    steps = _training_pathway_steps()
    expected = len(steps)
    records = []
    for s in list_students():
        proof = _student_video_proof(s.get("uid", ""), expected)
        records.append(
            {
                **s,
                **proof,
                "assessment_recorded": bool(s.get("assessment_completed_at") or proof.get("practical_uploaded")),
                "certificate_recorded": bool(s.get("certificate_number") or s.get("issue_date")),
                "trainer_verified": bool(s.get("videos_verified_at")),
                "all_videos_complete": proof.get("all_videos_complete"),
                "practical_uploaded": proof.get("practical_uploaded"),
                "trainer_score": s.get("trainer_score"),
            }
        )
    return jsonify({"success": True, "students": records})


def _unlock_certificate_if_ready(uid: str) -> dict | None:
    if not _all_videos_approved(uid):
        return None
    stamp = _iso(_now_utc())
    mark_student_milestone(uid, videos_verified_at=stamp)
    student = get_student_by_uid(uid)
    if not student:
        return None
    existing = _find_certificate(uid)
    filename = str((existing or {}).get("filename") or "").strip()
    if filename and (OUTPUT_DIR / filename).is_file():
        return existing or {"certificateId": uid, "uid": uid, "filename": filename}
    return None


@app.route("/api/admin/students/<uid>/videos/<step_id>/review", methods=["POST"])
def admin_review_student_video(uid: str, step_id: str):
    denied = _require_admin()
    if denied:
        return denied
    uid = str(uid or "").strip()
    key = str(step_id or "").strip().lower()
    if key != "practical":
        try:
            key = str(int(key))
        except ValueError:
            return jsonify({"success": False, "error": "Invalid video."}), 400
    data = request.get_json(silent=True) or {}
    status = str(data.get("status") or "").strip().lower()
    if status not in {"approved", "reupload"}:
        return jsonify({"success": False, "error": "Use approved or reupload."}), 400
    student = get_student_by_uid(uid)
    if not student:
        return jsonify({"success": False, "error": "Trainer not found."}), 404
    if status == "approved":
        if key == "practical":
            if not _practical_video_path(uid):
                return jsonify({"success": False, "error": "Practical video is not uploaded yet."}), 400
        else:
            if not _step_video_path(uid, int(key)):
                return jsonify({"success": False, "error": "This week video is not uploaded yet."}), 400
    set_video_review(uid, key, status)
    certificate = None
    if status == "reupload":
        clear_videos_verified(uid)
        message = "Trainer can re-upload this video."
    else:
        try:
            certificate = _unlock_certificate_if_ready(uid)
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc)}), 502
        message = "Video approved."
        if certificate:
            message = "All videos approved. Certificate is ready."
    proof = _student_video_proof(uid)
    return jsonify(
        {
            "success": True,
            "message": message,
            "student": {
                **(get_student_by_uid(uid) or {}),
                **proof,
                "trainer_verified": bool((get_student_by_uid(uid) or {}).get("videos_verified_at")),
            },
            "certificate": _certificate_public(certificate) if certificate else None,
        }
    )


@app.route("/api/admin/students/<uid>/score", methods=["POST"])
def admin_set_student_score(uid: str):
    denied = _require_admin()
    if denied:
        return denied
    uid = str(uid or "").strip()
    if not get_student_by_uid(uid):
        return jsonify({"success": False, "error": "Trainer not found."}), 404
    data = request.get_json(silent=True) or {}
    try:
        score = int(data.get("score"))
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Enter a score from 0 to 100."}), 400
    if score < 0 or score > 100:
        return jsonify({"success": False, "error": "Score must be between 0 and 100."}), 400
    step_id = str(data.get("step_id") or data.get("week") or "").strip()
    if step_id:
        student = set_week_score(uid, step_id, score)
        return jsonify(
            {
                "success": True,
                "message": "Private week marks saved.",
                "trainer_score": (student or {}).get("trainer_score"),
                "week_scores": (student or {}).get("week_scores") or {},
                "student": student,
            }
        )
    student = set_trainer_score(uid, score)
    return jsonify({"success": True, "message": "Score saved. Trainers cannot see this.", "trainer_score": score, "student": student})


@app.route("/api/admin/students/<uid>/grade", methods=["POST"])
def admin_set_student_grade(uid: str):
    denied = _require_admin()
    if denied:
        return denied
    uid = str(uid or "").strip()
    if not get_student_by_uid(uid):
        return jsonify({"success": False, "error": "Student not found."}), 404
    data = request.get_json(silent=True) or {}
    grade = str(data.get("grade") or "").strip()
    if grade not in CERTIFICATE_GRADES:
        return jsonify(
            {
                "success": False,
                "error": "Select Outstanding, Excellent, or Good.",
            }
        ), 400
    student = set_trainer_grade(uid, grade)
    return jsonify({"success": True, "message": "Grade saved.", "trainer_grade": grade, "student": student})


@app.route("/api/admin/students/<uid>/verify-videos", methods=["POST"])
def admin_verify_student_videos(uid: str):
    denied = _require_admin()
    if denied:
        return denied
    uid = str(uid or "").strip()
    student = get_student_by_uid(uid)
    if not student:
        return jsonify({"success": False, "error": "Trainer not found."}), 404
    proof = _student_video_proof(uid)
    if not proof.get("all_videos_complete"):
        return jsonify(
            {
                "success": False,
                "error": "Trainer must upload all pathway videos and the 2-minute practical video first.",
            }
        ), 400
    keys = [str(v.get("id")) for v in (proof.get("videos") or [])]
    set_all_video_reviews(uid, "approved", keys)
    mark_student_milestone(uid, videos_verified_at=_iso(_now_utc()))
    existing = _find_certificate(uid)
    filename = str((existing or {}).get("filename") or "").strip()
    certificate = None
    if filename and (OUTPUT_DIR / filename).is_file():
        certificate = _certificate_public(existing)
    return jsonify(
        {
            "success": True,
            "message": f"Videos verified. Save private marks and grade, then generate the certificate for {uid}.",
            "student": get_student_by_uid(uid),
            "certificate": certificate,
        }
    )


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
    from db import get_database_url, uses_sqlite

    try:
        count = len(list_students())
        db_ok = True
        db_error = None
    except Exception as exc:
        count = 0
        db_ok = False
        db_error = str(exc)
    return jsonify(
        {
            "status": "ok" if db_ok else "degraded",
            "database": "sqlite" if uses_sqlite() else "mysql",
            "databaseConfigured": bool(get_database_url()),
            "students": count,
            "verify": "/verify",
            "verifyApi": "/api/certificates/verify",
            **({"databaseError": db_error} if db_error else {}),
        }
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
