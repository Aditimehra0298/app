"""MySQL database for students / admission / certificates."""

from __future__ import annotations

import json
import os
import re
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, urlparse

BASE_DIR = Path(__file__).resolve().parent
STUDENT_PHOTOS_DIR = BASE_DIR / "static" / "students"
STUDENT_PHOTOS_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_DATABASE_URL = "mysql://root:MyNewPass123!@127.0.0.1:3306/sft_lms"
LMS_PLUMBING_SLUG = "professional-plumbing-training-program"


def _load_env_file() -> None:
    path = BASE_DIR / ".env"
    if not path.is_file():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file()


def get_database_url() -> str:
    return os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL).strip()


def uses_sqlite() -> bool:
    url = get_database_url().strip().lower()
    flag = os.environ.get("USE_SQLITE", "").strip().lower()
    if flag in {"1", "true", "yes"}:
        return True
    return url.startswith("sqlite:")


def _sqlite_path() -> Path:
    url = get_database_url().strip()
    if url.startswith("sqlite:///"):
        raw = url[len("sqlite:///") :]
        path = Path(raw)
        if not path.is_absolute():
            path = BASE_DIR / path
        return path
    return BASE_DIR / "data" / "sft.sqlite"


def get_lms_database_url() -> str:
    """Official SFT LMS MySQL. Same server, different database is typical."""
    return os.environ.get("LMS_DATABASE_URL", "").strip()


def _mysql_kwargs_from_url(url: str, default_db: str) -> dict:
    if url.startswith("mysql://"):
        p = urlparse(url)
        return {
            "host": p.hostname or "127.0.0.1",
            "port": p.port or 3306,
            "user": p.username or "root",
            "password": p.password or "",
            "database": (p.path or f"/{default_db}").lstrip("/") or default_db,
        }
    return {
        "host": os.environ.get("MYSQL_HOST", "127.0.0.1"),
        "port": int(os.environ.get("MYSQL_PORT", "3306")),
        "user": os.environ.get("MYSQL_USER", "root"),
        "password": os.environ.get("MYSQL_PASSWORD", ""),
        "database": default_db,
    }


def _mysql_connect_kwargs() -> dict:
    url = get_database_url()
    if url.startswith("mysql://"):
        return _mysql_kwargs_from_url(url, "sft")
    kwargs = _mysql_kwargs_from_url("", os.environ.get("MYSQL_DATABASE", "sft"))
    return kwargs


def _lms_connect_kwargs() -> dict | None:
    url = get_lms_database_url()
    if url:
        return _mysql_kwargs_from_url(url, "sftlms")
    extra_db = os.environ.get("LMS_MYSQL_DATABASE", "").strip()
    if not extra_db:
        return None
    kwargs = dict(_mysql_connect_kwargs())
    kwargs["database"] = extra_db
    return kwargs


SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        father_name VARCHAR(255) NOT NULL DEFAULT '',
        course_name VARCHAR(255) NOT NULL,
        batch_start DATE NULL,
        batch_end DATE NULL,
        uid VARCHAR(32) NOT NULL,
        certificate_number VARCHAR(64) NULL,
        issue_date DATE NULL,
        image_path VARCHAR(512) NULL,
        logo_path VARCHAR(512) NULL,
        phone VARCHAR(32) DEFAULT '',
        email VARCHAR(255) DEFAULT '',
        status VARCHAR(32) NOT NULL DEFAULT 'admitted',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_students_uid (uid),
        KEY idx_students_uid (uid),
        KEY idx_students_cert (certificate_number)
    )     ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS video_access_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        token VARCHAR(128) NOT NULL,
        uid VARCHAR(32) NOT NULL,
        certificate_number VARCHAR(64) NULL,
        visitor_name VARCHAR(255) NOT NULL,
        organisation VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        location VARCHAR(255) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_video_access_token (token),
        KEY idx_video_access_uid (uid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
]

SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    father_name TEXT NOT NULL DEFAULT '',
    course_name TEXT NOT NULL,
    batch_start TEXT NULL,
    batch_end TEXT NULL,
    uid TEXT NOT NULL UNIQUE,
    certificate_number TEXT NULL,
    issue_date TEXT NULL,
    image_path TEXT NULL,
    logo_path TEXT NULL,
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'admitted',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    videos_completed_at TEXT NULL,
    assessment_completed_at TEXT NULL,
    videos_verified_at TEXT NULL,
    trainer_score INTEGER NULL,
    trainer_grade TEXT NULL,
    video_reviews TEXT NULL,
    week_scores TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_students_cert ON students(certificate_number);
CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);
CREATE TABLE IF NOT EXISTS video_access_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    uid TEXT NOT NULL,
    certificate_number TEXT NULL,
    visitor_name TEXT NOT NULL,
    organisation TEXT NOT NULL,
    email TEXT NOT NULL,
    location TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

SEED_STUDENTS = [
    {
        "name": "Mr. Dilwinder Singh",
        "father_name": "Yadwinder Singh",
        "course_name": "Plumbing Foundational Course",
        "batch_start": "2026-07-15",
        "batch_end": "2026-08-15",
        "uid": "21PLM001",
        "certificate_number": "ET/PPT/001/2026",
        "issue_date": "2026-08-15",
        "image_path": "/static/students/plm-001.png",
        "phone": "9988040883",
        "email": "dilwindsingh2550@gmail.com",
        "status": "admitted",
    },
    {
        "name": "Mr. Vishavpartap Singh",
        "father_name": "Harjeet Singh",
        "course_name": "Plumbing Foundation Course",
        "batch_start": "2026-07-15",
        "batch_end": "2026-08-15",
        "uid": "21PLM002",
        "certificate_number": "ET/PPT/002/2026",
        "issue_date": "2026-08-15",
        "image_path": "/static/students/plm-002.png",
        "phone": "8268000066",
        "email": "vishavpartap957@gmail.com",
        "status": "admitted",
    },
    {
        "name": "Mr. Jashanpreet Singh",
        "father_name": "Jagdeep Singh",
        "course_name": "Plumbing Foundation Course",
        "batch_start": "2026-07-15",
        "batch_end": "2026-08-15",
        "uid": "21PLM003",
        "certificate_number": "ET/PPT/003/2026",
        "issue_date": "2026-08-15",
        "image_path": "/static/students/plm-003.png",
        "phone": "7657878073",
        "email": "jashan7657878073@gmail.com",
        "status": "admitted",
    },
]

