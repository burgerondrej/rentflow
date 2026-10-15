// ─────────────────────────────────────────
// KLÁVESOVÉ ZKRATKY
// Ctrl+N → událost 'rf-new' (App.jsx ji vyšle), obrazovka otevře svůj formulář „Nový …“.
// ─────────────────────────────────────────
import { useEffect, useRef } from 'react'
import { isDialogOpen } from './DialogShell.jsx'

/** Je otevřený dialog nebo detail (zkratky obrazovky se pak ignorují)? */
export function isOverlayOpen() {
  return isDialogOpen() || !!document.querySelector('.modal-backdrop')
}

/** Píše uživatel do pole? (šipky / zkratky se pak nesmí chytat) */
export function isTyping() {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/** Obrazovka reaguje na Ctrl+N (handler = otevřít formulář „Nový …“). */
export function useNewShortcut(handler) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const fn = () => ref.current && ref.current()
    window.addEventListener('rf-new', fn)
    return () => window.removeEventListener('rf-new', fn)
  }, [])
}

// Filtr Plateb předaný z jiné obrazovky (karta firmy → „po splatnosti“). Čte se při otevření Plateb, maže po připojení.
let pendingPayFilter = null
export const setPaymentsFilterOnOpen = (v) => { pendingPayFilter = v }
export const peekPaymentsFilter = () => pendingPayFilter
export const clearPaymentsFilter = () => { pendingPayFilter = null }
