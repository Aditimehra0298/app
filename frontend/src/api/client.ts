const jsonHeaders = { 'Content-Type': 'application/json' }

const API_BASE = String(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

function apiUrl(url: string) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `${API_BASE}${url}`
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(apiUrl(url), {
      credentials: API_BASE ? 'omit' : 'same-origin',
      ...options,
    })
  } catch {
    throw new Error('Network error. Check your connection and try again.')
  }

  const contentType = res.headers.get('content-type') || ''
  const data = contentType.includes('application/json')
    ? ((await res.json().catch(() => ({}))) as { error?: string; message?: string })
    : ({} as { error?: string; message?: string })

  if (!res.ok) {
    if (res.status === 413) {
      throw new Error('Video file is too large for the server. Use a shorter clip (under 2 minutes) or compress the video.')
    }
    if (res.status === 502 || res.status === 504) {
      throw new Error('Upload timed out. Try a shorter video or a stronger network connection.')
    }
    if (res.status === 401) {
      throw new Error(data.error || data.message || 'Session expired. Please log in again.')
    }
    throw new Error(data.error || data.message || `Request failed (${res.status})`)
  }
  return data as T
}

export const api = {
  getConfig: () => request<import('../types').AppConfig>('/api/config'),

  getProgress: () => request<import('../types').ProgressResponse>('/api/progress'),

  register: (candidateName: string, courseName: string) =>
    request<{ success: boolean }>('/api/register', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ candidateName, courseName }),
    }),

  loginWithUid: (uid: string, email: string) =>
    request<{
      success: boolean
      role?: 'admin' | 'student'
      student?: import('../types').Student
      progress?: import('../types').Progress
    }>('/api/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ uid, email }),
    }),

  submitAdmission: (formData: FormData) =>
    request<{ success: boolean; student: import('../types').Student; message: string }>(
      '/api/admission',
      { method: 'POST', body: formData },
    ),

  uploadStep: (stepId: number, formData: FormData) =>
    request<{ success: boolean; completed_steps: number[]; all_steps_done: boolean }>(
      `/api/steps/${stepId}/upload`,
      { method: 'POST', body: formData },
    ),

  submitAssessment: (answers: Record<string, number>) =>
    request<{ success: boolean; passed: boolean; score: number; correct: number; total: number }>(
      '/api/assessment/submit',
      { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ answers }) },
    ),

  uploadPractical: (formData: FormData) =>
    request<{ success: boolean; passed: boolean; awaiting_trainer?: boolean; certificate_ready?: boolean }>(
      '/api/assessment/video',
      { method: 'POST', body: formData },
    ),

  generateCertificate: () =>
    request<import('../types').CertificateResult>('/api/certificate/generate', { method: 'POST' }),

  getCertificate: () => request<import('../types').CertificateResult>('/api/certificate'),

  reset: () => request<{ success: boolean }>('/api/reset', { method: 'POST' }),

  logout: () => request<{ success: boolean }>('/api/logout', { method: 'POST' }),

  verify: (certId: string) =>
    request<import('../types').VerifyResult>(`/api/verify/${encodeURIComponent(certId)}`),

  verifyCertificate: (uid: string, number: string) =>
    request<{
      ok: boolean
      verified?: boolean
      message?: string
      certificate?: Record<string, string | number | boolean | null>
      unlock?: {
        required?: boolean
        unlocked?: boolean
        amount?: number
        currency?: string
        label?: string
        razorpayKeyId?: string | null
        configured?: boolean
        options?: Array<{
          region?: string
          currency?: string
          amount?: number
          label?: string
          title?: string
          methods?: string
        }>
      }
      proofs?: {
        videos?: import('../types').VerifyVideoProof[]
        videosComplete?: boolean
        assessmentPassed?: boolean
        certificateApproved?: boolean
        approved?: boolean
        uploadedSteps?: number
        expectedSteps?: number
      }
      student?: import('../types').Student
    }>(
      `/api/certificates/verify?uid=${encodeURIComponent(uid)}&number=${encodeURIComponent(number)}&q=${encodeURIComponent(number)}`,
    ),

  createVerifyUnlockOrder: (payload: {
    uid: string
    number: string
    email?: string
    region?: 'national' | 'international'
    currency?: 'INR' | 'USD'
  }) =>
    request<{
      ok: boolean
      message?: string
      keyId?: string
      orderId?: string
      amount?: number
      currency?: string
      label?: string
      region?: string
      name?: string
      description?: string
      prefill?: { email?: string; name?: string; contact?: string }
    }>('/api/certificates/verify/unlock/order', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }),

  confirmVerifyUnlock: (payload: {
    uid: string
    number: string
    email?: string
    razorpay_order_id: string
    razorpay_payment_id: string
    razorpay_signature: string
  }) =>
    request<{
      ok: boolean
      unlocked?: boolean
      message?: string
      token?: string
      videos?: import('../types').VerifyVideoProof[]
      pdfUrl?: string
      downloadUrl?: string
    }>('/api/certificates/verify/unlock/confirm', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }),

  requestVerifyVideoAccess: (payload: {
    uid: string
    number: string
    name: string
    organisation: string
    email: string
    location: string
  }) =>
    request<{
      ok: boolean
      pending?: boolean
      token?: string
      videos?: import('../types').VerifyVideoProof[]
      message?: string
      request?: { status?: string }
    }>('/api/certificates/verify/video-access', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }),

  checkVerifyVideoAccess: (payload: { uid: string; email: string }) =>
    request<{
      ok: boolean
      status?: 'none' | 'pending' | 'approved' | 'rejected' | 'expired'
      token?: string
      videos?: import('../types').VerifyVideoProof[]
      message?: string
    }>('/api/certificates/verify/video-access/status', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }),

  adminStatus: () =>
    request<{
      authenticated: boolean
      passwordRequired?: boolean
      institute?: { uid: string; name: string; email?: string } | null
    }>('/api/admin/status'),

  adminLogin: (uid: string, email: string, password?: string) =>
    request<{ success: boolean; institute?: { uid: string; name: string; email?: string } }>('/api/admin/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ uid, email, password: password || '' }),
    }),

  adminProfile: () =>
    request<{
      success: boolean
      institute: {
        uid: string
        name: string
        email: string
        logoUrl?: string
        passwordSet?: boolean
        courses?: number
      }
    }>('/api/admin/profile'),

  adminChangePassword: (payload: {
    currentPassword?: string
    newPassword: string
    confirmPassword: string
  }) =>
    request<{ success: boolean; message: string }>('/api/admin/password', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }),

  adminLogout: () => request<{ success: boolean }>('/api/admin/logout', { method: 'POST' }),

  adminListCourses: () =>
    request<{ success: boolean; courses: import('../types').InstituteCourse[] }>('/api/admin/courses'),

  adminAddCourse: (data: {
    title: string
    description: string
    batch_start: string
    batch_end: string
    steps: { title: string; description: string }[]
    image?: File | null
  }) => {
    const fd = new FormData()
    fd.append('title', data.title)
    fd.append('description', data.description)
    fd.append('batch_start', data.batch_start)
    fd.append('batch_end', data.batch_end)
    fd.append('steps', JSON.stringify(data.steps))
    if (data.image) fd.append('image', data.image)
    return request<{ success: boolean; courses: import('../types').InstituteCourse[]; message: string }>(
      '/api/admin/courses',
      { method: 'POST', body: fd },
    )
  },

  adminDeleteCourse: (courseId: string) =>
    request<{ success: boolean; courses: import('../types').InstituteCourse[]; message: string }>(
      `/api/admin/courses/${encodeURIComponent(courseId)}`,
      { method: 'DELETE' },
    ),

  adminGetCourse: (courseId: string) =>
    request<{
      success: boolean
      course: import('../types').InstituteCourse
      steps: import('../types').TrainingStep[]
      students: import('../types').Student[]
    }>(`/api/admin/courses/${encodeURIComponent(courseId)}`),

  adminAddCourseStudent: (courseId: string, formData: FormData) =>
    request<{ success: boolean; message: string; student: import('../types').Student }>(
      `/api/admin/courses/${encodeURIComponent(courseId)}/students`,
      { method: 'POST', body: formData },
    ),

  adminDeleteStudent: (uid: string) =>
    request<{ success: boolean; message: string }>(
      `/api/admin/students/${encodeURIComponent(uid)}`,
      { method: 'DELETE' },
    ),

  adminUploadStudentPhoto: (uid: string, formData: FormData) =>
    request<{ success: boolean; message: string; student: import('../types').Student }>(
      `/api/admin/students/${encodeURIComponent(uid)}/photo`,
      { method: 'POST', body: formData },
    ),

  adminUploadStudentVideo: (uid: string, stepId: string | number, formData: FormData) =>
    request<{ success: boolean; message: string; student: import('../types').Student }>(
      `/api/admin/students/${encodeURIComponent(uid)}/videos/${encodeURIComponent(String(stepId))}/upload`,
      { method: 'POST', body: formData },
    ),

  adminListSteps: () =>
    request<{ success: boolean; steps: import('../types').TrainingStep[] }>('/api/admin/steps'),

  adminAddStep: (formData: FormData) =>
    request<{ success: boolean; steps: import('../types').TrainingStep[]; message: string }>(
      '/api/admin/steps',
      { method: 'POST', body: formData },
    ),

  adminUpdateStep: (stepId: number, formData: FormData) =>
    request<{ success: boolean; steps: import('../types').TrainingStep[]; message: string }>(
      `/api/admin/steps/${stepId}`,
      { method: 'PUT', body: formData },
    ),

  adminDeleteStep: (stepId: number) =>
    request<{ success: boolean; steps: import('../types').TrainingStep[]; message: string }>(
      `/api/admin/steps/${stepId}`,
      { method: 'DELETE' },
    ),

  adminListStudents: () =>
    request<{ success: boolean; students: import('../types').Student[] }>('/api/admin/students'),

  adminListVideoAccessRequests: () =>
    request<{
      success: boolean
      count: number
      requests: Array<{
        id: number
        uid: string
        certificateNumber?: string
        name: string
        organisation: string
        email: string
        location: string
        status?: string
        createdAt?: string
        expiresAt?: string
        approvedAt?: string
      }>
    }>('/api/admin/video-access-requests'),

  adminApproveVideoAccess: (requestId: number) =>
    request<{ success: boolean; message: string }>(
      `/api/admin/video-access-requests/${requestId}/approve`,
      { method: 'POST' },
    ),

  adminRejectVideoAccess: (requestId: number) =>
    request<{ success: boolean; message: string }>(
      `/api/admin/video-access-requests/${requestId}/reject`,
      { method: 'POST' },
    ),

  adminVerifyVideos: (uid: string) =>
    request<{
      success: boolean
      message: string
      student?: import('../types').Student
      certificate?: import('../types').CertificateResult
    }>(`/api/admin/students/${encodeURIComponent(uid)}/verify-videos`, { method: 'POST' }),

  adminReviewVideo: (uid: string, stepId: string | number, status: 'approved' | 'reupload') =>
    request<{
      success: boolean
      message: string
      student?: import('../types').Student
      certificate?: import('../types').CertificateResult | null
    }>(`/api/admin/students/${encodeURIComponent(uid)}/videos/${encodeURIComponent(String(stepId))}/review`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ status }),
    }),

  adminSetScore: (uid: string, score: number, stepId?: string | number) =>
    request<{
      success: boolean
      message: string
      trainer_score: number | null
      week_scores?: Record<string, number>
      student?: import('../types').Student
    }>(
      `/api/admin/students/${encodeURIComponent(uid)}/score`,
      {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ score, step_id: stepId == null ? undefined : String(stepId) }),
      },
    ),

  adminSetGrade: (uid: string, grade: string) =>
    request<{ success: boolean; message: string; trainer_grade: string; student?: import('../types').Student }>(
      `/api/admin/students/${encodeURIComponent(uid)}/grade`,
      {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ grade }),
      },
    ),

  adminSendCertificateEmail: (uid: string, email?: string) =>
    request<{ success: boolean; message: string; email?: string; student?: import('../types').Student }>(
      `/api/admin/students/${encodeURIComponent(uid)}/send-certificate`,
      {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(email ? { email } : {}),
      },
    ),

  adminUpdateStudent: (
    uid: string,
    data: {
      name: string
      father_name?: string
      email?: string
      phone?: string
      batch_start?: string
      batch_end?: string
      issue_date?: string | null
      course_name?: string
    },
  ) =>
    request<{ success: boolean; message: string; student: import('../types').Student }>(
      `/api/admin/students/${encodeURIComponent(uid)}`,
      {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(data),
      },
    ),

  adminGetTrainingSetup: () =>
    request<{ success: boolean; setup: import('../types').TrainingSetup }>('/api/admin/training-setup'),

  adminUpdateTrainingSetup: (setup: import('../types').TrainingSetup) =>
    request<{ success: boolean; setup: import('../types').TrainingSetup; message: string }>(
      '/api/admin/training-setup',
      {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(setup),
      },
    ),

  adminGetLogo: () =>
    request<{ success: boolean; logoUrl: string | null }>('/api/admin/logo'),

  adminUploadLogo: (file: File) => {
    const fd = new FormData()
    fd.append('logo', file)
    return request<{ success: boolean; logoUrl: string; message: string }>('/api/admin/logo', {
      method: 'POST',
      body: fd,
    })
  },

  getStudent: (uid: string) =>
    request<{ success: boolean; student: import('../types').Student }>(
      `/api/students/${encodeURIComponent(uid)}`,
    ),
}
