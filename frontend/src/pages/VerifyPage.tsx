import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  BadgeCheck,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Globe,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  User,
  Video,
  X,
} from 'lucide-react'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { OrgLogo } from '../components/OrgLogo'
import type { Student, VerifyResult, VerifyVideoProof } from '../types'

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide ${
        ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
      }`}
    >
      {ok ? <CheckCircle2 size={12} /> : <Circle size={12} />}
      {label}
    </span>
  )
}

function videoAccessStorageKey(uid: string) {
  return `sft-verify-video-access:${uid.trim().toUpperCase()}`
}

type VisitorForm = {
  name: string
  organisation: string
  email: string
  location: string
}

const EMPTY_VISITOR: VisitorForm = { name: '', organisation: '', email: '', location: '' }

function fromLmsPayload(res: Awaited<ReturnType<typeof api.verifyCertificate>>): VerifyResult {
  if (!res.ok) return { found: false }
  const c = res.certificate || {}
  const p = res.proofs
  const s = res.student
  return {
    found: true,
    approved: Boolean(res.verified ?? p?.approved),
    certId: String(c.delegateNumber || s?.uid || ''),
    student: s,
    cert: {
      candidateName: String(c.learnerName || s?.name || ''),
      courseName: String(c.courseTitle || s?.course_name || ''),
      certificateNumber: String(c.certificateNumber || s?.certificate_number || ''),
      issueDate: String(c.issuedAt || s?.issue_date || ''),
      grade: 'Excellent',
    },
    pdfUrl: c.pdfUrl ? String(c.pdfUrl) : null,
    downloadUrl: c.pdfUrl ? String(c.pdfUrl) : null,
    videos: p?.videos,
    videosComplete: p?.videosComplete,
    uploadedSteps: p?.uploadedSteps,
    expectedSteps: p?.expectedSteps,
    assessmentPassed: p?.assessmentPassed,
    certificateApproved: p?.certificateApproved,
  }
}

const FEATURES = [
  { icon: ShieldCheck, label: 'Verify', text: 'Confirm certificate authenticity' },
  { icon: FileText, label: 'Access', text: 'View training & assessment details' },
  { icon: Download, label: 'Download', text: 'Get your verified certificate PDF' },
  { icon: Lock, label: 'Secure', text: 'Your data is safe and protected' },
] as const

const TRUST_ITEMS = [
  {
    id: 'accredited',
    title: 'Accredited & Trusted',
    text: 'Certificates are issued by SFT Global Skill Assessment Council.',
  },
  {
    id: 'authentic',
    title: '100% Authentic',
    text: 'Every certificate is verified against our official and secure database.',
  },
  {
    id: 'instant',
    title: 'Instant Results',
    text: 'Get real-time verification results within seconds.',
  },
] as const

function TrustIcon({ id }: { id: (typeof TRUST_ITEMS)[number]['id'] }) {
  if (id === 'accredited') {
    return (
      <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden="true">
        <path
          d="M24 6l3.2 6.5 7.2 1-5.2 5.1 1.2 7.1L24 22.8 17.6 25.7l1.2-7.1-5.2-5.1 7.2-1L24 6z"
          fill="#c5a059"
        />
        <path d="M18 30h12v3.2l-2.4 1.4 1.2 3.4-4.8-2.6-4.8 2.6 1.2-3.4L18 33.2V30z" fill="#c5a059" />
        <path d="M24 12.5l1.4 2.9 3.2.5-2.3 2.2.5 3.2L24 19.8l-2.8 1.5.5-3.2-2.3-2.2 3.2-.5L24 12.5z" fill="#8b6914" />
      </svg>
    )
  }
  if (id === 'authentic') {
    return (
      <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden="true">
        <path
          d="M24 6c6 3.2 10.5 3.8 14 4.2v12.2c0 8.4-5.4 15.6-14 19.6-8.6-4-14-11.2-14-19.6V10.2C13.5 9.8 18 9.2 24 6z"
          fill="#0d4f3c"
        />
        <path
          d="M16.8 23.2l5.2 5.2 9.2-10"
          fill="none"
          stroke="#c5a059"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden="true">
      <circle cx="24" cy="24" r="16" fill="#0d4f3c" />
      <circle cx="24" cy="24" r="12.5" fill="none" stroke="#c5a059" strokeWidth="1.5" />
      <line x1="24" y1="12" x2="24" y2="14.2" stroke="#c5a059" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="24" y1="33.8" x2="24" y2="36" stroke="#c5a059" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="12" y1="24" x2="14.2" y2="24" stroke="#c5a059" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="33.8" y1="24" x2="36" y2="24" stroke="#c5a059" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="24" y1="24" x2="24" y2="15" stroke="#c5a059" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="24" y1="24" x2="31" y2="27" stroke="#c5a059" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="24" cy="24" r="2" fill="#c5a059" />
    </svg>
  )
}

export function VerifyPage() {
  const { certId } = useParams<{ certId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { config } = useApp()
  const [data, setData] = useState<VerifyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [uid, setUid] = useState('')
  const [number, setNumber] = useState('')
  const [videosUnlocked, setVideosUnlocked] = useState(false)
  const [unlockedVideos, setUnlockedVideos] = useState<VerifyVideoProof[] | null>(null)
  const [accessModalOpen, setAccessModalOpen] = useState(false)
  const [visitor, setVisitor] = useState<VisitorForm>(EMPTY_VISITOR)
  const [visitorError, setVisitorError] = useState('')
  const [visitorBusy, setVisitorBusy] = useState(false)

  const queryUid = useMemo(() => String(searchParams.get('uid') || searchParams.get('delegate') || '').trim(), [searchParams])
  const queryNumber = useMemo(
    () => String(searchParams.get('number') || searchParams.get('q') || '').trim(),
    [searchParams],
  )

  const brand = data?.brand || config?.brand
  const councilName = brand?.name ?? 'SFT Global Skill Assessment Council'
  const tagline = brand?.tagline ?? 'Assessing Skills. Validating Competence.'
  const website = 'https://sftlms.com/'
  const websiteLabel = 'www.sftlms.com'
  const emails = ['info@sftrainings.org', 'bdm@sftrainings.org']
  const phone = '+91 9056742783'

  useEffect(() => {
    document.body.classList.add('verify-website-mode')
    return () => document.body.classList.remove('verify-website-mode')
  }, [])

  useEffect(() => {
    if (queryUid) setUid(queryUid)
    if (queryNumber) setNumber(queryNumber)
    else if (certId) setNumber(certId)
  }, [certId, queryUid, queryNumber])

  useEffect(() => {
    if (queryUid && queryNumber) {
      setBusy(true)
      setFormError('')
      setVideosUnlocked(false)
      setUnlockedVideos(null)
      api
        .verifyCertificate(queryUid, queryNumber)
        .then((res) => {
          if (!res.ok) {
            setData({ found: false })
            setFormError(res.message || 'No certificate matches this UID and certificate number.')
            return
          }
          setData(fromLmsPayload(res))
          const cached = sessionStorage.getItem(videoAccessStorageKey(queryUid))
          if (cached) {
            try {
              const parsed = JSON.parse(cached) as { token?: string; videos?: VerifyVideoProof[] }
              if (parsed.token && Array.isArray(parsed.videos)) {
                setUnlockedVideos(parsed.videos)
                setVideosUnlocked(true)
              }
            } catch {
              sessionStorage.removeItem(videoAccessStorageKey(queryUid))
            }
          }
        })
        .catch((err) => {
          setData({ found: false })
          setFormError(err instanceof Error ? err.message : 'Verification failed.')
        })
        .finally(() => setBusy(false))
      return
    }
    if (certId) {
      setBusy(true)
      setFormError('')
      setVideosUnlocked(false)
      setUnlockedVideos(null)
      api
        .verify(certId)
        .then((res) => {
          setData(res)
          const keyUid = String(res.student?.uid || res.certId || certId)
          const cached = sessionStorage.getItem(videoAccessStorageKey(keyUid))
          if (cached) {
            try {
              const parsed = JSON.parse(cached) as { token?: string; videos?: VerifyVideoProof[] }
              if (parsed.token && Array.isArray(parsed.videos)) {
                setUnlockedVideos(parsed.videos)
                setVideosUnlocked(true)
              }
            } catch {
              sessionStorage.removeItem(videoAccessStorageKey(keyUid))
            }
          }
        })
        .catch(() => setData({ found: false }))
        .finally(() => setBusy(false))
      return
    }
    setData(null)
  }, [certId, queryUid, queryNumber])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const roll = uid.trim().toUpperCase()
    const num = number.trim()
    if (!roll) {
      setFormError('Enter the student UID / roll number.')
      return
    }
    if (!num) {
      setFormError('Enter the certificate number.')
      return
    }
    setSearchParams({ uid: roll, number: num, q: num })
  }

  const openVideoAccessModal = () => {
    setVisitorError('')
    setAccessModalOpen(true)
  }

  const student = data?.student
  const cert = data?.cert
  const name = cert?.candidateName || student?.name || ''
  const course = cert?.courseName || student?.course_name || ''
  const photo = (student as Student | undefined)?.image_path || '/static/icons/icon-192.png'
  const videos = (videosUnlocked && unlockedVideos ? unlockedVideos : data?.videos) ?? []
  const showLanding = !data?.found

  const submitVideoAccess = async (event: FormEvent) => {
    event.preventDefault()
    const roll = String(student?.uid || queryUid || uid || data?.certId || '').trim().toUpperCase()
    const num = String(
      cert?.certificateNumber || student?.certificate_number || queryNumber || number || '',
    ).trim()
    if (!roll || !num) {
      setVisitorError('Certificate details are missing. Search again first.')
      return
    }
    if (!visitor.name.trim() || !visitor.organisation.trim() || !visitor.email.trim() || !visitor.location.trim()) {
      setVisitorError('Please fill in name, organisation, email, and location.')
      return
    }
    setVisitorBusy(true)
    setVisitorError('')
    try {
      const res = await api.requestVerifyVideoAccess({
        uid: roll,
        number: num,
        name: visitor.name.trim(),
        organisation: visitor.organisation.trim(),
        email: visitor.email.trim(),
        location: visitor.location.trim(),
      })
      if (!res.ok) {
        setVisitorError(res.message || 'Could not unlock videos.')
        return
      }
      const nextVideos = res.videos || []
      setUnlockedVideos(nextVideos)
      setVideosUnlocked(true)
      sessionStorage.setItem(
        videoAccessStorageKey(roll),
        JSON.stringify({ token: res.token, videos: nextVideos }),
      )
      setAccessModalOpen(false)
      setVisitor(EMPTY_VISITOR)
    } catch (err) {
      setVisitorError(err instanceof Error ? err.message : 'Could not unlock videos.')
    } finally {
      setVisitorBusy(false)
    }
  }

  return (
    <div className="verify-website flex min-h-screen flex-col">
      {/* Header */}
      <header className="relative z-10 border-b border-emerald-900/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 lg:px-10">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <OrgLogo
              alt="Sustainable Futuristic Trainings"
              className="h-16 w-auto max-w-[9rem] shrink-0 object-contain object-left sm:h-[4.5rem] sm:max-w-[12rem]"
            />
            <div className="min-w-0 border-l border-emerald-900/15 pl-3 sm:pl-4">
              <p className="text-[0.62rem] font-bold uppercase leading-snug tracking-[0.06em] text-emerald-950 sm:text-xs lg:text-[0.8rem]">
                {councilName}
              </p>
              <p className="verify-gold mt-1 text-[0.55rem] font-semibold uppercase tracking-[0.18em] sm:text-[0.62rem]">
                Official Certificate Verification
              </p>
            </div>
          </div>
          <div className="hidden shrink-0 items-center gap-2 text-xs font-semibold text-emerald-900 sm:flex">
            <ShieldCheck size={16} className="verify-gold" />
            Secure Credential Lookup
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="verify-hero relative">
        <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-2 lg:items-center lg:gap-14 lg:px-10 lg:py-12">
          {/* Left column */}
          <div className="text-white">
            <p className="verify-gold inline-flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.2em]">
              <span aria-hidden="true">→</span>
              Official Verification Portal
            </p>
            <h1 className="mt-5 text-3xl font-semibold leading-tight lg:text-[2.35rem]">
              Verify Your
              <span className="verify-serif verify-gold mt-1 block text-4xl font-bold lg:text-[3.25rem] lg:leading-[1.1]">
                Certificate Authenticity
              </span>
            </h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-white/72 lg:text-[0.95rem]">
              Validate your certificate instantly against the official SFT database. Access training records,
              assessment status, and download your verified certificate PDF.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4 lg:gap-5">
              {FEATURES.map((item) => (
                <div key={item.label} className="flex flex-col items-center text-center">
                  <div className="verify-feature-icon">
                    <item.icon size={22} strokeWidth={1.5} />
                  </div>
                  <p className="verify-gold mt-3 text-[0.62rem] font-bold uppercase tracking-[0.14em]">{item.label}</p>
                  <p className="mt-1 text-[0.68rem] leading-snug text-white/55">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Form card */}
          <div>
            {showLanding ? (
              <form className="verify-form-card relative z-10 p-6 lg:p-8" onSubmit={submit}>
                <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
                    <BadgeCheck size={18} />
                  </div>
                  <div>
                    <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-emerald-900">
                      Certificate Verification
                    </p>
                    <p className="text-xs text-slate-500">Enter details exactly as printed on your certificate</p>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <label className="block">
                    <span className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-slate-500">
                      Student UID / Roll No.
                    </span>
                    <div className="verify-input-wrap mt-2">
                      <User size={18} className="shrink-0 text-slate-400" />
                      <input
                        value={uid}
                        onChange={(e) => setUid(e.target.value.toUpperCase())}
                        placeholder=""
                        autoComplete="off"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-slate-500">
                      Certificate Number
                    </span>
                    <div className="verify-input-wrap mt-2">
                      <FileText size={18} className="shrink-0 text-slate-400" />
                      <input
                        value={number}
                        onChange={(e) => setNumber(e.target.value)}
                        placeholder=""
                        autoComplete="off"
                      />
                    </div>
                  </label>
                </div>

                {formError && (
                  <p className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="verify-submit-btn mt-5 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-4 text-sm font-bold uppercase tracking-[0.08em] text-white transition hover:brightness-110 disabled:opacity-70"
                >
                  <ShieldCheck size={18} className="verify-gold" />
                  {busy ? 'Verifying…' : 'Verify Certificate'}
                </button>

                <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[0.68rem] text-slate-400">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  All verifications are secure and data is protected
                </p>
              </form>
            ) : (
              <div className="verify-form-card relative z-10 p-6 text-center lg:p-8">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 size={28} />
                </div>
                <p className="mt-4 font-semibold text-emerald-900">Certificate record found</p>
                <p className="mt-1 text-sm text-slate-500">Scroll down to view full details</p>
                <Link
                  to="/verify"
                  className="mt-5 inline-flex rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-slate-50"
                >
                  New search
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="verify-trust-bar">
        <div className="verify-trust-grid mx-auto max-w-6xl px-4 py-5 md:px-6 lg:px-8">
          {TRUST_ITEMS.map((item) => (
            <div key={item.id} className="verify-trust-item flex items-center gap-4 px-3 py-3 md:px-5 md:py-1.5">
              <div className="verify-trust-badge">
                <TrustIcon id={item.id} />
              </div>
              <div className="min-w-0">
                <p className="text-[0.78rem] font-bold uppercase tracking-[0.04em] text-[#0d3d2e] md:text-[0.85rem]">
                  {item.title}
                </p>
                <p className="mt-1 text-[0.72rem] leading-5 text-[#1f4a3a]">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Results — only when verifying or showing a record */}
      {(busy || data) && (
        <main className="mx-auto w-full max-w-6xl space-y-8 px-5 py-8 lg:px-10">
          {busy && !data && (
            <div className="verify-form-card px-6 py-12 text-center text-sm text-slate-500">
              Verifying certificate record…
            </div>
          )}

          {data?.found && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200/80">
            <div className={`${data.approved ? 'bg-brand-900' : 'bg-amber-600'} px-6 py-5 text-white lg:px-8`}>
              <div className="flex flex-wrap items-center gap-3">
                <ShieldCheck size={24} className="verify-gold" />
                <div>
                  <p className="verify-serif text-xl font-bold">
                    {data.approved ? 'Certificate Verified Successfully' : 'Record Found — Pending Final Approval'}
                  </p>
                  <p className="mt-1 text-sm text-white/80">Official SFT training database record for this certificate.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-8 p-6 lg:grid-cols-[280px_1fr] lg:p-8">
              <aside className="text-center lg:text-left">
                <img
                  src={photo}
                  alt=""
                  className="mx-auto h-32 w-32 rounded-2xl object-cover ring-4 ring-[#f4f1ea] lg:mx-0"
                />
                <h2 className="verify-serif mt-4 text-xl font-bold text-emerald-950">{name}</h2>
                {student?.father_name && <p className="text-sm text-slate-500">S/O {student.father_name}</p>}
                <p className="mt-2 text-sm font-semibold text-emerald-800">{course}</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start">
                  <StatusPill ok={Boolean(data.videosComplete)} label={`Videos ${data.uploadedSteps ?? 0}/${data.expectedSteps ?? videos.length}`} />
                  <StatusPill ok={Boolean(data.assessmentPassed)} label="Assessment" />
                  <StatusPill ok={Boolean(data.certificateApproved)} label="Certificate" />
                </div>
              </aside>

              <div className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['UID / Roll No', student?.uid || data.certId],
                    ['Certificate No.', cert?.certificateNumber || student?.certificate_number],
                    ['Issue date', cert?.issueDate || student?.issue_date],
                    ['Batch', student?.batch_duration],
                    ['Grade', cert?.grade || 'Excellent'],
                    ['Email', student?.email],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl bg-[#f7f4ee] px-4 py-3 ring-1 ring-[#e8e0d0]">
                      <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{value || '—'}</p>
                    </div>
                  ))}
                </div>

                {(data.downloadUrl || data.pdfUrl) && (
                  <a
                    href={data.downloadUrl || data.pdfUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="verify-submit-btn inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
                  >
                    <Download size={16} />
                    Open Certificate PDF
                  </a>
                )}

                <section>
                  <h3 className="verify-serif mb-3 flex items-center gap-2 text-base font-bold text-emerald-900">
                    <Video size={18} />
                    Training Video Proofs
                  </h3>
                  <p className="mb-4 text-sm text-slate-500">
                    {videosUnlocked
                      ? 'Access granted. Play uploaded training videos below.'
                      : 'All training videos are locked. Request access once to unlock them.'}
                  </p>
                  <div className="relative overflow-hidden rounded-2xl ring-1 ring-slate-200">
                    <div className={`grid gap-4 p-4 md:grid-cols-2 ${videosUnlocked ? '' : 'pointer-events-none select-none blur-[2px]'}`}>
                      {videos.map((step) => {
                        const canPlay = videosUnlocked && Boolean(step.uploaded && step.videoUrl)
                        return (
                          <div key={step.id} className="overflow-hidden rounded-xl border border-slate-100 bg-white">
                            <div className="flex items-center gap-3 p-3">
                              <img src={step.image} alt="" className="h-12 w-12 rounded-lg object-cover" />
                              <div className="min-w-0 flex-1">
                                <p className="text-[0.62rem] font-bold uppercase tracking-wide text-slate-400">
                                  Step {step.id}
                                </p>
                                <p className="truncate text-sm font-semibold text-emerald-900">{step.title}</p>
                              </div>
                              {videosUnlocked && (
                                <StatusPill ok={Boolean(step.uploaded)} label={step.uploaded ? 'Unlocked' : 'Missing'} />
                              )}
                            </div>
                            {canPlay ? (
                              <video
                                src={step.videoUrl || undefined}
                                controls
                                playsInline
                                preload="metadata"
                                className="max-h-48 w-full bg-black"
                              />
                            ) : (
                              <div className="relative flex h-28 w-full items-center justify-center bg-slate-900/90 text-white">
                                <img
                                  src={step.image}
                                  alt=""
                                  className="absolute inset-0 h-full w-full object-cover opacity-30"
                                />
                                <span className="relative z-10 text-sm font-bold">
                                  {videosUnlocked ? 'Video not uploaded yet' : 'Training video'}
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {!videosUnlocked && (
                      <button
                        type="button"
                        onClick={openVideoAccessModal}
                        className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-emerald-950/55 px-6 text-white transition hover:bg-emerald-950/65"
                      >
                        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500 shadow-xl">
                          <Lock size={28} className="text-white" />
                        </span>
                        <span className="text-lg font-bold">Locked</span>
                        <span className="max-w-xs text-center text-sm text-white/85">
                          Click to request access and unlock all training videos
                        </span>
                      </button>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}

        {!busy && data && !data.found && (
          <div className="verify-form-card p-10 text-center">
            <span className="inline-block rounded-full bg-red-100 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-red-800">
              Not found
            </span>
            <h2 className="verify-serif mt-4 text-2xl font-bold text-emerald-950">No Matching Certificate</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              Check the UID and certificate number and try again.
            </p>
            <Link
              to="/verify"
              className="verify-submit-btn mt-6 inline-flex rounded-xl px-5 py-3 text-sm font-bold text-white"
            >
              Search again
            </Link>
          </div>
        )}
        </main>
      )}

      {/* Footer */}
      <footer className="verify-footer text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10 lg:flex-row lg:items-start lg:justify-between lg:px-10">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
              <OrgLogo
                alt="Sustainable Futuristic Trainings"
                className="h-14 w-auto max-w-[9rem] object-contain object-left sm:h-16 sm:max-w-[11rem]"
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase leading-snug tracking-wide text-white/95 sm:text-sm">
                {councilName}
              </p>
              <p className="verify-gold mt-1.5 text-sm italic">{tagline}</p>
              <p className="mt-1 text-[0.7rem] text-white/55">
                Certified by {brand?.powered_by ?? 'SFT Global Skill Assessment Council'}
              </p>
            </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-3 sm:gap-10">
            <div>
              <p className="verify-gold flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-[0.14em]">
                <Globe size={14} />
                Website
              </p>
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block text-sm text-white/75 hover:text-white"
              >
                {websiteLabel}
              </a>
            </div>
            <div>
              <p className="verify-gold flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-[0.14em]">
                <Mail size={14} />
                Email
              </p>
              <div className="mt-2 space-y-1">
                {emails.map((addr) => (
                  <a
                    key={addr}
                    href={`mailto:${addr}`}
                    className="block text-sm text-white/75 hover:text-white"
                  >
                    {addr}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <p className="verify-gold flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-[0.14em]">
                <Phone size={14} />
                Phone
              </p>
              <a href={`tel:${phone.replace(/\s/g, '')}`} className="mt-2 block text-sm text-white/75 hover:text-white">
                Call us {phone}
              </a>
            </div>
          </div>
        </div>
      </footer>

      {accessModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="video-access-title"
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
          >
            <div className="flex items-start justify-between gap-3 bg-emerald-900 px-5 py-4 text-white">
              <div>
                <p id="video-access-title" className="verify-serif text-lg font-bold">
                  Request video access
                </p>
                <p className="mt-1 text-sm text-white/75">
                  Enter your details to unlock training video proofs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAccessModalOpen(false)}
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitVideoAccess} className="space-y-3 p-5">
              {(
                [
                  ['name', 'Name', 'Your full name'],
                  ['organisation', 'Organisation', 'Company or institute'],
                  ['email', 'Email address', 'name@example.com'],
                  ['location', 'Location', 'City / country'],
                ] as const
              ).map(([key, label, placeholder]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">
                    {label}
                  </span>
                  <input
                    type={key === 'email' ? 'email' : 'text'}
                    required
                    value={visitor[key]}
                    onChange={(e) => setVisitor((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-xl border border-slate-200 bg-[#f7f4ee] px-3 py-2.5 text-sm text-slate-800 outline-none ring-emerald-700/30 focus:ring-2"
                  />
                </label>
              ))}
              {visitorError && <p className="text-sm font-medium text-red-700">{visitorError}</p>}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAccessModalOpen(false)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={visitorBusy}
                  className="verify-submit-btn flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {visitorBusy ? 'Submitting…' : 'Unlock videos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