ADMISSION_COURSES = [
    "Plumbing Foundational Course",
    "Plumbing Foundation Course",
    "Carbon Trading & Reporting Practitioner Program",
    "Carbon Trading & Reporting",
    "Essentials of Carbon Trading & Reporting",
    "ESG Management Development Training Program",
]


@contextmanager
def get_lms_connection():
    """Second MySQL connection — SFT LMS database (optional)."""
    import pymysql
    from pymysql.cursors import DictCursor

    cfg = _lms_connect_kwargs()
    if not cfg:
        yield None
        return
    conn = pymysql.connect(
        host=cfg["host"],
        port=cfg["port"],
        user=cfg["user"],
        password=cfg["password"],
        database=cfg["database"],
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=False,
    )
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


class _SqliteCursor:
    def __init__(self, conn: "sqlite3.Connection"):
        self._cur = conn.cursor()

    def execute(self, sql: str, params=None):
        converted = sql.replace("%s", "?")
        if params is None:
            self._cur.execute(converted)
        else:
            self._cur.execute(converted, tuple(params))
        return self

    def fetchone(self):
        row = self._cur.fetchone()
        if row is None:
            return None
        return {key: row[key] for key in row.keys()}

    def fetchall(self):
        return [{key: row[key] for key in row.keys()} for row in self._cur.fetchall()]

    @property
    def lastrowid(self):
        return self._cur.lastrowid

    def close(self):
        self._cur.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False


class _SqliteConn:
    def __init__(self, path: Path):
        import sqlite3

        self._conn = sqlite3.connect(str(path), check_same_thread=False, timeout=30)
        self._conn.row_factory = sqlite3.Row

        def regexp(pattern: str, value) -> int:
            if value is None:
                return 0
            return 1 if re.search(pattern, str(value)) else 0

        self._conn.create_function("REGEXP", 2, regexp)

    def cursor(self):
        return _SqliteCursor(self._conn)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


@contextmanager
def get_connection():
    if uses_sqlite():
        path = _sqlite_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        conn = _SqliteConn(path)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        return

    import pymysql
    from pymysql.cursors import DictCursor

    cfg = _mysql_connect_kwargs()
    conn = pymysql.connect(
        host=cfg["host"],
        port=cfg["port"],
        user=cfg["user"],
        password=cfg["password"],
        database=cfg["database"],
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=False,
    )
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _has_column(cur, name: str) -> bool:
    if uses_sqlite():
        cur.execute("PRAGMA table_info(students)")
        return any(str(row.get("name") or "").lower() == name.lower() for row in (cur.fetchall() or []))
    cur.execute("SHOW COLUMNS FROM students LIKE %s", (name,))
    return cur.fetchone() is not None


def init_db() -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            if uses_sqlite():
                for statement in SQLITE_SCHEMA.split(";"):
                    sql = statement.strip()
                    if sql:
                        cur.execute(sql)
            else:
                for statement in SCHEMA_STATEMENTS:
                    cur.execute(statement)
            if not _has_column(cur, "logo_path"):
                cur.execute("ALTER TABLE students ADD COLUMN logo_path VARCHAR(512) NULL")
            if not _has_column(cur, "email"):
                cur.execute("ALTER TABLE students ADD COLUMN email VARCHAR(255) DEFAULT ''")
            if not _has_column(cur, "videos_completed_at"):
                cur.execute("ALTER TABLE students ADD COLUMN videos_completed_at DATETIME NULL")
            if not _has_column(cur, "assessment_completed_at"):
                cur.execute("ALTER TABLE students ADD COLUMN assessment_completed_at DATETIME NULL")
            if not _has_column(cur, "videos_verified_at"):
                cur.execute("ALTER TABLE students ADD COLUMN videos_verified_at DATETIME NULL")
            if not _has_column(cur, "trainer_score"):
                cur.execute("ALTER TABLE students ADD COLUMN trainer_score INT NULL")
            if not _has_column(cur, "video_reviews"):
                cur.execute("ALTER TABLE students ADD COLUMN video_reviews TEXT NULL")
            if not _has_column(cur, "week_scores"):
                cur.execute("ALTER TABLE students ADD COLUMN week_scores TEXT NULL")
            if not _has_column(cur, "trainer_grade"):
                cur.execute("ALTER TABLE students ADD COLUMN trainer_grade VARCHAR(64) NULL")
            _migrate_legacy_uids(cur)
            _migrate_certificate_numbers(cur)
    init_lms_bridge()


def _lms_id() -> str:
    return "c" + uuid.uuid4().hex[:24]


