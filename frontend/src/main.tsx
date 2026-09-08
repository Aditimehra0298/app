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

function isFormField(el: EventTarget | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

let keyboardCloseTimer: number | undefined

function syncViewportHeight() {
  const viewport = window.visualViewport
  const layoutHeight = window.innerHeight
  const visibleHeight = Math.round(viewport?.height ?? layoutHeight)
  rootEl.style.setProperty('--app-height', `${visibleHeight}px`)
  const heightDelta = layoutHeight - visibleHeight
  const focusedField = isFormField(document.activeElement)
  const keyboardLikely = heightDelta > 60 || (focusedField && heightDelta > 24)
  body.classList.toggle('keyboard-open', keyboardLikely || focusedField)
}

function scrollFieldIntoView(target: EventTarget | null) {
  if (!isFormField(target)) return
  window.setTimeout(() => {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, 280)
}

syncViewportHeight()
window.addEventListener('resize', syncViewportHeight)
window.visualViewport?.addEventListener('resize', syncViewportHeight)
window.visualViewport?.addEventListener('scroll', syncViewportHeight)
document.addEventListener(
  'focusin',
  (event) => {
    if (!isFormField(event.target)) return
    body.classList.add('keyboard-open')
    syncViewportHeight()
    scrollFieldIntoView(event.target)
  },
  true,
)
document.addEventListener(
  'focusout',
  () => {
    window.clearTimeout(keyboardCloseTimer)
    keyboardCloseTimer = window.setTimeout(() => {
      if (!isFormField(document.activeElement)) {
        body.classList.remove('keyboard-open')
      }
      syncViewportHeight()
    }, 120)
  },
  true,
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=9').catch(() => {})
  })
}
