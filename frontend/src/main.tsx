import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  )
}

function isPhone() {
  const ua = navigator.userAgent || ''
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || Math.min(window.innerWidth, window.innerHeight) < 600
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isAndroid() {
  return /Android/i.test(navigator.userAgent)
}

const rootEl = document.documentElement
const body = document.body

if (isStandalone()) {
  rootEl.classList.add('is-standalone')
  body.classList.add('is-standalone', 'app-standalone')
}
if (isPhone()) {
  rootEl.classList.add('is-phone')
  body.classList.add('is-phone', 'app-standalone')
}
if (isIos()) body.classList.add('is-ios')
if (isAndroid()) body.classList.add('is-android')

function syncViewportHeight() {
  const viewport = window.visualViewport
  const height = Math.round(viewport?.height ?? window.innerHeight)
  rootEl.style.setProperty('--app-height', `${height}px`)
  const keyboardLikely = Boolean(viewport && window.innerHeight - viewport.height > 80)
  body.classList.toggle('keyboard-open', keyboardLikely)
}

syncViewportHeight()
window.addEventListener('resize', syncViewportHeight)
window.visualViewport?.addEventListener('resize', syncViewportHeight)
window.visualViewport?.addEventListener('scroll', syncViewportHeight)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=7').catch(() => {})
  })
}
