import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { LogoutButton } from '../components/LogoutButton'
import { OrgLogo } from '../components/OrgLogo'
import type { Student } from '../types'

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="border-b border-slate-100 py-3 last:border-b-0">
      <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 break-all text-sm font-medium text-slate-800">{value}</p>
    </div>
  )
}

export function ProfilePage() {
  const { progress } = useApp()
  const navigate = useNavigate()
  const [student, setStudent] = useState<Student | null>(null)
  const p = progress?.progress

  useEffect(() => {
    if (!progress || progress.phase === 'registration') {
      navigate('/', { replace: true })
    }
  }, [progress, navigate])

  useEffect(() => {
    const uid = p?.student_uid
    if (!uid) return
    api.getStudent(uid).then((res) => setStudent(res.student)).catch(() => setStudent(null))
  }, [p?.student_uid])

  if (!p?.candidate_name) return null

  const photo = p.image_path || student?.image_path || '/static/icons/icon-192.png'
  const name = p.candidate_name
  const father = p.father_name || student?.father_name || ''
  const uid = p.student_uid || student?.uid || '—'
  const course = p.course_name || student?.course_name || ''
  const batch = student?.batch_duration || ''
  const email = student?.email || ''
  const phone = student?.phone || ''

  return (
    <div className="screen-scroll flex flex-col bg-slate-50">
      <header className="flex items-center gap-3 bg-brand-950 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] text-white">
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <OrgLogo alt="" className="h-9 w-9 object-contain" />
        <h1 className="flex-1 font-display text-base font-bold">Profile</h1>
        <LogoutButton />
      </header>

      <div className="flex flex-col items-center bg-brand-950 px-4 pb-8 pt-4 text-white">
        <img src={photo} alt="" className="h-24 w-24 rounded-full object-cover ring-4 ring-white/25 shadow-lg" />
        <p className="mt-3 font-display text-lg font-bold">{name}</p>
        {father && <p className="mt-0.5 text-sm text-white/70">S/O {father}</p>}
        <p className="mt-1 text-xs font-semibold tracking-wide text-accent-400">{uid}</p>
      </div>

      <div className="p-4">
        <div className="rounded-2xl border border-slate-100 bg-white px-4 shadow-sm">
          <Row label="Name" value={name} />
          <Row label="Father's name" value={father} />
          <Row label="UID / Roll No" value={uid} />
          <Row label="Email" value={email} />
          <Row label="Contact" value={phone} />
          <Row label="Course" value={course} />
          <Row label="Batch" value={batch} />
        </div>
      </div>
    </div>
  )
}
