import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Square, Upload } from 'lucide-react'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import type { TrainingStep } from '../types'

const VIDEO_MIN_SECONDS = 60
const VIDEO_MAX_SECONDS = 120
const VIDEO_MAX_BYTES = 300 * 1024 * 1024

function formatDurationLabel(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function useVideoRecorder(step: TrainingStep | undefined) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [duration, setDuration] = useState(0)
  const [durationUnknown, setDurationUnknown] = useState(false)
  const [recording, setRecording] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const startTime = useRef(0)
  const timerRef = useRef<number | null>(null)

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const canRecord = !isIOS && typeof MediaRecorder !== 'undefined'

  const reset = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setBlob(null)
    setDuration(0)
    setDurationUnknown(false)
    setRecording(false)
    setPreviewUrl(null)
    setError('')
    chunks.current = []
  }, [previewUrl])

  useEffect(() => reset, [step?.id, reset])

  const validateFileSize = (size: number) => {
    if (size > VIDEO_MAX_BYTES) {
      setError('Video file is too large. Maximum upload size is 300 MB.')
      return false
    }
    return true
  }

  const validate = (d: number, size = blob?.size ?? 0) => {
    if (!step) return false
    if (!validateFileSize(size)) return false
    if (!isFinite(d) || d <= 0) {
      setDurationUnknown(true)
      setError('')
      return true
    }
    setDurationUnknown(false)
    if (d < VIDEO_MIN_SECONDS) {
      setError(`Too short (${formatDurationLabel(d)}). Minimum 1:00 required.`)
      return false
    }
    if (d > VIDEO_MAX_SECONDS) {
      setError(`Too long (${formatDurationLabel(d)}). Maximum 2:00 allowed.`)
      return false
    }
    setError('')
    return true
  }

  const handleFile = async (file: File) => {
    reset()
    if (!validateFileSize(file.size)) {
      setBlob(file)
      return
    }
    setBlob(file)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    const d = await new Promise<number>((resolve) => {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.onloadedmetadata = () => resolve(isFinite(v.duration) ? v.duration : 0)
      v.onerror = () => resolve(0)
      setTimeout(() => resolve(0), 4000)
      v.src = URL.createObjectURL(file)
    })
    setDuration(d)
    validate(d, file.size)
  }

  const startRecord = async () => {
    if (!canRecord) {
      document.getElementById('camera-input')?.click()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      mediaRecorder.current = mr
      chunks.current = []
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      mr.onstop = () => {
        const b = new Blob(chunks.current, { type: mr.mimeType })
        const d = (Date.now() - startTime.current) / 1000
        setBlob(b)
        setDuration(d)
        setPreviewUrl(URL.createObjectURL(b))
        validate(d, b.size)
        stream.getTracks().forEach((t) => t.stop())
      }
      mr.start(1000)
      startTime.current = Date.now()
      setRecording(true)
      timerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startTime.current) / 1000
        if (elapsed >= VIDEO_MAX_SECONDS) stopRecord()
      }, 500)
    } catch {
      setError('Allow camera access or upload a video from gallery.')
    }
  }

  const stopRecord = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (mediaRecorder.current?.state !== 'inactive') mediaRecorder.current?.stop()
    setRecording(false)
  }

  const canSubmit = Boolean(
    blob &&
    !error &&
    blob.size <= VIDEO_MAX_BYTES &&
    (durationUnknown ||
      (duration >= VIDEO_MIN_SECONDS && duration <= VIDEO_MAX_SECONDS)),
  )

  return {
    canRecord, recording, previewUrl, error, blob, duration, durationUnknown,
    startRecord, stopRecord, handleFile, reset, canSubmit,
    elapsed: recording ? Math.floor((Date.now() - startTime.current) / 1000) : 0,
  }
}

