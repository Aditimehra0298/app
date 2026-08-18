import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import type { AppConfig, Phase, ProgressResponse } from '../types'

interface AppState {
  config: AppConfig | null
  progress: ProgressResponse | null
  loading: boolean
  refreshProgress: () => Promise<void>
  refreshConfig: () => Promise<void>
  setPhaseLocally: (phase: Phase) => void
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [progress, setProgress] = useState<ProgressResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProgress = useCallback(async () => {
    const p = await api.getProgress()
    setProgress(p)
  }, [])

  const refreshConfig = useCallback(async () => {
    const cfg = await api.getConfig()
    setConfig(cfg)
  }, [])

  useEffect(() => {
    Promise.all([api.getConfig(), api.getProgress()])
      .then(([cfg, prog]) => {
        setConfig(cfg)
        setProgress(prog)
      })
      .finally(() => setLoading(false))
  }, [])

  const setPhaseLocally = (phase: Phase) => {
    setProgress((prev) => (prev ? { ...prev, phase } : prev))
  }

  return (
    <AppContext.Provider
      value={{ config, progress, loading, refreshProgress, refreshConfig, setPhaseLocally }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
