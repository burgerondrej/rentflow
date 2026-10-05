import React, { useState, useEffect } from 'react'
import { useApp } from './AppContext.jsx'
import { parseDate, toCzDate, getEffectiveValuesToday } from './utils.js'

// ISO "RRRR-MM-DD" ↔ Date (lokální čas, bez posunu přes UTC)
const isoToDate = (iso) => { if (!iso) return null; const [y, m, d] = iso.split('-').map(Number); return (y && m && d) ? new Date(y, m - 1, d) : null }
const dateToIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const FREQ_SHORT = { 'Čtvrtletně': 'čtvrtletně', 'Pololetně': 'pololetně', 'Ročně': 'ročně' }

/**
 * Navazující smlouvy – hromadné prodloužení smluv nájemce (stejné předměty, nová data a nájemné).
 * Předvybrané: výchozí smlouva + stejná skupina + smlouvy nájemce se stejným datem konce.
 */
export default function RenewContractsDialog({ contract, onClose, onDone }) {
  const { contracts = [], assets = [], tenants = [], renewContracts, showToast } = useApp()

  const tenant = tenants.find(t => t.id === contract.tenantId)
  const assetOf = (c) => assets.find(a => a.id === c.assetId)

  // Aktivní smlouvy nájemce: nejdřív stejná skupina, pak dle předmětu
  const candidates = contracts
    .filter(c => c.tenantId === contract.tenantId && c.status === 'active')
    .sort((a, b) => {
      const ga = a.groupLabel && a.groupLabel === contract.groupLabel ? 0 : 1
      const gb = b.groupLabel && b.groupLabel === contract.groupLabel ? 0 : 1
      if (ga !== gb) return ga - gb
      return (assetOf(a)?.unit || '').localeCompare(assetOf(b)?.unit || '', 'cs', { numeric: true })
    })

  const isPreselected = (c) =>
    c.id === contract.id ||
    (!!contract.groupLabel && c.groupLabel === contract.groupLabel) ||
    (!!contract.end && c.end === contract.end)

  const [selected, setSelected] = useState(() => new Set(candidates.filter(isPreselected).map(c => c.id)))
  const [rents, setRents] = useState(() => Object.fromEntries(candidates.map(c => [c.id, String(getEffectiveValuesToday(c).rent)])))
  const [startIso, setStartIso] = useState(() => {
    const e = parseDate(contract.end)
    return dateToIso(e ? new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1) : new Date())
  })
  const [endIso, setEndIso] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, saving])

  const newStart = isoToDate(startIso)
  const newEnd = isoToDate(endIso)
  const dayBefore = newStart ? new Date(newStart.getFullYear(), newStart.getMonth(), newStart.getDate() - 1) : null
  const chosen = candidates.filter(c => selected.has(c.id))
  const isIncluded = (c) => c.paymentFrequency === 'Zahrnuto v nájemném'

  // Co se stane se starou smlouvou: zkrácení / mezera / navazuje
  const oldEndNote = (c) => {
    if (!dayBefore) return null
    const oe = parseDate(c.end)
    if (!oe) return { text: `skončí ${toCzDate(dayBefore)}`, warn: false }
    if (oe > dayBefore) return { text: `zkrátí se na ${toCzDate(dayBefore)}`, warn: false }
    if (oe < dayBefore) return { text: `mezera ${toCzDate(new Date(oe.getFullYear(), oe.getMonth(), oe.getDate() + 1))} – ${toCzDate(dayBefore)}`, warn: true }
    return null
  }

  const errors = []
  if (!newStart) errors.push('Zadejte začátek nové smlouvy.')
  if (newStart && newEnd && newEnd < newStart) errors.push('Konec nové smlouvy je před jejím začátkem.')
  if (chosen.length === 0) errors.push('Označte alespoň jednu smlouvu.')
  if (chosen.some(c => !isIncluded(c) && (rents[c.id] === '' || isNaN(Number(rents[c.id])) || Number(rents[c.id]) < 0))) errors.push('Vyplňte nájemné u všech označených smluv.')
  if (newStart && chosen.some(c => { const s = parseDate(c.start); return s && s >= newStart })) errors.push('Nová smlouva musí začínat po začátku původní smlouvy.')

  const toggle = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleConfirm = async () => {
    if (errors.length > 0 || saving) return
    setSaving(true)
    const ok = await renewContracts(chosen.map(c => ({ contract: c, rent: rents[c.id] })), newStart, newEnd)
    setSaving(false)
    if (ok) {
      showToast(`Vytvořeno ${chosen.length} navazujících smluv od ${toCzDate(newStart)}.`, 'success')
      onDone ? onDone() : onClose()
    }
  }

  const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }
  const th = { padding: '6px 8px', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'left', whiteSpace: 'nowrap' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div style={{ background: 'var(--bg)', borderRadius: 16, padding: 28, width: 820, maxWidth: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.25)', animation: 'modalIn 0.18s ease' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>🔁 Navazující smlouvy</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 18 }}>
          Nájemce: <span style={{ fontWeight: 600, color: 'var(--text2)' }}>{tenant?.name || '—'}</span>
          {' · '}staré smlouvy se ukončí, nové převezmou předmět, skupinu a nastavení.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
          <div>
            <label style={lbl}>Nová smlouva od *</label>
            <input type="date" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'var(--bg2)', boxSizing: 'border-box' }}
              value={startIso} onChange={e => setStartIso(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Nová smlouva do <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text3)' }}>(prázdné = na dobu neurčitou)</span></label>
            <input type="date" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'var(--bg2)', boxSizing: 'border-box' }}
              value={endIso} onChange={e => setEndIso(e.target.value)} />
          </div>
        </div>

        <div style={{ overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg2)' }}>
              <tr>
                <th style={{ ...th, width: 28 }}></th>
                <th style={th}>Předmět nájmu</th>
                <th style={th}>Skupina</th>
                <th style={th}>Končí</th>
                <th style={{ ...th, textAlign: 'right' }}>Nájem nyní</th>
                <th style={{ ...th, textAlign: 'right' }}>Nové nájemné (Kč)</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map(c => {
                const on = selected.has(c.id)
                const note = on ? oldEndNote(c) : null
                const incl = isIncluded(c)
                return (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border2)', background: on ? 'var(--bg2)' : 'transparent', opacity: on ? 1 : 0.7 }}>
                    <td style={{ padding: '8px 8px' }}>
                      <input type="checkbox" checked={on} onChange={() => toggle(c.id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '8px 8px', cursor: 'pointer' }} onClick={() => toggle(c.id)}>
                      <div style={{ fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{assetOf(c)?.unit || '—'}</div>
                      {FREQ_SHORT[c.paymentFrequency] && <div style={{ fontSize: 10, color: 'var(--text3)' }}>platba {FREQ_SHORT[c.paymentFrequency]}</div>}
                    </td>
                    <td style={{ padding: '8px 8px', fontSize: 11, color: 'var(--text3)', maxWidth: 220 }}>{c.groupLabel || '—'}</td>
                    <td style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 12, color: 'var(--text2)' }}>{c.end || 'neurčito'}</div>
                      {note && <div style={{ fontSize: 10, fontWeight: 600, color: note.warn ? '#92400E' : 'var(--text3)' }}>{note.warn ? '⚠️ ' : ''}{note.text}</div>}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text2)' }}>
                      {incl ? 'zahrnuto' : `${getEffectiveValuesToday(c).rent.toLocaleString('cs-CZ')} Kč`}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                      {incl
                        ? <span style={{ fontSize: 12, color: 'var(--text3)' }}>zahrnuto v nájemném</span>
                        : <input type="number" min={0} className="btn" disabled={!on}
                            style={{ width: 120, textAlign: 'right', cursor: 'text', background: on ? '#fff' : 'var(--bg2)', boxSizing: 'border-box' }}
                            value={rents[c.id] ?? ''} onChange={e => setRents(prev => ({ ...prev, [c.id]: e.target.value }))} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--text2)', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 12px', marginBottom: errors.length ? 8 : 16 }}>
          {newStart && chosen.length > 0
            ? <>Ukončí se <b>{chosen.length}</b> {chosen.length === 1 ? 'smlouva' : chosen.length < 5 ? 'smlouvy' : 'smluv'} a vznikne stejný počet nových od <b>{toCzDate(newStart)}</b>{newEnd ? <> do <b>{toCzDate(newEnd)}</b></> : ' na dobu neurčitou'}. Skupiny zůstávají, platby navazují. Před provedením se udělá záloha.</>
            : 'Vyberte smlouvy a začátek nové smlouvy.'}
        </div>
        {errors.length > 0 && (
          <div style={{ fontSize: 12, color: '#991B1B', marginBottom: 16 }}>{errors.join(' ')}</div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose} disabled={saving}>Zrušit</button>
          <button className="btn" style={{ flex: 2, background: errors.length ? 'var(--bg3)' : '#16A34A', color: errors.length ? 'var(--text3)' : '#fff', border: 'none', fontWeight: 700, cursor: errors.length ? 'not-allowed' : 'pointer' }}
            onClick={handleConfirm} disabled={errors.length > 0 || saving}>
            {saving ? 'Vytvářím…' : '✓ Vytvořit navazující smlouvy'}
          </button>
        </div>
      </div>
    </div>
  )
}
