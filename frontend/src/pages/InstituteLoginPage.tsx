import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'

const LOGIN_LOGO = '/static/images/sft-login-logo.png?v=1'

export function InstituteLoginPage() {
  const { config } = useApp()
  const navigate = useNavigate()
  const [uid, setUid] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')

  const brand = config?.brand
  const splash = config?.images.splash ?? '/static/images/splash-forest.jpg'

  useEffect(() => {
    api
      .adminStatus()
      .then((s) => {
        if (s.authenticated) navigate('/home', { replace: true })
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [navigate])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uid.trim() || !email.trim()) return
    setLoading(true)
    setError('')
    try {
      await api.adminLogin(uid.trim(), email.trim())
      navigate('/home', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Institute login failed')
    } finally {
      setLoading(false)
    }
  }

  if (checking) return null

  return (
    <div className="app-frame !bg-black">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <img src={splash} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-black/55" />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto px-[var(--pad-x)] pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-[max(env(safe-area-inset-top),1.5rem)] [-webkit-overflow-scrolling:touch]">
          <div className="mb-5 shrink-0 text-center text-white">
            <img
              src={LOGIN_LOGO}
              alt="Sustainable Futures Trainings"
              className="mx-auto h-[clamp(5.5rem,28vw,7.5rem)] w-[clamp(5.5rem,28vw,7.5rem)] rounded-2xl object-contain"
            />
            <h1 className="mt-4 font-display text-[clamp(0.95rem,4.2vw,1.15rem)] font-bold leading-snug">
              {brand?.name ?? 'SFT Global Skill Assessment Council'}
            </h1>
            <p className="mt-1.5 text-xs tracking-wide text-white/70">
              {brand?.tagline ?? 'Assessing Skills. Validating Competence.'}
            </p>
          </div>

          <form
            onSubmit={handleLogin}
            className="rounded-2xl border border-white/15 bg-black/35 p-5 shadow-2xl backdrop-blur-md"
          >
            <h2 className="font-display text-lg font-bold text-white">Institute login</h2>
            <p className="mt-1 mb-4 text-xs text-white/65">
              Sign in with your institute UID and email to open your course home.
            </p>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">
                Institute UID
              </span>
              <input
                className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-base uppercase tracking-wide text-white outline-none placeholder:text-white/35 focus:border-accent-400 focus:ring-2 focus:ring-accent-400/30"
                value={uid}
                onChange={(e) => setUid(e.target.value.toUpperCase())}
                autoComplete="username"
                autoFocus
              />
            </label>
            <label className="mt-3.5 block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">
                Institute email
              </span>
              <input
                type="email"
                className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-base text-white outline-none placeholder:text-white/35 focus:border-accent-400 focus:ring-2 focus:ring-accent-400/30"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
              />
            </label>
            {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
            <button
              type="submit"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent-400 px-6 py-3.5 text-sm font-semibold text-brand-950 shadow-lg shadow-black/30 transition active:scale-[0.98] disabled:opacity-50"
              disabled={loading || !uid.trim() || !email.trim()}
            >
              {loading ? 'Signing in…' : 'Institute login'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          <p className="mt-auto pt-6 text-center text-[0.65rem] text-white/45">
            Powered by {brand?.powered_by ?? 'SFT Global Trade Assessment Authority'}
          </p>
        </div>
      </div>
    </div>
  )
}