def _ensure_institute_organization(cur, *, name: str | None = None, email: str | None = None, uid: str | None = None) -> str:
    """Ensure the training institute exists in lms_organization and return its id."""
    org_name = (name or os.environ.get("INSTITUTE_NAME") or "Eurotech").strip() or "Eurotech"
    work_email = (email or os.environ.get("ADMIN_EMAIL") or "eurotech@gmail.com").strip().lower()
    institute_uid = (uid or os.environ.get("ADMIN_UID") or "21EUROTECH001").strip().upper()

    cur.execute(
        """
        SELECT id FROM lms_organization
        WHERE LOWER(workEmail) = LOWER(%s) OR companyName = %s
        LIMIT 1
        """,
        (work_email, org_name),
    )
    row = cur.fetchone()
    if row:
        org_id = str(row["id"])
        cur.execute(
            """
            UPDATE lms_organization
            SET companyName = %s, workEmail = %s, industryType = COALESCE(industryType, %s), updatedAt = NOW(3)
            WHERE id = %s
            """,
            (org_name, work_email, "training-institute", org_id),
        )
        return org_id

    cur.execute("SELECT COALESCE(MAX(identificationNumber), 0) + 1 AS n FROM lms_organization")
    ident = int((cur.fetchone() or {}).get("n") or 1)
    org_id = _lms_id()
    cur.execute(
        """
        INSERT INTO lms_organization (
            id, identificationNumber, companyName, workEmail, industryType, companySize,
            createdAt, updatedAt
        ) VALUES (%s, %s, %s, %s, %s, %s, NOW(3), NOW(3))
        """,
        (org_id, ident, org_name, work_email, "training-institute", institute_uid),
    )
    return org_id


def _ensure_learner_user(cur, *, email: str, name: str, phone: str = "") -> str | None:
    email = str(email or "").strip().lower()
    if not email or "@" not in email:
        return None
    cur.execute("SELECT id FROM lms_user WHERE LOWER(email) = LOWER(%s) LIMIT 1", (email,))
    row = cur.fetchone()
    if row:
        return str(row["id"])
    user_id = _lms_id()
    cur.execute("SELECT COALESCE(MAX(identificationNumber), 0) + 1 AS n FROM lms_user")
    ident = int((cur.fetchone() or {}).get("n") or 1)
    cur.execute(
        """
        INSERT INTO lms_user (
            id, email, name, role, accountType, phone, identificationNumber, createdAt, emailVerifiedAt
        ) VALUES (%s, %s, %s, 'learner', 'individual', %s, %s, NOW(3), NOW(3))
        """,
        (user_id, email, name, phone or None, ident),
    )
    return user_id


def _ensure_plumbing_course(cur) -> tuple[str, str]:
    title = "Professional Plumbing Training Program"
    cur.execute("SELECT id, slug, title FROM lms_course WHERE slug = %s LIMIT 1", (LMS_PLUMBING_SLUG,))
    row = cur.fetchone()
    if row:
        return str(row["id"]), str(row.get("title") or title)
    cur.execute("SELECT COALESCE(MAX(courseIdentificationNumber), 100) + 1 AS n FROM lms_course")
    next_n = int((cur.fetchone() or {}).get("n") or 901)
    course_id = _lms_id()
    cur.execute(
        """
        INSERT INTO lms_course (
            id, courseIdentificationNumber, slug, title, subtitle, category, level,
            published, learningFormat, createdAt, updatedAt
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, 1, %s, NOW(3), NOW(3))
        """,
        (
            course_id,
            next_n,
            LMS_PLUMBING_SLUG,
            title,
            "Practical plumbing pathway with video proofs, assessment, and certified PDF.",
            "plumbing",
            "Beginner",
            "practical",
        ),
    )
    return course_id, title


def init_lms_bridge() -> None:
    """Connect the SFT LMS MySQL (`sft_lms`) and copy issued plumbing certificates into it."""
    if uses_sqlite() and not get_lms_database_url():
        return
    cfg = _lms_connect_kwargs()
    if not cfg:
        return
    try:
        result = sync_all_app_data_to_lms()
        synced = int(result.get("synced") or 0)
        print(
            f"LMS MySQL connected: {cfg['user']}@{cfg['host']}:{cfg['port']}/{cfg['database']} ({synced} certificates synced)",
            flush=True,
        )
        if not result.get("ok") and result.get("error"):
            print(f"LMS sync note: {result['error']}", flush=True)
    except Exception as exc:
        print(f"LMS MySQL not connected ({cfg['host']}/{cfg['database']}): {exc}", flush=True)


