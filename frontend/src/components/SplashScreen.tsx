import { useApp } from '../context/AppContext'
import { OrgLogo } from './OrgLogo'

export function SplashScreen() {
  const { config } = useApp()
  const img = config?.images.splash ?? '/static/images/splash-forest.jpg'

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-brand-950/75" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-8 text-center text-white">
        <OrgLogo
          alt="Sustainable Futuristic Trainings"
          className="mb-6 h-40 w-auto max-w-[220px] object-contain"
        />
        <p className="mt-8 text-xs text-white/40">
          Powered by {config?.brand.powered_by ?? 'SFT Global Trade Assessment Authority'}
        </p>
        <div className="mt-10 h-1 w-16 animate-pulse rounded-full bg-accent-400/60" />
      </div>
    </div>
  )
}
