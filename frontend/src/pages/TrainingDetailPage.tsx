import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Award,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Mail,
  Plus,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Video,
} from 'lucide-react'
import { api } from '../api/client'
import { generateCertificatePdf, localVerifyUrl, trainingDurationMonths } from '../api/certificate'
import { InstituteTabBar } from '../components/InstituteTabBar'
import { LogoutButton } from '../components/LogoutButton'
import { OrgLogo } from '../components/OrgLogo'
import { StudentPhoto } from '../components/StudentPhoto'
import type { InstituteCourse, Student, TrainingStep } from '../types'

const EUROTECH_LOGO = '/static/images/eurotech-logo.png'

function emailedStorageKey(courseId: string) {
  return `sft-cert-emailed:${courseId}`
}

function loadEmailedUids(courseId: string): Record<string, boolean> {
  try {
    const raw = sessionStorage.getItem(emailedStorageKey(courseId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, boolean>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function deriveCertNumber(uid: string, issueDate?: string | null) {
  const last3 = uid.match(/(\d{3})$/)?.[1] || '001'
  const year = (issueDate || '').slice(0, 4) || String(new Date().getFullYear())
  return `ET/PPT/${last3}/${year}`
}

function formatBatchDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!y || !m || !d) return iso
  return `${d}-${m}-${y}`
}

function localTodayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Grade unlocks on/after the student's (or course) batch end date. */
function isTrainingPeriodComplete(student: Student, course?: InstituteCourse | null) {
  const end = (student.batch_end || course?.batch_end || '').slice(0, 10)
  if (!end) return false
  return localTodayISO() >= end
}

function trainingPeriodLockMessage(student: Student, course?: InstituteCourse | null) {
  const end = (student.batch_end || course?.batch_end || '').slice(0, 10)
  if (!end) {
    return 'Set the training batch end date first. Grade unlocks after the training period ends. Videos can still be uploaded.'
  }
  if (localTodayISO() < end) {
    return `Grade selection unlocks after the training period ends on ${formatBatchDate(end)}. Videos can still be uploaded during training.`
  }
  return ''
}

const CERTIFICATE_GRADES = ['Outstanding', 'Excellent', 'Good'] as const
const STUDENT_PHOTO_HINT =
  'JPG, PNG or WebP · passport size 300×400 px (35×45 mm) · max 2 MB'
const STUDENT_PHOTO_MAX_BYTES = 2 * 1024 * 1024
const STUDENT_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'

function validateStudentPhoto(file: File): string | null {
  const okType =
    /image\/(jpeg|png|webp)/i.test(file.type) ||
    /\.(jpe?g|png|webp)$/i.test(file.name)
  if (!okType) return 'Use JPG, PNG, or WebP only.'
  if (file.size > STUDENT_PHOTO_MAX_BYTES) return 'Photo must be 2 MB or smaller.'
  return null
}

function weekIdsForStudent(student: Student, fallbackIds: Array<string | number>) {
  const fromVideos = (student.videos || []).map((video) => String(video.id))
  return fromVideos.length ? fromVideos : fallbackIds.map(String)
}

function privateMarkFor(student: Student, id: string | number) {
  const key = String(id)
  const scores = student.week_scores || {}
  const value = scores[key] ?? scores[Number(key) as unknown as string]
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function allPrivateMarksSaved(student: Student, fallbackIds: Array<string | number>) {
  const ids = weekIdsForStudent(student, fallbackIds)
  if (!ids.length) return false
  return ids.every((id) => privateMarkFor(student, id) != null)
}

export function TrainingDetailPage() {
  const { courseId = '' } = useParams()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [course, setCourse] = useState<InstituteCourse | null>(null)
  const [steps, setSteps] = useState<TrainingStep[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [generatingUid, setGeneratingUid] = useState<string | null>(null)
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({})
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, string>>({})
  const [emailedUids, setEmailedUids] = useState<Record<string, boolean>>(() => loadEmailedUids(courseId))

  const [name, setName] = useState('')
  const [fatherName, setFatherName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [batchStart, setBatchStart] = useState('')
  const [batchEnd, setBatchEnd] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const replacePhotoRef = useRef<HTMLInputElement>(null)
  const replacePhotoUidRef = useRef<string | null>(null)

  const loadCourse = useCallback(async () => {
    const res = await api.adminGetCourse(courseId)
    setCourse(res.course)
    setSteps(res.steps)
    setStudents(res.students)
    setScoreDrafts(
      Object.fromEntries(
        (res.students || []).flatMap((student) => {
          const videos = student.videos || []
          const fromVideos = videos.map((video) => [
            `${student.uid}:${video.id}`,
            video.privateScore == null ? '' : String(video.privateScore),
          ])
          const fromMap = Object.entries(student.week_scores || {}).map(([key, value]) => [
            `${student.uid}:${key}`,
            String(value),
          ])
          return [...fromVideos, ...fromMap]
        }),
      ),
    )
    setGradeDrafts(
      Object.fromEntries((res.students || []).map((student) => [student.uid, student.trainer_grade || ''])),
    )
  }, [courseId])

  useEffect(() => {
    setEmailedUids(loadEmailedUids(courseId))
  }, [courseId])

  useEffect(() => {
    api
      .adminStatus()
      .then(async (s) => {
        if (!s.authenticated) {
          navigate('/', { replace: true })
          return
        }
        await loadCourse()
      })
      .catch(() => navigate('/', { replace: true }))
      .finally(() => setChecking(false))
  }, [loadCourse, navigate])

  const resetAddForm = () => {
    setName('')
    setFatherName('')
    setEmail('')
    setPhone('')
    setBatchStart('')
    setBatchEnd('')
    setPhoto(null)
    setAdding(false)
    setError('')
  }

  const addMonths = (iso: string, months: number) => {
    const [y, m, d] = iso.split('-').map(Number)
    if (!y || !m || !d) return iso
    const dt = new Date(y, m - 1 + months, d)
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    return `${dt.getFullYear()}-${mm}-${dd}`
  }

  const onBatchStartChange = (value: string) => {
    setBatchStart(value)
    const months = Number(course?.duration_months || 0)
    if (value && months > 0) setBatchEnd(addMonths(value, months))
  }

  const addStudentDuration =
    trainingDurationMonths(batchStart, batchEnd) || (batchStart && batchEnd ? '1' : '')

  const addStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Enter student name')
      return
    }
    if (!batchStart || !batchEnd) {
      setError('Enter this student\'s batch start and end dates.')
      return
    }
    if (batchEnd < batchStart) {
      setError('Batch end date must be on or after start date.')
      return
    }
    if (!photo) {
      setError('Upload the student photo.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('father_name', fatherName.trim())
      fd.append('email', email.trim())
      fd.append('phone', phone.trim())
      fd.append('batch_start', batchStart)
      fd.append('batch_end', batchEnd)
      if (photo) fd.append('image', photo)
      const res = await api.adminAddCourseStudent(courseId, fd)
      setStudents((prev) => [...prev, res.student])
      setMessage(res.message)
      resetAddForm()
      setOpenUid(res.student.uid)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add student')
    } finally {
      setBusy(false)
    }
  }

  const replaceStudentPhoto = async (uid: string, file: File) => {
    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await api.adminUploadStudentPhoto(uid, fd)
      setStudents((prev) => prev.map((s) => (s.uid === uid ? { ...s, ...res.student } : s)))
      setMessage('Photo saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save photo')
    } finally {
      setBusy(false)
      replacePhotoUidRef.current = null
    }
  }

  const removeStudent = async (student: Student) => {
    if (!confirm(`Remove ${student.name}?`)) return
    setBusy(true)
    setError('')
    try {
      await api.adminDeleteStudent(student.uid)
      setStudents((prev) => prev.filter((s) => s.uid !== student.uid))
      if (openUid === student.uid) setOpenUid(null)
      setMessage(`${student.name} removed`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove student')
    } finally {
      setBusy(false)
    }
  }

  const uploadVideo = async (uid: string, stepId: string | number, file: File) => {
    const key = `${uid}:${stepId}`
    setUploadingKey(key)
    setError('')
    try {
      const fd = new FormData()
      fd.append('video', file)
      fd.append('durationUnknown', '1')
      const res = await api.adminUploadStudentVideo(uid, stepId, fd)
      setStudents((prev) =>
        prev.map((s) =>
          s.uid === uid
            ? {
                ...s,
                ...res.student,
                week_scores: res.student.week_scores || s.week_scores,
              }
            : s,
        ),
      )
      setMessage('Video uploaded')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingKey(null)
    }
  }

  const issueCertificate = async (student: Student) => {
    setGeneratingUid(student.uid)
    setError('')
    setMessage('')
    try {
      if (!isTrainingPeriodComplete(student, course)) {
        setError(trainingPeriodLockMessage(student, course))
        return
      }
      const grade = (gradeDrafts[student.uid] || student.trainer_grade || '').trim()
      if (!CERTIFICATE_GRADES.includes(grade as (typeof CERTIFICATE_GRADES)[number])) {
        setError('Select Outstanding, Excellent, or Good first, then generate the certificate.')
        return
      }
      const result = await generateCertificatePdf(student, grade, {
        batch_start: student.batch_start,
        batch_end: student.batch_end,
        issue_date: student.issue_date || student.batch_end || undefined,
      })
      setStudents((prev) =>
        prev.map((s) =>
          s.uid === student.uid
            ? {
                ...s,
                certificate: result as Student['certificate'],
                certificate_recorded: true,
                certificate_pdf_ready: true,
                certificate_needs_regeneration: false,
                trainer_grade: grade,
              }
            : s,
        ),
      )
      const emailed = Boolean(result.emailSent)
      const emailNote = String(result.emailDetail || '')
      setMessage(
        emailed
          ? `Certificate generated for ${student.name}. Download email sent to ${student.email}.`
          : emailNote
            ? `Certificate generated for ${student.name}. Email not sent: ${emailNote}`
            : `Certificate generated for ${student.name}`,
      )
      window.open(result.downloadUrl || `${result.pdfUrl}?download=1`, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Certificate generation failed')
    } finally {
      setGeneratingUid(null)
      try {
        await loadCourse()
      } catch {
        /* keep optimistic certificate state if refresh fails */
      }
    }
  }

  const sendCertificateEmail = async (student: Student, toEmail?: string) => {
    const email = String(toEmail || student.email || '').trim().toLowerCase()
    if (!email || !email.includes('@')) {
      setError('Add the student email first, then click Email certificate.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const res = await api.adminSendCertificateEmail(student.uid, email)
      if (res.student) {
        setStudents((prev) => prev.map((s) => (s.uid === student.uid ? { ...s, ...res.student } : s)))
      } else if (email !== String(student.email || '').trim().toLowerCase()) {
        setStudents((prev) => prev.map((s) => (s.uid === student.uid ? { ...s, email } : s)))
      }
      setEmailedUids((prev) => {
        const next = { ...prev, [student.uid]: true }
        sessionStorage.setItem(emailedStorageKey(courseId), JSON.stringify(next))
        return next
      })
      setMessage(res.message || `Certificate email sent to ${email}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send certificate email')
    } finally {
      setBusy(false)
    }
  }

  const savePrivateScore = async (student: Student, stepId: string | number) => {
    const key = `${student.uid}:${stepId}`
    const raw = scoreDrafts[key] ?? ''
    const score = Number(raw)
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      setError('Enter a private score between 0 and 100.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const res = await api.adminSetScore(student.uid, score, stepId)
      setStudents((prev) =>
        prev.map((s) =>
          s.uid === student.uid
            ? {
                ...s,
                trainer_score: res.trainer_score,
                week_scores: res.week_scores || { ...(s.week_scores || {}), [String(stepId)]: score },
                videos: (s.videos || []).map((video) =>
                  String(video.id) === String(stepId) ? { ...video, privateScore: score } : video,
                ),
              }
            : s,
        ),
      )
      setMessage(`Private marks saved for ${student.name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save marks')
    } finally {
      setBusy(false)
    }
  }

  const saveGrade = async (student: Student, grade: string) => {
    if (!isTrainingPeriodComplete(student, course)) {
      setError(trainingPeriodLockMessage(student, course))
      return
    }
    setGradeDrafts((prev) => ({ ...prev, [student.uid]: grade }))
    if (!CERTIFICATE_GRADES.includes(grade as (typeof CERTIFICATE_GRADES)[number])) return
    setBusy(true)
    setError('')
    try {
      const res = await api.adminSetGrade(student.uid, grade)
      setStudents((prev) =>
        prev.map((s) => (s.uid === student.uid ? { ...s, trainer_grade: res.trainer_grade } : s)),
      )
      setMessage(`Grade saved for ${student.name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save grade')
    } finally {
      setBusy(false)
    }
  }

  if (checking) {
    return (
      <div className="app-frame flex items-center justify-center bg-slate-50 text-sm text-slate-400">
        Loading…
      </div>
    )
  }

  if (!course) {
    return (
      <div className="app-frame flex flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
        <p className="text-sm text-slate-500">Training not found</p>
        <Link to="/home" className="text-sm font-semibold text-brand-900">
          Back to home
        </Link>
      </div>
    )
  }

  const pathwaySteps = steps.filter((s) => s.kind !== 'practical')
  const practicalStep = steps.find((s) => s.kind === 'practical')

  const isPlumbing = course.id === 'plumbing' || /plumb/i.test(course.title)
  const heroImage = course.image || '/static/images/hero-plumbing.jpg'
  const batchLabel =
    course.batch_start || course.batch_end
      ? `${formatBatchDate(course.batch_start || '')} – ${formatBatchDate(course.batch_end || '')}`
      : ''
  const heroKicker = isPlumbing ? 'Trade skills pathway' : 'Official training'
  const heroSubtitle = isPlumbing
    ? 'Hands-on foundation in tools, pipework, sanitary fittings, and site testing — with weekly video proofs and a certified finish.'
    : course.description || 'Manage students, weekly videos, practical assessment, and certificates.'

  return (
    <div className="app-frame bg-slate-50">
      <section className="relative shrink-0 overflow-hidden text-white">
        <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-linear-to-b from-black/55 via-brand-950/72 to-brand-950" />
        <div className="relative z-10 flex min-h-[clamp(16.5rem,44vh,22rem)] flex-col px-4 pb-4 pt-[max(env(safe-area-inset-top),0.7rem)]">
          <div className="flex items-center gap-2">
            <OrgLogo alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white/30" />
            <p className="min-w-0 flex-1 truncate text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/70">
              {heroKicker}
            </p>
            <button
              type="button"
              onClick={() => navigate('/institute-profile')}
              className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 ring-1 ring-white/40 shadow-md active:scale-95"
              aria-label="Open Eurotech profile"
            >
              <img
                src={EUROTECH_LOGO}
                alt="Eurotech Assessment and Certification Services"
                className="h-full w-full object-contain"
              />
            </button>
            <LogoutButton />
          </div>

          <div className="mt-auto">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-accent-300">
              {isPlumbing ? 'Professional Plumbing Foundation' : 'Training programme'}
            </p>
            <h1 className="mt-1.5 font-display text-[clamp(1.2rem,5.4vw,1.7rem)] font-bold leading-tight tracking-tight">
              {course.title}
            </h1>
            <p className="mt-2 max-w-[22rem] text-[0.78rem] leading-relaxed text-white/80">
              {heroSubtitle}
            </p>
            <div className="mt-3.5 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-black/35 px-2.5 py-2.5 ring-1 ring-white/15 backdrop-blur-md">
                <Video size={13} className="text-accent-300" />
                <p className="mt-1.5 text-[0.58rem] font-semibold uppercase tracking-wide text-white/50">Pathway</p>
                <p className="mt-0.5 text-[0.72rem] font-bold leading-snug">{pathwaySteps.length} week videos</p>
              </div>
              <div className="rounded-2xl bg-black/35 px-2.5 py-2.5 ring-1 ring-white/15 backdrop-blur-md">
                <Users size={13} className="text-accent-300" />
                <p className="mt-1.5 text-[0.58rem] font-semibold uppercase tracking-wide text-white/50">Learners</p>
                <p className="mt-0.5 text-[0.72rem] font-bold leading-snug">
                  {students.length} student{students.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            {batchLabel && (
              <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[0.68rem] font-semibold text-white/85 ring-1 ring-white/15">
                <CalendarDays size={12} className="text-accent-300" />
                Batch {batchLabel}
              </p>
            )}
          </div>
        </div>
      </section>

      <main className="screen-scroll flex min-h-0 flex-1 flex-col p-4 pb-[max(env(safe-area-inset-bottom),5.5rem)]">
        {/* Add student */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold text-brand-950">
              <UserPlus size={16} />
              Students ({students.length})
            </h2>
            {!adding && (
              <button
                type="button"
                onClick={() => { setAdding(true); setError(''); setMessage('') }}
                className="inline-flex items-center gap-1 rounded-xl bg-brand-950 px-3 py-2 text-[0.72rem] font-semibold text-white active:scale-[0.97]"
              >
                <Plus size={14} /> Add student
              </button>
            )}
          </div>

          {adding && (
            <form onSubmit={addStudent} className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <p className="mb-3 text-[0.72rem] text-slate-500">
                Add a student and set their own batch start and end dates. These dates will print on their certificate.
              </p>
              <input
                ref={photoRef}
                type="file"
                accept={STUDENT_PHOTO_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  e.target.value = ''
                  if (!file) return
                  const err = validateStudentPhoto(file)
                  if (err) {
                    setError(err)
                    setPhoto(null)
                    return
                  }
                  setError('')
                  setPhoto(file)
                }}
              />
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                className="mb-1 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50"
              >
                {photo ? (
                  <img src={URL.createObjectURL(photo)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Camera size={22} className="text-slate-400" />
                )}
              </button>
              <p className="mb-0.5 text-[0.62rem] font-semibold text-slate-500">Student photo *</p>
              <p className="mb-3 text-[0.58rem] leading-snug text-slate-400">{STUDENT_PHOTO_HINT}</p>
              <div className="space-y-2.5">
                <input className="input-field !py-2.5" placeholder="Student name *" value={name} onChange={(e) => setName(e.target.value)} required />
                <input className="input-field !py-2.5" placeholder="Father's name" value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
                <input className="input-field !py-2.5" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input className="input-field !py-2.5" type="tel" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[0.62rem] font-bold uppercase tracking-wide text-slate-500">
                      Batch start *
                    </span>
                    <input
                      className="input-field !py-2.5"
                      type="date"
                      value={batchStart}
                      onChange={(e) => onBatchStartChange(e.target.value)}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[0.62rem] font-bold uppercase tracking-wide text-slate-500">
                      Batch end *
                    </span>
                    <input
                      className="input-field !py-2.5"
                      type="date"
                      min={batchStart || undefined}
                      value={batchEnd}
                      onChange={(e) => setBatchEnd(e.target.value)}
                      required
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-[0.62rem] font-bold uppercase tracking-wide text-slate-500">
                    Duration
                  </span>
                  <input
                    className="input-field !py-2.5 bg-slate-50 text-slate-600"
                    value={addStudentDuration ? `${addStudentDuration} month${addStudentDuration === '1' ? '' : 's'}` : ''}
                    placeholder="Auto from batch dates"
                    readOnly
                  />
                </label>
                <p className="text-[0.65rem] leading-relaxed text-slate-400">
                  Trainer sets each student&apos;s training period. The certificate will use these dates.
                </p>
              </div>
              {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={resetAddForm} className="rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="rounded-xl bg-brand-950 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? 'Adding…' : 'Add student'}
                </button>
              </div>
            </form>
          )}

          {message && !adding && <p className="mb-2 text-xs text-emerald-700">{message}</p>}
          {error && !adding && <p className="mb-2 text-xs text-red-600">{error}</p>}

          <input
            ref={replacePhotoRef}
            type="file"
            accept={STUDENT_PHOTO_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file || !replacePhotoUidRef.current) return
              const err = validateStudentPhoto(file)
              if (err) {
                setError(err)
                replacePhotoUidRef.current = null
                return
              }
              void replaceStudentPhoto(replacePhotoUidRef.current, file)
            }}
          />

          {students.length === 0 && !adding && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
              <p className="text-sm font-semibold text-brand-950">No students yet</p>
              <p className="mt-1 text-[0.72rem] text-slate-500">Add students, then upload their week videos here.</p>
            </div>
          )}

          <ul className="space-y-3">
            {students.map((student) => {
              const expanded = openUid === student.uid
              const videos = student.videos || []
              const studentDuration =
                trainingDurationMonths(student.batch_start, student.batch_end) ||
                (course.duration_months ? String(course.duration_months) : '')
              return (
                <li key={student.uid} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
                  <div className="flex gap-3 p-3">
                    <button
                      type="button"
                      onClick={() => {
                        replacePhotoUidRef.current = student.uid
                        replacePhotoRef.current?.click()
                      }}
                      className="h-14 w-14 shrink-0 overflow-hidden rounded-full ring-2 ring-white"
                      aria-label={`Change photo for ${student.name}`}
                    >
                      <StudentPhoto
                        src={student.image_path}
                        alt={student.name}
                        className="h-14 w-14 rounded-full object-cover"
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">{student.name}</p>
                      {student.father_name && <p className="text-[0.68rem] text-slate-500">S/O {student.father_name}</p>}
                      <p className="mt-0.5 text-[0.65rem] font-semibold text-brand-800">UID: {student.uid}</p>
                      {(student.batch_start || student.batch_end) && (
                        <p className="text-[0.62rem] text-slate-500">
                          Batch {formatBatchDate(student.batch_start || '')} – {formatBatchDate(student.batch_end || '')}
                        </p>
                      )}
                      {studentDuration && (
                        <p className="text-[0.62rem] text-slate-500">
                          Duration: {studentDuration} month{studentDuration === '1' ? '' : 's'}
                        </p>
                      )}
                      <p className="text-[0.62rem] text-slate-400">
                        Videos: {student.video_proof || `${student.uploaded_steps ?? 0}/${student.expected_steps ?? pathwaySteps.length}`}
                        {student.practical_uploaded || student.assessment_recorded ? ' · Practical ✓' : ''}
                        {student.certificate_recorded ? ' · Certificate ✓' : student.certificate_needs_regeneration ? ' · Certificate PDF missing' : ''}
                      </p>
                      {student.trainer_score != null && (
                        <p className="text-[0.62rem] font-medium text-brand-800">
                          Private avg: {student.trainer_score}/100
                        </p>
                      )}
                      {(student.videos || []).length > 0 && (
                        <p className="mt-0.5 text-[0.58rem] leading-relaxed text-slate-500">
                          {(student.videos || [])
                            .map((video) => {
                              const mark = privateMarkFor(student, video.id)
                              const label = video.kind === 'practical' ? 'Practical' : `W${video.id}`
                              return `${label} ${mark == null ? '—' : mark}`
                            })
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => setOpenUid(expanded ? null : student.uid)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-brand-900"
                        aria-label={expanded ? 'Collapse' : 'Expand'}
                      >
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeStudent(student)}
                        disabled={busy}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-500 disabled:opacity-50"
                        aria-label={`Remove ${student.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="space-y-3 border-t border-slate-100 bg-slate-50 p-3">
                      <CertificatePanel
                        student={student}
                        course={course}
                        busy={generatingUid === student.uid || busy}
                        grade={gradeDrafts[student.uid] ?? student.trainer_grade ?? ''}
                        marksReady={allPrivateMarksSaved(student, [...pathwaySteps.map((s) => s.id), 'practical'])}
                        onGradeChange={(value) => void saveGrade(student, value)}
                        onGenerate={() => void issueCertificate(student)}
                        onEmail={(emailAddr) => void sendCertificateEmail(student, emailAddr)}
                        emailSent={Boolean(emailedUids[student.uid])}
                        onPhoto={async (file) => {
                          await replaceStudentPhoto(student.uid, file)
                        }}
                        onError={(message) => setError(message)}
                        onSave={async (updates) => {
                          setBusy(true)
                          setError('')
                          setMessage('')
                          try {
                            const res = await api.adminUpdateStudent(student.uid, updates)
                            setStudents((prev) =>
                              prev.map((s) => (s.uid === student.uid ? { ...s, ...res.student } : s)),
                            )
                            setMessage(res.message || `Saved details for ${updates.name}`)
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Could not save student details')
                          } finally {
                            setBusy(false)
                          }
                        }}
                      />

                      <p className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-500">
                        Upload videos for {student.name}
                      </p>
                      <p className="text-[0.65rem] text-slate-500">
                        Week videos are optional. Only the final practical video is required.
                      </p>
                      {videos.map((video) => {
                        const uploadKey = `${student.uid}:${video.id}`
                        const isUploading = uploadingKey === uploadKey
                        const isPractical = video.kind === 'practical'
                        return (
                          <div key={String(video.id)} className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[0.75rem] font-semibold text-brand-950">
                                  {video.title}
                                  <span
                                    className={`ml-2 rounded-full px-1.5 py-0.5 text-[0.55rem] font-bold uppercase ${
                                      isPractical
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-slate-100 text-slate-500'
                                    }`}
                                  >
                                    {isPractical ? 'Required' : 'Optional'}
                                  </span>
                                </p>
                                <p className="mt-0.5 line-clamp-2 text-[0.65rem] text-slate-500">{video.description}</p>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[0.58rem] font-bold uppercase ${
                                    video.uploaded ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {video.uploaded ? 'Uploaded' : 'Pending'}
                                </span>
                                <span className="rounded-full bg-brand-950/8 px-2 py-0.5 text-[0.58rem] font-bold text-brand-900">
                                  {privateMarkFor(student, video.id) == null
                                    ? 'No marks'
                                    : `${privateMarkFor(student, video.id)}/100`}
                                </span>
                              </div>
                            </div>
                            {video.uploaded && video.videoUrl && (
                              <video src={video.videoUrl} controls playsInline className="mt-2 max-h-40 w-full rounded-lg bg-black" />
                            )}
                            <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-brand-900/20 bg-brand-950/5 py-2.5 text-[0.72rem] font-semibold text-brand-900 active:scale-[0.98]">
                              <Upload size={14} />
                              {isUploading ? 'Uploading…' : video.uploaded ? 'Replace video' : 'Upload video'}
                              <input
                                type="file"
                                accept="video/*"
                                className="hidden"
                                disabled={isUploading}
                                onChange={(e) => {
                                  const f = e.target.files?.[0]
                                  if (f) void uploadVideo(student.uid, video.id, f)
                                  e.target.value = ''
                                }}
                              />
                            </label>
                            <PrivateMarksField
                              label={`Private marks · ${video.title}`}
                              value={scoreDrafts[`${student.uid}:${video.id}`] ?? String(privateMarkFor(student, video.id) ?? '')}
                              saved={privateMarkFor(student, video.id)}
                              busy={busy}
                              onChange={(value) =>
                                setScoreDrafts((prev) => ({ ...prev, [`${student.uid}:${video.id}`]: value }))
                              }
                              onSave={() => void savePrivateScore(student, video.id)}
                            />
                          </div>
                        )
                      })}
                      {!videos.length && pathwaySteps.map((step) => (
                        <VideoUploadRow
                          key={step.id}
                          student={student}
                          step={step}
                          uploadingKey={uploadingKey}
                          scoreValue={scoreDrafts[`${student.uid}:${step.id}`] ?? ''}
                          onScoreChange={(value) =>
                            setScoreDrafts((prev) => ({ ...prev, [`${student.uid}:${step.id}`]: value }))
                          }
                          onSaveMarks={() => void savePrivateScore(student, step.id)}
                          busy={busy}
                          onUpload={uploadVideo}
                        />
                      ))}
                      {!videos.length && practicalStep && (
                        <VideoUploadRow
                          student={student}
                          step={{ ...practicalStep, id: 'practical' }}
                          uploadingKey={uploadingKey}
                          scoreValue={scoreDrafts[`${student.uid}:practical`] ?? ''}
                          onScoreChange={(value) =>
                            setScoreDrafts((prev) => ({ ...prev, [`${student.uid}:practical`]: value }))
                          }
                          onSaveMarks={() => void savePrivateScore(student, 'practical')}
                          busy={busy}
                          onUpload={uploadVideo}
                        />
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      </main>

      <InstituteTabBar active="course" />
    </div>
  )
}

function CertificatePanel({
  student,
  course,
  busy,
  grade,
  marksReady,
  emailSent,
  onGradeChange,
  onGenerate,
  onEmail,
  onPhoto,
  onError,
  onSave,
}: {
  student: Student
  course: InstituteCourse
  busy: boolean
  grade: string
  marksReady: boolean
  emailSent?: boolean
  onGradeChange: (grade: string) => void
  onGenerate: () => void
  onEmail: (email: string) => void
  onPhoto: (file: File) => Promise<void>
  onError?: (message: string) => void
  onSave: (updates: {
    name: string
    father_name: string
    email: string
    phone: string
    batch_start: string
    batch_end: string
    issue_date: string
    course_name: string
  }) => Promise<void>
}) {
  const cert = student.certificate
  const [name, setName] = useState(student.name || '')
  const [fatherName, setFatherName] = useState(student.father_name || '')
  const [email, setEmail] = useState(student.email || '')
  const [phone, setPhone] = useState(student.phone || '')
  const [batchStart, setBatchStart] = useState((student.batch_start || '').slice(0, 10))
  const [batchEnd, setBatchEnd] = useState((student.batch_end || '').slice(0, 10))
  const [issueDate, setIssueDate] = useState((student.issue_date || student.batch_end || '').slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(student.name || '')
    setFatherName(student.father_name || '')
    setEmail(student.email || '')
    setPhone(student.phone || '')
    setBatchStart((student.batch_start || '').slice(0, 10))
    setBatchEnd((student.batch_end || '').slice(0, 10))
    setIssueDate((student.issue_date || student.batch_end || '').slice(0, 10))
  }, [
    student.uid,
    student.name,
    student.father_name,
    student.email,
    student.phone,
    student.batch_start,
    student.batch_end,
    student.issue_date,
  ])

  const certNo =
    cert?.certificateNumber ||
    student.certificate_number ||
    deriveCertNumber(student.uid, issueDate || student.issue_date)
  const verifyUrl =
    cert?.verifyUrl ||
    localVerifyUrl(student.uid, { number: certNo })
  const pdfUrl = cert?.pdfUrl || cert?.downloadUrl
  const downloadPdfUrl = cert?.downloadUrl || (pdfUrl ? `${pdfUrl}${pdfUrl.includes('?') ? '&' : '?'}download=1` : null)
  const downloadFileName =
    cert?.downloadFilename ||
    `${(student.name || 'Candidate').replace(/[^\w\s-]+/g, '').replace(/[\s_-]+/g, '_')}_${(student.course_name || course.title || 'Certificate').replace(/[^\w\s-]+/g, '').replace(/[\s_-]+/g, '_')}.pdf`
  const duration = trainingDurationMonths(batchStart, batchEnd) || (course.duration_months ? String(course.duration_months) : '—')
  const ready = Boolean(student.certificate_recorded && pdfUrl)
  const needsRegeneration = Boolean(student.certificate_needs_regeneration || ((student.certificate_number || certNo) && !pdfUrl))
  const periodComplete = isTrainingPeriodComplete(student, course)
  const periodLockMessage = trainingPeriodLockMessage(student, course)
  const gradeReady = periodComplete && CERTIFICATE_GRADES.includes(grade as (typeof CERTIFICATE_GRADES)[number])
  const canIssue = gradeReady
  const dirty =
    name.trim() !== (student.name || '') ||
    fatherName.trim() !== (student.father_name || '') ||
    email.trim() !== (student.email || '') ||
    phone.trim() !== (student.phone || '') ||
    batchStart !== (student.batch_start || '').slice(0, 10) ||
    batchEnd !== (student.batch_end || '').slice(0, 10) ||
    issueDate !== (student.issue_date || student.batch_end || '').slice(0, 10)

  const saveDetails = async () => {
    if (!name.trim()) return
    if (batchStart && batchEnd && batchEnd < batchStart) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        father_name: fatherName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        batch_start: batchStart,
        batch_end: batchEnd,
        issue_date: issueDate,
        course_name: student.course_name || course.title,
      })
    } finally {
      setSaving(false)
    }
  }

  const readonlyRows = [
    ['UID / Roll No', student.uid],
    ['Course', student.course_name || course.title],
    ['Training duration', duration ? `${duration} month${Number(duration) > 1 ? 's' : ''}` : '—'],
    ['Certificate No.', certNo || '—'],
    ['Video progress', student.video_proof || '—'],
    ['Practical video', student.practical_uploaded || student.assessment_recorded ? 'Uploaded' : 'Pending'],
    ['Private marks', marksReady ? `Saved · avg ${student.trainer_score ?? '—'}/100` : 'Optional per video'],
    ['Certificate status', ready ? 'Issued' : needsRegeneration ? 'PDF missing — generate again' : canIssue ? 'Ready to issue' : 'Select a grade to generate'],
  ]

  return (
    <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-100">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-brand-950/5 px-3 py-2.5">
        <Award size={16} className="text-brand-800" />
        <p className="text-[0.75rem] font-bold text-brand-950">Certificate details</p>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[0.58rem] font-bold uppercase ${
            ready ? 'bg-emerald-100 text-emerald-700' : canIssue ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {ready ? 'Issued' : canIssue ? 'Ready' : 'Pending'}
        </span>
      </div>

      <div className="space-y-2.5 px-3 py-3">
        <p className="text-[0.62rem] font-bold uppercase tracking-wide text-slate-400">Editable student details</p>
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-100">
          <button
            type="button"
            disabled={busy || photoBusy}
            onClick={() => photoInputRef.current?.click()}
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-white disabled:opacity-50"
            aria-label="Change student photo"
          >
            <StudentPhoto src={student.image_path} alt={name || student.name} className="h-full w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/55 py-0.5 text-[0.5rem] font-bold uppercase tracking-wide text-white">
              <Camera size={10} />
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[0.62rem] font-bold uppercase tracking-wide text-slate-500">Student photo</p>
            <p className="mt-0.5 text-[0.68rem] text-slate-500">
              {student.image_path ? 'Tap photo to change. Used on the certificate.' : 'Add a passport photo for the certificate.'}
            </p>
            <p className="mt-1 text-[0.58rem] leading-snug text-slate-400">{STUDENT_PHOTO_HINT}</p>
            <button
              type="button"
              disabled={busy || photoBusy}
              onClick={() => photoInputRef.current?.click()}
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-brand-950 px-2.5 py-1.5 text-[0.65rem] font-semibold text-white disabled:opacity-40"
            >
              <Camera size={12} />
              {photoBusy ? 'Saving…' : student.image_path ? 'Change photo' : 'Upload photo'}
            </button>
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept={STUDENT_PHOTO_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              const err = validateStudentPhoto(file)
              if (err) {
                onError?.(err)
                return
              }
              setPhotoBusy(true)
              void onPhoto(file).finally(() => setPhotoBusy(false))
            }}
          />
        </div>
        <label className="block">
          <span className="mb-1 block text-[0.62rem] font-bold uppercase tracking-wide text-slate-500">Candidate *</span>
          <input className="input-field !py-2" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[0.62rem] font-bold uppercase tracking-wide text-slate-500">Father&apos;s name</span>
          <input className="input-field !py-2" value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[0.62rem] font-bold uppercase tracking-wide text-slate-500">Email</span>
            <input className="input-field !py-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.62rem] font-bold uppercase tracking-wide text-slate-500">Phone</span>
            <input className="input-field !py-2" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[0.62rem] font-bold uppercase tracking-wide text-slate-500">Batch start</span>
            <input className="input-field !py-2" type="date" value={batchStart} onChange={(e) => setBatchStart(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.62rem] font-bold uppercase tracking-wide text-slate-500">Batch end</span>
            <input
              className="input-field !py-2"
              type="date"
              min={batchStart || undefined}
              value={batchEnd}
              onChange={(e) => setBatchEnd(e.target.value)}
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-[0.62rem] font-bold uppercase tracking-wide text-slate-500">Issue date</span>
          <input className="input-field !py-2" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={busy || saving || !dirty || !name.trim()}
          onClick={() => void saveDetails()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-950 px-3 py-2.5 text-[0.72rem] font-semibold text-white disabled:opacity-40"
        >
          {saving ? 'Saving…' : dirty ? 'Save student details' : 'Details saved'}
        </button>
      </div>

      <dl className="divide-y divide-slate-50 border-t border-slate-100 px-3 py-1">
        {readonlyRows.map(([label, value]) => (
          <div key={label} className="flex gap-3 py-2">
            <dt className="w-[38%] shrink-0 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-400">
              {label}
            </dt>
            <dd className="min-w-0 flex-1 text-[0.72rem] font-medium text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3">
        <>
            <label className="w-full">
              <span className="mb-1 block text-[0.62rem] font-bold uppercase tracking-wide text-slate-500">
                Grade *
              </span>
              <select
                className="input-field py-2.5! disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                value={periodComplete ? grade : ''}
                disabled={!periodComplete || busy}
                onChange={(e) => onGradeChange(e.target.value)}
              >
                <option value="">{periodComplete ? 'Select grade' : 'Locked until training ends'}</option>
                {CERTIFICATE_GRADES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            {!periodComplete && (
              <p className="w-full text-[0.65rem] text-amber-700">{periodLockMessage}</p>
            )}
            {periodComplete && gradeReady && (
              <button
                type="button"
                disabled={busy}
                onClick={onGenerate}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-950 px-3 py-2.5 text-[0.72rem] font-semibold text-white disabled:opacity-50"
              >
                <FileText size={14} />
                {busy ? 'Generating…' : needsRegeneration ? 'Regenerate certificate' : 'Generate certificate'}
              </button>
            )}
            {periodComplete && !gradeReady && (
              <p className="w-full text-[0.65rem] text-amber-700">
                Select Outstanding, Excellent, or Good. Generate certificate will appear after you choose a grade. Videos are not required.
              </p>
            )}
          </>
        {ready && downloadPdfUrl ? (
          <a
            href={downloadPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={downloadFileName}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-950 px-3 py-2.5 text-[0.72rem] font-semibold text-white"
          >
            <ExternalLink size={14} /> Download PDF
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[0.72rem] font-semibold text-slate-400"
          >
            <ExternalLink size={14} /> Download PDF
          </button>
        )}
        {ready ? (
          <a
            href={verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[0.72rem] font-semibold text-brand-900"
          >
            <ExternalLink size={14} /> Verify online
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[0.72rem] font-semibold text-slate-400"
          >
            <ExternalLink size={14} /> Verify online
          </button>
        )}
        {ready ? (
          <button
            type="button"
            disabled={busy || !email.trim() || !email.includes('@')}
            onClick={() => onEmail(email.trim())}
            className={
              emailSent
                ? 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-[0.72rem] font-semibold text-white shadow-sm ring-1 ring-emerald-700/30 disabled:opacity-40'
                : 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[0.72rem] font-semibold text-brand-900 disabled:opacity-40'
            }
            title={
              emailSent
                ? `Already sent to ${email.trim()} — click to send again`
                : !email.trim()
                  ? 'Add student email first'
                  : `Send download link to ${email.trim()}`
            }
          >
            {emailSent ? <CheckCircle2 size={14} /> : <Mail size={14} />}
            {emailSent ? 'Email sent' : 'Email certificate'}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[0.72rem] font-semibold text-slate-400"
          >
            <Mail size={14} /> Email certificate
          </button>
        )}
      </div>
    </div>
  )
}

function PrivateMarksField({
  label,
  value,
  saved,
  busy,
  onChange,
  onSave,
}: {
  label: string
  value: string
  saved: number | null
  busy: boolean
  onChange: (value: string) => void
  onSave: () => void
}) {
  return (
    <div className="mt-2 rounded-lg bg-brand-950/5 p-2.5 ring-1 ring-brand-900/10">
      <p className="text-[0.62rem] font-bold uppercase tracking-wide text-brand-900">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-field py-2!"
          placeholder="0 - 100"
        />
        <button
          type="button"
          disabled={busy}
          onClick={onSave}
          className="rounded-xl bg-brand-950 px-3 py-2 text-[0.68rem] font-semibold text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
      {saved != null && (
        <p className="mt-1 text-[0.62rem] font-medium text-brand-800">Saved: {saved}/100</p>
      )}
    </div>
  )
}

function VideoUploadRow({
  student,
  step,
  uploadingKey,
  onUpload,
  scoreValue,
  onScoreChange,
  onSaveMarks,
  busy,
}: {
  student: Student
  step: { id: string | number; title: string; description?: string }
  uploadingKey: string | null
  onUpload: (uid: string, stepId: string | number, file: File) => void
  scoreValue: string
  onScoreChange: (value: string) => void
  onSaveMarks: () => void
  busy: boolean
}) {
  const key = `${student.uid}:${step.id}`
  const isUploading = uploadingKey === key
  const saved = privateMarkFor(student, step.id)
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
      <p className="text-[0.75rem] font-semibold text-brand-950">{step.title}</p>
      {step.description && <p className="mt-0.5 text-[0.65rem] text-slate-500">{step.description}</p>}
      <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-brand-900/20 bg-brand-950/5 py-2.5 text-[0.72rem] font-semibold text-brand-900">
        <Video size={14} />
        {isUploading ? 'Uploading…' : 'Upload video'}
        <input
          type="file"
          accept="video/*"
          className="hidden"
          disabled={isUploading}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onUpload(student.uid, step.id, f)
            e.target.value = ''
          }}
        />
      </label>
      <PrivateMarksField
        label={`Private marks · ${step.title}`}
        value={scoreValue || String(saved ?? '')}
        saved={saved}
        busy={busy}
        onChange={onScoreChange}
        onSave={onSaveMarks}
      />
    </div>
  )
}
