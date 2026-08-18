import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'

export function AssessmentPage() {
  const { config, progress, refreshProgress } = useApp()
  const navigate = useNavigate()
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<{ passed: boolean; score: number; correct: number; total: number } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (progress?.phase === 'registration') navigate('/')
    if (progress?.phase === 'training') navigate('/home')
    if (progress?.phase === 'certificate') navigate('/certificate')
  }, [progress, navigate])

  if (!config) return null

  const submit = async () => {
    if (Object.keys(answers).length < config.questions.length) {
      alert('Please answer all questions.')
      return
    }
    setLoading(true)
    try {
      const res = await api.submitAssessment(answers)
      setResult(res)
      await refreshProgress()
      if (res.passed) {
        navigate('/certificate')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen-scroll flex flex-col">
      <div className="relative h-40 shrink-0 overflow-hidden">
        <img src={config.images.assessment} alt="" className="h-full w-full object-cover" />
        <div className="gradient-hero absolute inset-0 flex flex-col justify-end p-4">
          <span className="mb-1 w-fit rounded-full bg-teal-500/30 px-2.5 py-0.5 text-[0.6rem] font-bold uppercase text-white">
            Trade Assessment
          </span>
          <h2 className="font-display text-lg font-bold text-white">{config.assessmentTitle}</h2>
        </div>
      </div>

      <div className="space-y-4 p-4 pb-2">
        <p className="text-sm text-slate-600">{config.assessmentSubtitle}</p>

        <div className="grid grid-cols-3 gap-2">
          {[
            { val: config.questions.length, label: 'Questions' },
            { val: `${config.passPercentage}%`, label: 'Pass mark' },
            { val: 'Online', label: 'Format' },
          ].map(({ val, label }) => (
            <div key={label} className="card py-3 text-center">
              <p className="font-display text-lg font-bold text-brand-900">{val}</p>
              <p className="text-[0.6rem] uppercase tracking-wide text-slate-400">{label}</p>
            </div>
          ))}
        </div>

        {config.questions.map((q, qi) => (
          <div key={q.id} className="card">
            <p className="mb-3 text-sm font-semibold leading-snug text-slate-800">
              <span className="mr-2 inline-block rounded-md bg-brand-900 px-1.5 py-0.5 text-[0.65rem] font-bold text-white">
                Q{qi + 1}
              </span>
              {q.question}
            </p>
            <div className="space-y-2">
              {q.options.map((opt, oi) => (
                <label
                  key={oi}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-sm transition ${
                    answers[q.id] === oi
                      ? 'border-accent-500 bg-teal-50'
                      : 'border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    name={q.id}
                    className="mt-0.5 accent-teal-600"
                    checked={answers[q.id] === oi}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                  />
                  <span className="text-slate-700">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        ))}

        {result && !result.passed && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-800">
            <strong>Not passed</strong> — {result.score}%. Need {config.passPercentage}%. Review and try again.
          </div>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-slate-100 bg-slate-50/95 p-4 backdrop-blur">
        <button className="btn-primary" disabled={loading} onClick={submit}>
          {loading ? 'Submitting…' : 'Submit Trade Assessment'}
        </button>
      </div>
    </div>
  )
}
