import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Power } from 'lucide-react'
import { useApp } from '../context/AppContext'

type Props = {
  tone?: 'light' | 'dark'
}

export function LogoutButton({ tone = 'light' }: Props) {
  const { signOut } = useApp()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const confirmLogout = async () => {
    setBusy(true)
    try {
      await signOut()
      setOpen(false)
      navigate('/', { replace: true, state: { loggedOut: true } })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          tone === 'light'
            ? 'flex h-10 w-10 items-center justify-center rounded-full bg-white/12 ring-1 ring-white/30 shadow-md active:scale-95'
            : 'flex h-10 w-10 items-center justify-center rounded-full bg-brand-950 text-white ring-1 ring-brand-900/20 shadow-sm active:scale-95'
        }
        aria-label="Log out"
      >
        <Power size={18} strokeWidth={2.4} />
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:items-center">
            <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-950 text-white">
                <Power size={26} strokeWidth={2.4} />
              </div>
              <h2 className="mt-3 text-center font-display text-lg font-bold text-brand-950">Log out?</h2>
              <p className="mt-1 text-center text-sm text-slate-500">
                You will need your institute UID and email to sign in again.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 active:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmLogout()}
                  disabled={busy}
                  className="rounded-xl bg-brand-950 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
                >
                  {busy ? 'Please wait…' : 'Log out'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
