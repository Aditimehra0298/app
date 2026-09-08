import { useEffect, useState } from 'react'

function isFormField(el: EventTarget | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function keyboardLikelyOpen(): boolean {
  if (typeof document !== 'undefined' && document.body.classList.contains('keyboard-open')) {
    return true
  }
  const viewport = window.visualViewport
  const layoutHeight = window.innerHeight
  const visibleHeight = Math.round(viewport?.height ?? layoutHeight)
  const heightDelta = layoutHeight - visibleHeight
  const focusedField = isFormField(document.activeElement)
  return focusedField || heightDelta > 48
}

export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const sync = () => setOpen(keyboardLikelyOpen())

    sync()
    window.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('scroll', sync)
    document.addEventListener('focusin', sync, true)
    document.addEventListener('focusout', sync, true)

    const observer = new MutationObserver(sync)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })

    return () => {
      window.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('scroll', sync)
      document.removeEventListener('focusin', sync, true)
      document.removeEventListener('focusout', sync, true)
      observer.disconnect()
    }
  }, [])

  return open
}
