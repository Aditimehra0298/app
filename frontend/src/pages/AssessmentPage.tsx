import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Square, Upload } from 'lucide-react'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { formatDurationLabel, useVideoRecorder } from '../hooks/useVideoRecorder'

const PRACTICAL_MIN_SECONDS = 90
const PRACTICAL_MAX_SECONDS = 150

export function AssessmentPage() {
  const { config, progress, refreshProgress } = useApp()
  const navigate = useNavigate()
  const v = useVideoRecorder({
    resetKey: 'practical',
    minSeconds: PRACTICAL_MIN_SECONDS,
    maxSeconds: PRACTICAL_MAX_SECONDS,
  })
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (progress?.phase === 'registration') navigate('/')
    if (progress?.phase === 'certificate' && !progress.practical_reupload) navigate('/certificate')
  }, [progress, navigate])

  if (!config) return null

  const submit = async () => {
    if (!v.blob) return
    setUploading(true)
    const fd = new FormData()
    const ext = v.blob.type.includes('mp4') ? '.mp4' : v.blob.type.includes('quicktime') ? '.mov' : '.webm'
    fd.append('video', v.blob, `practical${ext}`)
    fd.append('duration', String(v.duration || 0))
    if (v.durationUnknown) fd.append('durationUnknown', '1')
    try {
      await api.uploadPractical(fd)
      await refreshProgress()
      navigate('/certificate')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="screen-scroll flex flex-col">
      <div className="relative h-40 shrink-0 overflow-hidden">
        <img src={config.images.assessment} alt="" className="h-full w-full object-cover" />
        <div className="gradient-hero absolute inset-0 flex flex-col justify-end p-4">
          <span className="mb-1 w-fit rounded-full bg-teal-500/30 px-2.5 py-0.5 text-[0.6rem] font-bold uppercase text-white">
            Final practical · Required
          </span>
          <h2 className="font-display text-lg font-bold text-white">{config.assessmentTitle}</h2>
        </div>
      </div>

      <div className="space-y-4 p-4 pb-2">
        <p className="text-sm text-slate-600">{config.assessmentSubtitle}</p>

        <div className="grid grid-cols-3 gap-2">
          {[
            { val: '2 min', label: 'Video' },
            { val: 'Trainer', label: 'Verified by' },
            { val: 'QR', label: 'Certificate' },
          ].map(({ val, label }) => (
            <div key={label} className="card py-3 text-center">
              <p className="font-display text-lg font-bold text-brand-900">{val}</p>
              <p className="text-[0.6rem] uppercase tracking-wide text-slate-400">{label}</p>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-brand-900">Practical video</h3>
            <span className="text-right text-[0.65rem] leading-snug text-slate-400">
              About 2:00
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
                <p className="text-xs">Record a 2-minute practical assessment</p>
              </div>
            )}
          </div>

          {v.recording && (
            <p className="mt-2 text-center text-sm font-bold text-red-600">
              ● REC {formatDurationLabel(v.elapsed)} / {formatDurationLabel(PRACTICAL_MAX_SECONDS)} max
            </p>
          )}

          {!v.recording && v.duration > 0 && (
            <p className="mt-2 text-center text-xs text-slate-500">
              Duration: {formatDurationLabel(v.duration)}
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
      </div>

      <div className="sticky bottom-0 border-t border-slate-100 bg-slate-50/95 p-4 backdrop-blur">
        <button className="btn-primary" disabled={!v.canSubmit || uploading} onClick={() => void submit()}>
          {uploading ? 'Uploading…' : 'Submit 2-minute practical'}
        </button>
      </div>
    </div>
  )
}
