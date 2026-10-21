import React, { useState } from 'react'
import { useApp } from './AppContext.jsx'
import { SectionHeader, EmptyState } from './UI.jsx'
import { parseDate, toCzDate } from './utils.js'

// ─────────────────────────────────────────
// STAVY MĚŘIDEL ke smlouvě – odečty při nástupu / odchodu nájemce (podklad pro vyúčtování)
// ─────────────────────────────────────────

const KINDS = { nastup: 'Nástup', odchod: 'Odchod', jiny: 'Průběžný' }
const FIELDS = [
  { key: 'electricity', label: 'Elektřina', unit: 'kWh' },
  { key: 'waterCold', label: 'Voda studená', unit: 'm³' },
  { key: 'waterHot', label: 'Voda teplá', unit: 'm³' },
  { key: 'gas', label: 'Plyn', unit: 'm³' },
  { key: 'heat', label: 'Teplo', unit: 'GJ' },
]
const num = (v) => (v === '' || v == null || isNaN(Number(String(v).replace(',', '.')))) ? null : Number(String(v).replace(',', '.'))
const fmt = (v) => v == null ? '—' : Number(v).toLocaleString('cs-CZ', { maximumFractionDigits: 3 })

export default function MeterReadings({ contract }) {
  const { meterReadings = [], addMeterReading, deleteMeterReading, confirmAction, isReadOnly } = useApp()
  const list = meterReadings.filter(m => m.contractId === contract.id)
    .sort((a, b) => (parseDate(b.date)?.getTime() || 0) - (parseDate(a.date)?.getTime() || 0))
  const [form, setForm] = useState(null) // { dateIso, kind, electricity, … , note }
  const open = () => setForm({ dateIso: new Date().toLocaleDateString('sv-SE'), kind: list.length ? 'odchod' : 'nastup', note: '' })
  const save = async () => {
    const [y, m, d] = (form.dateIso || '').split('-').map(Number)
    if (!y) return
    const reading = { id: '', contractId: contract.id, date: toCzDate(new Date(y, m - 1, d)), kind: form.kind, note: form.note?.trim() || null }
    FIELDS.forEach(f => { reading[f.key] = num(form[f.key]) })
    if (FIELDS.every(f => reading[f.key] == null)) return
    if (await addMeterReading(reading)) setForm(null)
  }
  const inp = { width: '100%', boxSizing: 'border-box', textAlign: 'left', cursor: 'text' }
  const lbl = { display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--text2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <SectionHeader icon="🔢" tone="blue" title="Stavy měřidel" meta={list.length ? `${list.length}×` : ''}
        actions={!isReadOnly && !form && <button className="btn btn-sm" onClick={open}>+ Zapsat stav</button>} />
      {form && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><label style={lbl}>Datum odečtu</label><input type="date" className="btn" style={{ ...inp, cursor: 'pointer' }} value={form.dateIso} onChange={e => setForm({ ...form, dateIso: e.target.value })} /></div>
            <div><label style={lbl}>Příležitost</label>
              <select className="btn" style={{ ...inp, cursor: 'pointer' }} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
                {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
            {FIELDS.map(f => (
              <div key={f.key}><label style={lbl}>{f.label} ({f.unit})</label>
                <input type="text" inputMode="decimal" className="btn" style={inp} value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} /></div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}><label style={lbl}>Poznámka</label>
            <input type="text" className="btn" style={inp} value={form.note} placeholder="např. číslo měřidla, fotka v Dokumentech…" onChange={e => setForm({ ...form, note: e.target.value })} /></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm" onClick={() => setForm(null)}>Zrušit</button>
            <button className="btn btn-sm btn-primary" onClick={save}>Uložit stav</button>
          </div>
        </div>
      )}
      {list.length === 0 && !form ? (
        <div style={{ padding: 10 }}><EmptyState compact icon="🔢" title="Zatím žádné odečty" text="Zapište stavy měřidel při nástupu a odchodu nájemce – hodí se pro vyúčtování." /></div>
      ) : list.map(m => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderTop: '1px solid var(--border2)', fontSize: 13 }}>
          <div style={{ minWidth: 110 }}>
            <div style={{ fontWeight: 800, color: 'var(--text)' }}>{m.date}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{KINDS[m.kind] || 'Odečet'}</div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '4px 14px', color: 'var(--text2)' }}>
            {FIELDS.filter(f => m[f.key] != null).map(f => <span key={f.key}>{f.label}: <b style={{ color: 'var(--text)' }}>{fmt(m[f.key])}</b> {f.unit}</span>)}
            {m.note && <span style={{ color: 'var(--text3)' }}>· {m.note}</span>}
          </div>
          {!isReadOnly && <button className="btn btn-sm btn-ghost" style={{ color: '#DC2626', padding: '4px 8px' }} title="Smazat odečet"
            onClick={() => confirmAction({ title: 'Smazat stav měřidel?', text: `Odečet k ${m.date} bude smazán.`, okLabel: 'Smazat', danger: true, onOk: () => deleteMeterReading(m.id) })}>✕</button>}
        </div>
      ))}
    </div>
  )
}
