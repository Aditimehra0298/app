import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { ModulesPage } from './pages/ModulesPage'
import { AssessmentPage } from './pages/AssessmentPage'
import { CertificatePage } from './pages/CertificatePage'
import { VerifyPage } from './pages/VerifyPage'
import { AdminPage } from './pages/AdminPage'
import { AdmissionPage } from './pages/AdmissionPage'
import { StudentHomePage } from './pages/StudentHomePage'
import { ProfilePage } from './pages/ProfilePage'

export default function App() {
  return (
    <AppProvider>
      <div className="app-shell">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/admission" element={<AdmissionPage />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/verify/:certId" element={<VerifyPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route element={<Layout />}>
              <Route path="/home" element={<StudentHomePage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/modules" element={<ModulesPage />} />
              <Route path="/assessment" element={<AssessmentPage />} />
              <Route path="/certificate" element={<CertificatePage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </div>
    </AppProvider>
  )
}
