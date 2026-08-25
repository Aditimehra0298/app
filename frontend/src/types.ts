export interface Student {
  id: number
  name: string
  father_name: string
  course_name: string
  batch_start: string
  batch_end: string
  batch_duration: string
  uid: string
  certificate_number: string | null
  issue_date: string | null
  image_path: string | null
  logo_path?: string | null
  phone?: string
  email?: string
  status?: string
  uploaded_steps?: number
  expected_steps?: number
  video_proof?: string
  videos?: VerifyVideoProof[]
  assessment_recorded?: boolean
  certificate_recorded?: boolean
  trainer_verified?: boolean
  trainer_score?: number | null
  week_scores?: Record<string, number>
  trainer_grade?: string | null
  all_videos_complete?: boolean
  practical_uploaded?: boolean
  certificate?: CertificateResult
}

export interface Brand {
  name: string
  short_name: string
  tagline: string
  powered_by: string
  theme_color: string
  accent_color: string
}

export interface TrainingStep {
  id: number
  title: string
  description: string
  min_seconds: number
  max_seconds: number
  icon: string
  image: string
  kind?: string
}

export interface Question {
  id: string
  question: string
  options: string[]
}

export interface Course {
  index: string
  courseName: string
  templateFile: string
}

export interface AppConfig {
  brand: Brand
  steps: TrainingStep[]
  questions: Question[]
  assessmentTitle: string
  assessmentSubtitle: string
  passPercentage: number
  courses: Course[]
  defaultCourse: string
  admissionCourses?: string[]
  trainingSetup?: TrainingSetup
  logoUrl?: string
  images: {
    hero: string
    splash: string
    assessment: string
    certificate: string
  }
}

export interface TrainingSetup {
  course_name: string
  batch_months: number
  pathway_weeks: number
}

export interface InstituteCourse {
  id: string
  title: string
  description: string
  image: string
  built: boolean
  duration_months?: number
  batch_start?: string
  batch_end?: string
  steps?: { title: string; description: string }[]
}

export interface Progress {
  candidate_name: string
  course_name: string
  student_uid?: string | null
  father_name?: string
  image_path?: string | null
  completed_steps: number[]
  assessment_passed: boolean
  assessment_score: number
  certificate_id: string | null
  pdf_filename: string | null
  videos_completed_at?: string | null
  assessment_completed_at?: string | null
}

export type Phase = 'registration' | 'training' | 'assessment' | 'certificate'

export interface ProgressResponse {
  progress: Progress
  total_steps: number
  completed_count: number
  phase: Phase
  all_steps_done: boolean
  certificate_ready?: boolean
  certificate_ready_at?: string | null
  wait_seconds?: number
  trainer_verified?: boolean
  awaiting_trainer?: boolean
  assessment_done?: boolean
  reupload_steps?: number[]
  practical_reupload?: boolean
}

export interface VerifyVideoProof {
  id: number | string
  title: string
  description: string
  image: string
  uploaded: boolean
  kind?: string
  reviewStatus?: string
  privateScore?: number | null
  locked?: boolean
  videoUrl: string | null
}

export interface VerifyResult {
  found: boolean
  approved?: boolean
  certId?: string
  student?: Student
  cert?: Record<string, string>
  pdfUrl?: string | null
  downloadUrl?: string | null
  videos?: VerifyVideoProof[]
  videosComplete?: boolean
  uploadedSteps?: number
  expectedSteps?: number
  assessmentPassed?: boolean
  certificateApproved?: boolean
  brand?: Brand
}

export interface CertificateResult {
  success: boolean
  pending?: boolean
  certificateId?: string
  uid?: string
  filename?: string
  pdfUrl?: string
  downloadUrl?: string
  verifyUrl?: string
  qrUrl?: string
  candidateName?: string
  courseName?: string
  grade?: string
  certificateNumber?: string
  issueDate?: string
  templateFile?: string
  wait_seconds?: number
  awaiting_trainer?: boolean
}
