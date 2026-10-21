import React, { useState } from 'react'
import { useApp } from './AppContext.jsx'
import { SectionHeader, EmptyState } from './UI.jsx'
import { parseDate, toCzDate } from './utils.js'

// ─────────────────────────────────────────
// STAVY MĚŘIDEL ke smlouvě – nástup / odchod nájemce i průběžné odečty (např. roční vyúčtování)
// Která měřidla se odečítají, určuje sekce předmětu (Nastavení → Firmy a sekce); prázdné = výchozí podle typu.
// ─────────────────────────────────────────

export const KINDS = { jiny: 'Průběžný odečet (např. roční vyúčtování)', nastup: 'Nástup nájemce', odchod: 'Odchod nájemce' }
export const KIND_SHORT = { jiny: 'Průběžný', nastup: 'Nástup', odchod: 'Odchod' }
// unit: null = jednotku zapisuje uživatel ručně (topení / chlazení: GJ, kWh, dílky…)
export const METER_FIELDS = [
  { key: 'electricity', label: 'Elektřina', unit: 'kWh' },
  { key: 'heat', label: 'Topení', unit: null, unitKey: 'heatUnit' },
  { key: 'cooling', label: 'Chlazení', unit: null, unitKey: 'coolingUnit' },
  { key: 'waterCold', label: 'Voda studená', unit: 'm³' },
  { key: 'waterHot', label: 'Voda teplá', unit: 'm³' },
  { key: 'gas', label: 'Plyn', unit: 'm³' },
]
const DEFAULT_METERS = { residential: ['heat', 'waterCold', 'waterHot'], commercial: ['heat', 'cooling', 'waterCold', 'waterHot'] }

/** Výchozí měřidla podle typu předmětů sekce. */
export const defaultMeters = (assetType) => DEFAULT_METERS[assetType] || []

/** Měřidla sekce: uložená volba (čárkami), jinak výchozí podle typu. */
export function sectionMeters(subject) {
  if (subject?.meters === 'none') return [] // vědomě bez měřidel
  const saved = String(subject?.meters || '').split(',').map(s => s.trim()).filter(k => METER_FIELDS.some(f => f.key === k))
  return saved.length ? METER_FIELDS.map(f => f.key).filter(k => saved.includes(k)) : defaultMeters(subject?.assetType)
}

const num = (v) => (v === '' || v == null || isNaN(Number(String(v).replace(/\s/g, '').replace(',', '.')))) ? null : Number(String(v).replace(/\s/g, '').replace(',', '.'))
const fmt = (v) => v == null ? '—' : Number(v).toLocaleString('cs-CZ', { maximumFractionDigits: 3 })

