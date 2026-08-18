import { NavLink } from 'react-router-dom'
import { Award, CheckSquare, Home, Video } from 'lucide-react'
import { useApp } from '../context/AppContext'

const tabs = [
  { to: '/home', icon: Home, label: 'Home', phase: 'home' as const },
  { to: '/modules', icon: Video, label: 'Modules', phase: 'training' as const },
  { to: '/assessment', icon: CheckSquare, label: 'Assessment', phase: 'assessment' as const },
  { to: '/certificate', icon: Award, label: 'Certificate', phase: 'certificate' as const },
]

export function TabBar() {
  const { progress } = useApp()
  const phase = progress?.phase ?? 'registration'

  const unlocked = {
    home: phase !== 'registration',
    registration: false,
    training: phase !== 'registration',
    assessment: progress?.all_steps_done || phase === 'assessment' || phase === 'certificate',
    certificate: phase === 'certificate',
  }

  return (
    <nav className="flex shrink-0 border-t border-slate-200/80 bg-white/95 pb-[max(env(safe-area-inset-bottom),8px)] backdrop-blur-md">
      {tabs.map(({ to, icon: Icon, label, phase: tabPhase }) => {
        const locked = !unlocked[tabPhase]
        return (
          <NavLink
            key={to}
            to={locked ? '#' : to}
            onClick={(e) => locked && e.preventDefault()}
            className={({ isActive }) =>
              `flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[0.62rem] font-semibold tracking-wide transition ${
                isActive && !locked ? 'tab-active' : 'text-slate-400'
              } ${locked ? 'pointer-events-none opacity-35' : ''}`
            }
          >
            <Icon size={20} strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
