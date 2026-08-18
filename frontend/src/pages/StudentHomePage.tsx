import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronRight, Lock, Video } from 'lucide-react'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import type { Student, TrainingStep } from '../types'

function stepStatus(
  stepIndex: number,
  stepId: number,
  completedSteps: number[],
  currentIndex: number,
): 'done' | 'current' | 'locked' {
  if (completedSteps.includes(stepId)) return 'done'
  if (stepIndex === currentIndex) return 'current'
  return 'locked'
}

export function StudentHomePage() {
  const { config, progress, refreshProgress } = useApp()
  const navigate = useNavigate()
  const [student, setStudent] = useState<Student | null>(null)
  const tapCount = useRef(0)
  const tapTimer = useRef<number | null>(null)

  const p = progress?.progress
  const completed = p?.completed_steps ?? []
  const currentIndex = progress?.completed_count ?? 0
  const steps = config?.steps ?? []

  useEffect(() => {
    refreshProgress()
  }, [refreshProgress])

  useEffect(() => {
    if (!progress || progress.phase === 'registration') {
      navigate('/', { replace: true })
    }
  }, [progress, navigate])

  useEffect(() => {
    const uid = p?.student_uid
    if (!uid) return
    api.getStudent(uid).then((res) => setStudent(res.student)).catch(() => setStudent(null))
  }, [p?.student_uid])

  if (!config || !p?.candidate_name) return null

  const photo = p.image_path || student?.image_path || '/static/icons/icon-192.png'
  const course = p.course_name || student?.course_name || config.defaultCourse || 'Plumbing Foundational Course'
  const batch = student?.batch_duration || student?.batch_start || 'Training batch not set'
  const hero = config.images.hero || '/static/images/hero-plumbing.jpg'

  const openStep = (_step: TrainingStep, status: 'done' | 'current' | 'locked') => {
    if (status === 'locked') return
    if (status === 'current') navigate('/modules')
  }

  const onLogoTap = () => {
    tapCount.current += 1
    if (tapTimer.current) window.clearTimeout(tapTimer.current)
    tapTimer.current = window.setTimeout(() => {
      tapCount.current = 0
    }, 1200)
    // Safety: do NOT expose admin panel shortcut from learner screen.
    // Tap counter is kept only to debounce the action.
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
      <div className="screen-scroll flex flex-col">
        <section className="relative min-h-[clamp(14rem,38vh,22rem)] shrink-0 overflow-hidden text-white">
          <img
            src={hero}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-linear-to-b from-black/35 via-brand-950/40 to-brand-950/92" />

          <div className="relative z-10 flex min-h-[clamp(14rem,38vh,22rem)] flex-col px-[var(--pad-x)] pb-6 pt-[max(env(safe-area-inset-top),0.75rem)]">
            <div className="mb-2 flex items-start justify-between gap-3">
              <button type="button" onClick={onLogoTap} className="flex items-center gap-2" aria-label="SFT">
                <img src="/static/images/sft-logo.png?v=2" alt="" className="h-8 w-8 rounded-lg object-cover ring-1 ring-white/30" />
                <span className="text-xs font-bold tracking-wide text-white/90">SFT</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="shrink-0 rounded-full bg-white/15 p-0.5 ring-2 ring-white/50 shadow-lg"
                aria-label="Open profile"
              >
                <img src={photo} alt="" className="h-12 w-12 rounded-full object-cover" />
              </button>
            </div>

            <div className="mt-auto grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-black/40 px-3 py-3.5 ring-2 ring-accent-400/80 backdrop-blur-md">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-white/55">
                  Course
                </p>
                <p className="mt-1.5 font-display text-sm font-bold leading-snug text-white">
                  {course}
                </p>
                <p className="mt-2 text-[0.62rem] font-semibold text-accent-400">Selected</p>
              </div>
              <div className="rounded-2xl bg-black/40 px-3 py-3.5 ring-2 ring-accent-400/80 backdrop-blur-md">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-white/55">
                  Training batch
                </p>
                <p className="mt-1.5 text-sm font-bold leading-snug text-white">
                  {batch}
                </p>
                <p className="mt-2 text-[0.62rem] font-semibold text-accent-400">Selected</p>
              </div>
            </div>
          </div>
        </section>

        <div className="flex-1 px-[var(--pad-x)] pb-[max(env(safe-area-inset-bottom),1rem)] pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-brand-900">Pathway</h2>
            <span className="rounded-full bg-brand-900/10 px-2.5 py-0.5 text-xs font-semibold text-brand-900">
              {completed.length}/{steps.length} done
            </span>
          </div>

          <ul className="space-y-3">
            {steps.map((step, stepIndex) => {
              const status = stepStatus(stepIndex, step.id, completed, currentIndex)
              const isCurrent = status === 'current'
              const isDone = status === 'done'
              const isLocked = status === 'locked'

              return (
                <li key={step.id}>
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => openStep(step, status)}
                    className={`flex w-full items-center gap-3 overflow-hidden rounded-2xl border text-left transition active:scale-[0.99] ${
                      isCurrent
                        ? 'border-accent-400/40 bg-white shadow-md ring-2 ring-accent-400/20'
                        : isDone
                          ? 'border-emerald-100 bg-white'
                          : 'border-slate-100 bg-white opacity-70'
                    } ${isLocked ? 'cursor-not-allowed' : ''}`}
                  >
                    <div className="relative h-20 w-20 shrink-0">
                      <img src={step.image} alt="" className="h-full w-full object-cover" />
                      {isDone && (
                        <div className="absolute inset-0 flex items-center justify-center bg-brand-950/50">
                          <CheckCircle2 className="text-emerald-400" size={28} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 py-3 pr-2">
                      <p className="text-[0.6rem] font-bold uppercase tracking-wider text-slate-400">
                        Step {step.id}
                      </p>
                      <p className="font-display text-sm font-bold text-brand-900">{step.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[0.7rem] leading-snug text-slate-500">
                        {step.description}
                      </p>
                      {isCurrent && (
                        <span className="mt-1.5 inline-flex items-center gap-1 text-[0.65rem] font-semibold text-accent-500">
                          <Video size={12} /> Tap to record video
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 pr-3">
                      {isLocked ? (
                        <Lock className="text-slate-300" size={18} />
                      ) : (
                        <ChevronRight className={isCurrent ? 'text-accent-500' : 'text-slate-300'} size={20} />
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>

          {progress?.phase === 'certificate' ? (
            <button
              type="button"
              className="btn-primary mt-4"
              onClick={() => navigate('/certificate')}
            >
              {progress.certificate_ready ? 'Open certificate' : 'Certificate processing'}
            </button>
          ) : progress?.all_steps_done ? (
            <button
              type="button"
              className="btn-primary mt-4"
              onClick={() => navigate('/assessment')}
            >
              Continue to assessment
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
