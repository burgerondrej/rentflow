import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useApp } from '../AppContext.jsx'
import { save } from '@tauri-apps/api/dialog'
import { invoke } from '@tauri-apps/api/tauri'

const MONTHS = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec']

// ─── Modal pro výběr měsíců u čtvrtletní/pololetní platby ──────────────────
function PeriodMonthPickerModal({ contract, preselectedKeys, onConfirm, onClose }) {
  const MONTHS_CZ = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec']
  const freq = contract.paymentFrequency || ''
  const periodLen = freq === 'Čtvrtletně' ? 3 : 6

  // Sestavíme nabídku měsíců: rozsah trvání smlouvy ± buffer
  const parseD = (s) => {
    if (!s) return null
    const p = s.split('.').map(x => x.trim())
    if (p.length === 3) return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]))
    return null
  }
  const contractStart = parseD(contract.start) || new Date(new Date().getFullYear(), 0, 1)
  const contractEnd   = parseD(contract.end)   || new Date(contractStart.getFullYear() + 2, 11, 31)

  // Vygeneruj všechny měsíce v rozsahu smlouvy
  const allMonths = []
  const cur = new Date(contractStart.getFullYear(), contractStart.getMonth(), 1)
  const endLimit = new Date(contractEnd.getFullYear(), contractEnd.getMonth(), 1)
  while (cur <= endLimit) {
    allMonths.push(`${cur.getFullYear()}-${cur.getMonth()}`)
    cur.setMonth(cur.getMonth() + 1)
  }

  const [selected, setSelected] = useState(new Set(preselectedKeys))
  const today = new Date()
  const [date, setDate]   = useState(today.toISOString().split('T')[0])
  const [note, setNote]   = useState('')
  const rentPerMonth = ((Number(contract.rent) || 0) + (Number(contract.parking) || 0) + (Number(contract.flatFee) || 0)) / periodLen

  const toggle = (key) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const formatKey = (key) => {
    const [yr, mo] = key.split('-').map(Number)
    return `${MONTHS_CZ[mo]} ${yr}`
  }

  const selectedCount = selected.size
  const totalAmount = rentPerMonth * selectedCount

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg)', borderRadius: 16, padding: 28, width: 420, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.25)', animation: 'modalIn 0.18s ease' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Vybrat uhrazené měsíce</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>
          {contract.tenantName && <span style={{ fontWeight: 600, color: 'var(--text2)' }}>{contract.tenantName}</span>}
          {contract.tenantName && ' · '}
          <span style={{ background: 'var(--bg2)', padding: '2px 8px', borderRadius: 6, fontWeight: 600, color: 'var(--accent)' }}>{freq}</span>
          <span style={{ marginLeft: 8, color: 'var(--text3)' }}>{rentPerMonth.toLocaleString('cs-CZ')} Kč / měsíc</span>
        </div>

        {/* Mřížka měsíců */}
        <div style={{ overflowY: 'auto', flex: 1, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
            {allMonths.map(key => {
              const isOn = selected.has(key)
              return (
                <button key={key} type="button" onClick={() => toggle(key)}
                  style={{ padding: '8px 6px', borderRadius: 8, fontSize: 12, fontWeight: isOn ? 700 : 500, cursor: 'pointer', border: isOn ? '1.5px solid var(--accent)' : '1px solid var(--border)', background: isOn ? 'var(--accent)' : 'var(--bg2)', color: isOn ? '#fff' : 'var(--text2)', transition: '0.12s', textAlign: 'center' }}>
                  {formatKey(key)}
                </button>
              )
            })}
          </div>
        </div>

        {/* Souhrn */}
        <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>Vybráno {selectedCount} měs. × {rentPerMonth.toLocaleString('cs-CZ')} Kč</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{totalAmount.toLocaleString('cs-CZ')} Kč</span>
        </div>

        {/* Datum */}
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Termín přijetí platby</label>
        <input type="date" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'var(--bg2)', marginBottom: 12, boxSizing: 'border-box' }}
          value={date} onChange={e => setDate(e.target.value)} />

        {/* Poznámka */}
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          Poznámka <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text3)' }}>(nepovinné)</span>
        </label>
        <textarea className="btn" rows={2} placeholder="Např. hotovost, přeplatek…"
          style={{ width: '100%', resize: 'vertical', textAlign: 'left', cursor: 'text', background: 'var(--bg2)', marginBottom: 16, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, padding: '8px 12px' }}
          value={note} onChange={e => setNote(e.target.value)} />

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>Zrušit</button>
          <button className="btn" style={{ flex: 2, background: selectedCount > 0 ? '#16A34A' : '#9CA3AF', color: '#fff', border: 'none', fontWeight: 700 }}
            onClick={() => { if (selectedCount > 0) onConfirm(date, totalAmount, note, Array.from(selected)) }}
            disabled={selectedCount === 0}>
            ✓ Potvrdit úhradu ({selectedCount} měs.)
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal pro zadání data přijetí platby ───────────────────────────────────
function PaymentDateModal({ contract, fullAmount, onConfirm, onClose, monthLabel }) {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate]       = useState(today)
  const [partial, setPartial] = useState(false)
  const [amount, setAmount]   = useState(String(fullAmount || ''))
  const [note, setNote]       = useState('')

  const handleConfirm = () => {
    const finalAmount = partial ? (Number(amount) || 0) : fullAmount
    onConfirm(date, finalAmount, note)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg)', borderRadius: 16, padding: 28, width: 360, boxShadow: '0 20px 50px rgba(0,0,0,0.25)', animation: 'modalIn 0.18s ease' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Potvrdit úhradu</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: monthLabel ? 6 : 20 }}>
          {contract.tenantName && <span style={{ fontWeight: 600, color: 'var(--text2)' }}>{contract.tenantName}</span>}
          {contract.tenantName && ' · '}
          {(fullAmount || 0).toLocaleString('cs-CZ')} Kč
        </div>
        {monthLabel && (
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', background: 'var(--bg2)', borderRadius: 8, padding: '5px 10px', marginBottom: 16, display: 'inline-block' }}>
            📅 {monthLabel}
          </div>
        )}

        {/* Způsob úhrady */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[{ val: false, label: 'Plně uhrazeno' }, { val: true, label: 'Částečně uhrazeno' }].map(opt => (
            <button key={String(opt.val)} type="button" onClick={() => { setPartial(opt.val); if (!opt.val) setAmount(String(fullAmount || '')) }}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: partial === opt.val ? '1.5px solid var(--accent)' : '1px solid var(--border)', background: partial === opt.val ? 'var(--accent)' : 'var(--bg2)', color: partial === opt.val ? '#fff' : 'var(--text2)', transition: '0.15s' }}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Částka – editovatelná jen při částečné úhradě */}
        {partial && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Uhrazená částka (Kč)
            </label>
            <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text', background: 'var(--bg2)', boxSizing: 'border-box', borderColor: '#F59E0B' }}
              value={amount} onChange={e => setAmount(e.target.value)} min={0} />
            {Number(amount) < (fullAmount || 0) && Number(amount) > 0 && (
              <div style={{ fontSize: 11, color: '#D97706', marginTop: 4, fontWeight: 600 }}>
                Zbývá doplatit: {((fullAmount || 0) - Number(amount)).toLocaleString('cs-CZ')} Kč
              </div>
            )}
          </div>
        )}

        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          Termín přijetí platby
        </label>
        <input type="date" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'var(--bg2)', marginBottom: 16, boxSizing: 'border-box' }}
          value={date} onChange={e => setDate(e.target.value)} />

        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          Poznámka <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text3)' }}>(nepovinné)</span>
        </label>
        <textarea
          className="btn"
          rows={2}
          placeholder="Např. hotovost, přeplatek, splátkový kalendář…"
          style={{ width: '100%', resize: 'vertical', textAlign: 'left', cursor: 'text', background: 'var(--bg2)', marginBottom: 20, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, padding: '8px 12px' }}
          value={note}
          onChange={e => setNote(e.target.value)}
        />

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>Zrušit</button>
          <button className="btn" style={{ flex: 2, background: partial ? '#D97706' : '#16A34A', color: '#fff', border: 'none', fontWeight: 700 }}
            onClick={handleConfirm}>
            ✓ {partial ? 'Potvrdit částečnou úhradu' : 'Potvrdit úhradu'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Modal pro bytové subjekty: nejdřív se ptá zda přišlo nájemné+zálohy dohromady nebo odděleně
function CombinedPaymentModal({ contract, rentAmount, depositAmount, onConfirm, onClose, monthLabel }) {
  const today = new Date().toISOString().split('T')[0]
  const [step, setStep] = useState('ask') // 'ask' | 'together' | 'separate'
  const [sharedDate, setSharedDate] = useState(today)
  const [rentDate, setRentDate]     = useState(today)
  const [depDate, setDepDate]       = useState(today)
  const [note, setNote]             = useState('')
  const hasDeposit = depositAmount > 0

  const handleTogether = () => {
    if (!hasDeposit) { onConfirm([{ type: 'rent', date: sharedDate, amount: rentAmount, note }]); return }
    setStep('together')
  }
  const handleSeparate = () => setStep('separate')

  const confirmTogether = () => {
    const res = [{ type: 'rent', date: sharedDate, amount: rentAmount, note }]
    if (hasDeposit) res.push({ type: 'deposit', date: sharedDate, amount: depositAmount, note })
    onConfirm(res)
  }
  const [rentPaid, setRentPaid]   = useState(true)
  const [depPaid, setDepPaid]     = useState(true)

  const confirmSeparate = () => {
    const res = []
    if (rentPaid) res.push({ type: 'rent', date: rentDate, amount: rentAmount, note })
    if (hasDeposit && depPaid) res.push({ type: 'deposit', date: depDate, amount: depositAmount, note })
    if (res.length > 0) onConfirm(res)
    else onClose()
  }

  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }
  const inputStyle = { width: '100%', textAlign: 'left', cursor: 'pointer', background: 'var(--bg2)', marginBottom: 16, boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg)', borderRadius: 16, padding: 28, width: 380, boxShadow: '0 20px 50px rgba(0,0,0,0.25)', animation: 'modalIn 0.18s ease' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Potvrdit úhradu</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: monthLabel ? 6 : 16 }}>
          <span style={{ fontWeight: 600, color: 'var(--text2)' }}>{contract.tenantName}</span>
        </div>
        {monthLabel && (
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', background: 'var(--bg2)', borderRadius: 8, padding: '5px 10px', marginBottom: 16, display: 'inline-block' }}>
            📅 {monthLabel}
          </div>
        )}

        {step === 'ask' && (
          <>
            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, marginBottom: 16 }}>
              Přišlo nájemné{hasDeposit ? ' a zálohy' : ''} dohromady nebo odděleně?
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 3 }}>Nájemné</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{rentAmount.toLocaleString('cs-CZ')} Kč</div>
              </div>
              {hasDeposit && (
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 3 }}>Zálohy</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{depositAmount.toLocaleString('cs-CZ')} Kč</div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" style={{ flex: 1 }} onClick={onClose}>Zrušit</button>
              {hasDeposit && (
                <button className="btn" style={{ flex: 1.5, background: 'var(--bg2)', color: 'var(--text)', fontWeight: 700 }} onClick={handleSeparate}>
                  Odděleně
                </button>
              )}
              <button className="btn" style={{ flex: 1.5, background: '#16A34A', color: '#fff', border: 'none', fontWeight: 700 }} onClick={handleTogether}>
                Dohromady
              </button>
            </div>
          </>
        )}

        {step === 'together' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
              Nájemné i zálohy přišly společně — zadejte jedno datum.
            </div>
            <label style={labelStyle}>Termín přijetí platby</label>
            <input type="date" className="btn" style={inputStyle} value={sharedDate} onChange={e => setSharedDate(e.target.value)} />
            <label style={labelStyle}>Poznámka <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text3)' }}>(nepovinné)</span></label>
            <textarea className="btn" rows={2} placeholder="Např. hotovost, přeplatek…"
              style={{ width: '100%', resize: 'vertical', textAlign: 'left', cursor: 'text', background: 'var(--bg2)', marginBottom: 20, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, padding: '8px 12px' }}
              value={note} onChange={e => setNote(e.target.value)} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setStep('ask')}>← Zpět</button>
              <button className="btn" style={{ flex: 2, background: '#16A34A', color: '#fff', border: 'none', fontWeight: 700 }} onClick={confirmTogether}>
                ✓ Potvrdit úhradu
              </button>
            </div>
          </>
        )}

        {step === 'separate' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
              Zaškrtněte co přišlo a zadejte datum. Nezaškrtnuté zůstane jako neuhrazené.
            </div>

            {/* Nájemné */}
            <div style={{ background: rentPaid ? 'rgba(187,247,208,0.55)' : 'var(--bg2)', border: `1px solid ${rentPaid ? '#86EFAC' : 'var(--border)'}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: rentPaid ? 10 : 0 }}>
                <input type="checkbox" checked={rentPaid} onChange={e => setRentPaid(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#16A34A', cursor: 'pointer' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  Nájemné — {rentAmount.toLocaleString('cs-CZ')} Kč
                </span>
              </label>
              {rentPaid && (
                <>
                  <label style={labelStyle}>Termín přijetí</label>
                  <input type="date" className="btn" style={{ ...inputStyle, marginBottom: 0 }} value={rentDate} onChange={e => setRentDate(e.target.value)} />
                </>
              )}
            </div>

            {/* Zálohy */}
            {hasDeposit && (
              <div style={{ background: depPaid ? 'rgba(187,247,208,0.55)' : 'var(--bg2)', border: `1px solid ${depPaid ? '#86EFAC' : 'var(--border)'}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: depPaid ? 10 : 0 }}>
                  <input type="checkbox" checked={depPaid} onChange={e => setDepPaid(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#16A34A', cursor: 'pointer' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    Zálohy — {depositAmount.toLocaleString('cs-CZ')} Kč
                  </span>
                </label>
                {depPaid && (
                  <>
                    <label style={labelStyle}>Termín přijetí</label>
                    <input type="date" className="btn" style={{ ...inputStyle, marginBottom: 0 }} value={depDate} onChange={e => setDepDate(e.target.value)} />
                  </>
                )}
              </div>
            )}

            <label style={{ ...labelStyle, marginTop: 8 }}>Poznámka <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text3)' }}>(nepovinné)</span></label>
            <textarea className="btn" rows={2} placeholder="Např. hotovost, přeplatek…"
              style={{ width: '100%', resize: 'vertical', textAlign: 'left', cursor: 'text', background: 'var(--bg2)', marginBottom: 20, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, padding: '8px 12px' }}
              value={note} onChange={e => setNote(e.target.value)} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setStep('ask')}>← Zpět</button>
              <button className="btn" style={{ flex: 2, background: '#16A34A', color: '#fff', border: 'none', fontWeight: 700 }} onClick={confirmSeparate}>
                ✓ Uložit {(!rentPaid || !depPaid) && !(!rentPaid && !depPaid) ? 'částečnou úhradu' : 'úhradu'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Modal pro editaci uhrazené částky ──────────────────────────────────────
function EditAmountModal({ payment, monthLabel, tenantName, onConfirm, onClose }) {
  const [amount, setAmount] = useState(String(payment.amount || ''))
  const [agreed, setAgreed] = useState(payment.agreed || false)
  const [step, setStep] = useState('edit') // 'edit' | 'confirm'
  const parsed = parseFloat(amount.replace(',', '.'))
  const isValid = !isNaN(parsed) && parsed >= 0

  if (step === 'confirm') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
        onClick={onClose}>
        <div style={{ background: 'var(--bg)', borderRadius: 16, padding: 28, width: 380, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}
          onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Potvrdit úpravu platby</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20, lineHeight: 1.6 }}>
            Změnit uhrazenou částku za <strong>{monthLabel}</strong>{tenantName ? ` (${tenantName})` : ''} na{' '}
            <strong>{parsed.toLocaleString('cs-CZ')} Kč</strong>?
            {agreed && <div style={{ marginTop: 8, color: '#16A34A', fontWeight: 700, fontSize: 12 }}>✓ Bude označeno jako odsouhlasená plná úhrada</div>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => setStep('edit')}>← Zpět</button>
            <button className="btn" style={{ flex: 2, background: '#D97706', color: '#fff', border: 'none', fontWeight: 700 }}
              onClick={() => onConfirm(parsed, agreed)}>
              ✓ Uložit změnu
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
      onClick={onClose}>
      <div style={{ background: 'var(--bg)', borderRadius: 16, padding: 28, width: 380, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Upravit uhrazenou částku</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 18 }}>
          {monthLabel}{tenantName ? ` · ${tenantName}` : ''}
        </div>
        <input
          className="btn"
          type="number"
          style={{ width: '100%', textAlign: 'left', cursor: 'text', background: 'var(--bg2)', boxSizing: 'border-box', marginBottom: 12 }}
          value={amount}
          onChange={e => setAmount(e.target.value)}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && isValid) setStep('confirm') }}
          placeholder="Částka v Kč"
        />
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20, cursor: 'pointer', padding: '10px 14px', background: agreed ? '#F0FDF4' : 'var(--bg2)', border: `1.5px solid ${agreed ? '#16A34A' : 'var(--border)'}`, borderRadius: 10, transition: '0.15s' }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            style={{ marginTop: 2, accentColor: '#16A34A', width: 16, height: 16, flexShrink: 0 }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: agreed ? '#15803D' : 'var(--text)' }}>Odsouhlasená plná úhrada</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, lineHeight: 1.4 }}>
              Tato částka je finální dohodnutá výše — bude považována za 100% uhrazeno bez ohledu na výši nájmu ve smlouvě.
            </div>
          </div>
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>Zrušit</button>
          <button className="btn" style={{ flex: 2, background: isValid ? '#D97706' : '#9CA3AF', color: '#fff', border: 'none', fontWeight: 700 }}
            disabled={!isValid}
            onClick={() => { if (isValid) setStep('confirm') }}>
            Dále →
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Payments() {
  const { contracts = [], tenants = [], assets = [], payments = [], addPayment, deletePayment, updatePaymentAmount, addAmendment, deleteAmendment, isReadOnly, subjects = [], residentialSubjects = [], billingGroups = [] } = useApp() || {}
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear]   = useState(new Date().getFullYear())
  const [showPicker, setShowPicker]       = useState(false)
  const [activeSub, setActiveSub]     = useState(subjects[0] || '')
  const activeSubRef = useRef(subjects[0] || '')
  const handleSubChange = useCallback((sub) => { activeSubRef.current = sub; setActiveSub(sub) }, [])

  // Subjekty s alespoň jednou smlouvou (pro selector)
  const subjectsWithContracts = subjects.filter(sub =>
    contracts.some(c => {
      const asset = assets.find(a => a.id === c.assetId)
      const effective = c.billingSubject || asset?.subject || ''
      return effective === sub
    })
  )

  // Synchronizuj activeSub na první dostupný subjekt po načtení smluv
  useEffect(() => {
    if (subjectsWithContracts.length > 0 && !subjectsWithContracts.includes(activeSub)) {
      activeSubRef.current = subjectsWithContracts[0]
      setActiveSub(subjectsWithContracts[0])
    }
  }, [subjectsWithContracts.join(',')])
  const [detailContract, setDetailContract] = useState(null)
  const [activeTab, setActiveTab]           = useState('overview')
  const [pendingPayment, setPendingPayment] = useState(null)   // { contract, tenantName, paymentType }
  const [periodPicker, setPeriodPicker]     = useState(null)   // { contract, preselectedKeys }
  const [combinedModal, setCombinedModal]   = useState(null)   // { contract, tenantName, rentAmount, depositAmount }
  const [editAmountModal, setEditAmountModal] = useState(null) // { payment, monthLabel, tenantName }
  const [reportLoading, setReportLoading]   = useState(false)

  const monthKey   = `${selectedYear}-${selectedMonth}`
  const monthLabel = `${MONTHS[selectedMonth]} ${selectedYear}`

  // Parsuje CZ datum "D. M. RRRR" → Date
  const parseDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return null
    try {
      const parts = dateStr.split('.').map(p => p.trim())
      if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
    } catch { return null }
    return null
  }

  // Začátek a konec vybraného měsíce (pro porovnání s trváním smlouvy)
  const monthStart = new Date(selectedYear, selectedMonth, 1)
  const monthEnd   = new Date(selectedYear, selectedMonth + 1, 0) // poslední den měsíce

  // Smlouva je relevantní pro vybraný měsíc, pokud:
  //   start <= poslední den měsíce  AND  (end >= první den měsíce  OR  end není zadán)
  const isContractActiveInMonth = (c) => {
    const startD = parseDate(c.start)
    const endD   = parseDate(c.end)
    if (startD && startD > monthEnd) return false   // smlouva ještě nezačala
    if (endD   && endD   < monthStart) return false // smlouva již skončila
    return true
  }

  const activeContracts = contracts.filter(c =>
    c.status === 'active' &&
    c.paymentFrequency !== 'Zahrnuto v nájemném' &&
    isContractActiveInMonth(c)
  )
  const getAssetForContract  = (c) => assets.find(a => a.id === c.assetId)
  const getTenantForContract = (c) => tenants.find(t => t.id === c.tenantId)

  // Najít platbu dle contractId + month + (volitelně) paymentType
  const getPayment = (contractId, key, paymentType) => {
    if (paymentType) {
      return payments.find(p => p.contractId === contractId && p.month === key && p.paymentType === paymentType)
    }
    // Pro nerozlišené subjekty – hledáme libovolnou platbu za daný měsíc (bez deposit)
    return payments.find(p => p.contractId === contractId && p.month === key && p.paymentType !== 'deposit')
  }

  const getDepositPayment = (contractId, key) =>
    payments.find(p => p.contractId === contractId && p.month === key && p.paymentType === 'deposit')

  const getDepositStatus = (c, key) => {
    const [yr, mo] = key.split('-').map(Number)
    const payment = getDepositPayment(c.id, key)
    const expected = getEffectiveValues(c, yr, mo).deposit
    if (!payment) return { status: 'unpaid', payment: null, remaining: expected }
    if (Number(payment.amount) < expected - 0.01) return { status: 'partial', payment, remaining: expected - Number(payment.amount) }
    return { status: 'paid', payment, remaining: 0 }
  }

  const getContractSubject = (c) => {
    const asset = getAssetForContract(c)
    if (asset?.type === 'ostatni') return asset.subject
    return c.billingSubject || asset?.subject || ''
  }

  // Stejné pořadí jako ve Smlouvách (rf_contract_order z localStorage)
  const getSavedOrder = () => {
    try { const s = localStorage.getItem('rf_contract_order'); return s ? JSON.parse(s) : null } catch { return null }
  }
  const applyOrder = (items) => {
    const order = getSavedOrder()
    if (!order) return items
    const map = {}
    items.forEach(i => { map[i.id] = i })
    const result = order.filter(id => map[id]).map(id => map[id])
    items.forEach(i => { if (!order.includes(i.id)) result.push(i) })
    return result
  }

  const contractsForSub = (subName) =>
    applyOrder(activeContracts.filter(c => getContractSubject(c) === subName))

  const isBytovySub = (subName) => residentialSubjects.includes(subName)

  // ── Effective values s ohledem na amendments ─────────────────────────────
  // Vrátí platné finanční podmínky smlouvy k 1. dni daného měsíce.
  // amendments jsou seřazeny dle effectiveFrom ASC (zajišťuje AppContext/DB).
  const getEffectiveValues = (c, year, month) => {
    const base = {
      rent: Number(c.rent) || 0,
      deposit: Number(c.deposit) || 0,
      depositWater: Number(c.depositWater) || 0,
      flatFee: Number(c.flatFee) || 0,
      parking: Number(c.parking) || 0,
    }
    if (!c.amendments || c.amendments.length === 0) return base
    // 1. den daného měsíce jako timestamp pro porovnání
    const monthStart = new Date(year, month, 1).getTime()
    // Aplikuj všechny amendments, jejichž effectiveFrom <= 1. den měsíce
    const vals = { ...base }
    for (const a of c.amendments) {
      // parse CZ date "D. M. RRRR"
      const parts = (a.effectiveFrom || '').split('.').map(p => p.trim())
      if (parts.length !== 3) continue
      const aDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime()
      if (aDate > monthStart) break // amendments jsou ASC — zbytek je v budoucnosti
      if (a.rent        !== null && a.rent        !== undefined) vals.rent        = Number(a.rent)
      if (a.deposit     !== null && a.deposit     !== undefined) vals.deposit     = Number(a.deposit)
      if (a.depositWater !== null && a.depositWater !== undefined) vals.depositWater = Number(a.depositWater)
      if (a.flatFee     !== null && a.flatFee     !== undefined) vals.flatFee     = Number(a.flatFee)
      if (a.parking     !== null && a.parking     !== undefined) vals.parking     = Number(a.parking)
    }
    return vals
  }

  // ── Nájemné helpers (Varianta A: rent v DB = splátka dle frekvence) ────────
  const PERIOD_LEN = { 'Čtvrtletně': 3, 'Pololetně': 6, 'Ročně': 12 }
  const periodLen = (c) => PERIOD_LEN[c.paymentFrequency] || 1
  // Splátka pro vybraný měsíc (respektuje amendments)
  const effPeriodRent = (c, yr, mo) => {
    const yr_ = yr ?? selectedYear; const mo_ = mo ?? selectedMonth
    const v = getEffectiveValues(c, yr_, mo_)
    return v.rent + v.parking + v.flatFee
  }
  // Měsíční ekvivalent (pro subExpected, dashboard, grafy)
  const effRent = (c, yr, mo) => effPeriodRent(c, yr, mo) / periodLen(c)
  const globalExpected  = activeContracts.reduce((s, c) => s + effRent(c), 0)
  const globalReceived  = (() => {
    const seenGroups = new Set()
    let total = 0
    for (const c of activeContracts) {
      if (c.groupLabel) {
        if (!seenGroups.has(c.groupLabel)) {
          seenGroups.add(c.groupLabel)
          const gp = payments.find(p => p.groupLabel === c.groupLabel && p.month === monthKey)
          if (gp) {
            total += Number(gp.amount) || 0
          }
        }
      } else {
        const isMulti = ['Čtvrtletně','Pololetně','Ročně'].includes(c.paymentFrequency)
        const p = getPayment(c.id, monthKey)
        if (p) total += isMulti ? effRent(c) : (Number(p.amount) || 0)
      }
    }
    return total
  })()
  const globalPercent   = globalExpected > 0 ? Math.round((globalReceived / globalExpected) * 100) : 0

  // ── Výpočet periodického okna měsíců ─────────────────────────────────────
  const getPeriodMonthKeys = (contract, refYear, refMonth) => {
    const freq = contract.paymentFrequency || 'Měsíčně'
    if (freq === 'Měsíčně' || freq === 'Zahrnuto v nájemném') {
      return [`${refYear}-${refMonth}`]
    }

    // Parsuj datum začátku smlouvy
    let startMonth = 0, startYear = refYear
    if (contract.start) {
      const parts = contract.start.split('.').map(p => p.trim())
      if (parts.length === 3) { startMonth = parseInt(parts[1]) - 1; startYear = parseInt(parts[2]) }
    }

    const periodLen = freq === 'Čtvrtletně' ? 3 : freq === 'Pololetně' ? 6 : 12

    if (freq === 'Čtvrtletně' || freq === 'Pololetně') {
      // Najdi okno od data začátku smlouvy: startMonth, startMonth+periodLen, startMonth+2*periodLen, ...
      // Najdeme okno, do kterého refMonth/refYear patří
      const refDate = new Date(refYear, refMonth, 1)
      let windowStart = new Date(startYear, startMonth, 1)
      // Posunuj o periodLen dokud refDate je před začátkem okna nebo za koncem
      while (true) {
        const windowEnd = new Date(windowStart.getFullYear(), windowStart.getMonth() + periodLen - 1, 1)
        if (refDate >= windowStart && refDate <= windowEnd) break
        if (refDate < windowStart) { windowStart = new Date(windowStart.getFullYear(), windowStart.getMonth() - periodLen, 1); break }
        windowStart = new Date(windowStart.getFullYear(), windowStart.getMonth() + periodLen, 1)
      }
      return Array.from({ length: periodLen }, (_, i) => {
        const d = new Date(windowStart.getFullYear(), windowStart.getMonth() + i, 1)
        return `${d.getFullYear()}-${d.getMonth()}`
      })
    }

    if (freq === 'Ročně') {
      // Pokud je zaškrtnuto "Platby dle kalendářního roku" → okno Jan–Dec refYear
      if (contract.calendarYearBilling) {
        return Array.from({ length: 12 }, (_, i) => `${refYear}-${i}`)
      }
      const refDate = new Date(refYear, refMonth, 1)
      let windowStart = new Date(startYear, startMonth, 1)
      while (new Date(windowStart.getFullYear() + 1, windowStart.getMonth(), 1) <= refDate) {
        windowStart = new Date(windowStart.getFullYear() + 1, windowStart.getMonth(), 1)
      }
      return Array.from({ length: 12 }, (_, i) => { const d = new Date(windowStart.getFullYear(), windowStart.getMonth() + i, 1); return `${d.getFullYear()}-${d.getMonth()}` })
    }

    return [`${refYear}-${refMonth}`]
  }
  const isPeriodPaid = (contract, year, month) =>
    getPeriodMonthKeys(contract, year, month).some(k => !!getPayment(contract.id, k))
  const deletePeriodPayments = (contract, year, month) => {
    const freq = contract.paymentFrequency || ''
    if (freq === 'Čtvrtletně' || freq === 'Pololetně') {
      // Smaž všechny platby nájmu pro tuto smlouvu — uživatel mohl vybrat libovolné měsíce
      payments.filter(p => p.contractId === contract.id && p.paymentType !== 'deposit')
              .forEach(p => deletePayment(p.id))
    } else {
      getPeriodMonthKeys(contract, year, month).forEach(k => { const p = getPayment(contract.id, k); if (p) deletePayment(p.id) })
    }
  }

  // Vrátí stav platby nájmu: 'paid' | 'partial' | 'unpaid'
  // MUSÍ být za isPeriodPaid a effPeriodRent
  const getRentStatus = (c, key) => {
    const freq = c.paymentFrequency || 'Měsíčně'
    const isMulti = freq === 'Čtvrtletně' || freq === 'Pololetně' || freq === 'Ročně'
    if (isMulti) {
      const [y, m] = key.split('-').map(Number)
      const paid = isPeriodPaid(c, y, m)
      const payment = getPayment(c.id, key)
      if (payment?.agreed) return { status: 'paid', payment, remaining: 0 }
      return paid
        ? { status: 'paid', payment, remaining: 0 }
        : { status: 'unpaid', payment: null, remaining: effPeriodRent(c) }
    }
    const payment = getPayment(c.id, key)
    // Odsouhlasená platba = vždy paid bez ohledu na výši
    if (payment?.agreed) return { status: 'paid', payment, remaining: 0 }
    const [yr, mo] = key.split('-').map(Number)
    const ev = getEffectiveValues(c, yr, mo)
    const expected = ev.rent + ev.parking + ev.flatFee
    if (!payment) return { status: 'unpaid', payment: null, remaining: expected }
    if (Number(payment.amount) < expected - 0.01) return { status: 'partial', payment, remaining: expected - Number(payment.amount) }
    return { status: 'paid', payment, remaining: 0 }
  }

  const globalPaidCount = (() => {
    const seenG = new Set()
    let count = 0
    for (const c of activeContracts) {
      if (c.groupLabel) {
        if (seenG.has(c.groupLabel)) continue
        seenG.add(c.groupLabel)
        const gp = payments.find(p => p.groupLabel === c.groupLabel && p.month === monthKey)
        if (!gp) continue
        if (gp.agreed) { count++; continue }
        const members = activeContracts.filter(x => x.groupLabel === c.groupLabel)
        const groupTotal = members.reduce((s, mc) => { const ev = getEffectiveValues(mc, selectedYear, selectedMonth); return s + ev.rent + ev.parking + ev.flatFee }, 0)
        if (Number(gp.amount) >= groupTotal - 0.01) count++
      } else {
        if (getRentStatus(c, monthKey).status === 'paid') count++
      }
    }
    return count
  })()

  // Počty pro sidebar badge — respektuje skupiny i multimonth
  const getSubStatus = (subName) => {
    const sub = contractsForSub(subName)
    const seen = new Set()
    let total = 0, unpaid = 0
    sub.forEach(c => {
      const key = c.groupLabel || c.id
      if (seen.has(key)) return
      seen.add(key)
      total++
      if (c.groupLabel) {
        const gp = payments.find(p => p.groupLabel === c.groupLabel && p.month === monthKey)
        if (!gp) { unpaid++; return }
        if (gp.agreed) return // paid
        const members = sub.filter(x => x.groupLabel === c.groupLabel)
        const groupTotal = members.reduce((s, mc) => { const ev = getEffectiveValues(mc, selectedYear, selectedMonth); return s + ev.rent + ev.parking + ev.flatFee }, 0)
        if (Number(gp.amount) < groupTotal - 0.01) unpaid++ // partial
      } else {
        if (getRentStatus(c, monthKey).status !== 'paid') unpaid++
      }
    })
    return { unpaid, total }
  }

  // Handler pro PeriodMonthPickerModal (čtvrtletní/pololetní)
  const handlePeriodConfirm = async (dateStr, totalAmount, note, selectedKeys) => {
    if (!periodPicker) return
    const { contract } = periodPicker
    const d = new Date(dateStr)
    const dateLabel = d.toLocaleDateString('cs-CZ')
    const perMonth = selectedKeys.length > 0 ? totalAmount / selectedKeys.length : 0
    for (const k of selectedKeys) {
      await addPayment({
        contractId: contract.id,
        month: k,
        amount: perMonth,
        status: 'paid',
        date: dateLabel,
        paymentType: 'rent',
        note: note || '',
      })
    }
    setPeriodPicker(null)
  }

  const subContracts = contractsForSub(activeSub)
  // DEBUG: breakdown per contract
  const subExpected  = subContracts.reduce((s, c) => s + effRent(c), 0)
  const subReceived  = (() => {
    const seenGroups = new Set()
    let total = 0
    for (const c of subContracts) {
      if (c.groupLabel) {
        if (!seenGroups.has(c.groupLabel)) {
          seenGroups.add(c.groupLabel)
          const gp = payments.find(p => p.groupLabel === c.groupLabel && p.month === monthKey)
          if (gp && gp.paymentType !== 'deposit') {
            total += Number(gp.amount) || 0
          } else {
          }
        }
      } else {
        const freq = c.paymentFrequency || 'Měsíčně'
        const isMulti = freq === 'Čtvrtletně' || freq === 'Pololetně' || freq === 'Ročně'
        if (isMulti) {
          const paid = isPeriodPaid(c, selectedYear, selectedMonth)
          total += paid ? effRent(c) : 0
        } else {
          const p = getPayment(c.id, monthKey)
          const added = (p && p.paymentType !== 'deposit') ? (Number(p.amount) || 0) : 0
          total += added
        }
      }
    }
    return total
  })()
  const subRemaining = subExpected - subReceived
  const subPercent   = subExpected > 0 ? Math.round((subReceived / subExpected) * 100) : 0

  // ── Toggle platby pro přehledovou tabulku ─────────────────────────────────
  const handleToggle = (e, contract, payment) => {
    e.stopPropagation()
    if (isReadOnly) return
    const freq = contract.paymentFrequency || 'Měsíčně'
    const isMultiMonth = freq === 'Čtvrtletně' || freq === 'Pololetně' || freq === 'Ročně'

    if (isMultiMonth) {
      if (isPeriodPaid(contract, selectedYear, selectedMonth)) {
        deletePeriodPayments(contract, selectedYear, selectedMonth)
        return
      }
      // Čtvrtletně/Pololetně → picker s checkboxy
      if (freq === 'Čtvrtletně' || freq === 'Pololetně') {
        const preselected = getPeriodMonthKeys(contract, selectedYear, selectedMonth)
        const tenant = tenants.find(t => t.id === contract.tenantId)
        setPeriodPicker({ contract: { ...contract, tenantName: tenant?.name || '' }, preselectedKeys: preselected })
        return
      }
      // Ročně → původní modal s datem
      const tenant = tenants.find(t => t.id === contract.tenantId)
      const fullAmount = effPeriodRent(contract)
      setPendingPayment({ contract, tenantName: tenant?.name || '', paymentType: 'rent', fullAmount, isMultiMonth: true })
      return
    }

    if (payment) {
      deletePayment(payment.id)
    } else {
      if (isBytovySub(activeSub)) {
        const tenant = tenants.find(t => t.id === contract.tenantId)
        const ev = getEffectiveValues(contract, selectedYear, selectedMonth)
        const rentTotal = ev.rent + ev.parking
        const depositAmt = ev.deposit
        const existingRent = getPayment(contract.id, monthKey, 'rent')
        const existingDep  = getDepositPayment(contract.id, monthKey)
        // Pokud je nájem i záloha již uhrazena, jen otevři detail
        if (existingRent && (depositAmt === 0 || existingDep)) {
          setDetailContract(contract)
          return
        }
        // Pokud chybí jen jedna položka, otevři přímý modal pro tu chybějící
        if (existingRent && depositAmt > 0 && !existingDep) {
          setPendingPayment({ contract, tenantName: tenant?.name || '', paymentType: 'deposit', fullAmount: depositAmt })
          return
        }
        if (!existingRent && depositAmt > 0 && existingDep) {
          setPendingPayment({ contract, tenantName: tenant?.name || '', paymentType: 'rent', fullAmount: rentTotal })
          return
        }
        // Jinak otevři combined modal
        setCombinedModal({ contract, tenantName: tenant?.name || '', rentAmount: rentTotal, depositAmount: depositAmt })
      } else {
        const tenant = tenants.find(t => t.id === contract.tenantId)
        const fullAmount = effPeriodRent(contract)
        setPendingPayment({ contract, tenantName: tenant?.name || '', paymentType: 'rent', fullAmount })
      }
    }
  }

  const handleConfirmPayment = async (dateStr, customAmount, note) => {
    if (!pendingPayment) return
    const { contract, groupLabel, paymentType, fullAmount, isMultiMonth } = pendingPayment
    const d = new Date(dateStr)
    const amount = customAmount !== undefined ? customAmount : fullAmount
    const dateLabel = d.toLocaleDateString('cs-CZ')

    if (isMultiMonth && contract) {
      const keys = pendingPayment.selectedMonthKeys || getPeriodMonthKeys(contract, selectedYear, selectedMonth)
      const perMonth = amount / keys.length
      for (const k of keys) {
        await addPayment({
          contractId: contract.id,
          month: k,
          amount: perMonth,
          status: 'paid',
          date: dateLabel,
          paymentType: paymentType || 'rent',
          note: note || '',
        })
      }
    } else {
      addPayment({
        contractId: groupLabel ? `group:${groupLabel}` : contract.id,
        groupLabel: groupLabel || null,
        month: monthKey,
        amount,
        status: 'paid',
        date: dateLabel,
        paymentType: paymentType || 'rent',
        note: note || '',
      })
    }
    setPendingPayment(null)
  }

  const handleCombinedConfirm = async (entries) => {
    if (!combinedModal) return
    const { contract } = combinedModal
    for (const entry of entries) {
      await addPayment({
        contractId: contract.id,
        month: monthKey,
        amount: entry.amount,
        status: 'paid',
        date: new Date(entry.date).toLocaleDateString('cs-CZ'),
        paymentType: entry.type,
        note: entry.note || '',
      })
    }
    setCombinedModal(null)
  }

  // ── 6měsíční historie ─────────────────────────────────────────────────────
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d    = new Date(selectedYear, selectedMonth - 5 + i, 1)
    const key  = `${d.getFullYear()}-${d.getMonth()}`
    const mStart = new Date(d.getFullYear(), d.getMonth(), 1)
    const mEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    // Smlouvy aktivní v daném měsíci pro vybraný subjekt
    const con = applyOrder(
      contracts.filter(c =>
        c.status === 'active' &&
        c.paymentFrequency !== 'Zahrnuto v nájemném' &&
        getContractSubject(c) === activeSub &&
        (() => {
          const sD = parseDate(c.start); const eD = parseDate(c.end)
          if (sD && sD > mEnd) return false
          if (eD && eD < mStart) return false
          return true
        })()
      )
    )
    const lyr = d.getFullYear(); const lmo = d.getMonth()
    const exp = con.reduce((s, c) => s + effRent(c, lyr, lmo), 0)
    // Skupinové platby: každou skupinu počítej jednou
    const seenG = new Set()
    const rec = con.reduce((s, c) => {
      if (c.groupLabel) {
        if (seenG.has(c.groupLabel)) return s
        seenG.add(c.groupLabel)
        const gp = payments.find(p => p.groupLabel === c.groupLabel && p.month === key)
        if (!gp || gp.paymentType === 'deposit') return s
        return s + (Number(gp.amount) || 0)
      }
      const p = payments.find(pp => pp.contractId === c.id && pp.month === key && pp.paymentType !== 'deposit')
      if (!p) return s
      const isMulti = ['Čtvrtletně','Pololetně','Ročně'].includes(c.paymentFrequency)
      return s + (isMulti ? effRent(c, lyr, lmo) : Number(p.amount) || 0)
    }, 0)
    const pct = exp > 0 ? Math.round((rec / exp) * 100) : 0
    return { key, label: MONTHS[d.getMonth()].slice(0, 3), exp, rec, pct, isCurrent: key === monthKey }
  })
  const maxRec = Math.max(...last6Months.map(m => m.exp), 1)

  // ── Dlužníci ──────────────────────────────────────────────────────────────
  const debtors = (() => {
    const seenGroups = new Set()
    const result = []
    for (const c of activeContracts) {
      if (c.groupLabel) {
        // Skupinové smlouvy — zpracuj jednou za skupinu
        if (seenGroups.has(c.groupLabel)) continue
        seenGroups.add(c.groupLabel)
        const gp = payments.find(p => p.groupLabel === c.groupLabel && p.month === monthKey)
        // Agreed → paid, přeskočit
        if (gp?.agreed) continue
        // Spočítej celkový expected skupiny
        const members = activeContracts.filter(x => x.groupLabel === c.groupLabel)
        const groupTotal = members.reduce((s, mc) => {
          const ev = getEffectiveValues(mc, selectedYear, selectedMonth)
          return s + ev.rent + ev.parking + ev.flatFee
        }, 0)
        if (!gp) {
          result.push({ contract: c, tenant: getTenantForContract(c), asset: getAssetForContract(c), rs: { status: 'unpaid', payment: null, remaining: groupTotal }, isGroup: true, groupLabel: c.groupLabel, groupTotal })
        } else if (Number(gp.amount) < groupTotal - 0.01) {
          result.push({ contract: c, tenant: getTenantForContract(c), asset: getAssetForContract(c), rs: { status: 'partial', payment: gp, remaining: groupTotal - Number(gp.amount) }, isGroup: true, groupLabel: c.groupLabel, groupTotal })
        }
        // Jinak paid → nepřidávat
      } else {
        const rs = getRentStatus(c, monthKey)
        if (rs.status !== 'paid') {
          result.push({ contract: c, tenant: getTenantForContract(c), asset: getAssetForContract(c), rs, isGroup: false })
        }
      }
    }
    return result.sort((a, b) => (b.groupTotal || effRent(b.contract)) - (a.groupTotal || effRent(a.contract)))
  })()

  const contractHistory = (contractId) =>
    payments.filter(p => p.contractId === contractId)
            .sort((a, b) => {
              // Správné numerické řazení: "2025-8" < "2025-9" < "2026-0"
              const [ay, am] = a.month.split('-').map(Number)
              const [by, bm] = b.month.split('-').map(Number)
              if (ay !== by) return ay - by
              return am - bm
            })

  const formatMonthKey = (key) => {
    const [yr, mo] = key.split('-')
    return `${MONTHS[parseInt(mo)]} ${yr}`
  }

  // ── Poslední den daného měsíce ────────────────────────────────────────────
  const lastDayOfMonth = (year, month) => new Date(year, month + 1, 0).getDate()

  // ── Pomocná: je smlouva aktivní v daném roce/měsíci? ─────────────────────
  const isContractActiveInPeriod = (c, y, m) => {
    const mStart = new Date(y, m, 1)
    const mEnd   = new Date(y, m + 1, 0)
    const startD = parseDate(c.start)
    const endD   = parseDate(c.end)
    if (startD && startD > mEnd) return false
    if (endD   && endD   < mStart) return false
    return true
  }

  // ── Stav platby skupiny pro daný měsíc ───────────────────────────────────
  const getGroupStatus = (label, members, y, m) => {
    const key = `${y}-${m}`
    const groupPayment = payments.find(p => p.groupLabel === label && p.month === key)
    const groupTotal = members.reduce((s, c) => {
      const ev = getEffectiveValues(c, y, m)
      return s + ev.rent + ev.parking + ev.flatFee
    }, 0)
    if (!groupPayment) return { status: 'unpaid', payment: null, remaining: groupTotal, expected: groupTotal }
    // Odsouhlasená platba = vždy paid
    if (groupPayment.agreed) return { status: 'paid', payment: groupPayment, remaining: 0, expected: groupTotal }
    const paid = Number(groupPayment.amount)
    if (paid < groupTotal - 0.01) return { status: 'partial', payment: groupPayment, remaining: groupTotal - paid, expected: groupTotal }
    return { status: 'paid', payment: groupPayment, remaining: 0, expected: groupTotal }
  }

  // ── Report nezaplacených k poslednímu dni vybraného měsíce ────────────────
  const generateUnpaidReport = async () => {
    setReportLoading(true)
    try {
      const reportDate = new Date(selectedYear, selectedMonth + 1, 0) // poslední den měsíce
      const reportDateStr = reportDate.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })
      const stamp = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`

      // Všechny měsíce pro report: od 11 měsíců zpět AŽ PO vybraný měsíc včetně
      // Klíč formát: "RRRR-M" kde M je 0-based index měsíce
      const allReportMonths = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(selectedYear, selectedMonth - i, 1)
        const k = `${d.getFullYear()}-${d.getMonth()}`
        allReportMonths.push({ year: d.getFullYear(), month: d.getMonth(), key: k })
      }
      const currentKey = `${selectedYear}-${selectedMonth}`
      // pastMonths = všechny kromě aktuálního (pro "historické dluhy" sekci)
      const pastMonths = allReportMonths.slice(0, -1)

      console.log('[Report] selectedYear:', selectedYear, 'selectedMonth:', selectedMonth)

      // Sestavení dat per subjekt
      const subjectData = subjectsWithContracts.map(subName => {
        // Všechny aktivní smlouvy pro tento subjekt v daném (vybraném) měsíci
        const subContracts = contractsForSub(subName)

        const tenantRows = []
        const seenGroups = new Set()

        subContracts.forEach(c => {
          if (c.groupLabel) {
            // Skupinové smlouvy – zpracuj jednou za skupinu
            if (seenGroups.has(c.groupLabel)) return
            seenGroups.add(c.groupLabel)

            const members = subContracts.filter(x => x.groupLabel === c.groupLabel)
            const tenant  = getTenantForContract(members[0])
            const asset   = getAssetForContract(members[0])
            const tName   = tenant?.name || '—'
            const aUnit   = `${c.groupLabel} (${members.length} ${asset?.type === 'commercial' ? 'prostory' : 'stání'})`

            // Stav aktuálního měsíce
            const currentStatus = getGroupStatus(c.groupLabel, members, selectedYear, selectedMonth)

            // Dluhy v předchozích měsících — jen od prvního zaznamenaného měsíce skupiny
            const groupPayments = payments.filter(p => p.groupLabel === c.groupLabel)
            const oldestGroupMonth = groupPayments.length > 0
              ? groupPayments.reduce((oldest, p) => {
                  const [py, pm] = p.month.split('-').map(Number)
                  const [oy, om] = oldest.split('-').map(Number)
                  return (py < oy || (py === oy && pm < om)) ? p.month : oldest
                }, groupPayments[0].month)
              : currentKey

            const pastDebts = []
            pastMonths.forEach(({ year: y, month: m, key: k }) => {
              const anyActive = members.some(mc => isContractActiveInPeriod(mc, y, m))
              if (!anyActive) return
              const [oy, om] = oldestGroupMonth.split('-').map(Number)
              if (y < oy || (y === oy && m < om)) return
              const st = getGroupStatus(c.groupLabel, members, y, m)
              if (st.status !== 'paid') {
                const paid = st.payment ? Number(st.payment.amount) : 0
                pastDebts.push({
                  monthLabel: formatMonthKey(k),
                  expected: Math.round(st.expected),
                  paid: Math.round(paid),
                  remaining: Math.round(st.remaining),
                  status: st.status,
                })
              }
            })

            tenantRows.push({ tName, aUnit, currentStatus, pastDebts, contract: members[0], isGroup: true })
          } else {
            // Jednotlivá smlouva
            const tenant = getTenantForContract(c)
            const asset  = getAssetForContract(c)
            const tName  = tenant?.name || '—'
            const aUnit  = asset?.unit || asset?.name || '—'

            const currentStatus = getRentStatus(c, currentKey)

            // Najdi nejstarší zaznamenanou platbu pro tuto smlouvu
            // — dluhy reportujeme jen od prvního zaznamenaného měsíce v systému
            const contractPayments = payments.filter(p => p.contractId === c.id)
            const oldestPaymentMonth = contractPayments.length > 0
              ? contractPayments.reduce((oldest, p) => {
                  const [py, pm] = p.month.split('-').map(Number)
                  const [oy, om] = oldest.split('-').map(Number)
                  return (py < oy || (py === oy && pm < om)) ? p.month : oldest
                }, contractPayments[0].month)
              : currentKey // pokud žádná platba není, sledujeme jen aktuální měsíc

            const pastDebts = []
            pastMonths.forEach(({ year: y, month: m, key: k }) => {
              if (!isContractActiveInPeriod(c, y, m)) return
              // Přeskočit měsíce starší než první zaznamenaná platba
              const [oy, om] = oldestPaymentMonth.split('-').map(Number)
              if (y < oy || (y === oy && m < om)) return
              const st = getRentStatus(c, k)
              if (st.status !== 'paid') {
                const ev = getEffectiveValues(c, y, m)
                const expected = ev.rent + ev.parking + ev.flatFee
                const paid = st.payment ? Number(st.payment.amount) : 0
                pastDebts.push({
                  monthLabel: formatMonthKey(k),
                  expected: Math.round(expected),
                  paid: Math.round(paid),
                  remaining: Math.round(expected - paid),
                  status: st.status,
                })
              }
            })

            tenantRows.push({ tName, aUnit, currentStatus, pastDebts, contract: c, isGroup: false })
          }
        })

        const unpaidRows = tenantRows.filter(r => r.currentStatus.status !== 'paid' || r.pastDebts.length > 0)
        const allOk = unpaidRows.length === 0

        return { subName, allOk, unpaidRows }
      })

      // ── Generuj HTML ──────────────────────────────────────────────────────
      const PRINT_CSS = `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, 'Helvetica Neue', sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; }
        .page { max-width: 860px; margin: 0 auto; padding: 32px 40px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #12654A; }
        .header-title { font-size: 22px; font-weight: 800; color: #12654A; }
        .header-sub { font-size: 12px; color: #666; margin-top: 4px; }
        .header-right { text-align: right; }
        .header-date { font-size: 13px; font-weight: 700; color: #374151; }
        .header-gen { font-size: 11px; color: #9CA3AF; margin-top: 3px; }
        .section { margin-bottom: 24px; break-inside: avoid; }
        .section-title { font-size: 13px; font-weight: 800; color: #12654A; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px; padding: 6px 12px; background: #F0FDF4; border-left: 3px solid #12654A; border-radius: 0 6px 6px 0; display: flex; justify-content: space-between; align-items: center; }
        .ok-badge { font-size: 11px; font-weight: 700; color: #166534; background: #DCFCE7; padding: 2px 10px; border-radius: 20px; letter-spacing: 0; text-transform: none; }
        .ok-msg { font-size: 13px; color: #166534; font-style: italic; padding: 10px 14px; background: #F0FDF4; border-radius: 8px; border: 1px solid #BBF7D0; }
        .tenant-block { margin-bottom: 14px; border: 1px solid #E5E7EB; border-radius: 10px; overflow: hidden; }
        .tenant-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #F9FAFB; border-bottom: 1px solid #E5E7EB; }
        .tenant-name { font-size: 13px; font-weight: 700; color: #111827; }
        .tenant-unit { font-size: 11px; color: #6B7280; margin-top: 2px; }
        .debt-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; border-bottom: 1px solid #F3F4F6; }
        .debt-row:last-child { border-bottom: none; }
        .debt-month { font-size: 12px; font-weight: 600; color: #374151; }
        .debt-current { background: #FFF7ED; }
        .debt-current .debt-month { color: #92400E; }
        .debt-amounts { display: flex; gap: 18px; align-items: center; font-size: 12px; }
        .debt-label { color: #9CA3AF; font-size: 10px; margin-bottom: 1px; }
        .debt-val { font-weight: 700; }
        .debt-exp { color: #374151; }
        .debt-paid { color: #16A34A; }
        .debt-rem { color: #DC2626; }
        .badge-unpaid { background: #FEF2F2; color: #991B1B; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
        .badge-partial { background: #FFFBEB; color: #92400E; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
        .footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #E5E5E5; font-size: 10px; color: #9CA3AF; display: flex; justify-content: space-between; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      `

      const genTenantBlock = (row) => {
        const { tName, aUnit, currentStatus, pastDebts, isGroup } = row
        let expected, paid, remaining
        if (isGroup) {
          // Skupiny: expected je v currentStatus.expected
          expected = Math.round(currentStatus.expected || 0)
        } else {
          const ev = getEffectiveValues(row.contract, selectedYear, selectedMonth)
          expected = Math.round(ev.rent + ev.parking + ev.flatFee)
        }
        paid = currentStatus.payment ? Math.round(Number(currentStatus.payment.amount)) : 0
        remaining = Math.round(expected - paid)

        let rows = ''

        // Předchozí dluhy
        pastDebts.forEach(d => {
          rows += `
            <div class="debt-row">
              <div>
                <div class="debt-month">${d.monthLabel}</div>
              </div>
              <div class="debt-amounts">
                <div style="text-align:right">
                  <div class="debt-label">Předpis</div>
                  <div class="debt-val debt-exp">${d.expected.toLocaleString('cs-CZ')} Kč</div>
                </div>
                ${d.paid > 0 ? `<div style="text-align:right"><div class="debt-label">Uhrazeno</div><div class="debt-val debt-paid">${d.paid.toLocaleString('cs-CZ')} Kč</div></div>` : ''}
                <div style="text-align:right">
                  <div class="debt-label">Dluh</div>
                  <div class="debt-val debt-rem">${d.remaining.toLocaleString('cs-CZ')} Kč</div>
                </div>
                <span class="${d.status === 'partial' ? 'badge-partial' : 'badge-unpaid'}">${d.status === 'partial' ? 'Částečně' : 'Nezaplaceno'}</span>
              </div>
            </div>`
        })

        // Aktuální měsíc (pokud nezaplaceno)
        if (currentStatus.status !== 'paid') {
          rows += `
            <div class="debt-row debt-current">
              <div>
                <div class="debt-month">${formatMonthKey(currentKey)} (aktuální)</div>
              </div>
              <div class="debt-amounts">
                <div style="text-align:right">
                  <div class="debt-label">Předpis</div>
                  <div class="debt-val debt-exp">${expected.toLocaleString('cs-CZ')} Kč</div>
                </div>
                ${paid > 0 ? `<div style="text-align:right"><div class="debt-label">Uhrazeno</div><div class="debt-val debt-paid">${paid.toLocaleString('cs-CZ')} Kč</div></div>` : ''}
                <div style="text-align:right">
                  <div class="debt-label">Dluh</div>
                  <div class="debt-val debt-rem">${remaining.toLocaleString('cs-CZ')} Kč</div>
                </div>
                <span class="${currentStatus.status === 'partial' ? 'badge-partial' : 'badge-unpaid'}">${currentStatus.status === 'partial' ? 'Částečně' : 'Nezaplaceno'}</span>
              </div>
            </div>`
        }

        return `
          <div class="tenant-block">
            <div class="tenant-header">
              <div>
                <div class="tenant-name">${tName}</div>
                <div class="tenant-unit">${aUnit}</div>
              </div>
            </div>
            ${rows}
          </div>`
      }

      const sectionsHtml = subjectData.map(({ subName, allOk, unpaidRows }) => `
        <div class="section">
          <div class="section-title">
            <span>${subName}</span>
            ${allOk ? '<span class="ok-badge">✓ Vše v pořádku</span>' : ''}
          </div>
          ${allOk
            ? '<div class="ok-msg">Vše uhrazeno a v pořádku.</div>'
            : unpaidRows.map(row => genTenantBlock(row)).join('')
          }
        </div>`
      ).join('')

      const now = new Date()
      const genDateStr = now.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })

      const html = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RentFlow — Report nezaplacených — ${stamp}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="header-title">Report nezaplacených plateb</div>
      <div class="header-sub">RentFlow · Stav k ${reportDateStr}</div>
    </div>
    <div class="header-right">
      <div class="header-date">${MONTHS[selectedMonth]} ${selectedYear}</div>
      <div class="header-gen">Vygenerováno ${genDateStr}</div>
    </div>
  </div>
  ${sectionsHtml}
  <div class="footer">
    <span>RentFlow</span>
    <span>Report k ${reportDateStr}</span>
  </div>
</div>
</body>
</html>`

      const outPath = await save({
        defaultPath: `RentFlow-Nezaplacene-${stamp}.pdf`,
        filters: [{ name: 'PDF soubor', extensions: ['pdf'] }],
      })
      if (!outPath) return

      await invoke('export_to_pdf', { html, outPath })
    } catch (e) {
      console.error('Report error:', e)
    } finally {
      setReportLoading(false)
    }
  }

  return (
    <div style={{ paddingBottom: 60 }}>
      {pendingPayment && (
        <PaymentDateModal
          contract={{ ...pendingPayment.contract, tenantName: pendingPayment.tenantName }}
          fullAmount={pendingPayment.fullAmount}
          monthLabel={monthLabel}
          onConfirm={handleConfirmPayment}
          onClose={() => setPendingPayment(null)}
        />
      )}
      {combinedModal && (
        <CombinedPaymentModal
          contract={{ ...combinedModal.contract, tenantName: combinedModal.tenantName }}
          rentAmount={combinedModal.rentAmount}
          depositAmount={combinedModal.depositAmount}
          monthLabel={monthLabel}
          onConfirm={handleCombinedConfirm}
          onClose={() => setCombinedModal(null)}
        />
      )}
      {editAmountModal && (
        <EditAmountModal
          payment={editAmountModal.payment}
          monthLabel={editAmountModal.monthLabel}
          tenantName={editAmountModal.tenantName}
          onConfirm={async (newAmount, newAgreed) => {
            await updatePaymentAmount(editAmountModal.payment.id, newAmount, newAgreed)
            setEditAmountModal(null)
          }}
          onClose={() => setEditAmountModal(null)}
        />
      )}
      {periodPicker && (
        <PeriodMonthPickerModal
          contract={periodPicker.contract}
          preselectedKeys={periodPicker.preselectedKeys}
          onConfirm={handlePeriodConfirm}
          onClose={() => setPeriodPicker(null)}
        />
      )}

      {/* HLAVIČKA */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <div className="page-title">Evidence plateb</div>
          <div className="page-sub">Přehled plateb za {monthLabel}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--bg)', padding: '6px 16px', borderRadius: 12, border: '1.5px solid var(--border)' }}>
          <button className="btn btn-sm" onClick={() => {
            if (selectedYear === 2026 && selectedMonth === 0) return
            if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1) }
            else setSelectedMonth(m => m - 1)
          }}>◀</button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowPicker(v => !v)} style={{
              minWidth: 160, textAlign: 'center', fontWeight: 800, fontSize: 15, color: 'var(--text)',
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 8,
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {monthLabel} ▾
            </button>
            {showPicker && (
              <>
                <div onClick={() => setShowPicker(false)} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
                <div style={{
                  position: 'absolute', top: '110%', left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 14,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.18)', zIndex: 1000, padding: 16, minWidth: 260,
                }}>
                  {/* Rok */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <button className="btn btn-sm" onClick={() => setSelectedYear(y => y > 2026 ? y - 1 : y)}>◀</button>
                    <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{selectedYear}</span>
                    <button className="btn btn-sm" onClick={() => setSelectedYear(y => y + 1)}>▶</button>
                  </div>
                  {/* Mřížka měsíců */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {MONTHS.map((m, i) => {
                      const isCurrent = i === selectedMonth && selectedYear === new Date().getFullYear() && i === new Date().getMonth()
                      const isSelected = i === selectedMonth
                      return (
                        <button key={m} onClick={() => { setSelectedMonth(i); setShowPicker(false) }}
                          style={{
                            padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: isSelected ? 800 : 600,
                            border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                            background: isSelected ? 'rgba(18,101,74,0.1)' : isCurrent ? 'var(--bg2)' : 'var(--bg)',
                            color: isSelected ? 'var(--accent)' : 'var(--text)',
                            cursor: 'pointer',
                          }}>
                          {m.slice(0, 3)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
          <button className="btn btn-sm" onClick={() => {
            if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1) }
            else setSelectedMonth(m => m + 1)
          }}>▶</button>
        </div>
      </div>

      {/* SOUHRNNÁ LIŠTA */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Má být zaplaceno tento měsíc</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)' }}>{subExpected.toLocaleString('cs-CZ')} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text3)' }}>Kč</span></div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{activeSub} · {monthLabel}</div>
        </div>
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 14, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Uhrazeno</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#166534' }}>{subReceived.toLocaleString('cs-CZ')} <span style={{ fontSize: 12, fontWeight: 500 }}>Kč</span></div>
          <div style={{ fontSize: 11, color: '#4ADE80', marginTop: 4 }}>{subPercent}% z předpisu subjektu</div>
        </div>
        <div style={{ background: subRemaining > 0 ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${subRemaining > 0 ? '#FECACA' : '#BBF7D0'}`, borderRadius: 14, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: subRemaining > 0 ? '#991B1B' : '#166534', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Dosud neuhrazeno</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: subRemaining > 0 ? '#991B1B' : '#166534' }}>{subRemaining.toLocaleString('cs-CZ')} <span style={{ fontSize: 12, fontWeight: 500 }}>Kč</span></div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            {(() => {
              const seen = new Set()
              let unpaid = 0, partial = 0
              subContracts.forEach(c => {
                const k = c.groupLabel || c.id
                if (seen.has(k)) return
                seen.add(k)
                if (c.groupLabel) {
                  const gp = payments.find(p => p.groupLabel === c.groupLabel && p.month === monthKey)
                  if (!gp) unpaid++
                } else {
                  const s = getRentStatus(c, monthKey).status
                  if (s === 'unpaid') unpaid++
                  else if (s === 'partial') partial++
                }
              })
              const parts = []
              if (unpaid > 0)  parts.push(`${unpaid} nezaplatil${unpaid === 1 ? '' : 'o'}`)
              if (partial > 0) parts.push(`${partial} částečně`)
              return parts.length > 0 ? parts.join(' · ') : '—'
            })()}
          </div>
        </div>
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Plnění subjektu</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 10, background: 'var(--bg3)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: `${subPercent}%`, height: '100%', background: 'linear-gradient(90deg,#4ade80,#22c55e)', transition: 'width 0.5s' }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)', minWidth: 40 }}>{subPercent}%</div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
            {(() => {
              const seen = new Set()
              let paid = 0, partial = 0, total = 0
              subContracts.forEach(c => {
                const k = c.groupLabel || c.id
                if (seen.has(k)) return
                seen.add(k)
                total++
                if (c.groupLabel) {
                  const gp = payments.find(p => p.groupLabel === c.groupLabel && p.month === monthKey)
                  if (gp) paid++
                } else {
                  const s = getRentStatus(c, monthKey).status
                  if (s === 'paid') paid++
                  else if (s === 'partial') partial++
                }
              })
              return `${paid} plně · ${partial} částečně · z ${total} celkem`
            })()}
          </div>
        </div>
      </div>

      {/* ZÁLOŽKY SUBJEKTŮ */}
      <div style={{ background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 16, padding: 12, marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10, paddingLeft: 4 }}>Vyberte subjekt</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(4, auto)', gridAutoFlow: 'column', gap: 6 }}>
          {subjectsWithContracts.map(sub => {
            const isActive = activeSub === sub
            const sub2 = sub.includes('–') ? sub.split('–').slice(1).join('–').trim() : sub
            const group = sub.includes(' – ') ? sub.split(' – ')[0] : ''
            return (
              <button key={sub} onClick={() => handleSubChange(sub)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '8px 12px', borderRadius: 10, border: isActive ? '2px solid var(--accent)' : '1.5px solid var(--border)', background: isActive ? 'linear-gradient(135deg, #0A3D2B 0%, #1A8A62 100%)' : 'var(--bg)', color: isActive ? '#fff' : 'var(--text)', cursor: 'pointer', textAlign: 'left', boxShadow: isActive ? '0 4px 14px rgba(18,101,74,0.30)' : 'none', transition: 'all 0.15s ease' }}>
                {group && <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2, whiteSpace: 'nowrap' }}>{group}</span>}
                <span style={{ fontSize: 12.5, fontWeight: isActive ? 700 : 600, color: isActive ? '#fff' : 'var(--text)', lineHeight: 1.3, whiteSpace: 'nowrap' }}>{sub2}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* VNITŘNÍ ZÁLOŽKY */}
      <div style={{ display: 'flex', gap: 0, margin: '0 0 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
        {[['overview','📋 Přehled plateb za aktuální měsíc'],['history','📈 Historie za posledních 6 měsíců'],['debtors','🔴 Dosud neuhrazené platby napříč firmami za aktuální měsíc']].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{ padding: '10px 20px', border: 'none', background: 'transparent', borderBottom: activeTab === id ? '2px solid var(--accent)' : '2px solid transparent', color: activeTab === id ? 'var(--accent)' : 'var(--text3)', fontWeight: activeTab === id ? 700 : 500, fontSize: 13, cursor: 'pointer', marginBottom: '-1px', transition: '0.1s' }}>{label}</button>
        ))}
        <div style={{ flex: 1 }} />
        {!isReadOnly && (
          <button
            onClick={generateUnpaidReport}
            disabled={reportLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1.5px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: 12, cursor: reportLoading ? 'wait' : 'pointer', marginBottom: 6, opacity: reportLoading ? 0.6 : 1, transition: '0.15s', whiteSpace: 'nowrap' }}
          >
            {reportLoading ? '⏳ Generuji…' : '📄 Report nezaplacených'}
          </button>
        )}
      </div>

      {/* ══ TAB: PŘEHLED ══ */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 65%' }}>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '14px 20px', textAlign: 'left',  fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nájemce / Jednotka</th>
                    <th style={{ padding: '14px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Splatnost</th>
                    <th style={{ padding: '14px 12px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{isBytovySub(activeSub) ? 'Nájemné + parkování' : 'Nájemné'}</th>
                    <th style={{ padding: '14px 12px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Zálohy</th>
                    <th style={{ padding: '14px 12px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Uhrazeno dne</th>
                    <th style={{ padding: '14px 20px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nájem uhrazen</th>
                  </tr>
                </thead>
                <tbody>
                  {subContracts.length > 0 ? (() => {
                    // Seskup smlouvy dle group_label
                    const groups = []
                    const seen = new Set()
                    subContracts.forEach(c => {
                      if (c.groupLabel) {
                        if (!seen.has(c.groupLabel)) {
                          seen.add(c.groupLabel)
                          const members = subContracts.filter(x => x.groupLabel === c.groupLabel)
                          groups.push({ type: 'group', label: c.groupLabel, members })
                        }
                      } else {
                        groups.push({ type: 'single', contract: c })
                      }
                    })

                    return groups.map((g, gi) => {
                      if (g.type === 'group') {
                        const { label, members } = g
                        const groupTotal = members.reduce((s, c) => { const ev = getEffectiveValues(c, selectedYear, selectedMonth); return s + ev.rent + ev.parking + ev.flatFee }, 0)
                        const tenant = getTenantForContract(members[0])
                        // Skupina je uhrazena pokud existuje platba se stejným group_label v daném měsíci
                        const groupPayment = payments.find(p => p.groupLabel === label && p.month === monthKey)
                        const isPaid = !!groupPayment
                        const isPartial = groupPayment && Number(groupPayment.amount) < groupTotal - 0.01
                        const effectiveSub = members[0].billingSubject || getAssetForContract(members[0])?.subject || ''
                        const showDph = getAssetForContract(members[0])?.type !== 'residential' && (billingGroups.find(g => effectiveSub.startsWith(g.val))?.isVatPayer ?? true)

                        const handleGroupToggle = (e) => {
                          e.stopPropagation()
                          if (isReadOnly) return
                          if (groupPayment) {
                            deletePayment(groupPayment.id)
                          } else {
                            setPendingPayment({ groupLabel: label, tenantName: tenant?.name || '', paymentType: 'rent', fullAmount: groupTotal })
                          }
                        }

                        return (
                          <tr key={`group-${label}`}
                            style={{ borderBottom: '1px solid var(--border2)', background: isPaid ? 'rgba(187,247,208,0.55)' : 'rgba(239,68,68,0.18)', cursor: 'default' }}
                          >
                            <td style={{ padding: '14px 20px' }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{tenant?.name || 'Neznámý'}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                                <span style={{ fontSize: 10, background: '#EDE9FE', color: '#6D28D9', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>🔗 {label}</span>
                                <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                                  {members.length} {(() => {
                                    const t = getAssetForContract(members[0])?.type
                                    return t === 'commercial' ? 'prostor' : t === 'ads' ? 'ploch' : 'stání'
                                  })()}
                                </span>
                              </div>
                              {groupPayment?.note && (
                                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, fontStyle: 'italic' }}>
                                  💬 {groupPayment.note}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '14px 12px', textAlign: 'left', fontSize: 12, color: 'var(--text2)' }}>
                              {members[0]?.dueDay || '—'}
                            </td>
                            <td style={{ padding: '14px 12px', textAlign: 'right', fontWeight: 800, fontSize: 14, color: isPaid ? '#16A34A' : '#DC2626' }}>
                              {(() => {
                                const displayAmt = groupPayment?.agreed ? Number(groupPayment.amount) : groupTotal
                                return <>
                                  {displayAmt.toLocaleString('cs-CZ')} Kč
                                  {groupPayment?.agreed && displayAmt !== groupTotal && (
                                    <div style={{ fontSize: 10, color: '#16A34A', fontWeight: 600, marginTop: 1 }}>✓ odsouhlaseno (smlouva: {groupTotal.toLocaleString('cs-CZ')} Kč)</div>
                                  )}
                                  {showDph && displayAmt > 0 && !groupPayment?.agreed && <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, marginTop: 1 }}>s DPH: {(displayAmt * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</div>}
                                  {showDph && displayAmt > 0 && groupPayment?.agreed && <div style={{ fontSize: 10, color: '#16A34A', fontWeight: 600, marginTop: 1 }}>s DPH: {(displayAmt * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</div>}
                                </>
                              })()}
                            </td>
                            <td style={{ padding: '14px 12px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: isPaid ? '#16A34A' : '#DC2626' }}>
                              {(() => {
                                const isComm = getAssetForContract(members[0])?.type === 'commercial'
                                const dep  = members.reduce((s,c) => { const ev = getEffectiveValues(c, selectedYear, selectedMonth); return s + ev.deposit }, 0)
                                const depW = members.reduce((s,c) => { const ev = getEffectiveValues(c, selectedYear, selectedMonth); return s + ev.depositWater }, 0)
                                if (!isComm || (dep === 0 && depW === 0)) return <span style={{ color: 'var(--text3)', fontWeight: 400 }}>—</span>
                                return (
                                  <>
                                    {dep > 0 && (
                                      <div>
                                        {dep.toLocaleString('cs-CZ')} Kč
                                        {showDph && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>s DPH 21 %: {(dep * 1.21).toLocaleString('cs-CZ', {minimumFractionDigits:2,maximumFractionDigits:2})} Kč</div>}
                                      </div>
                                    )}
                                    {depW > 0 && (
                                      <div style={{ marginTop: dep > 0 ? 4 : 0 }}>
                                        {depW.toLocaleString('cs-CZ')} Kč <span style={{ fontSize: 10 }}>(voda)</span>
                                        {showDph && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>s DPH 12 %: {(depW * 1.12).toLocaleString('cs-CZ', {minimumFractionDigits:2,maximumFractionDigits:2})} Kč</div>}
                                      </div>
                                    )}
                                  </>
                                )
                              })()}
                            </td>
                            <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                              {groupPayment?.date
                                ? <span style={{ fontSize: 12, fontWeight: 700, color: '#16A34A' }}>{groupPayment.date}</span>
                                : <span style={{ fontSize: 12, color: 'var(--text3)' }}>—</span>}
                            </td>
                            <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                              {isPaid ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                                  {!isReadOnly && (
                                    <button onClick={(e) => { e.stopPropagation(); setEditAmountModal({ payment: groupPayment, monthLabel: formatMonthKey(monthKey), tenantName: tenant?.name || '' }) }} className="btn btn-sm"
                                      style={{ background: '#fff', color: '#D97706', borderColor: '#FCD34D', fontWeight: 700, borderRadius: 8, minWidth: 'unset', padding: '4px 8px' }}
                                      title="Upravit částku">✏️</button>
                                  )}
                                  <button onClick={handleGroupToggle} className="btn btn-sm"
                                    style={{ background: '#fff', color: '#991B1B', borderColor: '#FECACA', fontWeight: 800, minWidth: 96, borderRadius: 8, opacity: isReadOnly ? 0.5 : 1 }}>
                                    Zrušit
                                  </button>
                                </div>
                              ) : isPartial ? (
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: 11, fontWeight: 800, color: '#D97706', marginBottom: 4 }}>
                                    ⚠ Částečně: {Number(groupPayment.amount).toLocaleString('cs-CZ')} Kč
                                  </div>
                                  <div style={{ fontSize: 10, color: '#D97706', marginBottom: 4 }}>Zbývá: {(groupTotal - Number(groupPayment.amount)).toLocaleString('cs-CZ')} Kč</div>
                                  {!isReadOnly && (
                                    <button onClick={(e) => { e.stopPropagation(); setEditAmountModal({ payment: groupPayment, monthLabel: formatMonthKey(monthKey), tenantName: tenant?.name || '' }) }} className="btn btn-sm"
                                      style={{ background: '#fff', color: '#D97706', borderColor: '#FCD34D', fontWeight: 700, borderRadius: 8, fontSize: 11 }}
                                      title="Upravit částku">✏️ Upravit</button>
                                  )}
                                </div>
                              ) : (
                                <button onClick={handleGroupToggle} className="btn btn-sm"
                                  style={{ background: '#22C55E', color: '#fff', borderColor: '#22C55E', fontWeight: 800, minWidth: 96, borderRadius: 8, opacity: isReadOnly ? 0.5 : 1 }}>
                                  Uhrazeno
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      }

                      // Jednotlivá smlouva
                      const c = g.contract
                      const tenant   = getTenantForContract(c)
                      const asset    = getAssetForContract(c)
                      const freq     = c.paymentFrequency || 'Měsíčně'
                      const isMultiMonth = freq === 'Čtvrtletně' || freq === 'Pololetně' || freq === 'Ročně'
                      const ev       = getEffectiveValues(c, selectedYear, selectedMonth)
                      const rs       = isMultiMonth
                        ? { status: isPeriodPaid(c, selectedYear, selectedMonth) ? 'paid' : 'unpaid', payment: getPayment(c.id, monthKey) || null, remaining: effPeriodRent(c) }
                        : getRentStatus(c, monthKey)
                      const { status: rentStatus, payment, remaining } = rs
                      const isPaid    = rentStatus === 'paid'
                      const isPartial = rentStatus === 'partial'
                      const isRes     = asset?.type === 'residential'
                      const depPaymentRow = getDepositPayment(c.id, monthKey)
                      const depPaidRow    = !!depPaymentRow
                      const hasDeposit    = isRes && ev.deposit > 0
                      // Výsledný stav řádku — zohledňuje nájem i zálohy pro bytové
                      const rowAllPaid    = isPaid && (!hasDeposit || depPaidRow)
                      const rowSomePaid   = !rowAllPaid && (isPaid || isPartial || depPaidRow)
                      const rowBg  = rowAllPaid ? 'rgba(187,247,208,0.55)' : rowSomePaid ? 'rgba(254,215,170,0.55)' : 'rgba(239,68,68,0.18)'
                      const rowBgH = rowAllPaid ? 'rgba(187,247,208,0.85)'   : rowSomePaid ? 'rgba(254,215,170,0.85)'   : 'rgba(239,68,68,0.30)'
                      const rentTotal = ev.rent + ev.parking + ev.flatFee
                      const effectiveSub = c.billingSubject || asset?.subject || ''
                      const showDph = asset?.type !== 'residential' && (
                        (c.vatExempt === 2) ? true : (c.vatExempt === 1) ? false : (billingGroups.find(g => effectiveSub.startsWith(g.val))?.isVatPayer ?? true)
                      )
                      const isCommercial = asset?.type === 'commercial'

                      return (
                        <tr key={c.id} onClick={() => setDetailContract(c)}
                          style={{ borderBottom: '1px solid var(--border2)', background: rowBg, cursor: 'pointer', transition: '0.15s' }}
                          onMouseOver={e => { e.currentTarget.style.background = rowBgH }}
                          onMouseOut={e => { e.currentTarget.style.background = rowBg }}
                        >
                          <td style={{ padding: '14px 20px' }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{tenant?.name || 'Neznámý'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{asset?.unit || '—'}</div>
                            {payment?.note && (
                              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, fontStyle: 'italic' }}>
                                💬 {payment.note}
                              </div>
                            )}
                            {isMultiMonth && (() => {
                              const keys = getPeriodMonthKeys(c, selectedYear, selectedMonth)
                              const [fy, fm] = keys[0].split('-').map(Number)
                              const [ly, lm] = keys[keys.length-1].split('-').map(Number)
                              const fromLabel = `${MONTHS[fm].slice(0,3)} ${fy}`
                              const toLabel   = `${MONTHS[lm].slice(0,3)} ${ly}`
                              const freqColor = { 'Čtvrtletně': '#7C3AED', 'Pololetně': '#0369A1', 'Ročně': '#0F766E' }[freq] || 'var(--accent)'
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, background: freqColor, color: '#fff', padding: '1px 6px', borderRadius: 8 }}>{freq}</span>
                                  <span style={{ fontSize: 10, color: 'var(--text3)' }}>{fromLabel} – {toLabel}</span>
                                </div>
                              )
                            })()}
                          </td>
                          <td style={{ padding: '14px 12px', textAlign: 'left', fontSize: 12, color: 'var(--text2)' }}>
                            {c.dueDay || '—'}
                          </td>
                          <td style={{ padding: '14px 12px', textAlign: 'right', fontWeight: 800, fontSize: 14, color: isPaid ? '#16A34A' : isPartial ? '#D97706' : '#DC2626' }}>
                            {(() => {
                              const displayAmt = payment?.agreed ? Number(payment.amount) : rentTotal
                              return <>
                                {displayAmt.toLocaleString('cs-CZ')} Kč
                                {payment?.agreed && displayAmt !== rentTotal && (
                                  <div style={{ fontSize: 10, color: '#16A34A', fontWeight: 600, marginTop: 1 }}>✓ odsouhlaseno (smlouva: {rentTotal.toLocaleString('cs-CZ')} Kč)</div>
                                )}
                                {!payment?.agreed && isMultiMonth && effRent(c) !== rentTotal && (
                                  <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500, marginTop: 1 }}>= {effRent(c).toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} Kč/měs.</div>
                                )}
                                {showDph && displayAmt > 0 && <div style={{ fontSize: 10, color: payment?.agreed ? '#16A34A' : 'var(--text3)', fontWeight: 600, marginTop: 1 }}>s DPH: {(displayAmt * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</div>}
                                {isPartial && !payment?.agreed && <div style={{ fontSize: 10, color: '#D97706', fontWeight: 600, marginTop: 2 }}>Uhrazeno: {Number(payment.amount).toLocaleString('cs-CZ')} Kč</div>}
                              </>
                            })()}
                          </td>
                          <td style={{ padding: '14px 12px', textAlign: 'right', fontSize: 14, fontWeight: 800 }}>
                            {(() => {
                              const dep  = ev.deposit
                              const depW = ev.depositWater
                              if (dep === 0 && depW === 0) return <span style={{ color: 'var(--text3)', fontWeight: 400 }}>—</span>
                              const depPayment = getDepositPayment(c.id, monthKey)
                              const depPaid    = !!depPayment
                              const depPartial = depPayment && Number(depPayment.amount) < dep - 0.01
                              const depColor   = depPayment
                                ? (depPartial ? '#D97706' : '#16A34A')
                                : (hasDeposit ? (isPaid ? 'var(--text)' : '#DC2626') : (isPaid ? '#16A34A' : isPartial ? '#D97706' : '#DC2626'))
                              return (
                                <div style={{ color: depColor }}>
                                  {dep > 0 && (
                                    <div>
                                      {dep.toLocaleString('cs-CZ')} Kč
                                      {isCommercial && showDph && <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, marginTop: 1 }}>s DPH 21 %: {(dep * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</div>}
                                    </div>
                                  )}
                                  {depW > 0 && (
                                    <div style={{ marginTop: dep > 0 ? 4 : 0 }}>
                                      {depW.toLocaleString('cs-CZ')} Kč <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>(voda)</span>
                                      {isCommercial && showDph && <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, marginTop: 1 }}>s DPH 12 %: {(depW * 1.12).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</div>}
                                    </div>
                                  )}
                                </div>
                              )
                            })()}
                          </td>
                          <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                            {payment?.date
                              ? <span style={{ fontSize: 12, fontWeight: 700, color: '#16A34A' }}>{payment.date}</span>
                              : <span style={{ fontSize: 12, color: 'var(--text3)' }}>—</span>}
                          </td>
                          <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                            {isPaid ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                                {!isReadOnly && (
                                  <button onClick={(e) => { e.stopPropagation(); setEditAmountModal({ payment, monthLabel: formatMonthKey(monthKey), tenantName: getTenantForContract(c)?.name || '' }) }} className="btn btn-sm"
                                    style={{ background: '#fff', color: '#D97706', borderColor: '#FCD34D', fontWeight: 700, borderRadius: 8, minWidth: 'unset', padding: '4px 8px' }}
                                    title="Upravit nájem">✏️</button>
                                )}
                                {!isReadOnly && depPaymentRow && (
                                  <button onClick={(e) => { e.stopPropagation(); setEditAmountModal({ payment: depPaymentRow, monthLabel: formatMonthKey(monthKey), tenantName: (getTenantForContract(c)?.name || '') + ' (zálohy)' }) }} className="btn btn-sm"
                                    style={{ background: '#fff', color: '#1E40AF', borderColor: '#BFDBFE', fontWeight: 700, borderRadius: 8, minWidth: 'unset', padding: '4px 8px' }}
                                    title="Upravit zálohy">✏️💧</button>
                                )}
                                <button onClick={(e) => handleToggle(e, c, payment)} className="btn btn-sm"
                                  style={{ background: '#fff', color: '#991B1B', borderColor: '#FECACA', fontWeight: 800, minWidth: 96, borderRadius: 8, opacity: isReadOnly ? 0.5 : 1 }}>
                                  Zrušit
                                </button>
                              </div>
                            ) : isPartial ? (
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: '#D97706', marginBottom: 4 }}>
                                  ⚠ Částečně: {Number(payment.amount).toLocaleString('cs-CZ')} Kč
                                </div>
                                <div style={{ fontSize: 10, color: '#D97706', marginBottom: 4 }}>Zbývá: {remaining.toLocaleString('cs-CZ')} Kč</div>
                                {!isReadOnly && (
                                  <button onClick={(e) => { e.stopPropagation(); setEditAmountModal({ payment, monthLabel: formatMonthKey(monthKey), tenantName: getTenantForContract(c)?.name || '' }) }} className="btn btn-sm"
                                    style={{ background: '#fff', color: '#D97706', borderColor: '#FCD34D', fontWeight: 700, borderRadius: 8, fontSize: 11 }}
                                    title="Upravit částku">✏️ Upravit</button>
                                )}
                              </div>
                            ) : (
                              <button onClick={(e) => handleToggle(e, c, payment)} className="btn btn-sm"
                                style={{ background: '#22C55E', color: '#fff', borderColor: '#22C55E', fontWeight: 800, minWidth: 96, borderRadius: 8, opacity: isReadOnly ? 0.5 : 1 }}>
                                Uhrazeno
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  })() : (
                    <tr><td colSpan="6" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontStyle: 'italic' }}>
                      Pro tento subjekt nejsou aktivní žádné smlouvy.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* PRAVÝ REPORT */}
          <div style={{ flex: '0 0 32%', position: 'sticky', top: 24 }}>
            <div style={{ background: 'var(--bg)', border: '2px solid var(--border)', borderRadius: 20, padding: 24, boxShadow: '0 16px 32px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>Subjekt · {monthLabel}</div>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 20, color: 'var(--text)', lineHeight: 1.3 }}>{activeSub}</div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Vybráno</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#16A34A' }}>{subPercent}%</span>
                </div>
                <div style={{ height: 12, background: 'var(--bg3)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${subPercent}%`, height: '100%', background: 'linear-gradient(90deg,#4ade80,#22c55e)', transition: 'width 0.5s' }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ background: '#F0FDF4', padding: '14px 16px', borderRadius: 12, border: '1px solid #BBF7D0' }}>
                  <div style={{ fontSize: 10, color: '#166534', textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>Uhrazeno</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#166534' }}>{subReceived.toLocaleString('cs-CZ')} Kč</div>
                </div>
                <div style={{ background: subRemaining > 0 ? '#FEF2F2' : '#F0FDF4', padding: '14px 16px', borderRadius: 12, border: subRemaining > 0 ? '1px solid #FECACA' : '1px solid #BBF7D0' }}>
                  <div style={{ fontSize: 10, color: subRemaining > 0 ? '#991B1B' : '#166534', textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>Dosud neuhrazeno</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: subRemaining > 0 ? '#991B1B' : '#166534' }}>{subRemaining.toLocaleString('cs-CZ')} Kč</div>
                </div>
                <div style={{ background: 'var(--bg2)', padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>Má být celkem uhrazeno</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)' }}>{subExpected.toLocaleString('cs-CZ')} Kč</div>
                </div>
              </div>
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', textAlign: 'center', fontStyle: 'italic' }}>
                Klikněte na řádek pro detail a historii plateb.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB: HISTORIE ══ */}
      {activeTab === 'history' && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 20 }}>
            Inkaso nájemného — <span style={{ color: 'var(--accent)' }}>{activeSub}</span> — posledních 6 měsíců
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '24px 28px', marginBottom: 24, minHeight: 200 }}>
            {last6Months.map((m, i) => {
              const barH  = maxRec > 0 ? Math.round((m.exp / maxRec) * 120) : 0
              const fillH = m.exp > 0 ? Math.round((m.rec / m.exp) * barH) : 0
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>{m.pct}%</div>
                  <div style={{ width: '100%', height: barH, background: 'var(--bg3)', borderRadius: 8, position: 'relative', overflow: 'hidden', border: m.isCurrent ? '2px solid var(--accent)' : '1px solid var(--border)' }}>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: fillH, background: m.pct === 100 ? 'linear-gradient(0deg,#16a34a,#4ade80)' : m.pct > 50 ? 'linear-gradient(0deg,#d97706,#fbbf24)' : 'linear-gradient(0deg,#dc2626,#f87171)', borderRadius: 6, transition: 'height 0.4s' }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: m.isCurrent ? 800 : 600, color: m.isCurrent ? 'var(--accent)' : 'var(--text3)' }}>{m.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{m.rec.toLocaleString('cs-CZ')} Kč</div>
                </div>
              )
            })}
          </div>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '12px 20px', textAlign: 'left',  fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Měsíc</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Předpis</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Uhrazeno</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Dosud neuhrazeno</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Plnění</th>
                </tr>
              </thead>
              <tbody>
                {last6Months.slice().reverse().map((m, i) => {
                  const remaining = m.exp - m.rec
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border2)', background: m.isCurrent ? 'rgba(187,247,208,0.4)' : 'transparent', fontWeight: m.isCurrent ? 700 : 400 }}>
                      <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text)', fontWeight: m.isCurrent ? 800 : 600 }}>
                        {MONTHS[parseInt(m.key.split('-')[1])]} {m.key.split('-')[0]}
                        {m.isCurrent && <span style={{ marginLeft: 8, fontSize: 10, background: '#DCFCE7', color: '#166534', padding: '2px 6px', borderRadius: 4, fontWeight: 800 }}>Aktuální</span>}
                      </td>
                      <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 13, color: 'var(--text)' }}>{m.exp.toLocaleString('cs-CZ')} Kč</td>
                      <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 13, color: '#16A34A', fontWeight: 700 }}>{m.rec.toLocaleString('cs-CZ')} Kč</td>
                      <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 13, color: remaining > 0 ? '#DC2626' : '#16A34A', fontWeight: 600 }}>{remaining > 0 ? `${remaining.toLocaleString('cs-CZ')} Kč` : '—'}</td>
                      <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 800, background: m.pct === 100 ? '#DCFCE7' : m.pct > 50 ? '#FEF9C3' : '#FEE2E2', color: m.pct === 100 ? '#166534' : m.pct > 50 ? '#854D0E' : '#991B1B' }}>{m.pct}%</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ TAB: DLUŽNÍCI ══ */}
      {activeTab === 'debtors' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Dosud neuhrazené platby napříč firmami za {monthLabel}</div>
            <span style={{ background: debtors.length > 0 ? '#FEE2E2' : '#DCFCE7', color: debtors.length > 0 ? '#991B1B' : '#166534', padding: '3px 12px', borderRadius: 8, fontSize: 13, fontWeight: 800 }}>
              {debtors.length} {debtors.length === 1 ? 'smlouva' : debtors.length < 5 ? 'smlouvy' : 'smluv'}
            </span>
          </div>
          {debtors.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', background: '#F0FDF4', borderRadius: 16, border: '1px solid #BBF7D0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#166534' }}>Všichni zaplatili!</div>
              <div style={{ fontSize: 13, color: '#4ADE80', marginTop: 4 }}>Za {monthLabel} je vše uhrazeno napříč celým portfoliem.</div>
            </div>
          ) : (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '14px 20px', textAlign: 'left',  fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Nájemce</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left',  fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Jednotka / Subjekt</th>
                    <th style={{ padding: '14px 20px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Dlužná částka</th>
                    <th style={{ padding: '14px 20px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {debtors.map(({ contract: c, tenant, asset, rs, isGroup, groupLabel, groupTotal }) => (
                    <tr key={isGroup ? `group-${groupLabel}` : c.id} style={{ borderBottom: '1px solid var(--border2)', cursor: 'pointer', transition: '0.15s' }}
                      onClick={() => { setDetailContract(c); setActiveTab('overview'); setActiveSub(asset?.subject || subjects[0] || '') }}
                      onMouseOver={e => e.currentTarget.style.background = rs.status === 'partial' ? '#FFFBEB' : '#FEF2F2'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{tenant?.name || 'Neznámý'}</div>
                        {tenant?.phone && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>📞 {tenant.phone}</div>}
                        {isGroup && <div style={{ marginTop: 3 }}><span style={{ fontSize: 10, background: '#EDE9FE', color: '#6D28D9', padding: '1px 7px', borderRadius: 8, fontWeight: 700 }}>🔗 {groupLabel}</span></div>}
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{isGroup ? `Skupina (${activeContracts.filter(x => x.groupLabel === groupLabel).length} smlouvy)` : (asset?.unit || '—')}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{asset?.subject || '—'}</div>
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        {rs.status === 'partial' ? (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#D97706' }}>
                              ⚠ Částečně: {Number(rs.payment.amount).toLocaleString('cs-CZ')} Kč
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#D97706', marginTop: 2 }}>
                              Zbývá doplatit: {rs.remaining.toLocaleString('cs-CZ')} Kč
                            </div>
                          </>
                        ) : (
                          <div style={{ fontWeight: 900, fontSize: 15, color: '#DC2626' }}>
                            {(isGroup ? groupTotal : effRent(c)).toLocaleString('cs-CZ')} Kč
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <button onClick={(e) => { e.stopPropagation(); handleToggle(e, c, null) }} className="btn btn-sm"
                          style={{ background: '#22C55E', color: '#fff', borderColor: '#22C55E', fontWeight: 800, borderRadius: 8, opacity: isReadOnly ? 0.5 : 1 }}>
                          Uhrazeno
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ DETAIL MODAL ══ */}
      {detailContract && (() => {
        const c       = detailContract
        const tenant  = getTenantForContract(c)
        const asset   = getAssetForContract(c)
        const history = contractHistory(c.id)
        const typeIcon = { residential: '🏠', commercial: '🏢', ads: '📢', parking: '🅿️' }
        const isResidential = asset?.type === 'residential'
        const ev            = getEffectiveValues(c, selectedYear, selectedMonth)
        const rentTotal     = ev.rent + ev.parking
        const depositAmt    = ev.deposit
        const rentPayment    = getPayment(c.id, monthKey, 'rent') || (!isResidential && getPayment(c.id, monthKey))
        const depositPayment = isResidential ? getDepositPayment(c.id, monthKey) : null
        const rentIsPartial  = rentPayment && Number(rentPayment.amount) < rentTotal - 0.01
        const depIsPartial   = depositPayment && Number(depositPayment.amount) < depositAmt - 0.01

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
            onClick={() => setDetailContract(null)}>
            <div style={{ background: 'var(--bg)', width: 580, maxHeight: '88vh', borderRadius: 20, boxShadow: '0 30px 60px rgba(0,0,0,0.2)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
              onClick={e => e.stopPropagation()}>

              {/* Hlavička */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 22 }}>{typeIcon[asset?.type] || '📄'}</span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{asset?.unit || 'Neznámý předmět'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{asset?.subject || ''}</div>
                  </div>
                </div>
                <button onClick={() => setDetailContract(null)} style={{ background: 'var(--bg3)', border: 'none', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontWeight: 800, color: 'var(--text2)', fontSize: 16 }}>✕</button>
              </div>

              <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
                {/* Nájemce */}
                {tenant && (
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 18 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>Nájemce</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{tenant.name}</div>
                    {tenant.phone && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>📞 {tenant.phone}</div>}
                    {tenant.email && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>✉️ {tenant.email}</div>}
                    {tenant.bankAccount && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>🏦 {tenant.bankAccount}</div>}
                  </div>
                )}

                {/* Finanční podmínky – bytové: 2 sloupce s Uhrazeno tlačítky */}
                {isResidential ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
                    {/* Nájem + parkování */}
                    <div style={{ background: rentIsPartial ? '#FFFBEB' : rentPayment ? '#F0FDF4' : 'var(--bg2)', border: `1px solid ${rentIsPartial ? '#FCD34D' : rentPayment ? '#BBF7D0' : 'var(--border)'}`, borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: rentIsPartial ? '#D97706' : rentPayment ? '#166534' : 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>
                        Nájem{Number(c.parking) > 0 ? ' + parkování' : ''}
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: rentIsPartial ? '#D97706' : rentPayment ? '#166534' : 'var(--text)', marginBottom: 10 }}>
                        {rentTotal.toLocaleString('cs-CZ')} Kč
                      </div>
                      {rentPayment ? (
                        <div>
                          {rentIsPartial ? (
                            <>
                              <div style={{ fontSize: 11, color: '#D97706', fontWeight: 800, marginBottom: 2 }}>
                                ⚠ Částečně uhrazeno: {Number(rentPayment.amount).toLocaleString('cs-CZ')} Kč
                              </div>
                              <div style={{ fontSize: 10, color: '#D97706', marginBottom: 4 }}>
                                {rentPayment.date && `${rentPayment.date} · `}Zbývá: {(rentTotal - Number(rentPayment.amount)).toLocaleString('cs-CZ')} Kč
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 700, marginBottom: 6 }}>✓ Uhrazeno{rentPayment.date ? ` · ${rentPayment.date}` : ''}</div>
                          )}
                          {!isReadOnly && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-sm" style={{ flex: 1, background: '#fff', color: '#D97706', borderColor: '#FCD34D', fontWeight: 700, borderRadius: 8, fontSize: 11 }}
                                onClick={() => setEditAmountModal({ payment: rentPayment, monthLabel: monthLabel, tenantName: tenant?.name || '' })}>✏️ Upravit</button>
                              <button className="btn btn-sm" style={{ flex: 1, background: '#fff', color: '#991B1B', borderColor: '#FECACA', fontWeight: 700, borderRadius: 8, fontSize: 11 }}
                                onClick={() => deletePayment(rentPayment.id)}>Zrušit</button>
                            </div>
                          )}
                        </div>
                      ) : (
                        !isReadOnly && (
                          <button className="btn btn-sm" style={{ width: '100%', background: '#22C55E', color: '#fff', border: 'none', fontWeight: 700, borderRadius: 8, fontSize: 11 }}
                            onClick={() => setPendingPayment({ contract: c, tenantName: tenant?.name || '', paymentType: 'rent', fullAmount: rentTotal })}>
                            Nájem uhrazen
                          </button>
                        )
                      )}
                    </div>

                    {/* Zálohy */}
                    {depositAmt > 0 && (
                      <div style={{ background: depIsPartial ? '#FFFBEB' : depositPayment ? '#F0FDF4' : 'var(--bg2)', border: `1px solid ${depIsPartial ? '#FCD34D' : depositPayment ? '#BBF7D0' : 'var(--border)'}`, borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ fontSize: 9, fontWeight: 800, color: depIsPartial ? '#D97706' : depositPayment ? '#166534' : 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>Zálohy</div>
                        <div style={{ fontSize: 20, fontWeight: 900, color: depIsPartial ? '#D97706' : depositPayment ? '#166534' : 'var(--text)', marginBottom: 10 }}>
                          {depositAmt.toLocaleString('cs-CZ')} Kč
                        </div>
                        {depositPayment ? (
                          <div>
                            {depIsPartial ? (
                              <>
                                <div style={{ fontSize: 11, color: '#D97706', fontWeight: 800, marginBottom: 2 }}>
                                  ⚠ Částečně uhrazeno: {Number(depositPayment.amount).toLocaleString('cs-CZ')} Kč
                                </div>
                                <div style={{ fontSize: 10, color: '#D97706', marginBottom: 4 }}>
                                  {depositPayment.date && `${depositPayment.date} · `}Zbývá: {(depositAmt - Number(depositPayment.amount)).toLocaleString('cs-CZ')} Kč
                                </div>
                              </>
                            ) : (
                              <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 700, marginBottom: 6 }}>✓ Uhrazeno{depositPayment.date ? ` · ${depositPayment.date}` : ''}</div>
                            )}
                            {!isReadOnly && (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-sm" style={{ flex: 1, background: '#fff', color: '#D97706', borderColor: '#FCD34D', fontWeight: 700, borderRadius: 8, fontSize: 11 }}
                                  onClick={() => setEditAmountModal({ payment: depositPayment, monthLabel: monthLabel, tenantName: tenant?.name || '' })}>✏️ Upravit</button>
                                <button className="btn btn-sm" style={{ flex: 1, background: '#fff', color: '#991B1B', borderColor: '#FECACA', fontWeight: 700, borderRadius: 8, fontSize: 11 }}
                                  onClick={() => deletePayment(depositPayment.id)}>Zrušit</button>
                              </div>
                            )}
                          </div>
                        ) : (
                          !isReadOnly && (
                            <button className="btn btn-sm" style={{ width: '100%', background: '#22C55E', color: '#fff', border: 'none', fontWeight: 700, borderRadius: 8, fontSize: 11 }}
                              onClick={() => setPendingPayment({ contract: c, tenantName: tenant?.name || '', paymentType: 'deposit', fullAmount: depositAmt })}>
                              Zálohy uhrazeny
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Nerezidentní – interaktivní display s tlačítky */
                  (() => {
                    const commPayment    = rentPayment
                    const commDepPayment = getPayment(c.id, monthKey, 'deposit')
                    const commIsPartial    = commPayment && !commPayment.agreed && Number(commPayment.amount) < rentTotal - 0.01
                    const commDepIsPartial = commDepPayment && !commDepPayment.agreed && Number(commDepPayment.amount) < depositAmt - 0.01
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: depositAmt > 0 ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 18 }}>
                        {/* Nájem */}
                        <div style={{ background: commIsPartial ? '#FFFBEB' : commPayment ? '#F0FDF4' : 'var(--bg2)', border: `1px solid ${commIsPartial ? '#FCD34D' : commPayment ? '#BBF7D0' : 'var(--border)'}`, borderRadius: 12, padding: '14px 16px' }}>
                          <div style={{ fontSize: 9, fontWeight: 800, color: commIsPartial ? '#D97706' : commPayment ? '#166534' : 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>
                            Nájem{Number(c.parking) > 0 ? ' + parkování' : ''}
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 900, color: commIsPartial ? '#D97706' : commPayment ? '#166534' : 'var(--text)', marginBottom: 10 }}>
                            {commPayment?.agreed ? Number(commPayment.amount).toLocaleString('cs-CZ') : rentTotal.toLocaleString('cs-CZ')} Kč
                            {commPayment?.agreed && Number(commPayment.amount) !== rentTotal && (
                              <span style={{ fontSize: 11, color: '#15803D', fontWeight: 600, marginLeft: 6 }}>(sml. {rentTotal.toLocaleString('cs-CZ')})</span>
                            )}
                          </div>
                          {commPayment ? (
                            <div>
                              {commPayment.agreed ? (
                                <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 700, marginBottom: 6 }}>✓ Odsouhlaseno{commPayment.date ? ` · ${commPayment.date}` : ''}</div>
                              ) : commIsPartial ? (
                                <>
                                  <div style={{ fontSize: 11, color: '#D97706', fontWeight: 800, marginBottom: 2 }}>⚠ Částečně: {Number(commPayment.amount).toLocaleString('cs-CZ')} Kč</div>
                                  <div style={{ fontSize: 10, color: '#D97706', marginBottom: 4 }}>{commPayment.date && `${commPayment.date} · `}Zbývá: {(rentTotal - Number(commPayment.amount)).toLocaleString('cs-CZ')} Kč</div>
                                </>
                              ) : (
                                <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 700, marginBottom: 6 }}>✓ Uhrazeno{commPayment.date ? ` · ${commPayment.date}` : ''}</div>
                              )}
                              {!isReadOnly && (
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button className="btn btn-sm" style={{ flex: 1, background: '#fff', color: '#D97706', borderColor: '#FCD34D', fontWeight: 700, borderRadius: 8, fontSize: 11 }}
                                    onClick={() => setEditAmountModal({ payment: commPayment, monthLabel: monthLabel, tenantName: tenant?.name || '' })}>✏️ Upravit</button>
                                  <button className="btn btn-sm" style={{ flex: 1, background: '#fff', color: '#991B1B', borderColor: '#FECACA', fontWeight: 700, borderRadius: 8, fontSize: 11 }}
                                    onClick={() => deletePayment(commPayment.id)}>Zrušit</button>
                                </div>
                              )}
                            </div>
                          ) : (
                            !isReadOnly && (
                              <button className="btn btn-sm" style={{ width: '100%', background: '#22C55E', color: '#fff', border: 'none', fontWeight: 700, borderRadius: 8, fontSize: 11 }}
                                onClick={() => setPendingPayment({ contract: c, tenantName: tenant?.name || '', paymentType: 'rent', fullAmount: rentTotal })}>
                                Nájem uhrazen
                              </button>
                            )
                          )}
                        </div>

                        {/* Zálohy komerční */}
                        {depositAmt > 0 && (
                          <div style={{ background: commDepIsPartial ? '#FFFBEB' : commDepPayment ? '#F0FDF4' : 'var(--bg2)', border: `1px solid ${commDepIsPartial ? '#FCD34D' : commDepPayment ? '#BBF7D0' : 'var(--border)'}`, borderRadius: 12, padding: '14px 16px' }}>
                            <div style={{ fontSize: 9, fontWeight: 800, color: commDepIsPartial ? '#D97706' : commDepPayment ? '#166534' : 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>Zálohy</div>
                            <div style={{ fontSize: 20, fontWeight: 900, color: commDepIsPartial ? '#D97706' : commDepPayment ? '#166534' : 'var(--text)', marginBottom: 10 }}>
                              {commDepPayment?.agreed ? Number(commDepPayment.amount).toLocaleString('cs-CZ') : depositAmt.toLocaleString('cs-CZ')} Kč
                              {commDepPayment?.agreed && Number(commDepPayment.amount) !== depositAmt && (
                                <span style={{ fontSize: 11, color: '#15803D', fontWeight: 600, marginLeft: 6 }}>(sml. {depositAmt.toLocaleString('cs-CZ')})</span>
                              )}
                            </div>
                            {commDepPayment ? (
                              <div>
                                {commDepPayment.agreed ? (
                                  <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 700, marginBottom: 6 }}>✓ Odsouhlaseno{commDepPayment.date ? ` · ${commDepPayment.date}` : ''}</div>
                                ) : commDepIsPartial ? (
                                  <>
                                    <div style={{ fontSize: 11, color: '#D97706', fontWeight: 800, marginBottom: 2 }}>⚠ Částečně: {Number(commDepPayment.amount).toLocaleString('cs-CZ')} Kč</div>
                                    <div style={{ fontSize: 10, color: '#D97706', marginBottom: 4 }}>{commDepPayment.date && `${commDepPayment.date} · `}Zbývá: {(depositAmt - Number(commDepPayment.amount)).toLocaleString('cs-CZ')} Kč</div>
                                  </>
                                ) : (
                                  <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 700, marginBottom: 6 }}>✓ Uhrazeno{commDepPayment.date ? ` · ${commDepPayment.date}` : ''}</div>
                                )}
                                {!isReadOnly && (
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button className="btn btn-sm" style={{ flex: 1, background: '#fff', color: '#D97706', borderColor: '#FCD34D', fontWeight: 700, borderRadius: 8, fontSize: 11 }}
                                      onClick={() => setEditAmountModal({ payment: commDepPayment, monthLabel: monthLabel, tenantName: (tenant?.name || '') + ' (zálohy)' })}>✏️ Upravit</button>
                                    <button className="btn btn-sm" style={{ flex: 1, background: '#fff', color: '#991B1B', borderColor: '#FECACA', fontWeight: 700, borderRadius: 8, fontSize: 11 }}
                                      onClick={() => deletePayment(commDepPayment.id)}>Zrušit</button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              !isReadOnly && (
                                <button className="btn btn-sm" style={{ width: '100%', background: '#22C55E', color: '#fff', border: 'none', fontWeight: 700, borderRadius: 8, fontSize: 11 }}
                                  onClick={() => setPendingPayment({ contract: c, tenantName: tenant?.name || '', paymentType: 'deposit', fullAmount: depositAmt })}>
                                  Zálohy uhrazeny
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()
                )}

                {/* Platnost */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 3 }}>Platnost od</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{c.start || '—'}</div>
                  </div>
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 3 }}>Platnost do</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{c.end || 'Neurčito'}</div>
                  </div>
                </div>

                {/* Historie plateb */}
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Historie plateb ({history.length})
                </div>
                {history.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>Žádné evidované platby.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {history.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 13px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 9 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>{formatMonthKey(p.month)}</div>
                            {p.paymentType === 'deposit' && (
                              <span style={{ fontSize: 10, background: '#DBEAFE', color: '#1E40AF', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>zálohy</span>
                            )}
                            {(p.paymentType === 'rent' || p.paymentType === '') && isResidential && (
                              <span style={{ fontSize: 10, background: '#DCFCE7', color: '#166534', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>nájem</span>
                            )}
                          </div>
                          {p.date && <div style={{ fontSize: 10, color: '#4ADE80', marginTop: 1 }}>Přijato: {p.date}</div>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#166534' }}>{Number(p.amount || 0).toLocaleString('cs-CZ')} Kč</div>
                          {!isReadOnly && (
                            <button
                              onClick={() => setEditAmountModal({ payment: p, monthLabel: formatMonthKey(p.month), tenantName: tenant?.name || '' })}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: '1px solid #BBF7D0', background: '#fff', cursor: 'pointer', color: '#166534', fontSize: 12, flexShrink: 0 }}
                              title="Upravit částku"
                            >✏️</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
