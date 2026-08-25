import { Outlet, useLocation } from 'react-router-dom'
import { Header } from './Header'
import { TabBar } from './TabBar'
import { SplashScreen } from './SplashScreen'
import { useApp } from '../context/AppContext'

export function Layout() {
  const { loading, progress } = useApp()
  const location = useLocation()

  if (loading) return <SplashScreen />

  const loggedIn = Boolean(progress?.progress.candidate_name)
  const isAuthScreen = location.pathname === '/'
  const isHome = location.pathname === '/home'
  const isProfile = location.pathname === '/profile'

  return (
    <div className="app-frame">
      {!isAuthScreen && !isHome && !isProfile && <Header />}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
      {!isAuthScreen && loggedIn && <TabBar />}
    </div>
  )
}
