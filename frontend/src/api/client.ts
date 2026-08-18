const jsonHeaders = { 'Content-Type': 'application/json' }

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...options })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = data as { error?: string; message?: string }
    throw new Error(err.error || err.message || 'Request failed')
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

  generateCertificate: () =>
    request<import('../types').CertificateResult>('/api/certificate/generate', { method: 'POST' }),

  getCertificate: () => request<import('../types').CertificateResult>('/api/certificate'),

  reset: () => request<{ success: boolean }>('/api/reset', { method: 'POST' }),

  verify: (certId: string) =>
    request<import('../types').VerifyResult>(`/api/verify/${encodeURIComponent(certId)}`),

  verifyCertificate: (email: string, number: string) =>
    request<{
      ok: boolean
      verified?: boolean
      message?: string
      certificate?: Record<string, string | number | boolean | null>
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
      `/api/certificates/verify?email=${encodeURIComponent(email)}&number=${encodeURIComponent(number)}&q=${encodeURIComponent(number)}`,
    ),

  adminStatus: () => request<{ authenticated: boolean }>('/api/admin/status'),

  adminLogin: (uid: string, email: string) =>
    request<{ success: boolean }>('/api/admin/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ uid, email }),
    }),

  adminLogout: () => request<{ success: boolean }>('/api/admin/logout', { method: 'POST' }),

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