export function ModulesPage() {
  const { config, progress, refreshProgress } = useApp()
  const navigate = useNavigate()
  const stepIndex = progress?.completed_count ?? 0
  const step = config?.steps[stepIndex]
  const v = useVideoRecorder(step)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (progress?.phase === 'registration') navigate('/')
    if (progress?.phase === 'assessment') navigate('/assessment')
    if (progress?.phase === 'certificate') navigate('/certificate')
  }, [progress, navigate])

  if (!config || !step) return null

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  const submit = async () => {
    if (!v.blob || !step) return
    setUploading(true)
    const fd = new FormData()
    const ext = v.blob.type.includes('mp4') ? '.mp4' : v.blob.type.includes('quicktime') ? '.mov' : '.webm'
    fd.append('video', v.blob, `step_${step.id}${ext}`)
    fd.append('duration', String(v.duration || 0))
    if (v.durationUnknown) fd.append('durationUnknown', '1')
    try {
      const res = await api.uploadStep(step.id, fd)
      await refreshProgress()
      if (res.all_steps_done) navigate('/assessment')
      else {
        v.reset()
        navigate('/home')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="screen-scroll flex flex-col">
      <div className="relative h-44 shrink-0 overflow-hidden">
        <img src={step.image} alt="" className="h-full w-full object-cover" />
        <div className="gradient-hero absolute inset-0 flex flex-col justify-end p-4">
          <span className="mb-1 w-fit rounded-full bg-white/15 px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-white">
            Module {step.id} of {config.steps.length}
          </span>
          <h2 className="font-display text-lg font-bold text-white">{step.title}</h2>
        </div>
      </div>

      <div className="space-y-4 p-4 pb-2">
        <p className="text-sm leading-relaxed text-slate-600">{step.description}</p>

        <div className="card">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-brand-900">Video Evidence</h3>
            <span className="text-right text-[0.65rem] leading-snug text-slate-400">
              Min 1:00 · Max 2:00
              <br />
              Upload max 300 MB
            </span>
          </div>

          <div className="relative aspect-video overflow-hidden rounded-xl bg-brand-950">
            {v.previewUrl ? (
              <video src={v.previewUrl} className="h-full w-full object-cover" controls playsInline />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-white/70">
                <Camera size={32} className="text-accent-400/80" />
                <p className="text-xs">Record or upload 1–2 minute video</p>
              </div>
            )}
          </div>

          {v.recording && (
            <p className="mt-2 text-center text-sm font-bold text-red-600">
              ● REC {formatTime(v.elapsed)} / 2:00 max
            </p>
          )}

          {!v.recording && v.duration > 0 && (
            <p className="mt-2 text-center text-xs text-slate-500">
              Duration: {formatTime(v.duration)}
              {v.duration < VIDEO_MIN_SECONDS && ' — need at least 1:00'}
              {v.duration > VIDEO_MAX_SECONDS && ' — over 2:00 limit'}
            </p>
          )}

          <div className="mt-4 flex items-center justify-center gap-4">
            {v.canRecord && !v.recording && (
              <button
                type="button"
                onClick={v.startRecord}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg"
              >
                <Camera size={22} />
              </button>
            )}
            {v.recording && (
              <button
                type="button"
                onClick={v.stopRecord}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white"
              >
                <Square size={20} fill="white" />
              </button>
            )}
            {!v.canRecord && (
              <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-red-500 text-white shadow-lg">
                <Camera size={22} />
                <input id="camera-input" type="file" accept="video/*" capture="environment" className="hidden"
                  onChange={(e) => e.target.files?.[0] && v.handleFile(e.target.files[0])} />
              </label>
            )}
            <label className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2 border-slate-200 bg-white text-brand-900">
              <Upload size={18} />
              <input type="file" accept="video/*,.mp4,.mov,.webm" className="hidden"
                onChange={(e) => e.target.files?.[0] && v.handleFile(e.target.files[0])} />
            </label>
          </div>

          {v.error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{v.error}</p>}
        </div>

        {(progress?.progress.completed_steps.length ?? 0) > 0 && (
          <div className="card">
            <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-wide text-slate-400">Completed</p>
            {progress!.progress.completed_steps.map((id) => {
              const s = config.steps.find((x) => x.id === id)
              return (
                <p key={id} className="text-sm text-brand-800">✓ {s?.title ?? `Module ${id}`}</p>
              )
            })}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-slate-100 bg-slate-50/95 p-4 backdrop-blur">
        <button className="btn-primary" disabled={!v.canSubmit || uploading} onClick={submit}>
          {uploading ? 'Uploading…' : 'Submit Module Evidence'}
        </button>
      </div>
    </div>
  )
}
