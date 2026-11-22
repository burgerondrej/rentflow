import React, { useState } from 'react'
import DialogShell from './DialogShell.jsx'
import { parseDate, DUE_PREPAID } from './utils.js'

/**
 * Rychlá úprava jednoho údaje smlouvy přímo z detailu (✏️ u kartičky) – bez celého formuláře „Upravit“.
 * field: 'tenancySince' | 'end' | 'dueDay' | 'valorizationDate'. onSave(updates) dostane jen změněná pole.
 */
const czToIso = (cz) => { const d = parseDate(cz); return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '' }
const isoToCz = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${parseInt(d)}. ${parseInt(m)}. ${y}` }
const STD_DUE = ['15. den v měsíci', DUE_PREPAID, 'Dle vystavené faktury']

export default function QuickEditDialog({ field, contract: c, assetType, onSave, onClose }) {
  const [val, setVal] = useState(() => field === 'dueDay' ? (c.dueDay || '15. den v měsíci') : czToIso(c[field]))
  const [openEnd, setOpenEnd] = useState(field === 'end' && !c.end)
  const [dueMode, setDueMode] = useState(() => STD_DUE.includes(c.dueDay || '15. den v měsíci') ? (c.dueDay || '15. den v měsíci') : 'custom')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const META = {
    tenancySince: { icon: '🕰', title: 'V nájmu od', hint: 'Od kdy reálně trvá nájem (jen evidence – platby se nemění). Prázdné = dopočítá se ze smluv nájemce na předmětu.' },
    end: { icon: '⏹', title: 'Platnost do', hint: 'Poslední den nájmu. Mění konec smlouvy (upozornění „končí“, poslední měsíc plateb).' },
    dueDay: { icon: '📅', title: 'Splatnost', hint: 'Podle splatnosti se počítá „po splatnosti“.' },
    valorizationDate: assetType === 'residential'
      ? { icon: '📈', title: 'Poslední navýšení nájemného', hint: 'Od tohoto data běží rok, než lze nájem znovu navýšit. Prázdné = rok od začátku smlouvy (navýšení dodatkem se pozná samo).' }
      : { icon: '📈', title: 'Datum poslední valorizace', hint: 'Od tohoto data běží rok, než lze nájem znovu navýšit.' },
  }[field]

  const save = async (e) => {
    e?.preventDefault()
    let updates
    if (field === 'end') {
      if (!openEnd && !val) { setErr('Zadejte datum, nebo zaškrtněte „Na dobu neurčitou“.'); return }
      const s = parseDate(c.start)
      if (!openEnd && s && new Date(val) < s) { setErr('Konec je před začátkem smlouvy.'); return }
      updates = { end: openEnd ? '' : isoToCz(val) }
    } else if (field === 'dueDay') {
      const v = dueMode === 'custom' ? val.trim() : dueMode
      if (!v) { setErr('Zadejte splatnost.'); return }
      updates = { dueDay: v }
    } else if (field === 'valorizationDate') {
      updates = { valorizationDate: val ? isoToCz(val) : null, ...(val && assetType === 'commercial' ? { valorizationEnabled: 1 } : {}) }
    } else {
      updates = { [field]: val ? isoToCz(val) : null }
    }
    setBusy(true)
    await onSave(updates)
    setBusy(false)
    onClose()
  }

  const dateInput = (
    <input type="date" className="btn" autoFocus value={val} onChange={e => { setVal(e.target.value); setErr('') }}
      style={{ width: '100%', textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box' }} />
  )
  return (
    <DialogShell icon={META.icon} title={META.title} subtitle="Rychlá úprava" width={420} onClose={onClose} busy={busy}
      footer={<><button className="btn" onClick={onClose}>Zrušit</button><button className="btn btn-primary" type="submit" form="qe-form" disabled={busy}>Uložit</button></>}>
      <form id="qe-form" onSubmit={save}>
        {field === 'end' ? (
          <>
            {openEnd
              ? <div className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'default', fontWeight: 800, background: 'var(--tone-green-soft)', borderColor: 'var(--tone-green-border)', color: 'var(--tone-green-text)', boxSizing: 'border-box' }}>♾ Na dobu neurčitou</div>
              : dateInput}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text2)', cursor: 'pointer', marginTop: 8 }}>
              <input type="checkbox" checked={openEnd} onChange={e => { setOpenEnd(e.target.checked); setErr('') }} /> Na dobu neurčitou
            </label>
          </>
        ) : field === 'dueDay' ? (
          <>
            <select className="btn" value={dueMode} onChange={e => { setDueMode(e.target.value); if (e.target.value === 'custom' && STD_DUE.includes(val)) setVal(''); setErr('') }}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}>
              {STD_DUE.map(o => <option key={o} value={o}>{o}</option>)}
              <option value="custom">Jiná (např. „30. 4.“ u roční platby)…</option>
            </select>
            {dueMode === 'custom' && (
              <input className="btn" autoFocus value={val} onChange={e => { setVal(e.target.value); setErr('') }} placeholder="např. 30. 4. nebo 1. den v měsíci"
                style={{ width: '100%', textAlign: 'left', cursor: 'text', marginTop: 8, boxSizing: 'border-box' }} />
            )}
          </>
        ) : (
          <>
            {dateInput}
            {val && <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setVal('')}>Vymazat datum</button>}
          </>
        )}
        {err && <div style={{ color: 'var(--tone-red-text)', fontSize: 12.5, marginTop: 8, fontWeight: 600 }}>{err}</div>}
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>{META.hint}</div>
      </form>
    </DialogShell>
  )
}
