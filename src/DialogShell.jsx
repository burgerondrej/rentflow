import React, { useEffect } from 'react'

/**
 * Jednotná kostra dialogu (v1.3.1) – stejný vzhled všech oken v aplikaci:
 * overlay s rozostřením, hlavička (ikona v barevném čtverci, nadpis, podtitulek, ✕),
 * posuvný obsah a patička s tlačítky vpravo na šedém podkladu. Funguje v tmavém režimu.
 *
 * Props: icon, tone ('green' | 'red' | 'amber' | 'blue' | 'violet' | 'gray'), title, subtitle,
 *        width, onClose, footer (React uzel – tlačítka), busy (blokuje zavření), zIndex, bodyStyle
 */
export default function DialogShell({ icon, tone = 'green', title, subtitle, width = 520, onClose, footer, busy = false, zIndex = 2000, bodyStyle, children }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !busy && onClose) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, busy])

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget && !busy && onClose) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex, background: 'rgba(10, 20, 15, 0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="dlg" style={{ width, maxWidth: 'calc(94vw / var(--ui-zoom, 1))', maxHeight: 'calc(90vh / var(--ui-zoom, 1))' }}>
        <div className="dlg-head">
          {icon && <div className="dlg-icon" style={{ background: `var(--tone-${tone}-soft)`, borderColor: `var(--tone-${tone}-border)` }}>{icon}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dlg-title">{title}</div>
            {subtitle && <div className="dlg-sub">{subtitle}</div>}
          </div>
          {onClose && <button type="button" className="dlg-close" onClick={() => { if (!busy) onClose() }} title="Zavřít (Esc)">✕</button>}
        </div>
        <div className="dlg-body" style={bodyStyle}>{children}</div>
        {footer && <div className="dlg-foot">{footer}</div>}
      </div>
    </div>
  )
}
