import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { VerifyPage } from './pages/VerifyPage'

export default function VerifyApp() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<VerifyPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/verify/:certId" element={<VerifyPage />} />
          <Route path="*" element={<VerifyPage />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
