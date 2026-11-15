import React from 'react'
import { parseDate, isEndingArchived } from './utils.js'

// ─────────────────────────────────────────
// JEDNOTNÝ SLOVNÍK STAVŮ – stejné štítky v celé aplikaci
// zelená = v pořádku / dostupné, oranžová = pozor, červená = problém, šedá = neaktivní
// ─────────────────────────────────────────
export const STATUS = {
  // platby
  paid:       { color: '#16A34A', label: '✓ Uhrazeno' },
  partial:    { color: '#D97706', label: '◐ Částečně' },
  unpaid:     { color: '#DC2626', label: '✕ Neuhrazeno' },
  // smlouvy
  active:     { color: '#16A34A', label: 'Aktivní' },
  ending:     { color: '#D97706', label: 'Končí brzy' },
  expired:    { color: '#DC2626', label: 'Propadlá' },
  ended:      { color: '#6B7280', label: 'Ukončeno' },
  // předměty nájmu
  free:       { color: '#16A34A', label: 'Volné' },
  occupied:   { color: '#475569', label: 'Pronajato' },
  // revize
  revOk:      { color: '#16A34A', label: '🔧 V pořádku' },
  revSoon:    { color: '#D97706', label: '🔧 Blíží se' },
  revExpired: { color: '#DC2626', label: '🔧 Propadlá' },
}

// Krátký pulz štítku „Uhrazeno“ po zápisu platby. Klíč = id smlouvy nebo „group:<název>“ (jako contractId platby).
// Řádky Plateb se při překreslení znovu připojují – záporné zpoždění animace drží jednu souvislou animaci.
const PAID_PULSE_MS = 900
const justPaid = new Map()
export function notePaid(key) { if (key) justPaid.set(key, Date.now()) }
export function paidPulseStyle(key) {
  const t = key && justPaid.get(key)
  if (!t) return undefined
  const el = Date.now() - t
  if (el >= PAID_PULSE_MS) { justPaid.delete(key); return undefined }
  return { animation: `rfPaidPulse ${PAID_PULSE_MS}ms ease-out -${el}ms` }
}

/** Plný barevný štítek stavu. kind = klíč ze STATUS, text = vlastní text (volitelně). */
export function StatusPill({ kind, text, size = 'md', title, style }) {
  const st = STATUS[kind] || STATUS.ended
  const sm = size === 'sm'
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', flexShrink: 0,
      padding: sm ? '3px 9px' : '5px 11px', borderRadius: 999, background: st.color, color: '#fff',
      fontSize: sm ? 10.5 : 12, fontWeight: 800, letterSpacing: '0.2px', ...style,
    }}>{text || st.label}</span>
  )
}

/** Stav smlouvy pro štítek: { kind, text } – Aktivní / Končí za N dní / Propadlá / Končí <datum> / Ukončeno. */
export function contractStatus(c, soonDays = 60) {
  if (!c) return { kind: 'ended', text: 'Ukončeno' }
  if (c.status !== 'active') {
    return isEndingArchived(c) ? { kind: 'ending', text: `Končí ${c.end}` } : { kind: 'ended', text: 'Ukončeno' }
  }
  const end = parseDate(c.end)
  if (!end) return { kind: 'active', text: 'Aktivní' }
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const days = Math.round((end - t) / 86400000)
  if (days < 0) return { kind: 'expired', text: 'Propadlá' }
  if (days <= soonDays) return { kind: 'ending', text: `Končí za ${days} ${days === 1 ? 'den' : days < 5 ? 'dny' : 'dní'}` }
  return { kind: 'active', text: 'Aktivní' }
}
