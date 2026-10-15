import React, { useState, useEffect, useRef } from 'react'
import { useApp } from './AppContext.jsx'
import { firmOf, sectionOf, firmColors, firmSelection, isFirmSelection, selectionFirm } from './utils.js'

// ─────────────────────────────────────────
// Grafika firem (pronajímatelů): zkratka, souhrn nájmu po firmách, výběr firma → sekce
// Barvy a zkratky firem pocházejí z DB (subjects.color / short_name) – žádné názvy v kódu.
// ─────────────────────────────────────────

const TYPE_ICON = { residential: '🏠', commercial: '🏢', ads: '📢', parking: '🅿️', other: '📄', ostatni: '📄' }
const TONE = { ok: '#16A34A', bad: '#DC2626', warn: '#D97706', muted: 'var(--text3)' }

/** Barevná zkratka firmy (MCB, BP…). filled = plná barva, jinak světlý podklad. */
export function FirmBadge({ firm, size = 30, filled = true, style }) {
  const { theme } = useApp()
  if (!firm) return null
  const c = firmColors(firm.color, theme)
  return (
    <span title={firm.name} style={{
      width: size, height: size, borderRadius: Math.round(size * 0.3), flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: filled ? c.mid : c.bg, color: filled ? '#fff' : c.txt,
      fontSize: Math.max(9, Math.round(size * 0.32)), fontWeight: 800, letterSpacing: '0.3px', ...style,
    }}>{firm.short}</span>
  )
}

/** Barevný proužek firmy (levý okraj karet / řádků). */
export function firmStripe(firm, theme, width = 4) {
  if (!firm) return {}
  return { borderLeft: `${width}px solid ${firmColors(firm.color, theme).mid}` }
}

