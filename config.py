"""Sustainable Futures Training — steps, trade assessment, and app branding."""

APP_BRAND = {
    "name": "SFT Global Skills & Trade Assessment Council",
    "short_name": "SFT",
    "tagline": "Assessing Skills. Validating Competence.",
    "powered_by": "SFT Global Trade Assessment Authority",
    "theme_color": "#0d4f3c",
    "accent_color": "#14b8a6",
}

# Courses shown first in the programme (sustainable futures & trade focus)
FEATURED_COURSES = (
    "Carbon Trading & Reporting Practitioner Program",
    "Carbon Trading & Reporting",
    "Essentials of Carbon Trading & Reporting",
    "ESG Management Development Training Program",
    "Climate Adaptation & Cost of Inaction Training Course",
    "ISO 14064 GHG LEAD VERIFIER COURSE",
    "ISO 14064 Mastering GHG Accounting & Verification",
)

DEFAULT_COURSE = "Plumbing Foundational Course"

# Module video rules: minimum 1 minute, maximum 2 minutes, upload cap 300 MB
VIDEO_MIN_SECONDS = 60
VIDEO_MAX_SECONDS = 120
VIDEO_MAX_UPLOAD_BYTES = 300 * 1024 * 1024
# After all videos and assessment are done, wait 1 hour before certificate generation
CERTIFICATE_WAIT_SECONDS = 60 * 60

TRAINING_STEPS = [
    {
        "id": 1,
        "title": "Plumbing Safety & Tools",
        "description": (
            "Record a 1–2 minute video showing basic plumbing safety, PPE, and the tools "
            "used on a foundational plumbing job."
        ),
        "min_seconds": 60,
        "max_seconds": 120,
        "icon": "01",
        "image": "/static/images/week1-plumbing-tools.jpg",
    },
    {
        "id": 2,
        "title": "Pipe Fitting Practical",
        "description": (
            "Record a 1–2 minute video demonstrating pipe measurement, cutting, joining, "
            "or a basic fitting task from the plumbing foundational course."
        ),
        "min_seconds": 60,
        "max_seconds": 120,
        "icon": "02",
        "image": "/static/images/week2-pipe-fitting.jpg",
    },
    {
        "id": 3,
        "title": "Leak Check & Finish",
        "description": (
            "Record a 1–2 minute video explaining how you check for leaks, test the work, "
            "and complete the job to training standard."
        ),
        "min_seconds": 60,
        "max_seconds": 120,
        "icon": "03",
        "image": "/static/images/week3-sanitary-drainage.jpg",
    },
]

ASSESSMENT_TITLE = "Plumbing Foundational Assessment"
ASSESSMENT_SUBTITLE = (
    "Demonstrate your understanding of plumbing safety, fittings, and job completion standards."
)

ASSESSMENT_QUESTIONS = [
    {
        "id": "q1",
        "question": "What is the primary purpose of a carbon credit in emissions trading schemes?",
        "options": [
            "To replace all physical goods with digital tokens",
            "To represent one tonne of CO₂ equivalent reduced or removed from the atmosphere",
            "To increase fossil fuel production quotas",
            "To eliminate the need for environmental reporting",
        ],
        "correct": 1,
    },
    {
        "id": "q2",
        "question": "Which emissions category includes indirect emissions from purchased electricity?",
        "options": [
            "Scope 1 — direct emissions",
            "Scope 2 — energy indirect emissions",
            "Scope 3 — other indirect value-chain emissions",
            "Scope 4 — consumer emissions only",
        ],
        "correct": 1,
    },
    {
        "id": "q3",
        "question": "In ESG reporting, what does the 'G' pillar primarily address?",
        "options": [
            "Greenhouse gas verification only",
            "Governance structures, ethics, and board oversight",
            "Geographic trade routes",
            "Government tax incentives",
        ],
        "correct": 1,
    },
    {
        "id": "q4",
        "question": "Which international standard is widely used for GHG quantification and verification?",
        "options": [
            "ISO 9001",
            "ISO 14064",
            "ISO 27001",
            "ISO 22000",
        ],
        "correct": 1,
    },
    {
        "id": "q5",
        "question": "What is a key principle of sustainable futures trade assessment?",
        "options": [
            "Maximise short-term profit regardless of environmental impact",
            "Transparency, traceability, and verified environmental claims",
            "Avoid all documentation to reduce costs",
            "Report only when legally forced to do so",
        ],
        "correct": 1,
    },
    {
        "id": "q6",
        "question": "What does 'net zero' typically require organisations to do?",
        "options": [
            "Stop all business operations immediately",
            "Balance anthropogenic GHG emissions with removals, often by 2050",
            "Export all emissions to other countries",
            "Replace all staff with automation",
        ],
        "correct": 1,
    },
    {
        "id": "q7",
        "question": "In cap-and-trade systems, what happens when an emitter exceeds its allocated allowance?",
        "options": [
            "No action is required",
            "They must purchase additional allowances or face penalties",
            "They automatically receive free extra credits",
            "Their licence is permanently revoked without appeal",
        ],
        "correct": 1,
    },
]

PASS_PERCENTAGE = 70
