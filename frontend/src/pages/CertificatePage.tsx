import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, Download, Share2 } from 'lucide-react'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import type { Student } from '../types'
import type { CertificateResult } from '../types'

function formatWait(seconds: number): string {
  const s = Math.max(0, seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`
  return `${m}m ${String(sec).padStart(2, '0')}s`
}

export function CertificatePage() {
  const { config, progress, refreshProgress } = useApp()
  const navigate = useNavigate()
  const [student, setStudent] = useState<Student | null>(null)
  const [cert, setCert] = useState<CertificateResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const loadingRef = useRef(false)

  const uid = progress?.progress.student_uid
  const readyAtMs = useMemo(() => {
    const raw = progress?.certificate_ready_at
    if (!raw) return null
    const t = Date.parse(raw)
    return Number.isNaN(t) ? null : t
  }, [progress?.certificate_ready_at])

  const remaining = useMemo(() => {
    if (progress?.certificate_ready) return 0
    if (readyAtMs) return Math.max(0, Math.ceil((readyAtMs - now) / 1000))
    return Math.max(0, progress?.wait_seconds ?? 3600)
  }, [now, progress?.certificate_ready, progress?.wait_seconds, readyAtMs])

  const canGenerate = Boolean(progress?.certificate_ready || remaining <= 0)

  useEffect(() => {
    if (progress?.phase === 'registration') navigate('/')
    else if (progress?.phase === 'training') navigate('/home')
    else if (progress?.phase === 'assessment') navigate('/assessment')
  }, [progress, navigate])

  useEffect(() => {
    if (!uid) return
    api.getStudent(uid).then((res) => setStudent(res.student)).catch(() => setStudent(null))
  }, [uid])

  useEffect(() => {
    if (canGenerate) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [canGenerate])

  useEffect(() => {
    if (canGenerate || remaining > 5) return
    const id = window.setTimeout(() => {
      refreshProgress()
    }, Math.max(remaining, 1) * 1000)
    return () => window.clearTimeout(id)
  }, [canGenerate, remaining, refreshProgress])

  const loadCertificate = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setBusy(true)
    setError('')
    try {
      const result = await api.getCertificate()
      if (result.success && result.pdfUrl) {
        setCert(result)
        await refreshProgress()
      } else if (result.pending) {
        await refreshProgress()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Certificate is not ready yet')
    } finally {
      loadingRef.current = false
      setBusy(false)
    }
  }, [refreshProgress])

  useEffect(() => {
    if (!canGenerate || cert) return
    void loadCertificate()
  }, [canGenerate, cert, loadCertificate])

  const share = async () => {
    if (!cert) return
    const title = `${config?.brand.name ?? 'SFT'} Certificate`
    const text = `${cert.candidateName || student?.name || ''} — ${cert.courseName || student?.course_name || ''}`
    const verifyUrl =
      cert.verifyUrl ||
      `${window.location.origin}/verify/${encodeURIComponent(cert.certificateId || cert.uid || uid || '')}`
    try {
      if (cert.pdfUrl && navigator.canShare) {
        const res = await fetch(cert.pdfUrl, { credentials: 'same-origin' })
        if (res.ok) {
          const blob = await res.blob()
          const file = new File([blob], 'SFT-certificate.pdf', { type: 'application/pdf' })
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ title, text, files: [file] })
            return
          }
        }
      }
      if (navigator.share) {
        await navigator.share({ title, text, url: verifyUrl })
        return
      }
      await navigator.clipboard.writeText(verifyUrl)
      alert('Certificate link copied.')
    } catch {
      /* cancelled */
    }
  }

  if (!config) return null

  const name = cert?.candidateName || student?.name || progress?.progress.candidate_name || ''
  const course = cert?.courseName || student?.course_name || progress?.progress.course_name || ''
  const photo = student?.image_path || progress?.progress.image_path || '/static/icons/icon-192.png'

  return (
    <div className="screen-scroll flex flex-col">
      <div className="relative h-44 shrink-0 overflow-hidden">
        <img src={config.images.certificate} alt="" className="h-full w-full object-cover" />
        <div className="gradient-hero absolute inset-0 flex flex-col items-start justify-end p-4">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-gold-500/50 bg-gold-500/20 text-gold-500">
            ◆
          </div>
          <h2 className="font-display text-xl font-bold text-white">
            {cert ? 'Certificate issued' : canGenerate ? 'Your certificate' : 'Certificate processing'}
          </h2>
        </div>
      </div>

      <div className="space-y-4 p-4 pb-2">
        {!canGenerate && !cert && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-center">
            <Clock className="mx-auto mb-2 text-amber-600" size={28} />
            <p className="font-display text-base font-bold text-brand-900">Generating in 1 hour</p>
            <p className="mt-1 text-sm text-slate-600">
              Videos and assessment are done. Your certificate will appear here after this wait.
            </p>
            <p className="mt-3 font-display text-2xl font-bold tabular-nums text-brand-900">
              {formatWait(remaining)}
            </p>
            <p className="mt-1 text-[0.7rem] uppercase tracking-wide text-slate-400">Time remaining</p>
          </div>
        )}

        {canGenerate && !cert && (
          <div className="rounded-2xl border border-teal-100 bg-teal-50 px-4 py-5 text-center">
            <p className="font-display text-base font-bold text-brand-900">
              {busy ? 'Your certificate is coming…' : 'Preparing your certificate'}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Download and share will unlock as soon as the PDF is ready.
            </p>
          </div>
        )}

        {cert && (
          <>
            <p className="text-sm text-slate-600">
              {name}, you have earned your certificate. View it below, then download or share.
            </p>

            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <iframe
                title="Certificate PDF"
                src={cert.pdfUrl}
                className="h-64 w-full bg-slate-100"
              />
            </div>

            <div className="card space-y-0 divide-y divide-slate-100">
              <div className="flex items-center gap-3 pb-3">
                <img src={photo} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-brand-900/10" />
                <div className="min-w-0">
                  <p className="font-display text-base font-bold text-brand-900">{name}</p>
                  <p className="truncate text-xs text-slate-500">{course}</p>
                </div>
              </div>
              {[
                ['UID', cert.uid || student?.uid || uid || '—'],
                ['Certificate No.', cert.certificateNumber || student?.certificate_number || '—'],
                ['Grade', cert.grade || 'Excellent'],
                ['Issue date', cert.issueDate || student?.issue_date || '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5 text-sm">
                  <span className="text-slate-500">{k}</span>
                  <span className="max-w-[58%] text-right font-semibold text-slate-800">{v}</span>
                </div>
              ))}
            </div>

            {cert.qrUrl && (
              <div className="card text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Verified certificate QR
                </p>
                <p className="mt-1 text-xs text-slate-500">Scan to verify on sftlms.com with Gmail + certificate number</p>
                <img
                  src={cert.qrUrl}
                  alt="Certificate QR"
                  className="mx-auto mt-3 h-40 w-40 rounded-xl bg-white p-2 ring-1 ring-slate-100"
                />
              </div>
            )}
          </>
        )}

        {error && (
          <div className="space-y-2">
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
            {canGenerate && (
              <button type="button" className="btn-secondary" onClick={() => void loadCertificate()}>
                Try again
              </button>
            )}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 space-y-2 border-t border-slate-100 bg-slate-50/95 p-4 backdrop-blur">
        {cert ? (
          <>
            <a
              href={cert.downloadUrl || `${cert.pdfUrl}?download=1`}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <Download size={16} /> Download certificate
            </a>
            <button type="button" className="btn-secondary flex items-center justify-center gap-2" onClick={share}>
              <Share2 size={16} /> Share certificate
            </button>
          </>
        ) : (
          <button type="button" className="btn-primary" disabled>
            {canGenerate ? (busy ? 'Certificate coming…' : 'Unlocking certificate') : `Wait ${formatWait(remaining)}`}
          </button>
        )}
      </div>
    </div>
  )
}