def sync_certificate_to_lms(student: dict | None) -> bool:
    if not student or not _lms_connect_kwargs():
        return False
    email = str(student.get("email") or "").strip().lower()
    number = str(student.get("certificate_number") or "").strip()
    uid = str(student.get("uid") or "").strip()
    if not email or "@" not in email or not number or not uid:
        return False
    name = str(student.get("name") or "").strip()
    course_title = str(student.get("course_name") or "Professional Plumbing Training Program").strip()
    phone = str(student.get("phone") or "").strip()
    issue = str(student.get("issue_date") or date.today().isoformat())[:10]
    issued_at = f"{issue} 00:00:00"
    base = os.environ.get("PUBLIC_BASE_URL", "http://127.0.0.1:5001").rstrip("/")
    pdf_url = f"{base}/api/certificates/public-pdf?number={quote(number)}"
    try:
        with get_lms_connection() as conn:
            if conn is None:
                return False
            with conn.cursor() as cur:
                course_id, course_name = _ensure_plumbing_course(cur)
                org_id = _ensure_institute_organization(cur)
                user_id = _ensure_learner_user(cur, email=email, name=name, phone=phone)
                title = course_title or course_name
                cur.execute(
                    """
                    SELECT id FROM lms_certificate
                    WHERE certificateNumber = %s OR delegateNumber = %s
                    LIMIT 1
                    """,
                    (number, uid),
                )
                existing = cur.fetchone()
                if existing:
                    cur.execute(
                        """
                        UPDATE lms_certificate
                        SET learnerEmail = %s,
                            learnerName = %s,
                            courseSlug = %s,
                            courseId = %s,
                            courseTitle = %s,
                            certificateNumber = %s,
                            delegateNumber = %s,
                            pdfUrl = %s,
                            organizationId = %s,
                            userId = COALESCE(userId, %s),
                            status = 'issued',
                            visibleToLearner = 1,
                            issuedVia = 'trade-app',
                            issuedAt = COALESCE(issuedAt, %s)
                        WHERE id = %s
                        """,
                        (
                            email,
                            name,
                            LMS_PLUMBING_SLUG,
                            course_id,
                            title,
                            number,
                            uid,
                            pdf_url,
                            org_id,
                            user_id,
                            issued_at,
                            existing["id"],
                        ),
                    )
                    return True
                cur.execute("SELECT COALESCE(MAX(identificationNumber), 0) + 1 AS n FROM lms_certificate")
                ident = int((cur.fetchone() or {}).get("n") or 1)
                cur.execute("SELECT COALESCE(MAX(verifyNumber), 0) + 1 AS n FROM lms_certificate")
                verify_n = int((cur.fetchone() or {}).get("n") or 1)
                cur.execute(
                    """
                    INSERT INTO lms_certificate (
                        id, userId, organizationId, holderType, learnerEmail, learnerName, courseSlug, courseId,
                        courseTitle, certificateNumber, identificationNumber, issuedAt,
                        scorePercent, status, visibleToLearner, pdfUrl, issuedVia,
                        delegateNumber, verifyNumber
                    ) VALUES (
                        %s, %s, %s, 'individual', %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        100, 'issued', 1, %s, 'trade-app',
                        %s, %s
                    )
                    """,
                    (
                        _lms_id(),
                        user_id,
                        org_id,
                        email,
                        name,
                        LMS_PLUMBING_SLUG,
                        course_id,
                        title,
                        number,
                        ident,
                        issued_at,
                        pdf_url,
                        uid,
                        verify_n,
                    ),
                )
                return True
    except Exception as exc:
        print(f"LMS certificate sync skipped ({uid}): {exc}", flush=True)
        return False


def sync_all_app_data_to_lms() -> dict:
    """Push all institute students/certificates into Admin LMS tables."""
    if not _lms_connect_kwargs():
        return {"ok": False, "synced": 0, "organizationId": None, "error": "LMS database not configured"}
    org_id = None
    synced = 0
    errors: list[str] = []
    try:
        with get_lms_connection() as conn:
            if conn is None:
                return {"ok": False, "synced": 0, "organizationId": None, "error": "LMS connection failed"}
            with conn.cursor() as cur:
                org_id = _ensure_institute_organization(cur)
                _ensure_plumbing_course(cur)
        for student in list_students():
            if sync_certificate_to_lms(student):
                synced += 1
            else:
                uid = str(student.get("uid") or "")
                if uid:
                    errors.append(uid)
        return {"ok": True, "synced": synced, "organizationId": org_id, "failed": errors}
    except Exception as exc:
        return {"ok": False, "synced": synced, "organizationId": org_id, "error": str(exc)}

def _row_to_dict(row: dict | None) -> dict | None:
    if row is None:
        return None
    d = dict(row)
    for key in ("batch_start", "batch_end", "issue_date"):
        if d.get(key) is not None:
            d[key] = str(d[key])[:10]
    if d.get("created_at") is not None:
        d["created_at"] = str(d["created_at"])
    start = _format_date(d.get("batch_start"))
    end = _format_date(d.get("batch_end"))
    if start and end:
        d["batch_duration"] = f"{start} to {end}"
    elif start:
        d["batch_duration"] = f"From {start}"
    else:
        d["batch_duration"] = ""
    d.setdefault("phone", "")
    d.setdefault("email", "")
    d.setdefault("status", "admitted")
    d.setdefault("logo_path", None)
    for key in ("videos_completed_at", "assessment_completed_at", "videos_verified_at"):
        if d.get(key) is not None:
            d[key] = str(d[key])
        else:
            d.setdefault(key, None)
    d["video_reviews"] = _parse_video_reviews(d.get("video_reviews"))
    d["week_scores"] = _parse_week_scores(d.get("week_scores"))
    score = d.get("trainer_score")
    try:
        d["trainer_score"] = int(score) if score is not None and str(score).strip() != "" else None
    except (TypeError, ValueError):
        d["trainer_score"] = None
    d["trainer_grade"] = str(d.get("trainer_grade") or "").strip() or None
    return d


def _parse_video_reviews(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8", errors="ignore")
    if isinstance(raw, str) and raw.strip():
        try:
            data = json.loads(raw)
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _parse_week_scores(raw) -> dict:
    data = _parse_video_reviews(raw)
    scores: dict[str, int] = {}
    for key, value in data.items():
        try:
            score = int(value)
        except (TypeError, ValueError):
            continue
        if 0 <= score <= 100:
            scores[str(key)] = score
    return scores


def public_student_view(student: dict | None) -> dict | None:
    """Student-facing payload: never include trainer score or video review notes."""
    if not student:
        return None
    d = dict(student)
    d.pop("trainer_score", None)
    d.pop("week_scores", None)
    d.pop("trainer_grade", None)
    d.pop("video_reviews", None)
    return d


def get_video_reviews(uid: str) -> dict:
    student = get_student_by_uid(uid)
    return dict((student or {}).get("video_reviews") or {})


def set_video_review(uid: str, step_key: str, status: str) -> dict | None:
    reviews = get_video_reviews(uid)
    reviews[str(step_key)] = status
    payload = json.dumps(reviews)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE students SET video_reviews = %s WHERE LOWER(uid) = LOWER(%s)",
                (payload, uid.strip()),
            )
    return get_student_by_uid(uid)


