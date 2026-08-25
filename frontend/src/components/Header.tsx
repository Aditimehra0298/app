import { useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { LogoutButton } from './LogoutButton'
import { OrgLogo } from './OrgLogo'

export function Header() {
  const { config, progress } = useApp()
  const location = useLocation()
  const phase = progress?.phase ?? 'registration'
  const tapCount = useRef(0)
  const tapTimer = useRef<number | null>(null)

  const total = (progress?.total_steps ?? 3) + 2
  let current = 0
  if (phase === 'training') current = (progress?.completed_count ?? 0) + 1
  else if (phase === 'assessment') current = (progress?.total_steps ?? 3) + 1
  else if (phase === 'certificate') current = total
  const pct = phase !== 'registration' ? (current / total) * 100 : 0

  let screenTitle = 'SFT'
  if (location.pathname === '/modules') screenTitle = `Module ${current}/${progress?.total_steps ?? 3}`
  else if (location.pathname === '/assessment') screenTitle = 'Practical'
  else if (location.pathname === '/certificate') screenTitle = 'Certificate'

  const onLogoTap = () => {
    tapCount.current += 1
    if (tapTimer.current) window.clearTimeout(tapTimer.current)
    tapTimer.current = window.setTimeout(() => {
      tapCount.current = 0
    }, 1200)
    // Safety: do NOT expose admin panel shortcut from header.
  }

  return (
    <header className="shrink-0 bg-brand-950 pt-[env(safe-area-inset-top)] text-white">
      <div className="flex h-12 items-center justify-between gap-3 px-4">
        <button
          type="button"
          onClick={onLogoTap}
          className="flex items-center gap-2"
          aria-label="SFT"
        >
          <OrgLogo alt={config?.brand.short_name ?? 'SFT'} className="h-8 w-8 object-contain" />
          <span className="font-display text-sm font-bold tracking-wide">
            {config?.brand.short_name ?? 'SFT'}
          </span>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white/75">{screenTitle}</span>
          <LogoutButton />
        </div>
      </div>
      {phase !== 'registration' && (
        <div className="h-0.5 bg-white/10">
          <div className="h-full bg-accent-400 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      )}
    </header>
  )
}
