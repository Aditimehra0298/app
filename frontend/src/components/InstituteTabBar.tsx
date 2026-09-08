import { House, Plus, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useKeyboardOpen } from '../hooks/useKeyboardOpen'

type Tab = 'home' | 'course' | 'student'

interface Props {
  active?: Tab
  onCourseClick?: () => void
}

export function InstituteTabBar({ active, onCourseClick }: Props) {
  const navigate = useNavigate()
  const keyboardOpen = useKeyboardOpen()

  if (keyboardOpen) return null

  return (
    <div className="institute-tab-bar pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] px-3 pb-[max(env(safe-area-inset-bottom),0.55rem)]">
      <div className="pointer-events-auto mx-auto flex items-end justify-between rounded-[1.9rem] bg-brand-950 px-5 py-3 text-white shadow-[0_-10px_28px_rgba(5,46,34,0.38)] ring-1 ring-white/10">
        <button
          type="button"
          onClick={() => navigate('/home')}
          className={`${active === 'home' ? 'text-white' : 'text-white/82'} flex min-w-16 flex-col items-center gap-1`}
        >
          <House size={18} strokeWidth={2.4} />
          <span className="text-[0.68rem] font-semibold">Home</span>
        </button>

        <button
          type="button"
          onClick={onCourseClick || (() => navigate('/home'))}
          className="-mt-8 flex flex-col items-center gap-1"
          aria-label="Create course"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-400 text-brand-950 shadow-lg shadow-accent-400/35 ring-4 ring-brand-950">
            <Plus size={24} strokeWidth={3} />
          </span>
          <span className={`${active === 'course' ? 'text-white' : 'text-white/82'} text-[0.68rem] font-semibold`}>
            Course
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/students')}
          className={`${active === 'student' ? 'text-white' : 'text-white/82'} flex min-w-16 flex-col items-center gap-1`}
        >
          <Users size={18} strokeWidth={2.4} />
          <span className="text-[0.68rem] font-semibold">Student</span>
        </button>
      </div>
    </div>
  )
}