def set_all_video_reviews(uid: str, status: str, keys: list[str]) -> dict | None:
    reviews = get_video_reviews(uid)
    for key in keys:
        reviews[str(key)] = status
    payload = json.dumps(reviews)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE students SET video_reviews = %s WHERE LOWER(uid) = LOWER(%s)",
                (payload, uid.strip()),
            )
    return get_student_by_uid(uid)


def set_week_score(uid: str, step_key: str, score: int) -> dict | None:
    uid = str(uid or "").strip()
    key = str(step_key or "").strip()
    if not uid or not key:
        return None
    student = get_student_by_uid(uid)
    if not student:
        return None
    scores = dict(student.get("week_scores") or {})
    scores[key] = int(score)
    nums = [int(v) for v in scores.values() if isinstance(v, int) or str(v).isdigit()]
    average = round(sum(nums) / len(nums)) if nums else None
    payload = json.dumps(scores)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE students SET week_scores = %s, trainer_score = %s WHERE LOWER(uid) = LOWER(%s)",
                (payload, average, uid),
            )
    return get_student_by_uid(uid)


def set_trainer_score(uid: str, score: int | None) -> dict | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE students SET trainer_score = %s WHERE LOWER(uid) = LOWER(%s)",
                (score, uid.strip()),
            )
    return get_student_by_uid(uid)


def set_trainer_grade(uid: str, grade: str) -> dict | None:
    uid = str(uid or "").strip()
    value = str(grade or "").strip()
    if not uid or not value:
        return None
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE students SET trainer_grade = %s WHERE LOWER(uid) = LOWER(%s)",
                (value, uid),
            )
    return get_student_by_uid(uid)


def clear_videos_verified(uid: str) -> dict | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE students SET videos_verified_at = NULL WHERE LOWER(uid) = LOWER(%s)",
                (uid.strip(),),
            )
    return get_student_by_uid(uid)


def _format_date(value: str | None) -> str:
    if not value:
        return ""
    try:
        y, m, day = str(value)[:10].split("-")
        months = (
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        )
        return f"{int(day)}-{months[int(m) - 1]}-{y}"
    except (ValueError, IndexError):
        return str(value)


def _uid_prefix(course_name: str) -> str:
    course = (course_name or "").lower()
    if "plumb" in course:
        return "PLM"
    if "carbon" in course:
        return "CTR"
    if "esg" in course:
        return "ESG"
    return "SFT"


def _uid_year_prefix() -> str:
    return "21"


def _compact_uid(uid: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (uid or "").strip().upper())


def _to_login_uid(uid: str) -> str:
    """PLM-001 / PLM001 / 21PLM-001 → 21PLM001."""
    compact = _compact_uid(uid)
    m = re.fullmatch(r"(?:(\d{2}))?([A-Z]+)(\d+)", compact)
    if not m:
        return compact or (uid or "").strip().upper()
    year = m.group(1) or _uid_year_prefix()
    return f"{year}{m.group(2)}{int(m.group(3)):03d}"


def _uid_candidates(uid: str) -> list[str]:
    raw = (uid or "").strip()
    if not raw:
        return []
    compact = _compact_uid(raw)
    out: list[str] = []
    seen: set[str] = set()

    def add(value: str) -> None:
        key = value.strip().upper()
        if key and key not in seen:
            seen.add(key)
            out.append(value.strip())

    add(raw)
    add(raw.upper())
    add(compact)
    m = re.fullmatch(r"(?:(\d{2}))?([A-Z]+)(\d+)", compact)
    if m:
        year = m.group(1) or _uid_year_prefix()
        letters = m.group(2)
        num = int(m.group(3))
        add(f"{letters}-{num:03d}")
        add(f"{letters}{num:03d}")
        add(f"{year}{letters}{num:03d}")
        add(f"{year}{letters}-{num:03d}")
        add(f"{letters}-{num}")
        add(f"{year}{letters}{num}")
    return out


def _migrate_legacy_uids(cur) -> None:
    cur.execute("SELECT id, uid FROM students")
    rows = cur.fetchall() or []
    for row in rows:
        old = str(row.get("uid") or "").strip()
        new = _to_login_uid(old)
        if not old or new == old:
            continue
        cur.execute(
            "SELECT id FROM students WHERE LOWER(uid) = LOWER(%s) AND id != %s",
            (new, row["id"]),
        )
        if cur.fetchone():
            continue
        cur.execute("UPDATE students SET uid = %s WHERE id = %s", (new, row["id"]))


def _certificate_aliases(number: str, uid: str = "") -> set[str]:
    """ET/PPT/001/2026, SFT-PLM-2026-001, and UID all identify the same record."""
    out: set[str] = set()

    def add(value: str) -> None:
        raw = str(value or "").strip()
        if raw:
            out.add(raw)
            out.add(raw.upper())

    add(number)
    compact_uid = _compact_uid(uid)
    if compact_uid:
        add(uid)
        add(compact_uid)
        for candidate in _uid_candidates(uid):
            add(candidate)

    et = re.fullmatch(r"ET[/_\-]?PPT[/_\-](\d{3})[/_\-](\d{4})", str(number or "").strip(), re.I)
    if et:
        n, y = et.group(1), et.group(2)
        add(f"ET/PPT/{n}/{y}")
        add(f"SFT-PLM-{y}-{n}")
        add(f"21PLM{n}")
        add(f"PLM-{n}")
        add(f"PLM{n}")

    old = re.fullmatch(r"SFT-PLM-(\d{4})-(\d{3})", str(number or "").strip(), re.I)
    if old:
        y, n = old.group(1), old.group(2)
        add(f"ET/PPT/{n}/{y}")
        add(f"SFT-PLM-{y}-{n}")
        add(f"21PLM{n}")
        add(f"PLM-{n}")

    uid_num = re.search(r"(\d{3})$", compact_uid)
    if uid_num:
        n = uid_num.group(1)
        year = str(date.today().year)
        add(f"ET/PPT/{n}/{year}")
        add(f"ET/PPT/{n}/2026")
        add(f"SFT-PLM-{year}-{n}")
        add(f"SFT-PLM-2026-{n}")
    return {item for item in out if item}


