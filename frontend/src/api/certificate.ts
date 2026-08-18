import type { Student } from '../types'

const PLUMBING_COURSE_NAME = 'Professional Plumbing Training Program'
const PLUMBING_TEMPLATE_FILE = 'Professional plumbing tarining program.pdf'

export function localVerifyUrl(uid: string, extra?: { email?: string; number?: string }) {
  const params = new URLSearchParams()
  const number = String(extra?.number || uid || '').trim()
  const email = String(extra?.email || '').trim().toLowerCase()
  if (number) {
    params.set('number', number)
    params.set('q', number)
  }
  if (email) params.set('email', email)
  const qs = params.toString()
  return qs ? `https://sftlms.com/certificates/verify?${qs}` : 'https://sftlms.com/certificates/verify'
}

const DEFAULT_CERTIFICATE_WEBHOOK =
  'https://damnart-ai-guladab.n8n-wsk.com/webhook-test/certificate'

export function certificateGenerateUrl(): string {
  const fromEnv =
    import.meta.env.VITE_CERTIFICATE_API_URL ||
    import.meta.env.NEXT_PUBLIC_CERTIFICATE_API_URL ||
    DEFAULT_CERTIFICATE_WEBHOOK
  return String(fromEnv).replace(/\/$/, '')
}

export function toDdMmYyyy(value: string | null | undefined): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const iso = raw.slice(0, 10)
  const parts = iso.split('-')
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`
  }
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (dmy) {
    return `${dmy[1].padStart(2, '0')}-${dmy[2].padStart(2, '0')}-${dmy[3]}`
  }
  return raw
}

export function trainingDurationMonths(start?: string | null, end?: string | null): string {
  const startRaw = String(start || '').slice(0, 10)
  if (!startRaw || startRaw.length < 8) return ''
  const startDate = new Date(`${startRaw}T00:00:00`)
  if (Number.isNaN(startDate.getTime())) return ''
  const endRaw = String(end || '').slice(0, 10)
  const endDate = endRaw.length >= 8 ? new Date(`${endRaw}T00:00:00`) : new Date()
  if (Number.isNaN(endDate.getTime())) return ''
  let months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth())
  if (endDate.getDate() < startDate.getDate()) months -= 1
  return String(Math.max(1, months))
}

export function isPlumbingCourse(courseName: string): boolean {
  return /plumb/i.test(courseName || '')
}

export function buildCertificatePayload(student: Student, grade?: string) {
  const uid = String(student.uid || '').trim()
  const courseFromDb = String(student.course_name || '').trim()

  const deriveCertificateNumber = (u: string, issueDate?: string | null): string => {
    const match = String(u || '').match(/(\d{3})$/)
    const last3 = match?.[1] || ''
    const yearRaw = String(issueDate || '').slice(0, 4)
    const year = /^\d{4}$/.test(yearRaw) ? yearRaw : String(new Date().getFullYear())
    return `ET/PPT/${last3}/${year}`
  }

  const certificateNumber = deriveCertificateNumber(uid, student.issue_date || null)
  const payload: Record<string, string> = {
    certificateId: uid,
    candidateName: String(student.name || '').trim(),
    courseName: courseFromDb,
    templateFile: '',
    grade: grade?.trim() || 'Excellent',
    certificateNumber,
    delegateNumber: uid,
    uid,
    verifyUrl: localVerifyUrl(uid, {
      email: String(student.email || ''),
      number: certificateNumber,
    }),
    issueDate: toDdMmYyyy(student.issue_date) || toDdMmYyyy(new Date().toISOString().slice(0, 10)),
    startDate: toDdMmYyyy(student.batch_start),
    trainingDuration: trainingDurationMonths(student.batch_start, student.batch_end),
  }

  const imagePath = String(student.image_path || '').trim()
  if (imagePath) {
    const normalized = imagePath.startsWith('/') ? imagePath : `/${imagePath}`
    const photoUrl = /^https?:\/\//i.test(imagePath) ? imagePath : `${window.location.origin}${normalized}`
    // Different generators/workflows may read different keys.
    payload.photoUrl = photoUrl
    payload.candidatePhotoUrl = photoUrl
    payload.imageUrl = photoUrl
  }

  if (isPlumbingCourse(courseFromDb)) {
    payload.courseName = PLUMBING_COURSE_NAME
    payload.templateFile = PLUMBING_TEMPLATE_FILE
  }

  return payload
}

export interface RemoteCertificateResult {
  success: boolean
  pdfUrl: string
  filename: string
  certificateId: string
  templateFile?: string
  courseName?: string
  error?: string
}

export async function generateCertificatePdf(student: Student, grade?: string): Promise<RemoteCertificateResult> {
  const fallback = await fetch('/api/certificate/generate', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: student.uid, grade: grade || 'Excellent' }),
  })
  const data = (await fallback.json().catch(() => ({}))) as RemoteCertificateResult
  if (!fallback.ok || !data.success || !data.pdfUrl) {
    throw new Error(data.error || 'Certificate generation failed')
  }
  return data
}
