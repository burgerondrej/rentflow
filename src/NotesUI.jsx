import React, { useState } from 'react'
import { useApp } from './AppContext.jsx'
import { SectionHeader } from './UI.jsx'

/**
 * Poznámky ke smlouvě / nájemci – záznamy s datem (tabulka notes), nejnovější nahoře.
 * Smlouva má navíc staré pole „Poznámky ke smlouvě“ (contractNotes) – zobrazí se nahoře jako 📌 (pinned), data se nepřevádějí.
 */

/** "RRRR-MM-DD HH:MM:SS" → "26. 11. 2026 14:32" */
export function formatNoteDate(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]} ${m[4]}:${m[5]}` : (s || '')
}

/** Poznámky jedné smlouvy / nájemce (už seřazené od nejnovější). */
export const notesOf = (notes, entityType, entityId) => (notes || []).filter(n => n.entityType === entityType && n.entityId === entityId)

/** Ikonka 📝 s počtem na kartě; najetí = poslední poznámka. */
export function NoteBadge({ count, latest, style }) {
  if (!count) return null
  const tip = latest ? `${formatNoteDate(latest.createdAt)}\n${latest.text}` : ''
  return (
    <span title={tip} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 800, padding: '2px 7px', borderRadius: 8,
      background: 'var(--tone-amber-soft)', border: '1px solid var(--tone-amber-border)', color: 'var(--tone-amber-text)', whiteSpace: 'nowrap', cursor: 'help', ...style }}>
      📝 {count}
    </span>
  )
}

const taStyle = { width: '100%', minHeight: 64, resize: 'vertical', padding: '9px 11px', borderRadius: 9, border: '1.5px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.55, boxSizing: 'border-box' }

/** Textové pole: Ctrl+Enter = uložit, Esc = zrušit (Esc nezavře detail). */
function NoteEditor({ initial = '', placeholder, saveLabel = 'Uložit', onSave, onCancel, autoFocus }) {
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    const ok = await onSave(text)
    setBusy(false)
    if (ok && !onCancel) setText('')
  }
  return (
    <div>
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} style={taStyle}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() }
          if (e.key === 'Escape' && (onCancel || text)) { e.preventDefault(); e.stopPropagation(); onCancel ? onCancel() : setText('') }
        }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>Ctrl+Enter = uložit</span>
        <div style={{ flex: 1 }} />
        {onCancel && <button type="button" className="btn btn-sm" onClick={onCancel}>Zrušit</button>}
        <button type="button" className="btn btn-sm btn-primary" disabled={!text.trim() || busy} onClick={save}>{saveLabel}</button>
      </div>
    </div>
  )
}

const iconBtn = { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, padding: '2px 5px', borderRadius: 6, color: 'var(--text3)' }

function NoteItem({ note, label, onOpen, readOnly }) {
  const { updateNote, deleteNote, confirmAction } = useApp()
  const [editing, setEditing] = useState(false)
  const snippet = note.text.length > 60 ? note.text.slice(0, 60) + '…' : note.text
  return (
    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text2)' }}>{formatNoteDate(note.createdAt)}</span>
        {note.updatedAt && <span style={{ fontSize: 11, color: 'var(--text3)' }} title={`Upraveno ${formatNoteDate(note.updatedAt)}`}>· upraveno</span>}
        {label && (
          <span onClick={onOpen} title={onOpen ? 'Otevřít smlouvu' : undefined}
            style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 7, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: onOpen ? 'pointer' : 'default' }}>
            📑 {label}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {!readOnly && !editing && <>
          <button type="button" style={iconBtn} title="Upravit poznámku" onClick={() => setEditing(true)}>✏️</button>
          <button type="button" style={iconBtn} title="Smazat poznámku"
            onClick={() => confirmAction({ title: 'Smazat poznámku', text: `Poznámka z ${formatNoteDate(note.createdAt)} („${snippet}“) se trvale smaže.`, okLabel: 'Smazat', danger: true, onOk: () => deleteNote(note.id) })}>🗑</button>
        </>}
      </div>
      {editing
        ? <NoteEditor initial={note.text} autoFocus onCancel={() => setEditing(false)} onSave={async (t) => { const ok = await updateNote(note.id, t); if (ok) setEditing(false); return ok }} />
        : <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note.text}</div>}
    </div>
  )
}

/**
 * Sekce 📝 Poznámky (detail → Přehled).
 * pinned = { title, text, onSave(text) } – staré pole poznámky ve smlouvě; related = [{ note, label, onOpen }] – poznámky smluv nájemce.
 */
export function NotesSection({ entityType, entityId, pinned, related = [], style }) {
  const { notes = [], addNote, isReadOnly } = useApp()
  const own = notesOf(notes, entityType, entityId)
  const [pinEdit, setPinEdit] = useState(false)
  const total = own.length + related.length + (pinned?.text ? 1 : 0)
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', ...style }}>
      <SectionHeader icon="📝" tone="amber" title="Poznámky" meta={total ? String(total) : ''} />
      {!isReadOnly && (
        <div style={{ padding: '10px 16px 12px' }}>
          <NoteEditor placeholder="Napsat poznámku…" onSave={(t) => addNote(entityType, entityId, t)} />
        </div>
      )}
      {pinned?.text && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border2)', background: 'var(--bg2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text2)' }}>📌 {pinned.title}</span>
            <div style={{ flex: 1 }} />
            {!isReadOnly && !pinEdit && pinned.onSave && <button type="button" style={iconBtn} title="Upravit" onClick={() => setPinEdit(true)}>✏️</button>}
          </div>
          {pinEdit
            ? <NoteEditor initial={pinned.text} autoFocus onCancel={() => setPinEdit(false)} onSave={async (t) => { const ok = await pinned.onSave(t); if (ok !== false) setPinEdit(false); return ok !== false }} />
            : <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{pinned.text}</div>}
        </div>
      )}
      {own.map(n => <NoteItem key={n.id} note={n} readOnly={isReadOnly} />)}
      {related.length > 0 && <>
        <div style={{ padding: '6px 16px', fontSize: 10.5, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', background: 'var(--bg2)', borderTop: '1px solid var(--border2)' }}>Ze smluv</div>
        {related.map(r => <NoteItem key={r.note.id} note={r.note} label={r.label} onOpen={r.onOpen} readOnly={isReadOnly || r.pinned} />)}
      </>}
      {!total && isReadOnly && <div style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--text3)' }}>Zatím žádné poznámky.</div>}
    </div>
  )
}