def _migrate_certificate_numbers(cur) -> None:
    cur.execute("SELECT id, uid, certificate_number FROM students")
    rows = cur.fetchall() or []
    for row in rows:
        old = str(row.get("certificate_number") or "").strip()
        m = re.fullmatch(r"SFT-PLM-(\d{4})-(\d{3})", old, re.I)
        if not m:
            continue
        new = f"ET/PPT/{m.group(2)}/{m.group(1)}"
        cur.execute("UPDATE students SET certificate_number = %s WHERE id = %s", (new, row["id"]))


def next_uid(course_name: str = "") -> str:
    prefix = _uid_prefix(course_name)
    year_prefix = _uid_year_prefix()
    pattern = f"^{year_prefix}{prefix}[0-9]+$"
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT uid FROM students WHERE uid REGEXP %s",
                (pattern,),
            )
            rows = cur.fetchall()
    max_n = 0
    for row in rows:
        m = re.search(rf"^{year_prefix}{prefix}(\d+)$", row["uid"])
        if m:
            max_n = max(max_n, int(m.group(1)))
    return f"{year_prefix}{prefix}{max_n + 1:03d}"


def list_students() -> list[dict]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM students ORDER BY uid ASC")
            rows = cur.fetchall()
    return [_row_to_dict(r) for r in rows]  # type: ignore[misc]


def get_student_by_uid(uid: str) -> dict | None:
    candidates = _uid_candidates(uid)
    if not candidates:
        return None
    compact = [_compact_uid(c) for c in candidates]
    uid_ph = ",".join(["%s"] * len(candidates))
    compact_ph = ",".join(["%s"] * len(compact))
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT * FROM students
                WHERE LOWER(uid) IN ({uid_ph})
                   OR UPPER(REPLACE(uid, '-', '')) IN ({compact_ph})
                LIMIT 1
                """,
                [c.lower() for c in candidates] + compact,
            )
            row = cur.fetchone()
    return _row_to_dict(row)


def get_student_by_certificate(certificate_number: str) -> dict | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM students WHERE LOWER(certificate_number) = LOWER(%s)",
                (certificate_number.strip(),),
            )
            row = cur.fetchone()
    return _row_to_dict(row)


def get_student_by_uid_and_certificate(uid: str, number: str) -> dict | None:
    """Match verify form: student UID + certificate number must belong to the same record."""
    uid_s = str(uid or "").strip()
    number_s = str(number or "").strip()
    if not uid_s or not number_s:
        return None
    student = get_student_by_uid(uid_s)
    if not student:
        return None
    aliases = _certificate_aliases(str(student.get("certificate_number") or ""), str(student.get("uid") or ""))
    aliases |= _certificate_aliases(number_s, str(student.get("uid") or ""))
    wanted = number_s.upper()
    if wanted in {item.upper() for item in aliases}:
        return student
    if _compact_uid(number_s) == _compact_uid(str(student.get("uid") or "")):
        return student
    return None


def get_student_by_email_and_certificate(email: str, number: str) -> dict | None:
    """Match LMS verify: registered Gmail + certificate number (or UID)."""
    email_l = str(email or "").strip().lower()
    number_l = str(number or "").strip()
    if not email_l or "@" not in email_l or not number_l:
        return None
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM students WHERE LOWER(email) = %s", (email_l,))
            rows = cur.fetchall() or []
    wanted = number_l.upper()
    for row in rows:
        student = _row_to_dict(row)
        if not student:
            continue
        aliases = _certificate_aliases(str(student.get("certificate_number") or ""), str(student.get("uid") or ""))
        aliases |= _certificate_aliases(number_l, str(student.get("uid") or ""))
        if wanted in {item.upper() for item in aliases}:
            return student
        if _compact_uid(number_l) == _compact_uid(str(student.get("uid") or "")):
            return student
    student = get_student_by_certificate(number_l) or get_student_by_uid(number_l)
    if not student:
        return None
    stored = str(student.get("email") or "").strip().lower()
    if stored != email_l:
        return None
    return student


def save_student_certificate(uid: str, certificate_number: str, issue_date: str | None = None) -> dict | None:
    uid = str(uid or "").strip()
    cert_no = str(certificate_number or "").strip()
    if not uid or not cert_no:
        return get_student_by_uid(uid) if uid else None
    issue = str(issue_date or date.today().isoformat())[:10]
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE students
                SET certificate_number = %s,
                    issue_date = COALESCE(issue_date, %s),
                    status = 'certified'
                WHERE LOWER(uid) = LOWER(%s)
                """,
                (cert_no, issue, uid),
            )
    student = get_student_by_uid(uid)
    sync_certificate_to_lms(student)
    return student


