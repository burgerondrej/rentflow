import React, { useState } from 'react'
import { useApp } from './AppContext.jsx'

const SUBJECT_ORDER = [
  'Bürger Pavel – Parkování',
  'Bürger Pavel – Reklamní plochy',
  'JIHOTANK',
  'JIHOTANK CB',
  'METROPOLE CB – Komerční prostory',
  'METROPOLE CB – Novohradská 53/55',
  'METROPOLE CB – Novohradská 57a',
  'METROPOLE CB – Parkování',
  'METROPOLE CB – Reklamní plochy',
  'METROPOLE CB – Ubytovací jednotky',
]

const CONTRACT_TYPES = [
  { id: 'residential', icon: '🏠', label: 'Bytová jednotka',   sub: 'Obytný prostor',        gradient: 'linear-gradient(135deg, #166534 0%, #16a34a 60%, #22c55e 100%)' },
  { id: 'commercial',  icon: '🏢', label: 'Komerční prostor',  sub: 'Obchodní / kancelářský', gradient: 'linear-gradient(135deg, #3730a3 0%, #4f46e5 50%, #6d28d9 100%)' },
  { id: 'ads',         icon: '🪧', label: 'Reklamní plocha',   sub: 'Billboard / reklama',    gradient: 'linear-gradient(135deg, #c2410c 0%, #ea580c 60%, #f97316 100%)' },
  { id: 'parking',     icon: '🅿️', label: 'Parkovací stání',  sub: 'Parkování',              gradient: 'linear-gradient(135deg, #1e40af 0%, #2563eb 60%, #3b82f6 100%)' },
  { id: 'ostatni',     icon: '📄', label: 'Ostatní',           sub: 'Interní / skupinové',    gradient: 'linear-gradient(135deg, #0f766e 0%, #0d9488 60%, #14b8a6 100%)' },
]

