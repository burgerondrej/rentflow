import React, { useState } from 'react'
import { useApp } from './AppContext.jsx'
import DialogShell from './DialogShell.jsx'
import { Segmented } from './UI.jsx'
import { parseDate, toCzDate, getEffectiveValuesToday, contractSubject, ASSET_TYPES } from './utils.js'

const dateToIso = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''
const isoToDate = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return y && m && d ? new Date(y, m - 1, d) : null }
const fmt = (v) => Math.round(Number(v) || 0).toLocaleString('cs-CZ')
const FREQ_LABEL = { 'Čtvrtletně': 'čtvrtletní', 'Pololetně': 'pololetní', 'Ročně': 'roční' }

/**
 * Změna nájemce na předmětu (průvodce ve 3 krocích): předávka → nový nájemce → podmínky a kontrola.
 * Stará smlouva se ukončí ke dni před předávkou, nová vznikne na stejném předmětu (changeTenant v AppContext).
 */
export default function ChangeTenantDialog({ contract, onClose, onDone }) {
  const { tenants = [], assets = [], changeTenant, addTenant, showToast } = useApp()
  const asset = assets.find(a => a.id === contract.assetId)
  const oldTenant = tenants.find(t => t.id === contract.tenantId)
  const ev = getEffectiveValuesToday(contract)
  const isIncluded = contract.paymentFrequency === 'Zahrnuto v nájemném'

  const [step, setStep] = useState(1)
  const [startIso, setStartIso] = useState(() => {
    const e = parseDate(contract.end)
    const t = new Date(); t.setHours(0, 0, 0, 0)
    return dateToIso(e && e >= t ? new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1) : t)
  })
  const [mode, setMode] = useState('existing') // existing | new
  const [tenantId, setTenantId] = useState('')
  const [newT, setNewT] = useState({ name: '', phone: '', email: '', tenantType: 'person' })
  const [rent, setRent] = useState(String(ev.rent))
  const [cauce, setCauce] = useState('')
  const [endIso, setEndIso] = useState('')
  const [keepDeposits, setKeepDeposits] = useState(true)
  const [keepGroup, setKeepGroup] = useState(false)
  const [saving, setSaving] = useState(false)

  const start = isoToDate(startIso)
  const end = isoToDate(endIso)
  const dayBefore = start ? new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1) : null
  const oldStart = parseDate(contract.start)
  const oldEnd = parseDate(contract.end)
  const candidates = tenants.filter(t => t.id !== contract.tenantId && t.status !== 'archived')
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'cs'))
  const chosenName = mode === 'new' ? newT.name.trim() : (tenants.find(t => t.id === tenantId)?.name || '')

  const errs1 = []
  if (!start) errs1.push('Zadejte datum předávky (začátek nové smlouvy).')
  if (start && oldStart && start <= oldStart) errs1.push('Předávka musí být po začátku stávající smlouvy.')
  const errs2 = []
  if (mode === 'existing' && !tenantId) errs2.push('Vyberte nového nájemce.')
  if (mode === 'new' && !newT.name.trim()) errs2.push('Vyplňte jméno nového nájemce.')
  if (mode === 'new' && tenants.some(t => (t.name || '').trim().toLowerCase() === newT.name.trim().toLowerCase())) errs2.push('Nájemce s tímto jménem už existuje – vyberte ho ze seznamu.')
  const errs3 = []
  if (!isIncluded && (rent === '' || isNaN(Number(rent)) || Number(rent) < 0)) errs3.push('Vyplňte nájemné.')
  if (start && end && end < start) errs3.push('Konec nové smlouvy je před jejím začátkem.')
  const errs = step === 1 ? errs1 : step === 2 ? errs2 : errs3

  const handleConfirm = async () => {
    if ([...errs1, ...errs2, ...errs3].length || saving) return
    setSaving(true)
    let tid = tenantId
    if (mode === 'new') {
      tid = await addTenant({ id: '', name: newT.name.trim(), phone: newT.phone.trim() || null, email: newT.email.trim() || null, tenantType: newT.tenantType, status: 'active', tags: [] })
      if (!tid) { setSaving(false); return }
    }
    const ok = await changeTenant({ old: contract, tenantId: tid, start, end, rent, cauce, keepDeposits, keepGroup })
    setSaving(false)
    if (ok) {
      showToast(`Změna nájemce uložena: ${chosenName} od ${toCzDate(start)}.`, 'success')
      onDone ? onDone() : onClose()
    }
  }

  const stepPill = (n, label) => (
    <div style={{ flex: 1, fontSize: 11.5, fontWeight: 700, padding: '6px 8px', borderRadius: 8, textAlign: 'center',
      background: step === n ? 'var(--accent)' : step > n ? 'var(--tone-green-soft)' : 'var(--bg)',
      color: step === n ? '#fff' : step > n ? 'var(--tone-green-text)' : 'var(--text3)',
      border: `1px solid ${step === n ? 'var(--accent)' : step > n ? 'var(--tone-green-border)' : 'var(--border)'}` }}>{step > n ? '✓ ' : `${n} `}{label}</div>
  )
  const box = (caption, name, sub, green) => (
    <div style={{ border: `1.5px solid ${green ? 'var(--tone-green-border)' : 'var(--border)'}`, background: green ? 'var(--tone-green-soft)' : 'var(--bg)', borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700 }}>{caption}</div>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || '—'}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>{sub}</div>
    </div>
  )
  const check = (on, set, label, hint) => (
    <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, color: 'var(--text)', margin: '8px 0', cursor: 'pointer' }}>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ marginTop: 2, cursor: 'pointer' }} />
      <span>{label}{hint && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text3)' }}>{hint}</span>}</span>
    </label>
  )
  const inp = { width: '100%', textAlign: 'left', cursor: 'text', boxSizing: 'border-box' }
  const typeIcon = ASSET_TYPES[asset?.type]?.icon || '📄'

  const footer = (
    <>
      {errs.length > 0 && <div style={{ flex: 1, fontSize: 12, color: '#DC2626', fontWeight: 600 }}>{errs[0]}</div>}
      {step > 1 && <button className="btn" disabled={saving} onClick={() => setStep(step - 1)}>← Zpět</button>}
      <button className="btn" disabled={saving} onClick={onClose}>Zrušit</button>
      {step < 3
        ? <button className="btn btn-primary" disabled={errs.length > 0} style={{ opacity: errs.length ? 0.5 : 1 }} onClick={() => setStep(step + 1)}>Pokračovat →</button>
        : <button className="btn btn-primary" disabled={errs.length > 0 || saving} style={{ opacity: errs.length || saving ? 0.5 : 1 }} onClick={handleConfirm}>{saving ? '⏳ Ukládám…' : '✓ Provést změnu nájemce'}</button>}
    </>
  )

  return (
    <DialogShell icon="👤" title="Změna nájemce" subtitle={`${typeIcon} ${asset?.unit || '—'} · ${contractSubject(contract, assets)}`}
      width={640} onClose={onClose} busy={saving} footer={footer} bodyStyle={{ padding: 0 }}>
      <div style={{ display: 'flex', gap: 6, padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
        {stepPill(1, 'Předávka')}{stepPill(2, 'Nový nájemce')}{stepPill(3, 'Podmínky a kontrola')}
      </div>
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 30px minmax(0,1fr)', gap: 8, alignItems: 'center', marginBottom: 14 }}>
          {box('Odchází', oldTenant?.name, dayBefore ? `poslední den nájmu ${toCzDate(dayBefore)}` : '—')}
          <div style={{ textAlign: 'center', fontSize: 20, color: 'var(--accent)' }}>➜</div>
          {box('Přichází', chosenName || (step < 2 ? 'vyberete v kroku 2' : '—'), start ? `od ${toCzDate(start)}` : '—', true)}
        </div>

        {step === 1 && (
          <div>
            <label className="dlg-lbl">Datum předávky = první den nové smlouvy *</label>
            <input type="date" className="btn" style={{ ...inp, cursor: 'pointer', maxWidth: 260 }} value={startIso} onChange={e => setStartIso(e.target.value)} />
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 12, lineHeight: 1.6 }}>
              • Stávající smlouva se ukončí k <b>{dayBefore ? toCzDate(dayBefore) : '—'}</b>
              {oldEnd && dayBefore && oldEnd < dayBefore && <span style={{ color: 'var(--tone-amber-text)' }}> (už končí {contract.end} – mezi smlouvami bude mezera)</span>}.<br />
              • V měsíci předávky se nájem krátí podle dní, zálohy platí oba nájemci v plné výši.<br />
              • Před změnou se automaticky udělá záloha databáze.
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <Segmented size="sm" value={mode} onChange={setMode} style={{ marginBottom: 12 }}
              items={[{ id: 'existing', label: 'Existující nájemce' }, { id: 'new', label: '+ Nový nájemce' }]} />
            {mode === 'existing' ? (
              <>
                <label className="dlg-lbl">Nájemce *</label>
                <select className="btn" style={{ ...inp, cursor: 'pointer' }} value={tenantId} onChange={e => setTenantId(e.target.value)}>
                  <option value="">— Vyberte nájemce —</option>
                  {candidates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="dlg-lbl">Jméno / název *</label>
                  <input className="btn" style={inp} value={newT.name} onChange={e => setNewT({ ...newT, name: e.target.value })} />
                </div>
                <div style={{ marginTop: 10 }}>
                  <label className="dlg-lbl">Telefon</label>
                  <input className="btn" style={inp} value={newT.phone} onChange={e => setNewT({ ...newT, phone: e.target.value })} />
                </div>
                <div style={{ marginTop: 10 }}>
                  <label className="dlg-lbl">E-mail</label>
                  <input className="btn" style={inp} value={newT.email} onChange={e => setNewT({ ...newT, email: e.target.value })} />
                </div>
                <div style={{ marginTop: 10 }}>
                  <label className="dlg-lbl">Typ</label>
                  <select className="btn" style={{ ...inp, cursor: 'pointer' }} value={newT.tenantType} onChange={e => setNewT({ ...newT, tenantType: e.target.value })}>
                    <option value="person">Fyzická osoba</option>
                    <option value="company">Firma</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>Další údaje (IČO, adresa, účet…) doplníte později v detailu nájemce.</div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
              <div>
                <label className="dlg-lbl">Nájemné {FREQ_LABEL[contract.paymentFrequency] || 'měsíční'} (Kč)</label>
                {isIncluded ? <div style={{ fontSize: 13, color: 'var(--text3)', paddingTop: 8 }}>zahrnuto v nájemném</div>
                  : <input type="number" min={0} className="btn" style={inp} value={rent} onChange={e => setRent(e.target.value)} />}
              </div>
              <div>
                <label className="dlg-lbl">Složená kauce (Kč)</label>
                <input type="number" min={0} className="btn" style={inp} value={cauce} onChange={e => setCauce(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="dlg-lbl">Konec smlouvy</label>
                <input type="date" className="btn" style={{ ...inp, cursor: 'pointer' }} value={endIso} onChange={e => setEndIso(e.target.value)} />
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', margin: '4px 0 10px' }}>Prázdný konec = na dobu neurčitou.</div>
            {(ev.deposit > 0 || ev.depositWater > 0) && check(keepDeposits, setKeepDeposits,
              `Převzít zálohy (${fmt(ev.deposit)} Kč${ev.depositWater > 0 ? ` + voda ${fmt(ev.depositWater)} Kč` : ''})`,
              'V měsíci předávky je platí oba nájemci v plné výši.')}
            {contract.groupLabel && check(keepGroup, setKeepGroup, `Ponechat ve skupině plateb „${contract.groupLabel}“`, 'Výchozí vypnuto – skupina obvykle patří původnímu nájemci.')}
            <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6 }}>
              <b style={{ color: 'var(--text)' }}>Převezme se:</b> předmět, pronajímatel, frekvence a splatnost plateb, paušál {ev.flatFee > 0 ? `(${fmt(ev.flatFee)} Kč)` : ''}{ev.parking > 0 ? `, parkování (${fmt(ev.parking)} Kč)` : ''}, DPH a typ smlouvy, pořadí v Platbách.<br />
              <b style={{ color: 'var(--text)' }}>Nepřevezme se:</b> dodatky, dokumenty, osoby v bytě, poznámky a vyúčtování energií.
            </div>
          </div>
        )}
      </div>
    </DialogShell>
  )
}
