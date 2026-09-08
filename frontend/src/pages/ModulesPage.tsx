import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Camera, Square, Upload } from 'lucide-react'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { formatDurationLabel, useVideoRecorder } from '../hooks/useVideoRecorder'

const VIDEO_MIN_SECONDS = 60
const VIDEO_MAX_SECONDS = 120

export function ModulesPage() {
  const { config, progress, refreshProgress } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const stepIndex = progress?.completed_count ?? 0
  const trainingSteps = config?.steps.filter((s) => s.kind !== 'practical') ?? []
  const requestedId = Number(params.get('step') || 0)
  const redoId = (progress?.reupload_steps ?? [])[0]
  const step =
    trainingSteps.find((s) => s.id === requestedId) ||
    trainingSteps.find((s) => s.id === redoId) ||
    trainingSteps.find((s) => !(progress?.progress?.completed_steps ?? []).includes(s.id)) ||
    trainingSteps[stepIndex] ||
    trainingSteps[0]
  const v = useVideoRecorder({
    resetKey: step?.id,
    minSeconds: VIDEO_MIN_SECONDS,
    maxSeconds: VIDEO_MAX_SECONDS,
  })
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (progress?.phase === 'registration') navigate('/')
    if ((progress?.reupload_steps ?? []).length) return
    if (progress?.phase === 'certificate') navigate('/certificate')
  }, [progress, navigate])

  if (!config || !step) return null

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
      v.reset()
      if (res.all_steps_done) {
        navigate('/assessment')
      } else {
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
            Optional · Module {step.id}
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
              ● REC {formatDurationLabel(v.elapsed)} / 2:00 max
            </p>
          )}

          {!v.recording && v.duration > 0 && (
            <p className="mt-2 text-center text-xs text-slate-500">
              Duration: {formatDurationLabel(v.duration)}
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
                <input
                  id="camera-input"
                  type="file"
                  accept="video/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && v.handleFile(e.target.files[0])}
                />
              </label>
            )}
            <label className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2 border-slate-200 bg-white text-brand-900">
              <Upload size={18} />
              <input
                type="file"
                accept="video/*,.mp4,.mov,.webm"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && v.handleFile(e.target.files[0])}
              />
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
                <p key={id} className="text-sm text-brand-800">
                  ✓ {s?.title ?? `Module ${id}`}
                </p>
              )
            })}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 space-y-2 border-t border-slate-100 bg-slate-50/95 p-4 backdrop-blur">
        <button className="btn-primary" disabled={!v.canSubmit || uploading} onClick={() => void submit()}>
          {uploading ? 'Uploading…' : 'Submit Module Evidence'}
        </button>
        <button
          type="button"
          className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-brand-900"
          onClick={() => navigate('/assessment')}
        >
          Skip to required practical →
        </button>
      </div>
    </div>
  )
}
