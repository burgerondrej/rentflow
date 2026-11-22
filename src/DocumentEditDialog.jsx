import React, { useState } from 'react'
import DialogShell from './DialogShell.jsx'
import { useApp } from './AppContext.jsx'

/** Kategorie dokumentů – stejné jako při nahrání (Dokumenty, detail smlouvy / předmětu / nájemce). */
export const DOC_TYPES = ['Smlouva', 'Dodatek k NS', 'Protokol', 'Faktura', 'Revize', 'Ostatní']

/** Úprava dokumentu: název, kategorie, poznámka. Soubor ani vazba na smlouvu se nemění. */
export default function DocumentEditDialog({ doc, onClose }) {
  const { updateDocument } = useApp()
  const [name, setName] = useState(doc.name || '')
  const [type, setType] = useState(doc.type || 'Ostatní')
  const [notes, setNotes] = useState(doc.notes || '')
  const [busy, setBusy] = useState(false)
  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const ok = await updateDocument({ ...doc, name: name.trim(), type, notes: notes.trim() || null })
    setBusy(false)
    if (ok) onClose()
  }
  const types = DOC_TYPES.includes(type) ? DOC_TYPES : [...DOC_TYPES, type]
  return (
    <DialogShell icon="📄" tone="blue" title="Upravit dokument" subtitle={doc.uploadedAt ? `Nahráno ${doc.uploadedAt}` : undefined} width={460} onClose={onClose} busy={busy}
      footer={<><button className="btn" onClick={onClose}>Zrušit</button><button className="btn btn-primary" type="submit" form="doc-edit" disabled={busy || !name.trim()}>Uložit</button></>}>
      <form id="doc-edit" onSubmit={save}>
        <label className="dlg-lbl">Název</label>
        <input className="btn" autoFocus value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', textAlign: 'left', cursor: 'text' }} />
        <label className="dlg-lbl" style={{ marginTop: 12 }}>Kategorie</label>
        <select className="btn" value={type} onChange={e => setType(e.target.value)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="dlg-lbl" style={{ marginTop: 12 }}>Poznámka</label>
        <textarea className="btn" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Volitelná poznámka k dokumentu…"
          style={{ width: '100%', boxSizing: 'border-box', textAlign: 'left', cursor: 'text', minHeight: 64, resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }} />
      </form>
    </DialogShell>
  )
}
