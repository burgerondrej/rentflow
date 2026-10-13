import React, { useState } from 'react'
import { useApp } from '../AppContext.jsx'
import { FirmBadge, useObjectFirms } from '../FirmUI.jsx'
import { parseDate, contractSubject, firmOf, firmColors } from '../utils.js'

// ─────────────────────────────────────────
// KALENDÁŘ – konce smluv, revize, termíny úkolů (bez splatností)
// Barva události = barva firmy (pronajímatele); filtr podle firmy a typu.
// ─────────────────────────────────────────

const MONTHS = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec']
const DOW = ['Po','Út','St','Čt','Pá','So','Ne']
const TYPES = {
  contract: { icon: '📄', label: 'Konce smluv' },
  revision: { icon: '🔧', label: 'Revize' },
  task:     { icon: '✅', label: 'Úkoly' },
}
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

export default function Calendar({ onOpen, onNav }) {
  const { contracts = [], assets = [], tenants = [], revisions = [], tasks = [], firms = [], theme } = useApp()
  const { firmOfObject } = useObjectFirms()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [firmFilter, setFirmFilter] = useState('all')
  const [typeOn, setTypeOn] = useState({ contract: true, revision: true, task: true })

  // ── Události ──
  const events = []
  contracts.filter(c => c.status === 'active' && c.paymentFrequency !== 'Zahrnuto v nájemném').forEach(c => {
    const d = parseDate(c.end)
    if (!d) return
    const a = assets.find(x => x.id === c.assetId)
    const t = tenants.find(x => x.id === c.tenantId)
    events.push({ type: 'contract', date: d, firm: firmOf(contractSubject(c, assets)), title: `Konec smlouvy: ${a?.unit || '—'}`, sub: t?.name || '', onClick: () => onOpen && onOpen('contract', c.id) })
  })
  revisions.forEach(r => {
    const last = parseDate(r.lastDate)
    if (!last) return
    const next = new Date(last.getFullYear(), last.getMonth() + (parseInt(r.interval) || 12), last.getDate())
    const obj = r.subject || assets.find(a => a.id === r.assetId)?.subject || ''
    events.push({ type: 'revision', date: next, firm: r.subject ? firmOfObject(r.subject) : firmOf(obj), title: `Revize: ${r.title}`, sub: obj, onClick: () => onNav && onNav('maintenance') })
  })
  tasks.filter(t => t.status !== 'done' && t.deadline).forEach(t => {
    const [y, m, d] = (t.deadline || '').split('-').map(Number)
    if (!y || !m || !d) return
    const tagFirm = (t.tag || '').split(',').map(x => x.trim()).find(x => firms.some(f => f.name === x))
    events.push({ type: 'task', date: new Date(y, m - 1, d), firm: tagFirm || '', title: t.title, sub: 'Úkol', onClick: () => onNav && onNav('kanban') })
  })
  const visible = events.filter(e => typeOn[e.type] && (firmFilter === 'all' || e.firm === firmFilter))
  const byDay = {}
  visible.forEach(e => { (byDay[dayKey(e.date)] = byDay[dayKey(e.date)] || []).push(e) })

  const colorOf = (firmName) => {
    const f = firms.find(x => x.name === firmName)
    return f ? firmColors(f.color, theme) : { mid: '#64748B', bg: 'var(--bg2)', txt: 'var(--text)', sub: 'var(--text3)' }
  }

  // ── Mřížka měsíce (začátek v pondělí) ──
  const y = cursor.getFullYear(), m = cursor.getMonth()
  const first = new Date(y, m, 1)
  const offset = (first.getDay() + 6) % 7
  const cells = Array.from({ length: 42 }, (_, i) => new Date(y, m, 1 - offset + i))
  const weeks = cells[35].getMonth() !== m ? 5 : 6

  // ── Nadcházejících 60 dní ──
  const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60)
  const upcoming = visible.filter(e => e.date >= today && e.date <= horizon).sort((a, b) => a.date - b.date)

  const EventChip = ({ e, compact }) => {
    const c = colorOf(e.firm)
    return (
      <div onClick={(ev) => { ev.stopPropagation(); e.onClick() }} title={`${e.title}${e.sub ? ' · ' + e.sub : ''}`} style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: compact ? '2px 6px' : '6px 10px', borderRadius: 6, cursor: 'pointer',
        background: c.bg, borderLeft: `4px solid ${c.mid}`, fontSize: compact ? 11 : 13, fontWeight: 700, color: c.txt,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        <span>{TYPES[e.type].icon}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</span>
      </div>
    )
  }

  const chipBtn = (on, onClick, children, c) => (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px 5px 6px', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
      border: on ? `2px solid ${c ? c.mid : 'var(--accent)'}` : '1px solid var(--border)', background: on ? (c ? c.bg : 'var(--bg2)') : 'var(--bg)', color: on && c ? c.txt : 'var(--text)',
    }}>{children}</button>
  )

  return (
    <div style={{ paddingBottom: 60 }}>
      <div className="page-header" data-icon="📅" style={{ marginBottom: 18 }}>
        <div>
          <div className="page-title">Kalendář</div>
          <div className="page-sub">Konce smluv, revize a termíny úkolů – barevně podle firem</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setCursor(new Date(y, m - 1, 1))}>‹</button>
          <div style={{ minWidth: 150, textAlign: 'center', fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{MONTHS[m]} {y}</div>
          <button className="btn btn-sm" onClick={() => setCursor(new Date(y, m + 1, 1))}>›</button>
          <button className="btn btn-sm" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>Dnes</button>
        </div>
      </div>

      {/* Filtry: firma + typ události */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {chipBtn(firmFilter === 'all', () => setFirmFilter('all'), <><span style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--accent)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>▦</span>Všechny firmy</>)}
        {firms.filter(f => events.some(e => e.firm === f.name)).map(f => (
          <React.Fragment key={f.name}>
            {chipBtn(firmFilter === f.name, () => setFirmFilter(f.name), <><FirmBadge firm={f} size={22} />{f.name}</>, firmColors(f.color, theme))}
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {Object.entries(TYPES).map(([k, t]) => (
          <React.Fragment key={k}>
            {chipBtn(typeOn[k], () => setTypeOn(p => ({ ...p, [k]: !p[k] })), <><span style={{ fontSize: 14, paddingLeft: 4 }}>{t.icon}</span>{t.label} <span style={{ color: 'var(--text3)', fontWeight: 600 }}>{events.filter(e => e.type === k && (firmFilter === 'all' || e.firm === firmFilter)).length}</span></>)}
          </React.Fragment>
        ))}
      </div>

      {/* Mřížka */}
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
          {DOW.map(d => <div key={d} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {cells.slice(0, weeks * 7).map((d, i) => {
            const inMonth = d.getMonth() === m
            const isToday = d.getTime() === today.getTime()
            const evs = byDay[dayKey(d)] || []
            return (
              <div key={i} style={{ minHeight: 104, padding: 6, borderRight: (i % 7) < 6 ? '1px solid var(--border2, var(--border))' : 'none', borderBottom: '1px solid var(--border2, var(--border))', background: inMonth ? 'var(--bg)' : 'var(--bg2)', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, width: 24, height: 24, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isToday ? '#fff' : inMonth ? 'var(--text)' : 'var(--text3)', background: isToday ? 'var(--accent)' : 'transparent' }}>{d.getDate()}</span>
                </div>
                {evs.slice(0, 3).map((e, j) => <EventChip key={j} e={e} compact />)}
                {evs.length > 3 && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', paddingLeft: 4 }}>+ {evs.length - 3} další</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Nadcházející */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>Nadcházejících 60 dní</div>
        {upcoming.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>V příštích 60 dnech nic není.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {upcoming.map((e, i) => {
              const days = Math.round((e.date - today) / 86400000)
              const f = firms.find(x => x.name === e.firm)
              return (
                <div key={i} onClick={e.onClick} style={{ display: 'grid', gridTemplateColumns: '90px 28px minmax(0, 1fr) auto', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', boxShadow: `inset 5px 0 0 ${colorOf(e.firm).mid}` }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{e.date.getDate()}. {e.date.getMonth() + 1}. {e.date.getFullYear()}</span>
                  {f ? <FirmBadge firm={f} size={24} /> : <span />}
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{TYPES[e.type].icon} {e.title}</span>
                    {e.sub && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text3)' }}>{e.sub}</span>}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: days <= 7 ? '#DC2626' : days <= 30 ? '#D97706' : 'var(--text3)', whiteSpace: 'nowrap' }}>{days === 0 ? 'dnes' : `za ${days} ${days === 1 ? 'den' : days < 5 ? 'dny' : 'dní'}`}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
