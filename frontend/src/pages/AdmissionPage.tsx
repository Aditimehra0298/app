import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, CheckCircle2 } from 'lucide-react'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import type { Student } from '../types'

const fieldClass =
  'w-full appearance-none rounded-xl border border-white/15 bg-white/10 px-4 py-3.5 text-[16px] text-white outline-none placeholder:text-white/35 focus:border-accent-400 focus:ring-2 focus:ring-accent-400/30 [color-scheme:dark]'

function todayIsoDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function AdmissionPage() {
  const { config, refreshProgress } = useApp()
  const navigate = useNavigate()
  const courses = config?.admissionCourses?.length
    ? config.admissionCourses
    : ['Plumbing Foundational Course']

  const [name, setName] = useState('')
  const [fatherName, setFatherName] = useState('')
  const [course, setCourse] = useState(courses[0] ?? '')
  const [startDate, setStartDate] = useState(todayIsoDate)
  const [email, setEmail] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<Student | null>(null)

  const brand = config?.brand
  const splash = config?.images.splash ?? '/static/images/splash-forest.jpg'

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  const pickPhoto = (file: File) => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!photo) {
      setError('Please upload your photo.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('name', name.trim())
      form.append('father_name', fatherName.trim())
      form.append('course_name', course)
      form.append('batch_start', startDate)
      form.append('email', email.trim())
      form.append('image', photo)
      const res = await api.submitAdmission(form)
      setSaved(res.student)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admission failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-frame !bg-black">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <img src={splash} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-black/60" />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col px-[var(--pad-x)] pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-[max(env(safe-area-inset-top),1.25rem)]">
          <div className="mb-5 text-center text-white">
            <img
              src="/static/images/sft-logo.png?v=2"
              alt=""
              className="mx-auto h-20 w-20 rounded-2xl object-contain shadow-lg ring-1 ring-white/10"
            />
            <h1 className="mt-3 font-display text-lg font-bold leading-tight">Training admission</h1>
            <p className="mt-1 text-xs text-white/65">New student registration</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto [-webkit-overflow-scrolling:touch]">
            {saved ? (
              <div className="rounded-2xl border border-white/15 bg-black/35 p-5 text-center shadow-2xl backdrop-blur-md">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">
                  <CheckCircle2 size={32} />
                </div>
                <h2 className="font-display text-lg font-bold text-white">You are admitted</h2>
                <p className="mt-1 text-sm text-white/70">{saved.name}</p>
                {saved.image_path && (
                  <img
                    src={saved.image_path}
                    alt=""
                    className="mx-auto mt-3 h-20 w-20 rounded-full object-cover ring-2 ring-white/20"
                  />
                )}
                <div className="mt-4 rounded-2xl bg-black/40 px-4 py-4 ring-1 ring-white/10">
                  <p className="text-[0.65rem] uppercase tracking-[0.18em] text-white/50">
                    Your UID / Roll No
                  </p>
                  <p className="mt-1 font-display text-3xl font-bold tracking-wide text-accent-400">
                    {saved.uid}
                  </p>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-white/60">
                  Save this UID. Login with this UID and your registered Gmail to start training videos.
                </p>
                <button
                  type="button"
                  className="mt-5 w-full rounded-xl bg-accent-400 px-6 py-3.5 text-sm font-semibold text-brand-950 shadow-lg shadow-black/30 transition active:scale-[0.98] disabled:opacity-50"
                  disabled={busy}
                  onClick={async () => {
                    if (!saved?.uid) return
                    setBusy(true)
                    setError('')
                    try {
                      await api.loginWithUid(saved.uid, saved.email || email)
                      await refreshProgress()
                      navigate('/home', { replace: true })
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Login failed')
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  {busy ? 'Logging in…' : 'Start training videos'}
                </button>
              </div>
            ) : (
              <form
                onSubmit={submit}
                className="rounded-2xl border border-white/15 bg-black/35 p-5 shadow-2xl backdrop-blur-md"
              >
                <label className="mb-4 block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/55">
                    Your photo <span className="text-red-400">*</span>
                  </span>
                  <label className="flex min-h-[8.5rem] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/25 bg-white/5 px-3 py-4 text-center">
                    {photoPreview ? (
                      <img
                        src={photoPreview}
                        alt=""
                        className="mb-2 h-20 w-20 rounded-full object-cover ring-2 ring-white/20"
                      />
                    ) : (
                      <Camera className="mb-2 text-white/70" size={28} />
                    )}
                    <span className="text-xs text-white/70">
                      {photo ? photo.name : 'Tap to upload your photo'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="user"
                      className="sr-only"
                      onChange={(e) => {
                        const next = e.target.files?.[0]
                        if (next) pickPhoto(next)
                      }}
                      required={!photo}
                    />
                  </label>
                </label>

                <label className="mb-3.5 block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">
                    Student name <span className="text-red-400">*</span>
                  </span>
                  <input
                    className={fieldClass}
                    placeholder="Your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </label>

                <label className="mb-3.5 block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">
                    Father&apos;s name <span className="text-red-400">*</span>
                  </span>
                  <input
                    className={fieldClass}
                    placeholder="Father's full name"
                    value={fatherName}
                    onChange={(e) => setFatherName(e.target.value)}
                    autoComplete="off"
                    required
                  />
                </label>

                <label className="mb-3.5 block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">
                    Gmail <span className="text-red-400">*</span>
                  </span>
                  <input
                    type="email"
                    className={fieldClass}
                    placeholder="yourname@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    inputMode="email"
                    required
                  />
                </label>

                <label className="mb-3.5 block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">
                    Course <span className="text-red-400">*</span>
                  </span>
                  <select
                    className={fieldClass}
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    required
                  >
                    {courses.map((c) => (
                      <option key={c} value={c} className="bg-brand-950 text-white">
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mb-4 block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">
                    Training start date <span className="text-red-400">*</span>
                  </span>
                  <input
                    type="date"
                    className={fieldClass}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </label>

                {error && <p className="mb-3 text-xs text-red-300">{error}</p>}

                <button
                  type="submit"
                  className="w-full rounded-xl bg-accent-400 px-6 py-3.5 text-sm font-semibold text-brand-950 shadow-lg shadow-black/30 transition active:scale-[0.98] disabled:opacity-50"
                  disabled={busy}
                >
                  {busy ? 'Saving…' : 'Submit admission'}
                </button>

                <p className="mt-4 text-center text-xs text-white/55">
                  Already have a UID?{' '}
                  <Link to="/" className="font-semibold text-accent-400 underline">
                    Login
                  </Link>
                </p>
              </form>
            )}
          </div>

          <p className="pt-4 text-center text-[0.65rem] text-white/45">
            Powered by {brand?.powered_by ?? 'SFT Global Trade Assessment Authority'}
          </p>
        </div>
      </div>
    </div>
  )
}
