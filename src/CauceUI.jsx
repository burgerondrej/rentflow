import React, { useState } from 'react'
import { useApp } from './AppContext.jsx'
import DialogShell from './DialogShell.jsx'
import { parseDate, isContractOccupying, isContractBillable, contractSubject, firmOf, overdueItems, toCzDate } from './utils.js'

// ─────────────────────────────────────────
// KAUCE – stav, vypořádání při ukončení / změně nájemce, dialog vypořádání
// Vypořádání je v tabulce cauce_settlements (contractId → vráceno / započteno); bez záznamu se kauce drží.
// ─────────────────────────────────────────

export const fmtKc = (v) => `${Math.round(Number(v) || 0).toLocaleString('cs-CZ')} Kč`

/**
 * Stav kauce smlouvy: null (bez kauce) | { status, amount, settlement?, successor? }
 * status: 'held' (platná smlouva) | 'toReturn' (ukončená, nevypořádaná) | 'transferred' (převedena na navazující smlouvu
 * téhož nájemce – kauce se při prodloužení kopíruje) | 'settled' (vypořádaná).
 */
export function cauceInfo(c, contracts = [], settlements = []) {
  const amount = Number(c?.cauce) || 0
  if (amount <= 0) return null
  const settlement = settlements.find(s => s.contractId === c.id)
  if (settlement) return { status: 'settled', amount, settlement }
  if (isContractOccupying(c)) return { status: 'held', amount }
  const st = parseDate(c.start)?.getTime() ?? -Infinity
  const successor = contracts.find(o => o.id !== c.id && o.assetId === c.assetId && o.tenantId === c.tenantId &&
    (o.status === 'active' || isContractBillable(o)) && (parseDate(o.start)?.getTime() ?? -Infinity) > st && (Number(o.cauce) || 0) > 0)
  if (successor) return { status: 'transferred', amount, successor }
  return { status: 'toReturn', amount }
}

/** Dluh nájemce po splatnosti u firmy smlouvy (pro nápovědu „zvaž započtení“). */
export function tenantDebtForContract(c, ctx) {
  const firm = firmOf(contractSubject(c, ctx.assets || []))
  return overdueItems(ctx, s => firmOf(s) === firm).filter(it => it.contract.tenantId === c.tenantId).reduce((s, it) => s + it.owe, 0)
}

/** Z volby { mode: 'return' | 'offset' | 'later', offset } udělá záznam vypořádání (nebo null = vyřeší se později). */
export function settlementFromChoice(contractId, amount, choice, dateCz, note) {
  if (!choice || choice.mode === 'later') return null
  const offset = choice.mode === 'offset' ? Math.min(Math.max(0, Number(choice.offset) || 0), amount) : 0
  return { contractId, date: dateCz || toCzDate(new Date()), returned: amount - offset, offsetAmount: offset, note: note || null }
}

/**
 * Pole pro vypořádání kauce (nekontrolovaná – výsledek hlásí přes onChange({ mode, offset })).
 * allowLater = nabídnout „Vyřeším později“ (při ukončení / změně nájemce).
 */
export function CauceSettleFields({ amount, debt = 0, allowLater = true, initial = 'return', onChange }) {
  const [mode, setMode] = useState(initial)
  const [offset, setOffset] = useState(debt > 0 ? String(Math.min(Math.round(debt), amount)) : '')
  const emit = (m, o) => onChange && onChange({ mode: m, offset: o })
  const radio = (id, label, extra) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0', fontSize: 13.5, color: 'var(--text)', cursor: 'pointer', flexWrap: 'wrap' }}>
      <input type="radio" name="cauce-mode" checked={mode === id} onChange={() => { setMode(id); emit(id, offset) }} />
      {label}{extra}
    </label>
  )
  return (
    <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--tone-amber-soft)', border: '1px solid var(--tone-amber-border)', borderRadius: 10 }}>
      <div style={{ fontWeight: 800, color: 'var(--tone-amber-text)', marginBottom: 4 }}>💰 Kauce {fmtKc(amount)}</div>
      {radio('return', 'Vrátit celou')}
      {radio('offset', 'Započíst', <>
        <input type="number" min={0} max={amount} className="btn" value={offset}
          onChange={e => { setOffset(e.target.value); setMode('offset'); emit('offset', e.target.value) }}
          style={{ width: 110, textAlign: 'right', cursor: 'text', padding: '4px 8px' }} />
        <span>Kč (dluh / škoda), zbytek vrátit</span>
      </>)}
      {allowLater && radio('later', 'Vyřeším později (zůstane v přehledu Kauce jako „k vrácení“)')}
      {debt > 0 && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Nájemce u této firmy dluží {fmtKc(debt)} po splatnosti – zvaž započtení.</div>}
    </div>
  )
}

/** Dialog vypořádání kauce (z přehledu Kauce ve Smlouvách). */
export function CauceSettleDialog({ contract, onClose }) {
  const { contracts = [], payments = [], assets = [], tenants = [], cauceSettlements = [], saveCauceSettlement, deleteCauceSettlement, confirmAction, isReadOnly } = useApp()
  const info = cauceInfo(contract, contracts, cauceSettlements)
  const existing = info?.settlement
  const amount = info?.amount || 0
  const [choice, setChoice] = useState(existing ? { mode: existing.offsetAmount > 0 ? 'offset' : 'return', offset: String(existing.offsetAmount || '') } : { mode: 'return', offset: '' })
  const [dateIso, setDateIso] = useState(() => { const d = parseDate(existing?.date) || new Date(); return d.toLocaleDateString('sv-SE') })
  const [note, setNote] = useState(existing?.note || '')
  const debt = tenantDebtForContract(contract, { payments, contracts, assets })
  const unit = assets.find(a => a.id === contract.assetId)?.unit || ''
  const tenant = tenants.find(t => t.id === contract.tenantId)?.name || ''
  const save = async () => {
    const [y, m, d] = dateIso.split('-').map(Number)
    const s = settlementFromChoice(contract.id, amount, choice, y ? toCzDate(new Date(y, m - 1, d)) : null, note.trim() || null)
    if (s && await saveCauceSettlement(s)) onClose()
  }
  return (
    <DialogShell icon="💰" tone="amber" title="Vypořádání kauce" subtitle={`${unit} – ${tenant}`} width={500} onClose={onClose}
      footer={<>
        {existing && !isReadOnly && <button className="btn" style={{ marginRight: 'auto', color: 'var(--tone-red-text)' }}
          onClick={() => confirmAction({ title: 'Zrušit vypořádání kauce?', text: `Kauce ${fmtKc(amount)} se znovu zobrazí jako držená / k vrácení.`, okLabel: 'Zrušit vypořádání', danger: true,
            onOk: async () => { await deleteCauceSettlement(contract.id); onClose() } })}>Zrušit vypořádání</button>}
        <button className="btn" onClick={onClose}>Zavřít</button>
        {!isReadOnly && <button className="btn btn-primary" onClick={save}>Uložit</button>}
      </>}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Datum vypořádání</label>
      <input type="date" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box' }} value={dateIso} onChange={e => setDateIso(e.target.value)} />
      <CauceSettleFields amount={amount} debt={debt} allowLater={false} initial={choice.mode} onChange={setChoice} />
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', margin: '14px 0 6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Poznámka</label>
      <input type="text" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text', boxSizing: 'border-box' }} value={note} placeholder="např. vráceno převodem, započteno za vymalování…" onChange={e => setNote(e.target.value)} />
    </DialogShell>
  )
}
