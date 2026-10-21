import React, { useState } from 'react'
import { useApp } from './AppContext.jsx'
import DialogShell from './DialogShell.jsx'
import { parseDate, toCzDate } from './utils.js'

// ─────────────────────────────────────────
// POZNÁMKA K DLUŽNÍKOVI – jedna na nájemce v rámci firmy (firmy striktně oddělené)
// Zobrazuje se v Platbách → Po splatnosti a v detailu nájemce (Saldo).
// ─────────────────────────────────────────

export const findDebtNote = (notes = [], tenantId, firm) => notes.find(n => n.tenantId === tenantId && n.firm === firm) || null

/** Stav slibu: null | { kind: 'pending' | 'broken', days, date } – po termínu = slib nedodržen. */
export function promiseState(note) {
  const d = parseDate(note?.promisedDate)
  if (!d) return null
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const days = Math.round((t - d) / 86400000)
  return days > 0 ? { kind: 'broken', days, date: note.promisedDate } : { kind: 'pending', days: -days, date: note.promisedDate }
}

/** Řádek s poznámkou a štítkem slibu (nic, pokud poznámka není). */
export function DebtNoteLine({ note, style }) {
  if (!note || (!note.note && !note.promisedDate)) return null
  const ps = promiseState(note)
  const tone = ps?.kind === 'broken' ? 'red' : 'amber'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, fontWeight: 700, color: `var(--tone-${tone}-text)`, ...style }}>
      {note.note && <span>📝 {note.note}</span>}
      {ps && (
        <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 8px', borderRadius: 999, background: `var(--tone-${tone}-soft)`, border: `1px solid var(--tone-${tone}-border)`, whiteSpace: 'nowrap' }}>
          {ps.kind === 'broken' ? `slib nedodržen (${ps.days} ${ps.days === 1 ? 'den' : ps.days < 5 ? 'dny' : 'dní'})` : `slíbeno do ${ps.date}`}
        </span>
      )}
    </div>
  )
}

/** Dialog poznámky k dlužníkovi (přidat / upravit / smazat). */
export function DebtNoteDialog({ tenantId, firm, tenantName, onClose }) {
  const { debtNotes = [], saveDebtNote, deleteDebtNote, confirmAction, isReadOnly } = useApp()
  const existing = findDebtNote(debtNotes, tenantId, firm)
  const [text, setText] = useState(existing?.note || '')
  const [dateIso, setDateIso] = useState(() => { const d = parseDate(existing?.promisedDate); return d ? d.toLocaleDateString('sv-SE') : '' })
  const save = async () => {
    const [y, m, d] = (dateIso || '').split('-').map(Number)
    const promisedDate = y ? toCzDate(new Date(y, m - 1, d)) : null
    if (!text.trim() && !promisedDate) { onClose(); return }
    if (await saveDebtNote({ id: existing?.id || '', tenantId, firm, note: text.trim() || null, promisedDate })) onClose()
  }
  const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.4px' }
  return (
    <DialogShell icon="📝" tone="amber" title="Poznámka k dlužníkovi" subtitle={`${tenantName || ''} · ${firm}`} width={480} onClose={onClose}
      footer={<>
        {existing && !isReadOnly && <button className="btn" style={{ marginRight: 'auto', color: 'var(--tone-red-text)' }}
          onClick={() => confirmAction({ title: 'Smazat poznámku?', text: `Poznámka k nájemci ${tenantName || ''} (${firm}) bude smazána.`, okLabel: 'Smazat', danger: true,
            onOk: async () => { await deleteDebtNote(existing.id); onClose() } })}>Smazat</button>}
        <button className="btn" onClick={onClose}>Zavřít</button>
        {!isReadOnly && <button className="btn btn-primary" onClick={save}>Uložit</button>}
      </>}>
      <label style={lbl}>Poznámka</label>
      <textarea className="btn" rows={3} value={text} onChange={e => setText(e.target.value)} autoFocus
        placeholder="např. 20. 10. volal, doplatí vše do konce měsíce"
        style={{ width: '100%', boxSizing: 'border-box', textAlign: 'left', cursor: 'text', resize: 'vertical', fontFamily: 'inherit' }} />
      <label style={{ ...lbl, marginTop: 14 }}>Slíbil zaplatit do</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="date" className="btn" value={dateIso} onChange={e => setDateIso(e.target.value)} style={{ cursor: 'pointer', textAlign: 'left' }} />
        {dateIso && <button type="button" className="btn btn-sm" onClick={() => setDateIso('')}>Bez termínu</button>}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>Platí pro všechny dluhy nájemce u této firmy. Po termínu se v Po splatnosti ukáže „slib nedodržen“.</div>
    </DialogShell>
  )
}