def delete_student_certificate(uid: str) -> dict | None:
    uid = str(uid or "").strip()
    if not uid:
        return None
    student = get_student_by_uid(uid)
    number = str((student or {}).get("certificate_number") or "").strip()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE students
                SET certificate_number = NULL,
                    status = CASE WHEN status = 'certified' THEN 'videos_verified' ELSE status END
                WHERE LOWER(uid) = LOWER(%s)
                """,
                (uid,),
            )
    _delete_lms_certificate(uid, number)
    return get_student_by_uid(uid)


def _delete_lms_certificate(uid: str, number: str = "") -> None:
    if not _lms_connect_kwargs():
        return
    try:
        with get_lms_connection() as conn:
            if conn is None:
                return
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM lms_certificate
                    WHERE LOWER(delegateNumber) = LOWER(%s)
                       OR ( %s <> '' AND LOWER(certificateNumber) = LOWER(%s) )
                    """,
                    (uid, number, number),
                )
    except Exception as exc:
        print(f"LMS certificate delete skipped ({uid}): {exc}", flush=True)


def upsert_student(data: dict) -> dict:
    fields = (
        "name",
        "father_name",
        "course_name",
        "batch_start",
        "batch_end",
        "uid",
        "certificate_number",
        "issue_date",
        "image_path",
        "logo_path",
        "phone",
        "email",
        "status",
    )
    values = {k: data.get(k) for k in fields}
    if not values.get("uid") or not values.get("name"):
        raise ValueError("uid and name are required")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM students WHERE LOWER(uid) = LOWER(%s)",
                (values["uid"],),
            )
            existing = cur.fetchone()
            if existing:
                keep_if_blank = (
                    "father_name",
                    "certificate_number",
                    "issue_date",
                    "image_path",
                    "logo_path",
                    "phone",
                    "email",
                    "batch_start",
                    "batch_end",
                    "status",
                    "course_name",
                )
                for key in keep_if_blank:
                    incoming = values.get(key)
                    current = existing.get(key) if isinstance(existing, dict) else existing[key]
                    if incoming in (None, "") and current not in (None, ""):
                        values[key] = current
                cur.execute(
                    """
                    UPDATE students SET
                        name = %s, father_name = %s, course_name = %s,
                        batch_start = %s, batch_end = %s,
                        certificate_number = %s, issue_date = %s, image_path = %s,
                        logo_path = %s, phone = %s, email = %s, status = %s
                    WHERE id = %s
                    """,
                    (
                        values["name"],
                        values.get("father_name") or "",
                        values["course_name"],
                        values.get("batch_start"),
                        values.get("batch_end"),
                        values.get("certificate_number"),
                        values.get("issue_date"),
                        values.get("image_path"),
                        values.get("logo_path"),
                        values.get("phone") or "",
                        values.get("email") or "",
                        values.get("status") or "admitted",
                        existing["id"],
                    ),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO students (
                        name, father_name, course_name, batch_start, batch_end,
                        uid, certificate_number, issue_date, image_path, logo_path, phone, email, status
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        values["name"],
                        values.get("father_name") or "",
                        values["course_name"],
                        values.get("batch_start"),
                        values.get("batch_end"),
                        values["uid"],
                        values.get("certificate_number"),
                        values.get("issue_date"),
                        values.get("image_path"),
                        values.get("logo_path"),
                        values.get("phone") or "",
                        values.get("email") or "",
                        values.get("status") or "admitted",
                    ),
                )
    student = get_student_by_uid(values["uid"])
    assert student is not None
    return student


def _normalize_batch_start(value: str | None) -> str:
    """Accept YYYY-MM or YYYY-MM-DD for training start date."""
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("Please select the training start date.")
    if len(raw) == 7 and raw[4] == "-":
        return f"{raw}-01"
    if len(raw) >= 10 and raw[4] == "-" and raw[7] == "-":
        return raw[:10]
    raise ValueError("Please enter a valid training start date.")


def admit_student(data: dict) -> dict:
    """Public admission — name, father_name, course_name, training start date."""
    name = str(data.get("name", "")).strip()
    father_name = str(data.get("father_name", "")).strip()
    course_name = str(data.get("course_name", "")).strip()
    batch_start = _normalize_batch_start(data.get("batch_start"))
    email = str(data.get("email") or "").strip().lower()

    if len(name) < 2:
        raise ValueError("Please enter the student full name.")
    if len(father_name) < 2:
        raise ValueError("Please enter father's name.")
    if not course_name:
        raise ValueError("Please select a course.")
    if not email or "@" not in email:
        raise ValueError("Please enter your Gmail address.")
    if not data.get("image_path"):
        raise ValueError("Please upload your photo.")

    requested_uid = str(data.get("uid") or "").strip().upper()
    if requested_uid:
        if get_student_by_uid(requested_uid):
            raise ValueError(f"UID {requested_uid} is already registered.")
        uid = requested_uid
    else:
        uid = next_uid(course_name)

    return upsert_student(
        {
            "uid": uid,
            "name": name,
            "father_name": father_name,
            "course_name": course_name,
            "batch_start": batch_start,
            "batch_end": None,
            "phone": "",
            "email": email,
            "image_path": data.get("image_path"),
            "logo_path": None,
            "certificate_number": None,
            "issue_date": None,
            "status": "admitted",
        }
    )


def update_student_status(uid: str, status: str) -> dict | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE students SET status = %s WHERE LOWER(uid) = LOWER(%s)",
                (status, uid.strip()),
            )
    return get_student_by_uid(uid)


def set_student_image_path(uid: str, image_path: str) -> dict | None:
    uid = str(uid or "").strip()
    path = str(image_path or "").strip()
    if not uid or not path:
        return None
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE students SET image_path = %s WHERE LOWER(uid) = LOWER(%s)",
                (path, uid),
            )
    return get_student_by_uid(uid)