function isoToCz(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${parseInt(d)}. ${parseInt(m)}. ${y}`
}

export default function ContractForm({ onClose }) {
  const { tenants, assets, addContract } = useApp()

  const [contractType, setContractType] = useState(null)
  const [revealed, setRevealed] = useState(false)

  const [formData, setFormData] = useState({
    tenantId: '', assetId: '',
    rent: '', deposit: '', cauce: '', parking: '', depositWater: '', flatFee: '', flatFeeEnabled: false,
    start: '', end: '',
    dueDay: '15. den v měsíci',
    dueDayCustom: '',
    terminationMonths: '',
    renewalMethod: 'Formou dodatku',
    valorizationEnabled: false,
    valorizationDate: '',
    contractVersion: 'Nová verze smlouvy',
    occupants: '',
    permanentResidents: '',
    paymentFrequency: 'Měsíčně',
    calendarYearBilling: false,
    contractNotes: '',
    includedParkingEnabled: false,
    includedParkingSpots: '',
    includedParkingRent: '',
    billingSubject: '',
    vatExempt: 0,
    groupLabel: '',
    autoRenewalType: '',
    rentTotal: '',
  })
  const set = (k, v) => setFormData(prev => ({ ...prev, [k]: v }))

  const handleTypeSelect = (type) => {
    setContractType(type)
    if (type === 'residential') set('terminationMonths', '3')
    setTimeout(() => setRevealed(true), 30)
  }

  const activeTenants = [...(tenants || [])]
    .filter(t => t.status !== 'archived')
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'cs'))

  const availableAssets = [...(assets || [])]
    .filter(a => a.status !== 'archived' && (!contractType || a.type === contractType))
    .sort((a, b) => {
      const iA = SUBJECT_ORDER.indexOf(a.subject), iB = SUBJECT_ORDER.indexOf(b.subject)
      const wA = iA === -1 ? 999 : iA, wB = iB === -1 ? 999 : iB
      if (wA !== wB) return wA - wB
      return (a.unit || '').localeCompare(b.unit || '', 'cs', { numeric: true, sensitivity: 'base' })
    })

  const renderAssetOptions = () => {
    const groupedAssets = {}
    availableAssets.forEach(a => {
      if (!groupedAssets[a.subject]) groupedAssets[a.subject] = []
      groupedAssets[a.subject].push(a)
    })
    const typeIcon = { residential: '🏠', commercial: '🏢', ads: '🪧', parking: '🅿️', ostatni: '📄' }
    return Object.entries(groupedAssets).map(([subject, assetsInGroup]) => {
      const needsSub = assetsInGroup.some(a => a.type === 'parking' || a.type === 'ads')
      if (needsSub) {
        const byLoc = {}
        assetsInGroup.forEach(a => {
          const loc = a.format || 'Ostatní'
          if (!byLoc[loc]) byLoc[loc] = []
          byLoc[loc].push(a)
        })
        return Object.entries(byLoc).map(([loc, locAssets]) => (
          <optgroup key={`${subject}|${loc}`} label={`${subject} · ${loc}`}>
            {locAssets.map(a => (
              <option key={a.id} value={a.id}>
                {typeIcon[a.type] || '📄'} {a.unit}{a.status !== 'free' ? ' (obsazeno)' : ''}
              </option>
            ))}
          </optgroup>
        ))
      }
      return (
        <optgroup key={subject} label={subject}>
          {assetsInGroup.map(a => (
            <option key={a.id} value={a.id}>
              {typeIcon[a.type] || '📄'} {a.unit}{a.status !== 'free' ? ' (obsazeno)' : ''}
            </option>
          ))}
        </optgroup>
      )
    })
  }

  const selectedConf = CONTRACT_TYPES.find(t => t.id === contractType)
  const totalRent = (Number(formData.rent) || 0) + (Number(formData.parking) || 0)
  const selectedAsset = (assets || []).find(a => a.id === formData.assetId)
  const effectiveSubject = formData.billingSubject || selectedAsset?.subject || ''
  const isDphSubject = formData.vatExempt === 2 ? true
    : formData.vatExempt === 1 ? false
    : !effectiveSubject.startsWith('Bürger Pavel')
  const isMetropoleParkingAsset = selectedAsset?.subject === 'METROPOLE CB – Parkování'
  const isMetropoleAdsAsset = selectedAsset?.subject === 'METROPOLE CB – Reklamní plochy'

  const subtractMonthsFromDate = (czDate, months) => {
    const parts = czDate.split('.').map(p => p.trim())
    if (parts.length !== 3) return null
    let d = parseInt(parts[0]) - 1  // subtract 1 day first
    let m = parseInt(parts[1]) - 1
    let y = parseInt(parts[2])
    // handle day underflow
    if (d < 1) { m--; if (m < 0) { m = 11; y-- }; d = new Date(y, m + 1, 0).getDate() }
    // subtract months
    m -= parseInt(months)
    while (m < 0) { m += 12; y-- }
    // clamp day to last day of target month
    const lastDay = new Date(y, m + 1, 0).getDate()
    d = Math.min(d, lastDay)
    return d + ". " + (m + 1) + ". " + y
  }
  const computeTerminationDate = () => {
    if (!formData.end || !formData.terminationMonths) return null
    return subtractMonthsFromDate(isoToCz(formData.end), formData.terminationMonths)
  }
  const terminationDate = computeTerminationDate()

  const handleSubmit = (e) => {
    e.preventDefault()
    const freqTypes = ['ads', 'parking', 'ostatni']
    const isParkingIncluded = contractType === 'parking' && formData.paymentFrequency === 'Zahrnuto v nájemném'
    addContract({
      tenantId: formData.tenantId,
      assetId: formData.assetId,
      rent: Number(formData.rent) || 0,
      deposit: contractType === 'residential' || contractType === 'commercial' ? (Number(formData.deposit) || 0) : 0,
      cauce: contractType === 'residential' || contractType === 'commercial' ? (Number(formData.cauce) || 0) : 0,
      depositWater: contractType === 'commercial' ? (Number(formData.depositWater) || 0) : 0,
      flatFee: contractType === 'commercial' && formData.flatFeeEnabled ? (Number(formData.flatFee) || 0) : 0,
      parking: contractType === 'residential' && formData.includedParkingEnabled ? (Number(formData.includedParkingRent) || 0) : 0,
      start: isParkingIncluded ? '' : isoToCz(formData.start),
      end: isParkingIncluded ? '' : isoToCz(formData.end),
      status: 'active',
      addenda: [],
      dueDay: isParkingIncluded ? null : ((formData.dueDay === 'Vlastní' || formData.dueDay === 'Konkrétní datum') ? formData.dueDayCustom : formData.dueDay),
      terminationMonths: formData.terminationMonths ? parseInt(formData.terminationMonths) : null,
      renewalMethod: formData.renewalMethod || null,
      valorizationEnabled: formData.valorizationEnabled ? 1 : 0,
      valorizationDate: formData.valorizationEnabled ? (formData.valorizationDate || null) : null,
      invoiceDue: null,
      contractVersion: contractType === 'residential' ? formData.contractVersion : null,
      occupants: contractType === 'residential' && formData.occupants ? parseInt(formData.occupants) : null,
      permanentResidents: contractType === 'residential' && formData.permanentResidents ? parseInt(formData.permanentResidents) : null,
      paymentFrequency: freqTypes.includes(contractType) ? formData.paymentFrequency : null,
      energySettlements: [],
      contractNotes: formData.contractNotes || null,
      includedParkingSpots: formData.includedParkingEnabled ? (parseInt(formData.includedParkingSpots) || 0) : 0,
      billingSubject: formData.billingSubject || null,
      vatExempt: formData.vatExempt || 0,
      groupLabel: formData.groupLabel || null,
      autoRenewalType: formData.autoRenewalType || null,
      rentTotal: Number(formData.rentTotal) || 0,
    })
    onClose()
  }

  // ── helpers ──
  const lbl = (text, req) => (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
      {text}{req && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
    </label>
  )
  const card = (icon, title, children) => (
    <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: '16px 18px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{title}</span>
      </div>
      {children}
    </div>
  )

  // ── shared blocks ──
  const sectionNajemce = card('👤', 'Nájemce a předmět nájmu',
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        {lbl('Nájemce', true)}
        <select className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
          value={formData.tenantId} onChange={e => set('tenantId', e.target.value)} required>
          <option value="">— Vyberte nájemce —</option>
          {activeTenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {activeTenants.length === 0 && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>Nejprve přidejte nájemce v sekci Nájemníci.</div>}
      </div>
      <div>
        {lbl('Předmět nájmu', true)}
        <select className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
          value={formData.assetId} onChange={e => set('assetId', e.target.value)} required>
          <option value="">— Vyberte předmět nájmu —</option>
          {renderAssetOptions()}
        </select>
        {availableAssets.length === 0 && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>Žádné volné předměty nájmu tohoto typu.</div>}
      </div>
    </div>
  )

  const splatnostField = (
    <div>
      {lbl('Splatnost nájemného')}
      <select className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
        value={['15. den v měsíci','Dle vystavené faktury','Konkrétní datum','Vlastní'].includes(formData.dueDay) ? formData.dueDay : 'Vlastní'}
        onChange={e => { set('dueDay', e.target.value); set('dueDayCustom', '') }}>
        <option value="15. den v měsíci">15. den v měsíci</option>
        <option value="Dle vystavené faktury">Dle vystavené faktury</option>
        <option value="Konkrétní datum">Konkrétní datum (vždy stejný den v roce)…</option>
        <option value="Vlastní">Vlastní text…</option>
      </select>
      {formData.dueDay === 'Vlastní' && (
        <input type="text" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text', marginTop: 8 }}
          placeholder="např. 1. den v měsíci" value={formData.dueDayCustom} onChange={e => set('dueDayCustom', e.target.value)} />
      )}
      {formData.dueDay === 'Konkrétní datum' && (() => {
        // Uložíme jen den a měsíc — rok se ignoruje (platí každý rok)
        const parseFixedDate = (val) => {
          if (!val) return ''
          // val = "DD.MM." nebo ISO "YYYY-MM-DD"
          if (val.includes('-')) {
            const [, m, d] = val.split('-')
            return `2000-${m}-${d}`
          }
          const parts = val.replace(/\.$/, '').split('.')
          if (parts.length >= 2) return `2000-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
          return ''
        }
        const toFixedDisplay = (isoVal) => {
          if (!isoVal) return ''
          const [, m, d] = isoVal.split('-')
          return `${parseInt(d)}. ${parseInt(m)}.`
        }
        const isoVal = parseFixedDate(formData.dueDayCustom)
        return (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Vyber den a měsíc (rok se ignoruje — datum platí každý rok):</div>
            <input type="date" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
              value={isoVal || '2000-01-01'}
              onChange={e => {
                const [, m, d] = e.target.value.split('-')
                set('dueDayCustom', `${parseInt(d)}. ${parseInt(m)}.`)
              }} />
            {formData.dueDayCustom && (
              <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, marginTop: 5 }}>
                Splatnost: vždy do {formData.dueDayCustom} daného roku
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )

  const zpusobProdlouzeni = (
    <div>
      {lbl('Způsob prodloužení smlouvy')}
      <select className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
        value={formData.renewalMethod} onChange={e => { set('renewalMethod', e.target.value); if (e.target.value !== 'Automatické prodloužení') set('autoRenewalType', ''); }}>
        <option value="Formou dodatku">Formou dodatku</option>
        <option value="Formou nové smlouvy">Formou nové smlouvy</option>
        {contractType === 'commercial' && <option value="Automatické prodloužení">Automatické prodloužení</option>}
      </select>
    </div>
  )

  const datumyField = (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          {lbl('Platnost od', true)}
          <input type="date" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
            value={formData.start} onChange={e => set('start', e.target.value)} required />
        </div>
        <div>
          {lbl('Platnost do')}
          <input type="date" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
            value={formData.end} onChange={e => set('end', e.target.value)} />
        </div>
      </div>
      {(formData.start || formData.end) && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
          {formData.start && `Od: ${isoToCz(formData.start)}`}{formData.start && formData.end && ' · '}{formData.end && `Do: ${isoToCz(formData.end)}`}
        </div>
      )}
    </>
  )

  const sectionParkingInRent = (
    <div style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="checkbox" id="incl-park" checked={formData.includedParkingEnabled}
          onChange={e => { set('includedParkingEnabled', e.target.checked); if (!e.target.checked) { set('includedParkingSpots', ''); set('includedParkingRent', '') } }}
          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }} />
        <label htmlFor="incl-park" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
          Nájemné zahrnuje parkovací stání
        </label>
      </div>
      {formData.includedParkingEnabled && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              {lbl('Počet parkovacích míst')}
              <input type="number" min="1" className="btn"
                style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                placeholder="1"
                value={formData.includedParkingSpots}
                onChange={e => set('includedParkingSpots', e.target.value)} />
            </div>
            <div>
              {lbl('Nájemné za parkování (Kč/měs)')}
              <input type="number" min="0" className="btn"
                style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                placeholder="0"
                value={formData.includedParkingRent}
                onChange={e => set('includedParkingRent', e.target.value)} />
            </div>
          </div>
          {((Number(formData.rent) || 0) + (Number(formData.includedParkingRent) || 0)) > 0 && (() => {
            const pLen = { 'Čtvrtletně': 3, 'Pololetně': 6, 'Ročně': 12 }[formData.paymentFrequency] || 1
            const periodTotal = (Number(formData.rent) || 0) + (Number(formData.includedParkingRent) || 0)
            const monthlyEq = periodTotal / pLen
            const isMulti = pLen > 1
            return (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>{isMulti ? `Měsíční ekvivalent nájemného` : 'Celkové měsíční nájemné'}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#166534' }}>
                  {monthlyEq.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} Kč / měsíc
                </span>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )

  const sectionPoznamka = card('💬', 'Poznámka ke smlouvě',
    <div>
      {lbl('Volitelná poznámka')}
      <textarea className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text', minHeight: 80, resize: 'vertical', lineHeight: 1.5, padding: '8px 12px' }}
        placeholder="Interní poznámka ke smlouvě, zvláštní podmínky..."
        value={formData.contractNotes} onChange={e => set('contractNotes', e.target.value)} />
    </div>
  )

  // ── TYPE-SPECIFIC SECTIONS ──
  const renderSections = () => {
    switch (contractType) {

      // ── BYTOVÁ JEDNOTKA ────────────────────────────────────────────────
      case 'residential': return (<>
        {sectionNajemce}

        {card('💰', 'Nájemné',
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                {(() => {
                  const freqLabelMap = { 'Čtvrtletně': 'Čtvrtletní nájemné (Kč)', 'Pololetně': 'Pololetní nájemné (Kč)', 'Ročně': 'Roční nájemné (Kč)' }
                  return lbl(freqLabelMap[formData.paymentFrequency] || 'Měsíční nájemné (Kč)', true)
                })()}
                <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                  value={formData.rent} onChange={e => set('rent', e.target.value)} required />
                {['Čtvrtletně','Pololetně','Ročně'].includes(formData.paymentFrequency) && (Number(formData.rent) || 0) > 0 && (() => {
                  const pLen = { 'Čtvrtletně': 3, 'Pololetně': 6, 'Ročně': 12 }[formData.paymentFrequency]
                  return <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text3)' }}>= <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{((Number(formData.rent) || 0) / pLen).toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} Kč / měsíc</span></div>
                })()}
              </div>
              <div>
                {lbl('Zálohy energií a služeb (Kč)')}
                <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                  value={formData.deposit} onChange={e => set('deposit', e.target.value)} />
              </div>
            </div>
            {/* Paušální poplatek energií */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 4 }}>
                <input type="checkbox" checked={formData.flatFeeEnabled}
                  onChange={e => set('flatFeeEnabled', e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Paušální poplatek energií a služeb</span>
              </label>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: formData.flatFeeEnabled ? 10 : 0, paddingLeft: 26 }}>
                Místo záloh — paušál se počítá jako součást nájmu (DPH 21 %).
              </div>
              {formData.flatFeeEnabled && (() => {
                const ffVal = Number(formData.flatFee) || 0
                return (
                  <div style={{ paddingLeft: 0 }}>
                    {lbl(isDphSubject ? 'Paušál bez DPH (Kč)' : 'Paušální poplatek (Kč)', true)}
                    <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                      value={formData.flatFee} onChange={e => set('flatFee', e.target.value)} />
                    {isDphSubject && ffVal > 0 && (
                      <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text3)' }}>
                        s DPH 21 %: <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{(ffVal * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
            <div>
              {lbl('Složená kauce (Kč)')}
              <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                value={formData.cauce} onChange={e => set('cauce', e.target.value)} />
            </div>
            {['Čtvrtletně','Pololetně','Ročně'].includes(formData.paymentFrequency) && (
              <div>
                {lbl('Celkové nájemné za dobu smlouvy (Kč)')}
                <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                  placeholder="Volitelné — pouze informativní" min="0"
                  value={formData.rentTotal} onChange={e => set('rentTotal', e.target.value)} />
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text3)' }}>Informativní pole — nevstupuje do výpočtů plateb.</div>
              </div>
            )}
            {sectionParkingInRent}
          </div>
        )}

        {card('📅', 'Platnost nájemní smlouvy',
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {datumyField}
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#166534' }}>
              📋 Výpovědní doba činí <strong>3 měsíce</strong> počítající se od 1. dne měsíce následujícího po obdržení výpovědi
            </div>
          </div>
        )}

        {card('📝', 'Podmínky nájemní smlouvy',
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {zpusobProdlouzeni}
            {splatnostField}
            <div>
              {lbl('Verze smlouvy')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {['Nová verze smlouvy', 'Stará verze smlouvy'].map(v => (
                  <button key={v} type="button"
                    onClick={() => set('contractVersion', v)}
                    style={{
                      padding: '10px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      border: formData.contractVersion === v ? '2px solid var(--accent)' : '2px solid var(--border)',
                      background: formData.contractVersion === v ? 'rgba(18,101,74,0.07)' : 'var(--bg)',
                      color: formData.contractVersion === v ? 'var(--accent)' : 'var(--text2)',
                      transition: 'all 0.15s ease',
                    }}>
                    {v === 'Nová verze smlouvy' ? '🆕 Nová verze' : '📜 Stará verze'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {card('👥', 'Počet osob a trvalé pobyty',
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              {lbl('Počet osob v bytě')}
              <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                min="0" placeholder="0" value={formData.occupants} onChange={e => set('occupants', e.target.value)} />
            </div>
            <div>
              {lbl('Z toho s trvalým bydlištěm')}
              <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                min="0" placeholder="0" value={formData.permanentResidents} onChange={e => set('permanentResidents', e.target.value)} />
            </div>
            {Number(formData.occupants) > 0 && Number(formData.permanentResidents) > Number(formData.occupants) && (
              <div style={{ gridColumn: '1/-1', fontSize: 11, color: '#EF4444' }}>Počet s trvalým bydlištěm nemůže přesáhnout celkový počet osob.</div>
            )}
          </div>
        )}
        {sectionPoznamka}
      </>)

      // ── KOMERČNÍ PROSTOR ───────────────────────────────────────────────
      case 'commercial': {
        const rentVal = Number(formData.rent) || 0
        const depEnergyVal = Number(formData.deposit) || 0
        const depWaterVal = Number(formData.depositWater) || 0
        return (<>
        {sectionNajemce}

        {card('💰', 'Nájemné',
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              {(() => {
                const freqLabelMap = { 'Čtvrtletně': 'Čtvrtletní nájemné', 'Pololetně': 'Pololetní nájemné', 'Ročně': 'Roční nájemné' }
                const base = freqLabelMap[formData.paymentFrequency] || 'Měsíční nájemné'
                return lbl(isDphSubject ? `${base} bez DPH (Kč)` : `${base} (Kč)`, true)
              })()}
              <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                value={formData.rent} onChange={e => set('rent', e.target.value)} required />
              {isDphSubject && rentVal > 0 && (
                <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text3)' }}>
                  s DPH: <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{(rentVal * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                </div>
              )}
              {['Čtvrtletně','Pololetně','Ročně'].includes(formData.paymentFrequency) && rentVal > 0 && (() => {
                const pLen = { 'Čtvrtletně': 3, 'Pololetně': 6, 'Ročně': 12 }[formData.paymentFrequency]
                const monthly = rentVal / pLen
                return <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text3)' }}>= <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{monthly.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} Kč / měsíc</span>{isDphSubject ? ` (${(monthly * 1.21).toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} Kč s DPH)` : ''}</div>
              })()}
            </div>
            {isDphSubject ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ marginBottom: 5 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Zálohy energií a služeb</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Bez DPH (Kč) <span style={{ color: '#EF4444' }}></span></div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>DPH 21 %</div>
                  </div>
                  <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                    value={formData.deposit} onChange={e => set('deposit', e.target.value)} />
                  {depEnergyVal > 0 && (
                    <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text3)' }}>
                      s DPH: <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{(depEnergyVal * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ marginBottom: 5 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Zálohy energií a služeb – Voda</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>a srážkovné bez DPH (Kč)</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>DPH 12 %</div>
                  </div>
                  <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                    value={formData.depositWater} onChange={e => set('depositWater', e.target.value)} />
                  {depWaterVal > 0 && (
                    <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text3)' }}>
                      s DPH: <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{(depWaterVal * 1.12).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div>
                {lbl('Zálohy energií a služeb (Kč)')}
                <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                  value={formData.deposit} onChange={e => set('deposit', e.target.value)} />
              </div>
            )}
            {/* Paušální poplatek energií */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 4 }}>
                <input type="checkbox" checked={formData.flatFeeEnabled}
                  onChange={e => set('flatFeeEnabled', e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Paušální poplatek energií a služeb</span>
              </label>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: formData.flatFeeEnabled ? 10 : 0, paddingLeft: 26 }}>
                Místo záloh — paušál se počítá jako součást nájmu (DPH 21 %).
              </div>
              {formData.flatFeeEnabled && (() => {
                const ffVal = Number(formData.flatFee) || 0
                return (
                  <div style={{ paddingLeft: 0 }}>
                    {lbl(isDphSubject ? 'Paušál bez DPH (Kč)' : 'Paušální poplatek (Kč)', true)}
                    <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                      value={formData.flatFee} onChange={e => set('flatFee', e.target.value)} />
                    {isDphSubject && ffVal > 0 && (
                      <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text3)' }}>
                        s DPH 21 %: <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{(ffVal * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
            <div>
              {lbl('Složená kauce (Kč)')}
              <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                value={formData.cauce} onChange={e => set('cauce', e.target.value)} />
            </div>
            {['Čtvrtletně','Pololetně','Ročně'].includes(formData.paymentFrequency) && (
              <div>
                {lbl('Celkové nájemné za dobu smlouvy (Kč)')}
                <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                  placeholder="Volitelné — pouze informativní" min="0"
                  value={formData.rentTotal} onChange={e => set('rentTotal', e.target.value)} />
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text3)' }}>Informativní pole — nevstupuje do výpočtů plateb.</div>
              </div>
            )}
            {sectionParkingInRent}
          </div>
        )}

        {card('📅', 'Platnost nájemní smlouvy',
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {datumyField}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                {lbl('Krajní termín podání výpovědi')}
                <select className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                  value={formData.terminationMonths} onChange={e => set('terminationMonths', e.target.value)}>
                  <option value="">— Nevyplněno —</option>
                  {[1,2,3,4,5,6,9,12].map(m => <option key={m} value={m}>{m} {m===1?'měsíc':m<5?'měsíce':'měsíců'} před koncem</option>)}
                </select>
              </div>
              <div>{splatnostField}</div>
            </div>
            {terminationDate && (
              <div style={{ fontSize: 12, background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '8px 12px', color: '#92400E', fontWeight: 600 }}>
                ⚠️ Krajní termín podání výpovědi: <strong>{terminationDate}</strong>
              </div>
            )}
          </div>
        )}

        {card('📝', 'Podmínky nájemní smlouvy',
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {zpusobProdlouzeni}
            {/* Automatické prodloužení */}
            {formData.renewalMethod === 'Automatické prodloužení' && (
            <div style={{ padding: '14px 16px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
              {lbl('Automatické prodloužení smlouvy')}
              <select className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                value={formData.autoRenewalType || ''}
                onChange={e => set('autoRenewalType', e.target.value)}>
                <option value="">— Bez automatického prodloužení —</option>
                <option value="repeat_2y">Automatické a opakované prodloužení o 2 roky</option>
                <option value="repeat_5y">Automatické a opakované prodloužení o 5 let</option>
                <option value="once_2y">Automatické (neopakované) prodloužení o 2 roky</option>
              </select>
              {formData.autoRenewalType && (
                <div style={{ marginTop: 8, background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400E' }}>
                  ⚠️ Pokud smlouva nebude ukončena nejpozději {formData.terminationMonths || 6} měsíců před koncem platnosti, RentFlow ji automaticky prodlouží při spuštění aplikace.
                </div>
              )}
            </div>
            )}
            <div style={{ padding: '14px 16px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: formData.valorizationEnabled ? 12 : 0 }}>
                <input type="checkbox" id="val-com" checked={formData.valorizationEnabled}
                  onChange={e => set('valorizationEnabled', e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                <label htmlFor="val-com" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
                  Valorizace nájemného je možná
                </label>
              </div>
              {formData.valorizationEnabled && (
                <div>
                  {lbl('Datum poslední valorizace')}
                  <input type="date" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                    value={formData.valorizationDate} onChange={e => set('valorizationDate', e.target.value)} />
                  {formData.valorizationDate && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Naposledy: {isoToCz(formData.valorizationDate)}</div>}
                </div>
              )}
            </div>
          </div>
        )}
        {sectionPoznamka}
      </>)
      }

      // ── REKLAMNÍ PLOCHA / PARKOVACÍ STÁNÍ / OSTATNÍ ────────────────────
      case 'ads':
      case 'parking':
      case 'ostatni': {
        const rentVal = Number(formData.rent) || 0
        const rentDph = rentVal * 1.21
        // Pro ostatní: showDph závisí na vybraném pronajímateli přes billingSubject
        const showDph = isDphSubject
        const freqLabel = { 'Měsíčně': 'měsíční', 'Čtvrtletně': 'čtvrtletní', 'Pololetně': 'pololetní', 'Ročně': 'roční' }[formData.paymentFrequency] || 'měsíční'
        const parkingIncluded = contractType === 'parking' && formData.paymentFrequency === 'Zahrnuto v nájemném'
        return (<>
          {sectionNajemce}

          {contractType === 'ostatni' && card('🏢', 'Pronajímatel',
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
                Vyberte, za který subjekt je smlouva uzavírána. Ovlivňuje DPH a zaúčtování příjmů.
              </div>
              {[
                { val: 'METROPOLE CB', label: 'METROPOLE CB', sub: 'Plátce DPH (21 %)' },
                { val: 'Bürger Pavel', label: 'Bürger Pavel', sub: 'Neplátce DPH' },
                { val: 'JIHOTANK',    label: 'JIHOTANK',     sub: 'Plátce DPH (21 %)' },
                { val: 'JIHOTANK CB', label: 'JIHOTANK CB',  sub: 'Plátce DPH (21 %)' },
              ].map(({ val, label, sub }) => {
                const selected = (formData.billingSubject || '') === val
                return (
                  <button key={val} type="button" onClick={() => set('billingSubject', val)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                      borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                      border: selected ? '2px solid var(--accent)' : '2px solid var(--border)',
                      background: selected ? 'rgba(18,101,74,0.07)' : 'var(--bg)',
                    }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {selected && <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)' }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: selected ? 'var(--accent)' : 'var(--text)' }}>{label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{sub}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {isMetropoleParkingAsset && card('🏢', 'Pronajímatel',
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
                Stání je evidováno pod METROPOLE CB – Parkování. Pokud je pronajímatelem Bürger Pavel, vyber níže — příjmy a DPH se zaúčtují správně.
              </div>
              {[
                { val: '', label: 'METROPOLE CB – Parkování', sub: 'Plátce DPH' },
                { val: 'Bürger Pavel – Parkování', label: 'Bürger Pavel – Parkování', sub: 'Neplátce DPH' },
              ].map(({ val, label, sub }) => {
                const selected = (formData.billingSubject || '') === val
                return (
                  <button key={val} type="button" onClick={() => set('billingSubject', val)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                      borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                      border: selected ? '2px solid var(--accent)' : '2px solid var(--border)',
                      background: selected ? 'rgba(18,101,74,0.07)' : 'var(--bg)',
                    }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {selected && <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)' }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: selected ? 'var(--accent)' : 'var(--text)' }}>{label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{sub}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {isMetropoleAdsAsset && card('🏢', 'Pronajímatel',
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
                Plocha je evidována pod METROPOLE CB – Reklamní plochy. Pokud je pronajímatelem Bürger Pavel, vyber níže — příjmy a DPH se zaúčtují správně.
              </div>
              {[
                { val: '', label: 'METROPOLE CB – Reklamní plochy', sub: 'Plátce DPH' },
                { val: 'Bürger Pavel – Reklamní plochy', label: 'Bürger Pavel – Reklamní plochy', sub: 'Neplátce DPH' },
              ].map(({ val, label, sub }) => {
                const selected = (formData.billingSubject || '') === val
                return (
                  <button key={val} type="button" onClick={() => set('billingSubject', val)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                      borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                      border: selected ? '2px solid var(--accent)' : '2px solid var(--border)',
                      background: selected ? 'rgba(18,101,74,0.07)' : 'var(--bg)',
                    }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {selected && <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)' }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: selected ? 'var(--accent)' : 'var(--text)' }}>{label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{sub}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {card('💰', 'Nájemné',
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                {lbl('Frekvence plateb')}
                <select className="btn" style={{ width: '100%', cursor: 'pointer' }}
                  value={formData.paymentFrequency} onChange={e => set('paymentFrequency', e.target.value)}>
                  {['Měsíčně', 'Čtvrtletně', 'Pololetně', 'Ročně'].map(f => <option key={f}>{f}</option>)}
                  {contractType === 'parking' && <option value="Zahrnuto v nájemném">Zahrnuto v nájemném</option>}
                </select>
              </div>
              {!parkingIncluded && (
                <div>
                  {lbl('DPH')}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { val: 0, label: 'Dle subjektu', icon: '🔄' },
                      { val: 2, label: 'S DPH (21 %)', icon: '📋' },
                      { val: 1, label: 'Bez DPH', icon: '🚫' },
                    ].map(({ val, label, icon }) => {
                      const sel = (formData.vatExempt || 0) === val
                      return (
                        <button key={val} type="button" onClick={() => set('vatExempt', val)}
                          style={{ flex: 1, padding: '8px 6px', borderRadius: 9, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                            border: sel ? '2px solid var(--accent)' : '2px solid var(--border)',
                            background: sel ? 'rgba(18,101,74,0.08)' : 'var(--bg)',
                            color: sel ? 'var(--accent)' : 'var(--text2)',
                          }}>
                          <div>{icon}</div>
                          <div style={{ marginTop: 3 }}>{label}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {parkingIncluded ? (
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#166534' }}>
                  🅿️ Parkovací stání je zahrnuto v nájemném — částka se nezadává.
                </div>
              ) : (
                <div>
                  {lbl(`${showDph ? 'Nájemné bez DPH' : 'Nájemné'} — ${freqLabel} (Kč)`, contractType !== 'parking')}
                  <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                    min="0" placeholder="0"
                    value={formData.rent} onChange={e => set('rent', e.target.value)}
                    {...(contractType !== 'parking' ? { required: true } : {})} />
                  {['Čtvrtletně','Pololetně','Ročně'].includes(formData.paymentFrequency) && (Number(formData.rent) || 0) > 0 && (() => {
                    const pLen = { 'Čtvrtletně': 3, 'Pololetně': 6, 'Ročně': 12 }[formData.paymentFrequency]
                    const monthly = (Number(formData.rent) || 0) / pLen
                    return <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text3)' }}>= <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{monthly.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} Kč / měsíc</span></div>
                  })()}
                  {showDph && (Number(formData.rent) || 0) > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>s DPH (21 %):</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{((Number(formData.rent) || 0) * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                    </div>
                  )}
                </div>
              )}
              {!parkingIncluded && ['Čtvrtletně','Pololetně','Ročně'].includes(formData.paymentFrequency) && (
                <div>
                  {lbl('Celkové nájemné za dobu smlouvy (Kč)')}
                  <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                    placeholder="Volitelné — pouze informativní" min="0"
                    value={formData.rentTotal} onChange={e => set('rentTotal', e.target.value)} />
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text3)' }}>Informativní pole — nevstupuje do výpočtů plateb.</div>
                </div>
              )}
            </div>
          )}

          {parkingIncluded ? (
            card('📅', 'Platnost nájemní smlouvy',
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#166534' }}>
                🅿️ Platnost se řídí příslušnou nájemní smlouvou — parkovací stání je zahrnuto v nájemném.
              </div>
            )
          ) : (
            card('📅', 'Platnost nájemní smlouvy',
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {datumyField}
                {splatnostField}
              </div>
            )
          )}

          {card('📝', 'Podmínky nájemní smlouvy',
            parkingIncluded
              ? <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#166534' }}>
                  🅿️ Způsob prodloužení smlouvy se řídí nadřazenou smlouvou — parkovací stání je zahrnuto v nájemném.
                </div>
              : zpusobProdlouzeni
          )}
          {contractType === 'commercial' && card('🔗', 'Skupina smluv',
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                Pokud tento komerční prostor sdílí jednu smlouvu s dalšími prostory (např. více kanceláří pod jednou smlouvou), zadej stejný název skupiny do všech příslušných smluv. V platbách se pak zobrazí jako jedna souhrnná položka.
              </div>
              {lbl('Název skupiny (např. „Kanceláře – Loxone 2024")')}
              <input type="text" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                placeholder="např. Loxone – kanceláře 2024"
                value={formData.groupLabel}
                onChange={e => set('groupLabel', e.target.value)} />
            </div>
          )}
          {contractType === 'parking' && card('🔗', 'Skupina smluv',
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                Pokud je toto stání součástí skupiny více stání pod jednou smlouvou, zadej stejný název skupiny do všech příslušných smluv. V platbách se pak zobrazí jako jedna souhrnná položka.
              </div>
              {lbl('Název skupiny (např. „Smlouva č. 15/2024 – Loxone")')}
              <input type="text" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                placeholder="např. Loxone – parkování 2024"
                value={formData.groupLabel}
                onChange={e => set('groupLabel', e.target.value)} />
            </div>
          )}
          {contractType === 'ads' && card('🔗', 'Skupina smluv',
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                Pokud je tato reklamní plocha součástí skupiny více ploch pod jednou smlouvou, zadej stejný název skupiny do všech příslušných smluv. V platbách se pak zobrazí jako jedna souhrnná položka.
              </div>
              {lbl('Název skupiny (např. „Smlouva č. 3/2024 – Billboard")')}
              <input type="text" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }}
                placeholder="např. Billboard – Hyundai 2024"
                value={formData.groupLabel}
                onChange={e => set('groupLabel', e.target.value)} />
            </div>
          )}
          {sectionPoznamka}
        </>)
      }

      default: return null
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: 'var(--bg)', borderRadius: 16, width: '100%', maxWidth: 560,
        zIndex: 1001, boxShadow: '0 32px 64px -12px rgba(0,0,0,0.25)', maxHeight: '92vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        {/* Gradient header */}
        <div style={{ background: selectedConf?.gradient || 'linear-gradient(135deg, #334155 0%, #475569 100%)', padding: '22px 28px 20px', flexShrink: 0, transition: 'background 0.4s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.18)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                {selectedConf?.icon || '📋'}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Nová smlouva</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 }}>
                  {selectedConf ? `${selectedConf.label} — ${selectedConf.sub}` : 'Vyberte typ předmětu nájmu'}
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <form onSubmit={handleSubmit} style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Rozcestník */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {CONTRACT_TYPES.map(({ id, icon, label }) => {
                const isSelected = contractType === id
                return (
                  <button key={id} type="button" onClick={() => handleTypeSelect(id)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 6, padding: '14px 8px', borderRadius: 12, cursor: 'pointer',
                      border: isSelected ? '2px solid var(--accent)' : '2px solid var(--border)',
                      background: isSelected ? 'rgba(18,101,74,0.07)' : 'var(--bg2)',
                      boxShadow: isSelected ? '0 0 0 3px rgba(18,101,74,0.1)' : 'none',
                      transition: 'all 0.18s ease',
                    }}>
                    <span style={{ fontSize: 22 }}>{icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: isSelected ? 'var(--accent)' : 'var(--text2)', textAlign: 'center', lineHeight: 1.3, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</span>
                  </button>
                )
              })}
            </div>

            {/* Animovaný rozvoj */}
            <div style={{
              overflow: 'hidden',
              maxHeight: revealed ? '4000px' : '0px',
              opacity: revealed ? 1 : 0,
              transition: 'max-height 0.45s cubic-bezier(0.45,0,0.35,1), opacity 0.3s ease',
              display: 'flex', flexDirection: 'column', gap: 16
            }}>
              {renderSections()}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingBottom: 4 }}>
                <button type="button" className="btn" onClick={onClose}>Zrušit</button>
                <button type="submit" className="btn btn-primary" style={{ minWidth: 160 }}>✓ Vytvořit smlouvu</button>
              </div>
            </div>

            {!contractType && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={onClose}>Zrušit</button>
              </div>
            )}
          </form>
        </div>
      </div>
    </>
  )
}
