import React from 'react'

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
  return (
    <div className={`seg seg-${size}`} style={style} role="tablist">
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