export default function MeterReadings({ contract }) {
  const { meterReadings = [], addMeterReading, deleteMeterReading, confirmAction, isReadOnly, assets = [], contracts = [], subjectData = [] } = useApp()
  const asset = assets.find(a => a.id === contract.assetId)
  const fields = METER_FIELDS.filter(f => sectionMeters(subjectData.find(s => s.name === asset?.subject) || { assetType: asset?.type }).includes(f.key))
  const list = meterReadings.filter(m => m.contractId === contract.id)
    .sort((a, b) => (parseDate(b.date)?.getTime() || 0) - (parseDate(a.date)?.getTime() || 0))
  // Jednotky topení / chlazení – předvyplnit z posledního odečtu na stejném předmětu (i z předchozí smlouvy)
  const assetContractIds = new Set(contracts.filter(c => c.assetId === contract.assetId).map(c => c.id))
  const lastUnit = (key) => meterReadings.filter(m => assetContractIds.has(m.contractId) && m[key])
    .sort((a, b) => (parseDate(b.date)?.getTime() || 0) - (parseDate(a.date)?.getTime() || 0))[0]?.[key] || ''
  const [form, setForm] = useState(null)
  const open = () => setForm({ dateIso: new Date().toLocaleDateString('sv-SE'), kind: list.length ? 'jiny' : 'nastup', note: '', heatUnit: lastUnit('heatUnit'), coolingUnit: lastUnit('coolingUnit') })
  const save = async () => {
    const [y, m, d] = (form.dateIso || '').split('-').map(Number)
    if (!y) return
    const reading = { id: '', contractId: contract.id, date: toCzDate(new Date(y, m - 1, d)), kind: form.kind, note: form.note?.trim() || null,
      heatUnit: form.heatUnit?.trim() || null, coolingUnit: form.coolingUnit?.trim() || null }
    METER_FIELDS.forEach(f => { reading[f.key] = fields.some(x => x.key === f.key) ? num(form[f.key]) : null })
    if (METER_FIELDS.every(f => reading[f.key] == null)) return
    if (await addMeterReading(reading)) setForm(null)
  }
  const inp = { width: '100%', boxSizing: 'border-box', textAlign: 'left', cursor: 'text' }
  const lbl = { display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--text2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }
  const unitOf = (m, f) => f.unit || m[f.unitKey] || ''

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <SectionHeader icon="🔢" tone="blue" title="Stavy měřidel" meta={list.length ? `${list.length}×` : ''}
        actions={!isReadOnly && !form && fields.length > 0 && <button className="btn btn-sm" onClick={open}>+ Zapsat stav</button>} />
      {fields.length === 0 && !list.length && (
        <div style={{ padding: '10px 16px', fontSize: 12.5, color: 'var(--text3)' }}>Sekce předmětu nemá nastavená měřidla (Nastavení → Firmy a sekce).</div>
      )}
      {form && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 10, marginBottom: 10 }}>
            <div><label style={lbl}>Datum odečtu</label><input type="date" className="btn" style={{ ...inp, cursor: 'pointer' }} value={form.dateIso} onChange={e => setForm({ ...form, dateIso: e.target.value })} /></div>
            <div><label style={lbl}>Příležitost</label>
              <select className="btn" style={{ ...inp, cursor: 'pointer' }} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
                {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {fields.map(f => (
              <div key={f.key}><label style={lbl}>{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="text" inputMode="decimal" className="btn" style={inp} value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                  {!f.unit && <input type="text" className="btn" placeholder="jednotka" title="Jednotka (GJ, kWh, dílky…)" value={form[f.unitKey] || ''}
                    onChange={e => setForm({ ...form, [f.unitKey]: e.target.value })} style={{ width: 78, textAlign: 'left', cursor: 'text' }} />}
                </div>
              </div>
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
      {list.length === 0 && !form && fields.length > 0 ? (
        <div style={{ padding: 10 }}><EmptyState compact icon="🔢" title="Zatím žádné odečty" text="Zapište stavy při nástupu, odchodu i průběžně (např. k ročnímu vyúčtování)." /></div>
      ) : list.map(m => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderTop: '1px solid var(--border2)', fontSize: 13 }}>
          <div style={{ minWidth: 110 }}>
            <div style={{ fontWeight: 800, color: 'var(--text)' }}>{m.date}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{KIND_SHORT[m.kind] || 'Odečet'}</div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '4px 14px', color: 'var(--text2)' }}>
            {METER_FIELDS.filter(f => m[f.key] != null).map(f => <span key={f.key}>{f.label}: <b style={{ color: 'var(--text)' }}>{fmt(m[f.key])}</b> {unitOf(m, f)}</span>)}
            {m.note && <span style={{ color: 'var(--text3)' }}>· {m.note}</span>}
          </div>
          {!isReadOnly && <button className="btn btn-sm btn-ghost" style={{ color: '#DC2626', padding: '4px 8px' }} title="Smazat odečet"
            onClick={() => confirmAction({ title: 'Smazat stav měřidel?', text: `Odečet k ${m.date} bude smazán.`, okLabel: 'Smazat', danger: true, onOk: () => deleteMeterReading(m.id) })}>✕</button>}
        </div>
      ))}
    </div>
  )
}
