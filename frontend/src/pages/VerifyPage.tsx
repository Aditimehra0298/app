import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Circle, Download, ShieldCheck, Video } from 'lucide-react'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import type { Student, VerifyResult } from '../types'

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

export function VerifyPage() {
  const { certId } = useParams<{ certId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { config } = useApp()
  const [data, setData] = useState<VerifyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [email, setEmail] = useState('')
  const [number, setNumber] = useState('')

  const queryEmail = useMemo(() => String(searchParams.get('email') || '').trim().toLowerCase(), [searchParams])
  const queryNumber = useMemo(
    () => String(searchParams.get('number') || searchParams.get('q') || '').trim(),
    [searchParams],
  )

  useEffect(() => {
    if (queryEmail) setEmail(queryEmail)
    if (queryNumber) setNumber(queryNumber)
    else if (certId) setNumber(certId)
  }, [certId, queryEmail, queryNumber])

  useEffect(() => {
    const mail = queryEmail
    if (mail && (queryNumber || certId)) {
      const certNumber = queryNumber || certId || ''
      setBusy(true)
      setFormError('')
      api
        .verifyCertificate(mail, certNumber)
        .then((res) => {
          if (!res.ok) {
            setData({ found: false })
            setFormError(res.message || 'No certificate matches this email and certificate number.')
            return
          }
          setData(fromLmsPayload(res))
        })
        .catch((err) => {
          setData({ found: false })
          setFormError(err instanceof Error ? err.message : 'Verification failed.')
        })
        .finally(() => setBusy(false))
      return
    }
    if (certId && !mail) {
      setBusy(true)
      setFormError('')
      api
        .verify(certId)
        .then(setData)
        .catch(() => setData({ found: false }))
        .finally(() => setBusy(false))
      return
    }
    setData(null)
  }, [certId, queryEmail, queryNumber])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const mail = email.trim().toLowerCase()
    const num = number.trim()
    if (!mail || !mail.includes('@')) {
      setFormError('Enter the Gmail registered on the certificate.')
      return
    }
    if (!num) {
      setFormError('Enter the certificate number.')
      return
    }
    setSearchParams({ email: mail, number: num, q: num })
  }

  const brand = data?.brand || config?.brand
  const student = data?.student
  const cert = data?.cert
  const name = cert?.candidateName || student?.name || ''
  const course = cert?.courseName || student?.course_name || ''
  const photo = (student as Student | undefined)?.image_path || '/static/icons/icon-192.png'
  const videos = data?.videos ?? []
  const showForm = !busy && (!data || !data.found)

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto select-text bg-brand-950">
      <header className="mx-auto flex w-full max-w-lg items-center gap-3 px-[var(--pad-x)] pb-4 pt-[max(env(safe-area-inset-top),1.25rem)] text-white">
        <img src="/static/images/sft-logo.png?v=2" alt="" className="h-10 w-10 rounded-xl object-contain ring-1 ring-white/15" />
        <div>
          <p className="font-display text-sm font-bold leading-tight">
            {brand?.name ?? 'SFT Global Skills & Trade Assessment Council'}
          </p>
          <p className="text-[0.65rem] uppercase tracking-wider text-white/55">Certificate verification</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg space-y-4 px-[var(--pad-x)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        {showForm && (
          <form className="rounded-2xl bg-white p-5 shadow-xl" onSubmit={submit}>
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-teal-700">Accredited credential check</p>
            <h1 className="mt-1 font-display text-xl font-bold text-brand-900">Verify a certificate</h1>
            <p className="mt-2 text-sm text-slate-500">
              Enter the certificate number and registered Gmail. Video proofs and the PDF load from the SFT student database.
            </p>
            <label className="mt-4 block text-xs font-semibold text-slate-600">
              Certificate number
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="ET/PPT/001/2026"
                autoComplete="off"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold text-slate-600">
              Registered Gmail
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@gmail.com"
                autoComplete="email"
              />
            </label>
            {formError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{formError}</p>}
            <button type="submit" className="btn-primary mt-4 w-full">
              Verify certificate
            </button>
          </form>
        )}

        {busy && (
          <div className="rounded-2xl bg-white px-6 py-12 text-center text-sm text-slate-400">Verifying record…</div>
        )}

        {data?.found && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className={`${data.approved ? 'bg-emerald-700' : 'bg-amber-700'} px-5 py-4 text-white`}>
              <div className="flex items-center gap-2">
                <ShieldCheck size={22} />
                <p className="font-display text-base font-bold">
                  {data.approved ? 'Certificate approved & verified' : 'Record found — pending approval'}
                </p>
              </div>
              <p className="mt-1 text-xs text-white/80">
                Connected to the SFT student database. Videos, assessment, and certificate status below.
              </p>
            </div>

            <div className="space-y-5 p-5">
              <div className="flex items-center gap-3">
                <img src={photo} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-brand-900/10" />
                <div className="min-w-0">
                  <h1 className="font-display text-lg font-bold text-brand-900">{name || 'Student'}</h1>
                  {student?.father_name && <p className="text-xs text-slate-500">S/O {student.father_name}</p>}
                  <p className="mt-0.5 text-sm text-slate-600">{course}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <StatusPill
                  ok={Boolean(data.videosComplete)}
                  label={`Videos ${data.uploadedSteps ?? 0}/${data.expectedSteps ?? videos.length}`}
                />
                <StatusPill ok={Boolean(data.assessmentPassed)} label="Assessment" />
                <StatusPill ok={Boolean(data.certificateApproved)} label="Certificate" />
              </div>

              <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-100 px-4">
                {[
                  ['UID / Roll No', student?.uid || data.certId],
                  ['Certificate No.', cert?.certificateNumber || student?.certificate_number || '—'],
                  ['Gmail', student?.email || email || '—'],
                  ['Grade', cert?.grade || '—'],
                  ['Issue date', cert?.issueDate || student?.issue_date || '—'],
                  ['Batch', student?.batch_duration || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 py-2.5 text-sm">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="max-w-[60%] text-right font-semibold text-slate-800">{v || '—'}</dd>
                  </div>
                ))}
              </dl>

              <section>
                <h2 className="mb-2 flex items-center gap-2 font-display text-sm font-bold text-brand-900">
                  <Video size={16} /> Video proofs
                </h2>
                <ul className="space-y-3">
                  {videos.map((step) => (
                    <li key={step.id} className="overflow-hidden rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-3 p-3">
                        <img src={step.image} alt="" className="h-12 w-12 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-400">
                            Step {step.id}
                          </p>
                          <p className="truncate text-sm font-semibold text-brand-900">{step.title}</p>
                        </div>
                        <StatusPill ok={step.uploaded} label={step.uploaded ? 'Proof uploaded' : 'Missing'} />
                      </div>
                      {step.uploaded && step.videoUrl && (
                        <video
                          src={step.videoUrl}
                          controls
                          playsInline
                          preload="metadata"
                          className="max-h-56 w-full bg-black"
                        />
                      )}
                    </li>
                  ))}
                  {videos.length === 0 && (
                    <li className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                      No pathway videos recorded yet.
                    </li>
                  )}
                </ul>
              </section>

              {data.downloadUrl || data.pdfUrl ? (
                <a
                  href={data.downloadUrl || data.pdfUrl || '#'}
                  className="btn-primary flex items-center justify-center gap-2"
                >
                  <Download size={16} /> Download certificate
                </a>
              ) : (
                <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">
                  Certificate PDF is not issued yet.
                </p>
              )}

              <p className="text-center text-[0.65rem] text-slate-400">
                Certified by {brand?.powered_by ?? 'SFT Global Trade Assessment Authority'}
              </p>
            </div>
          </div>
        )}

        {!busy && data && !data.found && certId && !queryEmail && (
          <div className="rounded-2xl bg-white p-8 text-center shadow-xl">
            <span className="inline-block rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">
              Not found
            </span>
            <h1 className="mt-4 font-display text-lg font-bold text-brand-900">No matching certificate</h1>
            <p className="mt-2 text-sm text-slate-500">ID: {certId}</p>
            <Link to="/verify" className="btn-secondary mt-6 inline-flex">
              Try Gmail + certificate number
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