/** Měsíční nájem nájemce po firmách – každá firma vlastní krabička (rows z tenantRentsByFirm). */
export function FirmRentSummary({ rows, large = false }) {
  const { theme, firms = [] } = useApp()
  if (!rows || rows.length === 0) return null
  const fmt = (v) => Math.round(v).toLocaleString('cs-CZ')
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {rows.map(r => {
        const c = firmColors(r.color, theme)
        const firm = firms.find(f => f.name === r.name) || { name: r.name, short: r.short, color: r.color }
        return (
          <div key={r.name} style={{ flex: 1, minWidth: large ? 170 : 140, background: c.bg, border: `1px solid ${c.mid}40`, borderLeft: `4px solid ${c.mid}`, borderRadius: 10, padding: large ? '10px 14px' : '8px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <FirmBadge firm={firm} size={18} />
              <span style={{ fontSize: 10.5, fontWeight: 800, color: c.txt, textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
            </div>
            {r.dph > 0 && (
              <>
                <div style={{ fontSize: large ? 15 : 13, fontWeight: 900, color: c.txt }}>{fmt(r.dph)} <span style={{ fontSize: 10, fontWeight: 600, color: c.sub }}>Kč bez DPH / měsíc</span></div>
                <div style={{ fontSize: 11, fontWeight: 700, color: c.sub }}>{(r.dph * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč s DPH</div>
              </>
            )}
            {r.noDph > 0 && (
              <div style={{ fontSize: large ? 15 : 13, fontWeight: 900, color: c.txt, marginTop: r.dph > 0 ? 3 : 0 }}>{fmt(r.noDph)} <span style={{ fontSize: 10, fontWeight: 600, color: c.sub }}>Kč / měsíc{r.isVatPayer ? '' : ' · neplátce DPH'}</span></div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Kroužek plnění (pct 0–1)
function Ring({ pct, color, size = 34 }) {
  const r = size / 2 - 4, circ = 2 * Math.PI * r
  const done = pct >= 0.999
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={done ? TONE.ok : color} strokeWidth="3" strokeLinecap="round"
        strokeDasharray={`${(circ * Math.max(0, Math.min(1, pct))).toFixed(1)} ${circ.toFixed(1)}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2 + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--text2)">{Math.round(pct * 100)}</text>
    </svg>
  )
}

/**
 * Výběr firma → sekce (strom). value = název sekce | firmSelection(firma).
 * sections = názvy sekcí, které se mají nabízet (prázdné se nezobrazují); firmy bez sekcí se skryjí.
 * getStat(sel) → { pct?: 0–1, text?: string, tone?: 'ok'|'bad'|'warn'|'muted', count?: string } (volitelné)
 */
export function FirmPicker({ value, onChange, sections, getStat, crumbPrefix, compact = false, itemsByFirm, itemIcon, itemLabel }) {
  const { theme, firms = [], subjectData = [] } = useApp()
  // Položky stromu: sekce firmy (výchozí), nebo vlastní seznam (např. budovy) přes itemsByFirm[firma]
  const visible = firms
    .map(f => ({ ...f, secs: (itemsByFirm ? (itemsByFirm[f.name] || []) : f.sections).filter(s => !sections || sections.includes(s)) }))
    .filter(f => f.secs.length > 0)
  const activeFirmName = !value ? null : isFirmSelection(value) ? selectionFirm(value) : (visible.find(f => f.secs.includes(value))?.name || firmOf(value))
  const firm = visible.find(f => f.name === activeFirmName) || visible[0]
  if (!firm) return null
  const c = firmColors(firm.color, theme)
  const typeOf = (s) => subjectData.find(x => x.name === s)?.assetType || 'other'
  const iconOf = (s) => itemIcon ? itemIcon(s) : (TYPE_ICON[typeOf(s)] || '📄')
  const labelOf = (s) => itemLabel ? itemLabel(s) : sectionOf(s)
  const rows = firm.secs.length > 1 ? [firmSelection(firm.name), ...firm.secs] : firm.secs
  const curRow = rows.includes(value) ? value : rows[0]
  const statOf = (sel) => (getStat ? getStat(sel) : null) || {}
  const firmPick = (f) => onChange(f.secs.length > 1 ? firmSelection(f.name) : f.secs[0])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: compact ? '200px minmax(0, 1fr)' : '230px minmax(0, 1fr)', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      {/* Firmy */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, background: 'var(--bg2)', borderRight: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.8px', padding: '2px 4px 4px' }}>Pronajímatel</div>
        {visible.map(f => {
          const fc = firmColors(f.color, theme)
          const on = f.name === firm.name
          const st = statOf(f.secs.length > 1 ? firmSelection(f.name) : f.secs[0])
          return (
            <button key={f.name} onClick={() => firmPick(f)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', width: '100%',
              border: on ? `2px solid ${fc.mid}` : '1px solid var(--border)', background: on ? fc.bg : 'var(--bg)', transition: 'all 0.15s ease', position: 'relative',
            }}>
              <FirmBadge firm={f} size={compact ? 28 : 32} filled={on} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: on ? fc.txt : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                {st.text && <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: TONE[st.tone] || (on ? fc.sub : 'var(--text3)'), whiteSpace: 'nowrap' }}>{st.text}</span>}
              </span>
              {st.pct != null && <Ring pct={st.pct} color={fc.mid} size={compact ? 30 : 34} />}
            </button>
          )
        })}
      </div>

      {/* Strom sekcí vybrané firmy */}
      <div style={{ padding: '12px 14px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <FirmBadge firm={firm} size={26} />
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{firm.name}</span>
          {(() => { const st = statOf(rows[0]); return st.count ? <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text3)' }}>{st.count}</span> : null })()}
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 17, top: 16, bottom: 16, width: 2, borderRadius: 1, background: c.mid, opacity: 0.35 }} />
          {rows.map((r, i) => {
            const on = r === curRow
            const isAll = isFirmSelection(r)
            const st = statOf(r)
            return (
              <React.Fragment key={r}>
                <div onClick={() => onChange(r)} style={{
                  display: 'grid', gridTemplateColumns: '24px 22px minmax(0, 1fr) 96px 56px', alignItems: 'center', gap: 8,
                  padding: '7px 10px 7px 6px', borderRadius: 10, cursor: 'pointer', position: 'relative',
                  background: on ? c.bg : 'transparent', border: `1px solid ${on ? c.mid : 'transparent'}`, transition: 'background 0.12s ease',
                }}
                  onMouseOver={e => { if (!on) e.currentTarget.style.background = 'var(--bg2)' }}
                  onMouseOut={e => { if (!on) e.currentTarget.style.background = 'transparent' }}>
                  <span style={{ display: 'flex', justifyContent: 'center' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: on ? c.mid : 'var(--bg)', border: `2px solid ${c.mid}`, zIndex: 1 }} />
                  </span>
                  <span style={{ fontSize: 15, textAlign: 'center' }}>{isAll ? '▦' : iconOf(r)}</span>
                  <span style={{ fontSize: 13, fontWeight: on || isAll ? 700 : 500, color: on ? c.txt : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isAll ? 'Vše' : labelOf(r)}</span>
                  <span style={{ height: 6, borderRadius: 3, background: 'var(--bg2)', border: '1px solid var(--border)', overflow: 'hidden', visibility: st.pct != null ? 'visible' : 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.round((st.pct || 0) * 100)}%`, background: (st.pct || 0) >= 0.999 ? TONE.ok : c.mid }} />
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'right', color: TONE[st.tone] || 'var(--text3)', whiteSpace: 'nowrap' }}>{st.count || ''}</span>
                </div>
                {isAll && <div style={{ height: 1, background: 'var(--border)', margin: '4px 10px 4px 36px' }} />}
              </React.Fragment>
            )
          })}
        </div>
        {crumbPrefix && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 10, background: c.bg, border: `1px solid ${c.mid}55`, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: c.txt }}>
            <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: c.mid }} />
            <span>{crumbPrefix}</span><span style={{ color: c.sub }}>›</span>
            <span style={{ fontWeight: 800 }}>{firm.name}</span><span style={{ color: c.sub }}>›</span>
            <span>{isFirmSelection(curRow) ? 'Vše' : labelOf(curRow)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Tlačítko v horní liště s vyskakovacím výběrem firma → sekce.
 * value = 'all' | sekce | firmSelection(firma)
 */
export function FirmPickerButton({ value, onChange, getStat, sections }) {
  const { theme, firms = [] } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc) }
  }, [open])
  const isAll = !value || value === 'all'
  const firm = isAll ? null : firms.find(f => f.name === selectionFirm(value))
  const c = firm ? firmColors(firm.color, theme) : null
  const label = isAll ? 'Všechny firmy' : isFirmSelection(value) ? 'Vše' : sectionOf(value)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 6px', minWidth: 230, cursor: 'pointer', textAlign: 'left',
        border: `1px solid ${c ? c.mid + '88' : '#BBF7D0'}`, borderRadius: 10, background: c ? c.bg : '#F0FDF4',
      }}>
        {firm ? <FirmBadge firm={firm} size={26} /> : <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--accent)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>▦</span>}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: c ? c.sub : '#15803D' }}>{firm ? firm.name : 'Pronajímatel'}</span>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: c ? c.txt : '#15803D', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        </span>
        <span style={{ fontSize: 10, color: c ? c.sub : '#15803D' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 1500, width: 640, boxShadow: '0 18px 48px rgba(0,0,0,0.22)', borderRadius: 16, background: 'var(--bg)' }}>
          <div style={{ padding: '10px 10px 0' }}>
            <button onClick={() => { onChange('all'); setOpen(false) }} className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', fontWeight: isAll ? 800 : 600, background: isAll ? 'var(--accent)' : undefined, color: isAll ? '#fff' : undefined }}>
              ▦ Všechny firmy
            </button>
          </div>
          <div style={{ padding: 10 }}>
            <FirmPicker value={isAll ? null : value} onChange={(v) => { onChange(v); setOpen(false) }} getStat={getStat} sections={sections} compact />
          </div>
        </div>
      )}
    </div>
  )
}

