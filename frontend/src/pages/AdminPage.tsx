import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, FileText, Image as ImageIcon, LogOut, Plus, Trash2, Users, Video } from 'lucide-react'
import { api } from '../api/client'
import { generateCertificatePdf } from '../api/certificate'
import type { Student, TrainingSetup, TrainingStep } from '../types'

export function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)
  const [adminUid, setAdminUid] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [loginError, setLoginError] = useState('')
  const [steps, setSteps] = useState<TrainingStep[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [trainingSetup, setTrainingSetup] = useState<TrainingSetup>({
    course_name: 'Plumbing Foundational Course',
    batch_months: 1,
    pathway_weeks: 4,
  })
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [minSeconds, setMinSeconds] = useState(60)
  const [maxSeconds, setMaxSeconds] = useState(120)
  const [image, setImage] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [generatingUid, setGeneratingUid] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)

  const loadData = useCallback(async () => {
    const [stepsRes, studentsRes, setupRes, logoRes] = await Promise.all([
      api.adminListSteps(),
      api.adminListStudents(),
      api.adminGetTrainingSetup(),
      api.adminGetLogo(),
    ])
    setSteps(stepsRes.steps)
    setStudents(studentsRes.students)
    setTrainingSetup(setupRes.setup)
    setLogoUrl(logoRes.logoUrl)
  }, [])

  useEffect(() => {
    api
      .adminStatus()
      .then(async (s) => {
        setAuthenticated(s.authenticated)
        if (s.authenticated) await loadData()
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setChecking(false))
  }, [loadData])

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setMinSeconds(60)
    setMaxSeconds(120)
    setImage(null)
    setEditingId(null)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setBusy(true)
    try {
      await api.adminLogin(adminUid.trim(), adminEmail.trim())
      setAuthenticated(true)
      setAdminUid('')
      setAdminEmail('')
      await loadData()
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = async () => {
    await api.adminLogout()
    setAuthenticated(false)
    setSteps([])
    setStudents([])
    resetForm()
  }

  const startEdit = (step: TrainingStep) => {
    setEditingId(step.id)
    setTitle(step.title)
    setDescription(step.description)
    setMinSeconds(step.min_seconds)
    setMaxSeconds(step.max_seconds)
    setImage(null)
    setError('')
    setMessage('')
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !description.trim()) {
      setError('Title and video instructions are required.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const form = new FormData()
      form.append('title', title.trim())
      form.append('description', description.trim())
      form.append('min_seconds', String(minSeconds))
      form.append('max_seconds', String(maxSeconds))
      if (image) form.append('image', image)

      const res =
        editingId != null
          ? await api.adminUpdateStep(editingId, form)
          : await api.adminAddStep(form)

      setSteps(res.steps)
      setMessage(res.message)
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const handleGenerateCert = async (student: Student) => {
    setGeneratingUid(student.uid)
    setError('')
    setMessage('')
    try {
      const result = await generateCertificatePdf(student)
      setMessage(`Certificate generated for ${student.uid}`)
      window.open(result.pdfUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Certificate generation failed')
    } finally {
      setGeneratingUid(null)
    }
  }

  const handleSaveTrainingSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const res = await api.adminUpdateTrainingSetup(trainingSetup)
      setTrainingSetup(res.setup)
      setMessage(res.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update training setup')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (stepId: number) => {
    if (!confirm('Remove this pathway step? Learners will no longer see it.')) return
    setBusy(true)
    setError('')
    try {
      const res = await api.adminDeleteStep(stepId)
      setSteps(res.steps)
      setMessage(res.message)
      if (editingId === stepId) resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-frame">
      <header className="shrink-0 bg-brand-950 pt-[env(safe-area-inset-top)] text-white">
        <div className="flex items-center justify-between gap-2 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              to="/"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 active:bg-white/20"
              aria-label="Back to app"
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight">Trainer admin</p>
              <p className="truncate text-[0.62rem] uppercase tracking-wider text-white/55">
                Students & pathway
              </p>
            </div>
          </div>
          {authenticated && (
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-xs font-semibold ring-1 ring-white/15 active:bg-white/20"
            >
              <LogOut size={14} /> Logout
            </button>
          )}
        </div>
      </header>

      <main className="screen-scroll flex min-h-0 flex-1 flex-col">
        {checking ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Loading…</div>
        ) : !authenticated ? (
          <div className="flex flex-1 flex-col justify-center p-4">
            <form onSubmit={handleLogin} className="card space-y-4">
              <div>
                <h1 className="font-display text-base font-bold text-brand-900">Trainer sign in</h1>
                <p className="mt-1 text-xs text-slate-500">
                  View admitted students and manage pathway steps.
                </p>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Admin UID
                </span>
                <input
                  type="text"
                  className="input-field uppercase"
                  placeholder="e.g. 21Admin2021"
                  value={adminUid}
                  onChange={(e) => setAdminUid(e.target.value.toUpperCase())}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Admin email
                </span>
                <input
                  type="email"
                  className="input-field"
                  placeholder="sft@admin.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
              {loginError && <p className="text-xs text-red-600">{loginError}</p>}
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              <Link to="/" className="block text-center text-xs font-medium text-slate-400">
                ← Back to learner app
              </Link>
            </form>
          </div>
        ) : (
          <div className="space-y-4 p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
            <section className="card">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-brand-900">
                <ImageIcon size={16} /> Organisation logo
              </h2>
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  <img src={logoUrl} alt="Org logo" className="h-16 w-16 rounded-lg object-contain border border-slate-200 bg-white p-1" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400">
                    <ImageIcon size={24} />
                  </div>
                )}
                <label className="btn-primary cursor-pointer text-center text-xs">
                  {logoUploading ? 'Uploading…' : logoUrl ? 'Change logo' : 'Upload logo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={logoUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setLogoUploading(true)
                      setError('')
                      try {
                        const res = await api.adminUploadLogo(file)
                        setLogoUrl(res.logoUrl)
                        setMessage(res.message)
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Logo upload failed')
                      } finally {
                        setLogoUploading(false)
                        e.target.value = ''
                      }
                    }}
                  />
                </label>
              </div>
            </section>

            <section className="card">
              <h2 className="mb-3 text-sm font-bold text-brand-900">Training setup (trainer first step)</h2>
              <form onSubmit={handleSaveTrainingSetup} className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Training course name
                  </span>
                  <input
                    className="input-field"
                    value={trainingSetup.course_name}
                    onChange={(e) => setTrainingSetup((prev) => ({ ...prev, course_name: e.target.value }))}
                    required
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Batch months
                    </span>
                    <input
                      type="number"
                      min={1}
                      className="input-field"
                      value={trainingSetup.batch_months}
                      onChange={(e) =>
                        setTrainingSetup((prev) => ({ ...prev, batch_months: Math.max(1, Number(e.target.value) || 1) }))
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Pathway weeks
                    </span>
                    <input
                      type="number"
                      min={1}
                      className="input-field"
                      value={trainingSetup.pathway_weeks}
                      onChange={(e) =>
                        setTrainingSetup((prev) => ({ ...prev, pathway_weeks: Math.max(1, Number(e.target.value) || 1) }))
                      }
                    />
                  </label>
                </div>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? 'Saving…' : 'Save training setup'}
                </button>
              </form>
            </section>

            <section className="card">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-brand-900">
                <Users size={16} /> Students in database ({students.length})
              </h2>
              <p className="mb-3 text-[0.7rem] text-slate-500">
                Trainer records: students, video proof, assessment, and certificate status.
              </p>
              <ul className="space-y-3">
                {students.map((s) => (
                  <li key={s.uid} className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                    <div className="flex gap-3 p-3">
                      <img
                        src={s.image_path || '/static/icons/icon-192.png'}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-white"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                        <p className="text-[0.7rem] text-slate-500">S/O {s.father_name}</p>
                        <p className="mt-1 text-[0.7rem] text-slate-600">{s.course_name}</p>
                        <p className="text-[0.65rem] text-slate-400">{s.batch_duration}</p>
                        {(s.phone || s.email) && (
                          <p className="mt-0.5 text-[0.65rem] text-slate-500">
                            {[s.phone, s.email].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.65rem]">
                          <span className="font-semibold text-brand-900">UID: {s.uid}</span>
                          <span className="text-slate-500">Cert: {s.certificate_number || '—'}</span>
                          <span className="text-slate-500">Status: {s.status || 'admitted'}</span>
                        </div>
                        <div className="mt-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[0.62rem] text-slate-600 ring-1 ring-slate-100">
                          <p>Video proof: {s.video_proof || `${s.uploaded_steps ?? 0}/${s.expected_steps ?? steps.length}`}</p>
                          <p>Assessment: {s.assessment_recorded ? 'Recorded' : 'Pending'}</p>
                          <p>Certificate: {s.certificate_recorded ? 'Recorded' : 'Pending'}</p>
                        </div>
                        <button
                          type="button"
                          className="mt-2 inline-flex items-center gap-1 rounded-lg bg-brand-900 px-3 py-1.5 text-[0.65rem] font-semibold text-white disabled:opacity-50"
                          disabled={generatingUid === s.uid}
                          onClick={() => handleGenerateCert(s)}
                        >
                          <FileText size={12} />
                          {generatingUid === s.uid ? 'Generating…' : 'Generate Certificate'}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <div className="rounded-2xl border border-accent-400/30 bg-teal-50 px-4 py-3 text-xs text-brand-900">
              <p className="font-semibold">Pathway steps</p>
              <p className="mt-1 text-slate-600">
                Add steps here. After UID login, learners record a video for each step.
              </p>
            </div>

            <section className="card">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-brand-900">
                <Plus size={16} />
                {editingId != null ? `Edit step ${editingId}` : 'Add pathway step'}
              </h2>
              <form onSubmit={handleSave} className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Step title
                  </span>
                  <input
                    className="input-field"
                    placeholder="e.g. Practical Trade Application"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    What video should the learner record?
                  </span>
                  <textarea
                    className="input-field min-h-[88px] resize-none"
                    placeholder="Describe the video evidence required…"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Min seconds
                    </span>
                    <input
                      type="number"
                      min={10}
                      className="input-field"
                      value={minSeconds}
                      onChange={(e) => setMinSeconds(Number(e.target.value))}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Max seconds
                    </span>
                    <input
                      type="number"
                      min={10}
                      className="input-field"
                      value={maxSeconds}
                      onChange={(e) => setMaxSeconds(Number(e.target.value))}
                    />
                  </label>
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                {message && <p className="text-xs text-emerald-700">{message}</p>}
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary flex-1" disabled={busy}>
                    {busy ? 'Saving…' : editingId != null ? 'Save changes' : 'Add step'}
                  </button>
                  {editingId != null && (
                    <button type="button" className="btn-secondary !w-auto px-4" onClick={resetForm}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="card">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-brand-900">
                <Video size={16} /> Pathway steps ({steps.length})
              </h2>
              <ul className="space-y-3">
                {steps.map((step) => (
                  <li key={step.id} className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                    <div className="flex gap-3 p-3">
                      <img src={step.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.65rem] font-bold uppercase tracking-wide text-accent-500">
                          Step {step.icon}
                        </p>
                        <p className="truncate text-sm font-semibold text-slate-800">{step.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-[0.7rem] text-slate-500">{step.description}</p>
                      </div>
                    </div>
                    <div className="flex border-t border-slate-100">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => startEdit(step)}
                        className="flex-1 py-2.5 text-xs font-semibold text-brand-900 active:bg-white"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDelete(step.id)}
                        className="flex flex-1 items-center justify-center gap-1 border-l border-slate-100 py-2.5 text-xs font-semibold text-red-600 active:bg-red-50"
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
