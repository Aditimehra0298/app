import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Lock, Users } from 'lucide-react'
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
  createdAt?: string
}

function formatBatchDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!y || !m || !d) return iso
  return `${d}-${m}-${y}`
}

export function InstituteStudentsPage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [students, setStudents] = useState<StudentListItem[]>([])
  const [accessRequests, setAccessRequests] = useState<VideoAccessRequest[]>([])

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

  if (checking) {
    return (
      <div className="app-frame flex items-center justify-center bg-slate-50 text-sm text-slate-400">
        Loading students...
      </div>
    )
  }

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
              Video access requests ({accessRequests.length})
            </p>
          </div>
          <p className="mb-3 text-[0.72rem] text-slate-500">
            All name, organisation, email, and location entries from the verify lock form are saved here.
          </p>
          <div className="space-y-2">
            {accessRequests.length ? (
              accessRequests.map((req) => (
                <div key={req.id} className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                  <p className="text-sm font-semibold text-brand-950">{req.name}</p>
                  <p className="mt-0.5 text-[0.72rem] text-slate-600">{req.organisation}</p>
                  <p className="mt-0.5 text-[0.72rem] text-slate-500">{req.email}</p>
                  <p className="mt-0.5 text-[0.72rem] text-slate-500">{req.location}</p>
                  <p className="mt-1 text-[0.65rem] text-slate-400">
                    Student {req.uid}
                    {req.certificateNumber ? ` · ${req.certificateNumber}` : ''}
                    {req.createdAt ? ` · ${req.createdAt}` : ''}
                  </p>
                </div>
              ))
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