/** Stat pro FirmPicker ze seznamu položek: done/total → kroužek, počet, text. */
export function progressStat(done, total, emptyText = 'bez položek') {
  if (!total) return { text: emptyText, tone: 'muted', count: '' }
  const miss = total - done
  return { pct: done / total, count: `${done}/${total}`, text: miss > 0 ? `${miss} neuhrazeno` : 'vše uhrazeno', tone: miss > 0 ? 'bad' : 'ok' }
}

export { firmOf }

/**
 * Objekty (budovy) seskupené po firmách – pro Revize a Provozní náklady.
 * Budova bez přiřazené firmy spadne pod "Ostatní".
 */
export function useObjectFirms() {
  const { objectFirms = [], mainObjects = [], firms = [] } = useApp()
  const firmOfObject = (name) => objectFirms.find(o => o.name === name)?.firm || 'Ostatní'
  const itemsByFirm = {}
  mainObjects.forEach(n => { const f = firmOfObject(n); (itemsByFirm[f] = itemsByFirm[f] || []).push(n) })
  const matches = (sel, name) => !sel ? false : isFirmSelection(sel) ? firmOfObject(name) === selectionFirm(sel) : name === sel
  const isValid = (sel) => !!sel && (isFirmSelection(sel) ? (itemsByFirm[selectionFirm(sel)] || []).length > 1 : mainObjects.includes(sel))
  const first = firms.find(f => (itemsByFirm[f.name] || []).length > 0)
  const firstSel = !first ? '' : itemsByFirm[first.name].length > 1 ? firmSelection(first.name) : itemsByFirm[first.name][0]
  // První budova výběru (pro předvyplnění formulářů při výběru "Vše")
  const firstObjectOf = (sel) => isFirmSelection(sel) ? ((itemsByFirm[selectionFirm(sel)] || [])[0] || '') : sel
  return { itemsByFirm, firmOfObject, matches, isValid, firstSel, firstObjectOf }
}