def mark_student_milestone(
    uid: str,
    videos_completed_at: str | None = None,
    assessment_completed_at: str | None = None,
    videos_verified_at: str | None = None,
    issue_date: str | None = None,
) -> dict | None:
    """Persist video/assessment completion timestamps without overwriting other fields."""
    uid = uid.strip()
    if not uid:
        return None
    assignments: list[str] = []
    values: list = []
    if videos_completed_at:
        assignments.append("videos_completed_at = COALESCE(videos_completed_at, %s)")
        values.append(str(videos_completed_at)[:19].replace("T", " "))
    if assessment_completed_at:
        assignments.append("assessment_completed_at = COALESCE(assessment_completed_at, %s)")
        values.append(str(assessment_completed_at)[:19].replace("T", " "))
    if videos_verified_at:
        assignments.append("videos_verified_at = COALESCE(videos_verified_at, %s)")
        values.append(str(videos_verified_at)[:19].replace("T", " "))
        assignments.append("status = CASE WHEN COALESCE(status, '') = 'certified' THEN status ELSE %s END")
        values.append("videos_verified")
    if issue_date:
        assignments.append("issue_date = %s")
        values.append(str(issue_date)[:10])
    if not assignments:
        return get_student_by_uid(uid)
    values.append(uid)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE students SET {', '.join(assignments)} WHERE LOWER(uid) = LOWER(%s)",
                values,
            )
    return get_student_by_uid(uid)


def _row_to_video_access(row) -> dict:
    data = dict(row) if row else {}
    for key in ("expires_at", "created_at"):
        value = data.get(key)
        if hasattr(value, "isoformat"):
            data[key] = value.isoformat(sep=" ", timespec="seconds")
        elif value is not None:
            data[key] = str(value)
    return data


def create_video_access_request(
    *,
    uid: str,
    certificate_number: str,
    visitor_name: str,
    organisation: str,
    email: str,
    location: str,
    token: str,
    hours: int = 24,
) -> dict:
    uid = str(uid or "").strip()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=max(1, int(hours)))
    expires_sql = expires_at.replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")
    payload = (
        token,
        uid,
        str(certificate_number or "").strip(),
        str(visitor_name or "").strip(),
        str(organisation or "").strip(),
        str(email or "").strip().lower(),
        str(location or "").strip(),
        expires_sql,
    )
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO video_access_requests (
                    token, uid, certificate_number, visitor_name, organisation, email, location, expires_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                payload,
            )
            row_id = cur.lastrowid
            cur.execute(
                """
                SELECT id, token, uid, certificate_number, visitor_name, organisation, email, location,
                       expires_at, created_at
                FROM video_access_requests
                WHERE id = %s
                LIMIT 1
                """,
                (row_id,),
            )
            row = cur.fetchone()
    if row:
        return _row_to_video_access(row)
    return {
        "id": row_id,
        "token": token,
        "uid": uid,
        "certificate_number": str(certificate_number or "").strip(),
        "visitor_name": str(visitor_name or "").strip(),
        "organisation": str(organisation or "").strip(),
        "email": str(email or "").strip().lower(),
        "location": str(location or "").strip(),
        "expires_at": expires_sql,
    }


def get_valid_video_access(token: str, uid: str) -> dict | None:
    token = str(token or "").strip()
    uid = str(uid or "").strip()
    if not token or not uid:
        return None
    now_sql = datetime.now(timezone.utc).replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, token, uid, certificate_number, visitor_name, organisation, email, location,
                       expires_at, created_at
                FROM video_access_requests
                WHERE token = %s AND LOWER(uid) = LOWER(%s) AND expires_at > %s
                LIMIT 1
                """,
                (token, uid, now_sql),
            )
            row = cur.fetchone()
    return _row_to_video_access(row) if row else None


def list_video_access_requests(limit: int = 200) -> list[dict]:
    limit = max(1, min(int(limit or 200), 1000))
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, token, uid, certificate_number, visitor_name, organisation, email, location,
                       expires_at, created_at
                FROM video_access_requests
                ORDER BY id DESC
                LIMIT %s
                """,
                (limit,),
            )
            rows = cur.fetchall() or []
    return [_row_to_video_access(row) for row in rows]


def delete_student(uid: str) -> bool:
    uid = str(uid or "").strip()
    if not uid:
        return False
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM students WHERE LOWER(uid) = LOWER(%s)", (uid,))
            return cur.rowcount > 0


def seed_students(force: bool = False) -> int:
    init_db()
    _ensure_placeholder_photos()
    count = 0
    for student in SEED_STUDENTS:
        existing = get_student_by_uid(student["uid"])
        if existing and not force:
            continue
        upsert_student(student)
        count += 1
    for student in list_students():
        sync_certificate_to_lms(student)
    return count


def _ensure_placeholder_photos() -> None:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return

    colors = {
        "plm-001.png": "#0d4f3c",
        "plm-002.png": "#166534",
        "plm-003.png": "#14b8a6",
    }
    initials = {
        "plm-001.png": "DS",
        "plm-002.png": "VS",
        "plm-003.png": "JS",
    }
    for filename, color in colors.items():
        path = STUDENT_PHOTOS_DIR / filename
        if path.is_file():
            continue
        img = Image.new("RGB", (256, 256), color)
        draw = ImageDraw.Draw(img)
        text = initials[filename]
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 72)
        except OSError:
            font = ImageFont.load_default()
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(((256 - tw) / 2, (256 - th) / 2 - 8), text, fill="white", font=font)
        img.save(path, "PNG")


if __name__ == "__main__":
    n = seed_students(force=True)
    print(f"MySQL ready: {get_database_url()}")
    print(f"Seeded/updated {n} students")
    for s in list_students():
        print(f"  {s['uid']}: {s['name']} | {s['certificate_number']} | {s['batch_duration']}")
