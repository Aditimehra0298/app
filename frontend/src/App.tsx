import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { Layout } from './components/Layout'
import { ModulesPage } from './pages/ModulesPage'
import { AssessmentPage } from './pages/AssessmentPage'
import { CertificatePage } from './pages/CertificatePage'
import { VerifyPage } from './pages/VerifyPage'
import { InstituteLoginPage } from './pages/InstituteLoginPage'
import { InstituteHomePage } from './pages/InstituteHomePage'
import { InstituteStudentsPage } from './pages/InstituteStudentsPage'
import { TrainingDetailPage } from './pages/TrainingDetailPage'
import { ProfilePage } from './pages/ProfilePage'

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/verify/:certId" element={<VerifyPage />} />
          <Route
            path="/*"
            element={
              <div className="app-shell">
                <Routes>
                  <Route path="/" element={<InstituteLoginPage />} />
                  <Route path="/admission" element={<Navigate to="/" replace />} />
                  <Route path="/home" element={<InstituteHomePage />} />
                  <Route path="/students" element={<InstituteStudentsPage />} />
                  <Route path="/training/:courseId" element={<TrainingDetailPage />} />
                  <Route path="/admin" element={<Navigate to="/home" replace />} />
                  <Route element={<Layout />}>
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/modules" element={<ModulesPage />} />
                    <Route path="/assessment" element={<AssessmentPage />} />
                    <Route path="/certificate" element={<CertificatePage />} />
                  </Route>
                </Routes>
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
