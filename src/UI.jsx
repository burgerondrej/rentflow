import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'

/** Uživatel má ve Windows vypnuté animace → efekty vynechat. */
export const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Číslo, které při zobrazení / změně plynule „dojede“ na hodnotu (Dashboard). Vrací formátovaný text. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('cs-CZ'), duration = 700 }) {
  const [shown, setShown] = useState(() => prefersReducedMotion() ? value : 0)
  const fromRef = useRef(shown)
  useEffect(() => {
    if (prefersReducedMotion()) { setShown(value); fromRef.current = value; return }
    const from = fromRef.current, start = performance.now()
    let raf
    const step = (now) => {
      const k = Math.min(1, (now - start) / duration), e = 1 - Math.pow(1 - k, 3)
      const v = from + (value - from) * e
      fromRef.current = v; setShown(v)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return format(shown)
}

// ─────────────────────────────────────────
// SDÍLENÉ PRVKY VZHLEDU (v1.3.1) – jednotná hlavička sekce, segmentový přepínač a prázdný stav.
// Barvy výhradně z CSS proměnných (--tone-*), takže fungují i v tmavém režimu.
// tone: 'green' | 'blue' | 'amber' | 'red' | 'violet' | 'gray'
// ─────────────────────────────────────────

/** Hlavička sekce: ikona v barevném čtverečku, nadpis, doplněk (počet) a akce vpravo. */
export function SectionHeader({ icon, tone = 'gray', title, meta, actions, style }) {
  return (
    <div className="sec-head" style={style}>
      {icon && <div className="sec-head-icon" style={{ background: `var(--tone-${tone}-soft)`, borderColor: `var(--tone-${tone}-border)` }}>{icon}</div>}
      <div className="sec-head-title">{title}</div>
      {meta != null && meta !== '' && <div className="sec-head-meta">{meta}</div>}
      {actions && <div className="sec-head-actions">{actions}</div>}
    </div>
  )
}

/** Karta sekce = rámeček + SectionHeader + obsah. */
export function SectionCard({ icon, tone, title, meta, actions, children, bodyStyle, style }) {
  return (
    <div className="sec-card" style={style}>
      <SectionHeader icon={icon} tone={tone} title={title} meta={meta} actions={actions} />
      <div className="sec-card-body" style={bodyStyle}>{children}</div>
    </div>
  )
}

/** Segmentový přepínač: items = [{ id, label, count? }] */
export function Segmented({ items, value, onChange, size = 'md', style }) {
  // Posuvný podklad pod vybranou volbou (měří se pozice aktivního tlačítka)
  const boxRef = useRef(null)
  const [thumb, setThumb] = useState(null)
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    const measure = () => {
      const el = box.querySelector('.seg-item.on')
      setThumb(el ? { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } : null)
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro) ro.observe(box)
    return () => { if (ro) ro.disconnect() }
  }, [value, items.length])
  return (
    <div ref={boxRef} className={`seg seg-${size}${thumb ? ' has-thumb' : ''}`} style={style} role="tablist">
      {thumb && <span className="seg-thumb" style={thumb} aria-hidden="true" />}
      {items.map(it => (
        <button key={it.id} type="button" role="tab" aria-selected={value === it.id}
          className={`seg-item${value === it.id ? ' on' : ''}`} onClick={() => onChange(it.id)}>
          {it.label}{it.count != null && <span className="seg-count">{it.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Prázdný stav: ikona, krátká věta, případně akce. good = zelená (dobrá zpráva), jinak šedá. */
export function EmptyState({ icon, title, text, action, good = false, compact = false, style }) {
  const tone = good ? 'green' : 'gray'
  return (
    <div className={`empty-state${compact ? ' compact' : ''}`} style={style}>
      {icon && <div className="empty-state-icon" style={{ background: `var(--tone-${tone}-soft)`, borderColor: `var(--tone-${tone}-border)` }}>{icon}</div>}
      {title && <div className="empty-state-title" style={good ? { color: 'var(--tone-green-text)' } : undefined}>{title}</div>}
      {text && <div className="empty-state-text">{text}</div>}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  )
}

/**
 * Upozornění pod částkou platby, když nesedí s předpisem (překlep, částečná platba, přeplatek). Nic neblokuje.
 * expected = předpis, paid = už zaplaceno (pak se porovnává se zbývající částkou).
 */
export function PayAmountHint({ amount, expected, paid = 0, style }) {
  const a = Number(String(amount ?? '').replace(',', '.'))
  const e = Math.round(Number(expected) || 0), rem = Math.max(0, e - Math.round(Number(paid) || 0))
  if (!(a > 0) || !(e > 0) || Math.abs(a - rem) < 1) return null
  const kc = (v) => `${Math.round(v).toLocaleString('cs-CZ')} Kč`
  return (
    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tone-amber-text)', marginTop: 4, ...style }}>
      ⚠ {paid > 0 ? `Zbývá doplatit ${kc(rem)}` : `Předpis ${kc(e)}`} – zapisuješ o {kc(Math.abs(a - rem))} {a < rem ? 'méně, měsíc zůstane částečně uhrazený' : 'víc (přeplatek)'}.
    </div>
  )
}

/** „3 nájemci“ / „5 nájemců“ – víc souběžných smluv na jednom předmětu (podle popisku strany smlouvy). */
export function partiesLabel(n, tenantLabel = 'Nájemce') {
  const few = n >= 2 && n <= 4
  const forms = {
    'Smluvní strana': few ? 'smluvní strany' : 'smluvních stran',
    'Klient': few ? 'klienti' : 'klientů',
  }
  return `${n} ${forms[tenantLabel] || (few ? 'nájemci' : 'nájemců')}`
}
