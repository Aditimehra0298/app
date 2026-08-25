import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import type { AppConfig, Phase, ProgressResponse } from '../types'

interface AppState {
  config: AppConfig | null
  progress: ProgressResponse | null
  loading: boolean
  refreshProgress: () => Promise<void>
  refreshConfig: () => Promise<void>
  setPhaseLocally: (phase: Phase) => void
  signOut: () => Promise<void>
}

const AppContext = createContext<AppState | null>(null)

function emptyProgress(): ProgressResponse {
  return {
    progress: {
      candidate_name: '',
      course_name: '',
      student_uid: null,
      father_name: '',
      image_path: null,
      completed_steps: [],
      assessment_passed: false,
      assessment_score: 0,
      certificate_id: null,
      pdf_filename: null,
    },
    total_steps: 0,
    completed_count: 0,
    phase: 'registration',
    all_steps_done: false,
    certificate_ready: false,
    awaiting_trainer: false,
    trainer_verified: false,
    assessment_done: false,
    reupload_steps: [],
    practical_reupload: false,
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [progress, setProgress] = useState<ProgressResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const progressGen = useRef(0)

  const refreshProgress = useCallback(async () => {
    if (import.meta.env.VITE_VERIFY_SITE === '1') return
    const gen = ++progressGen.current
    const p = await api.getProgress()
    if (gen !== progressGen.current) return
    setProgress(p)
  }, [])

  const refreshConfig = useCallback(async () => {
    const cfg = await api.getConfig()
    setConfig(cfg)
  }, [])

  const signOut = useCallback(async () => {
    progressGen.current += 1
    setProgress(emptyProgress())
    try {
      await Promise.allSettled([api.adminLogout(), api.logout()])
    } catch {
      // Stay signed out on this device even if the request fails.
    }
  }, [])

  useEffect(() => {
    if (import.meta.env.VITE_VERIFY_SITE === '1') {
      api
        .getConfig()
        .then(setConfig)
        .catch(() => {})
        .finally(() => setLoading(false))
      return
    }
    const gen = ++progressGen.current
    Promise.all([api.getConfig(), api.getProgress()])
      .then(([cfg, prog]) => {
        setConfig(cfg)
        if (gen === progressGen.current) setProgress(prog)
      })
      .finally(() => setLoading(false))
  }, [])

  const setPhaseLocally = (phase: Phase) => {
    setProgress((prev) => (prev ? { ...prev, phase } : prev))
  }

  return (
    <AppContext.Provider
      value={{ config, progress, loading, refreshProgress, refreshConfig, setPhaseLocally, signOut }}
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
