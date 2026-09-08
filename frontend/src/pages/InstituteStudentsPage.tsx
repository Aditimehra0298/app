import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight, Lock, Users, X } from 'lucide-react'
import { api } from '../api/client'
import { InstituteTabBar } from '../components/InstituteTabBar'
import { LogoutButton } from '../components/LogoutButton'
import { OrgLogo } from '../components/OrgLogo'
import { StudentPhoto } from '../components/StudentPhoto'
import type { InstituteCourse, Student } from '../types'

interface StudentListItem extends Student {
  courseId: string
  courseTitle: string
}

type VideoAccessRequest = {
  id: number
  uid: string
  certificateNumber?: string
  name: string
  organisation: string
  email: string
  location: string
  status?: string
  createdAt?: string
  approvedAt?: string
}

function formatBatchDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!y || !m || !d) return iso
  return `${d}-${m}-${y}`
}

function statusLabel(status?: string) {
  const value = String(status || 'pending').toLowerCase()
  if (value === 'approved') return 'Approved'
  if (value === 'rejected') return 'Rejected'
  return 'Pending'
}

export function InstituteStudentsPage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [students, setStudents] = useState<StudentListItem[]>([])
  const [accessRequests, setAccessRequests] = useState<VideoAccessRequest[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  const loadStudents = useCallback(async () => {
    const coursesRes = await api.adminListCourses()
    const courses: InstituteCourse[] = coursesRes.courses || []
    const courseResponses = await Promise.all(courses.map((course) => api.adminGetCourse(course.id)))
    const all = courseResponses.flatMap((res) =>
      (res.students || []).map((student) => ({
        ...student,
        courseId: res.course.id,
        courseTitle: res.course.title,
      })),
    )
    setStudents(all)
  }, [])

  const loadAccessRequests = useCallback(async () => {
    const res = await api.adminListVideoAccessRequests()
    setAccessRequests(res.requests || [])
  }, [])

  useEffect(() => {
    api
      .adminStatus()
      .then(async (s) => {
        if (!s.authenticated) {
          navigate('/', { replace: true })
          return
        }
        await Promise.all([loadStudents(), loadAccessRequests()])
      })
      .catch(() => navigate('/', { replace: true }))
      .finally(() => setChecking(false))
  }, [loadAccessRequests, loadStudents, navigate])

  const approveRequest = async (req: VideoAccessRequest) => {
    setBusyId(req.id)
    setMessage('')
    try {
      const res = await api.adminApproveVideoAccess(req.id)
      setMessage(res.message || `Approved access for ${req.name}`)
      await loadAccessRequests()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not approve request')
    } finally {
      setBusyId(null)
    }
  }

  const rejectRequest = async (req: VideoAccessRequest) => {
    setBusyId(req.id)
    setMessage('')
    try {
      const res = await api.adminRejectVideoAccess(req.id)
      setMessage(res.message || `Rejected request from ${req.name}`)
      await loadAccessRequests()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not reject request')
    } finally {
      setBusyId(null)
    }
  }

  if (checking) {
    return (
      <div className="app-frame flex items-center justify-center bg-slate-50 text-sm text-slate-400">
        Loading students...
      </div>
    )
  }

  const pendingCount = accessRequests.filter((r) => (r.status || 'pending') === 'pending').length

  return (
    <div className="app-frame bg-slate-50">
      <header className="shrink-0 bg-brand-950 pt-[env(safe-area-inset-top)] text-white">
        <div className="flex items-center gap-2 px-4 py-3.5">
          <OrgLogo alt="" className="h-10 w-10 shrink-0 object-contain" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold">Students</p>
            <p className="text-[0.62rem] text-white/55">Course and batch details</p>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="screen-scroll flex min-h-0 flex-1 flex-col p-4 pb-[max(env(safe-area-inset-bottom),5.5rem)]">
        <section className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-950 text-white">
              <Users size={20} />
            </div>
            <div>
              <p className="font-display text-base font-bold text-brand-950">{students.length} students</p>
              <p className="text-[0.72rem] text-slate-500">Tap any student to open their training page.</p>
            </div>
          </div>
        </section>

        <div className="space-y-3">
          {students.length ? (
            students.map((student) => (
              <button
                key={student.uid}
                type="button"
                onClick={() => navigate(`/training/${encodeURIComponent(student.courseId)}`)}
                className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-100 active:scale-[0.99]"
              >
                <StudentPhoto
                  src={student.image_path}
                  alt={student.name}
                  className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-brand-900/10"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold text-brand-950">{student.name}</p>
                  <p className="mt-0.5 text-[0.7rem] text-slate-500">UID: {student.uid}</p>
                  <p className="mt-2 text-[0.75rem] font-semibold text-brand-900">{student.courseTitle}</p>
                  <p className="mt-0.5 text-[0.72rem] text-slate-500">
                    Batch: {formatBatchDate(student.batch_start || '') || '-'} to{' '}
                    {formatBatchDate(student.batch_end || '') || '-'}
                  </p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-slate-300" />
              </button>
            ))
          ) : (
            <div className="rounded-2xl bg-white p-5 text-sm text-slate-500 shadow-sm ring-1 ring-slate-100">
              No students added yet.
            </div>
          )}
        </div>

        <section className="mt-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <div className="mb-3 flex items-center gap-2">
            <Lock size={16} className="text-brand-900" />
            <p className="font-display text-sm font-bold text-brand-950">
              Video access requests ({pendingCount} pending)
            </p>
          </div>
          <p className="mb-3 text-[0.72rem] text-slate-500">
            Visitors submit this form on the verify website. Approve to unlock training videos for them.
          </p>
          {message && <p className="mb-3 text-[0.72rem] font-medium text-brand-800">{message}</p>}
          <div className="space-y-2">
            {accessRequests.length ? (
              accessRequests.map((req) => {
                const pending = (req.status || 'pending') === 'pending'
                return (
                  <div key={req.id} className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-brand-950">{req.name}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase ${
                          req.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : req.status === 'rejected'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {statusLabel(req.status)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[0.72rem] text-slate-600">{req.organisation}</p>
                    <p className="mt-0.5 text-[0.72rem] text-slate-500">{req.email}</p>
                    <p className="mt-0.5 text-[0.72rem] text-slate-500">{req.location}</p>
                    <p className="mt-1 text-[0.65rem] text-slate-400">
                      Student {req.uid}
                      {req.certificateNumber ? ` · ${req.certificateNumber}` : ''}
                      {req.createdAt ? ` · ${req.createdAt}` : ''}
                    </p>
                    {pending && (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={busyId === req.id}
                          onClick={() => approveRequest(req)}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand-950 px-3 py-2 text-[0.72rem] font-semibold text-white disabled:opacity-50"
                        >
                          <Check size={14} />
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === req.id}
                          onClick={() => rejectRequest(req)}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[0.72rem] font-semibold text-slate-600 disabled:opacity-50"
                        >
                          <X size={14} />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="text-sm text-slate-500">No video access forms submitted yet.</p>
            )}
          </div>
        </section>
      </main>

      <InstituteTabBar active="student" />
    </div>
  )
}
