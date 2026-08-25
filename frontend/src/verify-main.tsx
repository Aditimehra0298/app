import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import VerifyApp from './VerifyApp'

document.body.classList.add('verify-website-mode')
document.documentElement.classList.add('verify-website-mode')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VerifyApp />
  </StrictMode>,
)
