import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Award,
  BookOpen,
  Camera,
  ChevronLeft,
  ChevronRight,
  Layers,
  Plus,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import { api } from '../api/client'
import { InstituteTabBar } from '../components/InstituteTabBar'
import { useApp } from '../context/AppContext'
import { LogoutButton } from '../components/LogoutButton'
import type { InstituteCourse } from '../types'

interface StepDraft {
  title: string
  description: string
}

const EUROTECH_LOGO = '/static/images/eurotech-logo.png'
const SF_HOME_LOGO = '/static/images/sft-home-logo.png?v=3'

function formatBatchDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!y || !m || !d) return iso
  return `${d}-${m}-${y}`
}

export function InstituteHomePage() {
  const navigate = useNavigate()
  const { config } = useApp()
  const heroImage = config?.images.splash ?? '/static/images/splash-forest.jpg'
  const [checking, setChecking] = useState(true)
  const [instituteName, setInstituteName] = useState('Eurotech')
  const [instituteUid, setInstituteUid] = useState('21EUROTECH001')
  const [courses, setCourses] = useState<InstituteCourse[]>([])

  /* ── Create wizard state ── */
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState(0) // 0 = details, 1 = pathway
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [batchStart, setBatchStart] = useState('')
  const [batchEnd, setBatchEnd] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [steps, setSteps] = useState<StepDraft[]>([{ title: '', description: '' }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const loadCourses = useCallback(async () => {
    const res = await api.adminListCourses()
    setCourses(res.courses)
  }, [])

  useEffect(() => {
    api
      .adminStatus()
      .then(async (s) => {
        if (!s.authenticated) { navigate('/', { replace: true }); return }
        setInstituteName(s.institute?.name || 'Eurotech')
        setInstituteUid(s.institute?.uid || '21EUROTECH001')
        await loadCourses()
      })
      .catch(() => navigate('/', { replace: true }))
      .finally(() => setChecking(false))
  }, [loadCourses, navigate])

  const resetWizard = () => {
    setWizardOpen(false)
    setWizardStep(0)
    setTitle('')
    setDescription('')
    setBatchStart('')
    setBatchEnd('')
    setImageFile(null)
    setImagePreview('')
    setSteps([{ title: '', description: '' }])
    setError('')
  }

  const openWizard = () => {
    resetWizard()
    setWizardOpen(true)
  }

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setImageFile(f)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(f)
  }

  const goToPathway = () => {
    if (!title.trim()) { setError('Enter a training name'); return }
    if (!batchStart) { setError('Select batch start date'); return }
    if (!batchEnd) { setError('Select batch end date'); return }
    if (batchEnd < batchStart) { setError('End date must be on or after start date'); return }
    setError('')
    setWizardStep(1)
  }

  const addStep = () => setSteps((s) => [...s, { title: '', description: '' }])

  const removeStep = (i: number) => setSteps((s) => s.filter((_, j) => j !== i))

  const updateStep = (i: number, field: keyof StepDraft, value: string) =>
    setSteps((s) => s.map((st, j) => (j === i ? { ...st, [field]: value } : st)))

  const submitCourse = async () => {
    const cleanSteps = steps.filter((s) => s.title.trim())
    if (cleanSteps.length === 0) { setError('Add at least one week/step'); return }
    setBusy(true)
    setError('')
    try {
      const res = await api.adminAddCourse({
        title: title.trim(),
        description: description.trim(),
        batch_start: batchStart,
        batch_end: batchEnd,
        steps: cleanSteps,
        image: imageFile,
      })
      setCourses(res.courses)
      resetWizard()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create training')
    } finally {
      setBusy(false)
    }
  }

  const removeCourse = async (course: InstituteCourse) => {
    if (course.built) return
    if (!confirm(`Remove "${course.title}"?`)) return
    const res = await api.adminDeleteCourse(course.id)
    setCourses(res.courses)
  }

  const openCourse = (course: InstituteCourse) => {
    navigate(`/training/${encodeURIComponent(course.id)}`)
  }

  if (checking) {
    return (
      <div className="app-frame flex items-center justify-center bg-slate-50 text-sm text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <img src={SF_HOME_LOGO} alt="" className="h-14 w-14 animate-pulse object-contain" />
          <span>Loading…</span>
        </div>
      </div>
    )
  }

  const builtCourses = courses.filter((c) => c.built)
  const customCourses = courses.filter((c) => !c.built)
  const totalCourses = courses.length

  const stats = [
    { icon: Layers, label: 'Courses', value: String(totalCourses) },
    { icon: Video, label: 'Video steps', value: '4 / course' },
    { icon: Award, label: 'Certificates', value: 'Auto' },
  ]

  return (
    <div className="app-frame relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
      <div className="screen-scroll flex min-h-0 flex-1 flex-col">
        {/* Hero — matches student home / app shell */}
        <section className="relative min-h-[clamp(18rem,42vh,24rem)] shrink-0 overflow-hidden text-white">
          <img
            src={heroImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-linear-to-b from-black/60 via-brand-950/70 to-brand-950/95" />

          <div className="relative z-10 flex min-h-[clamp(18rem,42vh,24rem)] flex-col px-[var(--pad-x)] pb-5 pt-[max(env(safe-area-inset-top),0.75rem)]">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <img
                  src={SF_HOME_LOGO}
                  alt="Sustainable Futuristic Trainings"
                  className="h-12 w-12 shrink-0 object-contain"
                />
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-bold leading-tight text-white">{instituteName}</p>
                  <p className="truncate text-[0.62rem] uppercase tracking-[0.12em] text-white/55">{instituteUid}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/institute-profile')}
                  className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white p-1 ring-1 ring-white/40 shadow-md active:scale-95"
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
            </div>

            <div className="flex flex-1 items-center justify-center px-3 py-3">
              <div className="max-w-[21rem] rounded-3xl bg-black/30 px-5 py-4 text-center ring-1 ring-white/10 backdrop-blur-sm">
              <img
                src={SF_HOME_LOGO}
                alt="Sustainable Futuristic Trainings"
                className="mx-auto mb-3 h-[clamp(5.5rem,28vw,7.5rem)] w-[clamp(5.5rem,28vw,7.5rem)] object-contain"
              />
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/85">
                Sustainable Futuristic Trainings LLC
              </p>
              <h1 className="mt-1.5 font-display text-[clamp(1.05rem,4.8vw,1.4rem)] font-bold leading-snug tracking-tight text-white">
                Global Skill Assessment Council
              </h1>
              <p className="mt-2 text-xs tracking-wide text-white/65">
                {config?.brand?.tagline ?? 'Assessing Skills. Validating Competence.'}
              </p>
              <p className="mt-2 text-[0.78rem] leading-relaxed text-white/80">
                Create trainings, manage batches, and issue verified certificates from one place.
              </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-black/40 px-3 py-3.5 ring-2 ring-accent-400/80 backdrop-blur-md">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-white/55">Institute</p>
                <p className="mt-1.5 font-display text-sm font-bold leading-snug text-white">{instituteName}</p>
                <p className="mt-2 text-[0.62rem] font-semibold text-accent-400">Training portal</p>
              </div>
              <div className="rounded-2xl bg-black/40 px-3 py-3.5 ring-2 ring-accent-400/80 backdrop-blur-md">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-white/55">Overview</p>
                <p className="mt-1.5 text-sm font-bold leading-snug text-white">
                  {totalCourses} course{totalCourses === 1 ? '' : 's'}
                </p>
                <p className="mt-2 text-[0.62rem] font-semibold text-accent-400">Ready to manage</p>
              </div>
            </div>
          </div>
        </section>

        {/* Content */}
        <div className="flex-1 px-[var(--pad-x)] pb-[max(env(safe-area-inset-bottom),5.5rem)] pt-4">
          <button
            type="button"
            onClick={openWizard}
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-950 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-950/20 active:scale-[0.97]"
          >
            <Plus size={16} strokeWidth={2.8} />
            Create new training
          </button>

          <div className="mb-5 grid grid-cols-3 gap-2">
            {stats.map((s, i) => (
              <div key={i} className="flex flex-col items-center gap-1 rounded-2xl bg-white px-2 py-3 text-center shadow-sm ring-1 ring-slate-100">
                <s.icon size={15} className="text-brand-800" />
                <span className="font-display text-sm font-extrabold text-brand-950">{s.value}</span>
                <span className="text-[0.52rem] uppercase tracking-wide text-slate-400">{s.label}</span>
              </div>
            ))}
          </div>
          {builtCourses.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <BookOpen size={15} className="text-brand-800" />
                <h2 className="font-display text-[0.82rem] font-bold uppercase tracking-wide text-brand-950">Active trainings</h2>
              </div>
              <div className="space-y-2.5">
                {builtCourses.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => openCourse(course)}
                    className="group w-full overflow-hidden rounded-3xl bg-white text-left shadow-sm ring-1 ring-slate-100 active:scale-[0.99]"
                  >
                    <div className="relative h-[9.5rem] overflow-hidden">
                      <img src={course.image} alt="" className="h-full w-full object-cover object-center transition duration-300 group-active:scale-105" />
                      <div className="absolute inset-0 bg-linear-to-t from-brand-950 via-brand-950/45 to-black/10" />
                      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/95 px-2.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-white">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-white" />
                        Active
                      </span>
                      <div className="absolute inset-x-0 bottom-0 p-3.5">
                        <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-accent-300">
                          {course.duration_months ? `${course.duration_months}-month foundation` : 'Official pathway'}
                        </p>
                        <p className="mt-1 font-display text-[1.02rem] font-bold leading-snug text-white">{course.title}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-3.5 py-3">
                      <div className="min-w-0 flex-1">
                        {course.description && (
                          <p className="line-clamp-2 text-[0.72rem] leading-relaxed text-slate-500">{course.description}</p>
                        )}
                        <p className="mt-1 text-[0.65rem] font-semibold text-brand-800">
                          Weekly videos · practical assessment · verified certificate
                        </p>
                      </div>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-950 text-white">
                        <ChevronRight size={16} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {customCourses.length > 0 && (
            <section className="mt-7">
              <h2 className="mb-3 font-display text-[0.82rem] font-bold uppercase tracking-wide text-brand-950">Your trainings</h2>
              <div className="grid grid-cols-2 gap-3">
                {customCourses.map((course) => (
                  <button key={course.id} type="button" onClick={() => openCourse(course)} className="group relative overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-slate-100 active:scale-[0.97]">
                    <div className="relative h-24 bg-brand-950">
                      <img src={course.image} alt="" className="h-full w-full object-cover opacity-60" />
                      <div className="absolute inset-0 bg-gradient-to-t from-brand-950/90 to-brand-950/20" />
                      <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); void removeCourse(course) }} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm ring-1 ring-white/20" aria-label={`Remove ${course.title}`}>
                        <Trash2 size={12} />
                      </span>
                      {(course.batch_start || course.batch_end) ? (
                        <span className="absolute left-2 bottom-2 rounded-md bg-black/50 px-2 py-0.5 text-[0.55rem] font-bold text-white backdrop-blur-sm">
                          {formatBatchDate(course.batch_start || '')} – {formatBatchDate(course.batch_end || '')}
                        </span>
                      ) : course.duration_months ? (
                        <span className="absolute left-2 bottom-2 rounded-md bg-black/50 px-2 py-0.5 text-[0.55rem] font-bold text-white backdrop-blur-sm">
                          {course.duration_months} month{course.duration_months > 1 ? 's' : ''}
                        </span>
                      ) : null}
                    </div>
                    <div className="p-3">
                      <p className="font-display text-[0.78rem] font-bold leading-snug text-brand-900">{course.title}</p>
                      {course.description && <p className="mt-0.5 line-clamp-2 text-[0.65rem] leading-relaxed text-slate-400">{course.description}</p>}
                      {course.steps && course.steps.length > 0 && (
                        <p className="mt-1 text-[0.6rem] font-semibold text-brand-700">{course.steps.length} week{course.steps.length > 1 ? 's' : ''} pathway</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {customCourses.length === 0 && (
            <section className="mt-7">
              <div className="rounded-2xl border border-dashed border-brand-900/12 bg-white p-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-950 to-brand-800 text-white shadow-lg shadow-brand-950/20">
                  <Plus size={24} strokeWidth={2.4} />
                </div>
                <p className="mt-3.5 font-display text-sm font-bold text-brand-950">No custom trainings yet</p>
                <p className="mx-auto mt-1 max-w-[22ch] text-[0.72rem] leading-relaxed text-slate-400">
                  Tap "Create new training" to build your first course.
                </p>
                <button type="button" onClick={openWizard} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-950 px-4 py-2.5 text-[0.75rem] font-semibold text-white active:scale-[0.97]">
                  <Plus size={14} strokeWidth={2.8} />
                  Get started
                </button>
              </div>
            </section>
          )}
        </div>
      </div>

      <InstituteTabBar active="home" onCourseClick={openWizard} />

      {/* ══════════════════════════════════════════════════
          CREATE TRAINING WIZARD (full-screen overlay)
         ══════════════════════════════════════════════════ */}
      {wizardOpen && (
        <div className="absolute inset-0 z-50 flex flex-col bg-white">
          {/* Wizard header */}
          <div className="shrink-0 border-b border-slate-100 bg-white pt-[env(safe-area-inset-top)]">
            <div className="flex items-center justify-between px-4 py-3">
              {wizardStep === 0 ? (
                <button type="button" onClick={resetWizard} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 active:scale-95">
                  <X size={20} />
                </button>
              ) : (
                <button type="button" onClick={() => { setWizardStep(0); setError('') }} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 active:scale-95">
                  <ChevronLeft size={20} />
                </button>
              )}
              <div className="text-center">
                <p className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">
                  Step {wizardStep + 1} of 2
                </p>
                <p className="font-display text-sm font-bold text-brand-950">
                  {wizardStep === 0 ? 'Training details' : 'Weekly pathway'}
                </p>
              </div>
              <div className="w-9" />
            </div>
            {/* Progress bar */}
            <div className="flex gap-1.5 px-4 pb-3">
              <div className={`h-1 flex-1 rounded-full ${wizardStep >= 0 ? 'bg-accent-400' : 'bg-slate-200'}`} />
              <div className={`h-1 flex-1 rounded-full ${wizardStep >= 1 ? 'bg-accent-400' : 'bg-slate-200'}`} />
            </div>
          </div>

          {/* Wizard body */}
          <div className="screen-scroll flex-1 px-5 py-5">
            {wizardStep === 0 && (
              <div className="space-y-4">
                {/* Image upload */}
                <div>
                  <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">Training cover photo</p>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 active:scale-[0.98]"
                  >
                    {imagePreview ? (
                      <>
                        <img src={imagePreview} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-black/30" />
                        <span className="relative z-10 flex items-center gap-2 rounded-xl bg-white/90 px-3 py-2 text-[0.72rem] font-semibold text-brand-950">
                          <Camera size={14} /> Change photo
                        </span>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Camera size={28} />
                        <span className="text-[0.72rem] font-semibold">Tap to upload photo</span>
                      </div>
                    )}
                  </button>
                </div>

                {/* Title */}
                <label className="block">
                  <span className="mb-1.5 block text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">Training name *</span>
                  <input className="input-field" placeholder="e.g. Plumbing Advanced" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
                </label>

                {/* Description */}
                <label className="block">
                  <span className="mb-1.5 block text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">Short description</span>
                  <textarea className="input-field min-h-20" placeholder="What this training covers" value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>

                {/* Batch dates */}
                <div>
                  <span className="mb-1.5 block text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">
                    Batch period *
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1 block text-[0.62rem] font-medium text-slate-500">From</span>
                      <input
                        className="input-field !px-3"
                        type="date"
                        value={batchStart}
                        max={batchEnd || undefined}
                        onChange={(e) => setBatchStart(e.target.value)}
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[0.62rem] font-medium text-slate-500">To</span>
                      <input
                        className="input-field !px-3"
                        type="date"
                        value={batchEnd}
                        min={batchStart || undefined}
                        onChange={(e) => setBatchEnd(e.target.value)}
                        required
                      />
                    </label>
                  </div>
                  {batchStart && batchEnd && batchEnd >= batchStart && (
                    <p className="mt-2 text-[0.68rem] text-slate-500">
                      Batch: {formatBatchDate(batchStart)} to {formatBatchDate(batchEnd)}
                    </p>
                  )}
                </div>

                {error && <p className="text-xs text-red-600">{error}</p>}
              </div>
            )}

            {wizardStep === 1 && (
              <div>
                <p className="mb-1 text-[0.78rem] font-semibold text-brand-950">
                  Define the weekly pathway for <span className="text-accent-500">{title}</span>
                </p>
                <p className="mb-5 text-[0.7rem] text-slate-400">
                  Each week, the trainer will record a video for that step. Add one step per week.
                </p>

                <div className="space-y-3">
                  {steps.map((step, i) => (
                    <div key={i} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-950 text-[0.65rem] font-bold text-white">
                            W{i + 1}
                          </span>
                          <span className="text-[0.72rem] font-bold text-brand-950">Week {i + 1}</span>
                        </span>
                        {steps.length > 1 && (
                          <button type="button" onClick={() => removeStep(i)} className="flex h-7 w-7 items-center justify-center rounded-lg text-red-400 hover:bg-red-50 active:scale-95">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <input
                        className="input-field mb-2 !py-2.5 !text-sm"
                        placeholder={`Week ${i + 1} title — e.g. Pipe Fitting Basics`}
                        value={step.title}
                        onChange={(e) => updateStep(i, 'title', e.target.value)}
                      />
                      <textarea
                        className="input-field !min-h-16 !py-2.5 !text-sm"
                        placeholder="What the trainer should record for this week"
                        value={step.description}
                        onChange={(e) => updateStep(i, 'description', e.target.value)}
                      />
                    </div>
                  ))}
                </div>

                <button type="button" onClick={addStep} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-900/15 bg-white py-3 text-[0.78rem] font-semibold text-brand-900 active:scale-[0.98]">
                  <Plus size={16} strokeWidth={2.5} />
                  Add week {steps.length + 1}
                </button>

                {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
              </div>
            )}
          </div>

          {/* Wizard footer */}
          <div className="shrink-0 border-t border-slate-100 bg-white px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
            {wizardStep === 0 ? (
              <button type="button" onClick={goToPathway} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-950 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-950/20 active:scale-[0.97]">
                Next: Add weekly pathway
                <ChevronRight size={16} />
              </button>
            ) : (
              <button type="button" onClick={() => void submitCourse()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-400 py-3.5 text-sm font-bold text-brand-950 shadow-lg shadow-accent-400/30 disabled:opacity-50 active:scale-[0.97]">
                {busy ? 'Creating…' : 'Create training'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
