import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, KeyRound, Shield } from 'lucide-react'
import { api } from '../api/client'
import { LogoutButton } from '../components/LogoutButton'

const EUROTECH_LOGO = '/static/images/eurotech-logo.png'
const SF_LOGO = '/static/images/sft-home-logo.png?v=5'

type InstituteProfile = {
  uid: string
  name: string
  email: string
  logoUrl?: string
  passwordSet?: boolean
  courses?: number
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="border-b border-slate-100 py-3 last:border-b-0">
      <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 break-all text-sm font-medium text-slate-800">{value}</p>
    </div>
  )
}

export function InstituteProfilePage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [institute, setInstitute] = useState<InstituteProfile | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    api
      .adminStatus()
      .then(async (s) => {
        if (!s.authenticated) {
          navigate('/', { replace: true })
          return
        }
        const res = await api.adminProfile()
        setInstitute(res.institute)
      })
      .catch(() => navigate('/', { replace: true }))
      .finally(() => setChecking(false))
  }, [navigate])

  const changePassword = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const res = await api.adminChangePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      })
      setMessage(res.message || 'Password updated.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setInstitute((prev) => (prev ? { ...prev, passwordSet: true } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password')
    } finally {
      setBusy(false)
    }
  }

  if (checking) {
    return (
      <div className="app-frame flex items-center justify-center bg-slate-50 text-sm text-slate-400">
        Loading profile…
      </div>
    )
  }

  if (!institute) return null

  return (
    <div className="app-frame bg-slate-50">
      <header className="shrink-0 bg-brand-950 pt-[env(safe-area-inset-top)] text-white">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <img
            src={SF_LOGO}
            alt="Sustainable Futuristic Trainings"
            className="h-11 w-11 shrink-0 object-contain"
          />
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold">Institute profile</p>
            <p className="text-[0.62rem] text-white/55">Eurotech account settings</p>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="screen-scroll flex min-h-0 flex-1 flex-col p-4 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <section className="mb-4 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
          <div className="flex flex-col items-center bg-brand-950 px-4 pb-6 pt-5 text-white">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 shadow-lg">
              <img
                src={institute.logoUrl || EUROTECH_LOGO}
                alt="Eurotech Assessment and Certification Services"
                className="h-full w-full object-contain"
              />
            </div>
            <p className="mt-3 font-display text-lg font-bold">{institute.name}</p>
            <p className="mt-0.5 text-xs font-semibold tracking-wide text-accent-400">{institute.uid}</p>
          </div>
          <div className="px-4">
            <Row label="Institute name" value={institute.name} />
            <Row label="Institute UID" value={institute.uid} />
            <Row label="Login email" value={institute.email} />
            <Row label="Courses" value={String(institute.courses ?? 0)} />
            <Row
              label="Password"
              value={institute.passwordSet ? 'Set — required at login' : 'Not set yet'}
            />
          </div>
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <div className="mb-3 flex items-center gap-2">
            <KeyRound size={16} className="text-brand-900" />
            <p className="font-display text-sm font-bold text-brand-950">
              {institute.passwordSet ? 'Change password' : 'Set login password'}
            </p>
          </div>
          <p className="mb-4 text-[0.72rem] text-slate-500">
            {institute.passwordSet
              ? 'Enter your current password, then choose a new one (min 6 characters).'
              : 'No password is set yet. Create one now — it will be required on the next login.'}
          </p>
          <form onSubmit={changePassword} className="space-y-3">
            {institute.passwordSet && (
              <label className="block">
                <span className="mb-1.5 block text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                  Current password
                </span>
                <input
                  type="password"
                  className="input-field !py-2.5"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                New password
              </span>
              <input
                type="password"
                className="input-field !py-2.5"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                Confirm new password
              </span>
              <input
                type="password"
                className="input-field !py-2.5"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </label>
            {error && <p className="text-sm font-medium text-red-700">{error}</p>}
            {message && <p className="text-sm font-medium text-emerald-700">{message}</p>}
            <button
              type="submit"
              disabled={busy || !newPassword || !confirmPassword}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Shield size={16} />
              {busy ? 'Saving…' : institute.passwordSet ? 'Update password' : 'Set password'}
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}
