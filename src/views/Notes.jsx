import React, { useMemo, useState } from 'react'
import { useApp } from '../AppContext.jsx'
import DialogShell from '../DialogShell.jsx'
import { EmptyState } from '../UI.jsx'
import { FirmBadge, useObjectFirms } from '../FirmUI.jsx'
import { NoteEditor, NoteItem } from '../NotesUI.jsx'
import { contractSubject, firmOf, isContractOccupying } from '../utils.js'

/**
 * Administrativa → Poznámky: strom firma → budovy + vlastní sekce (libovolná hloubka) a přehled poznámek ze smluv / od nájemců.
 * Uzel = 'firm:<název>' | 'object:<název budovy>' | 'section:<id>' | 'related:<firma>' (jen čtení).
 * Poznámky v tabulce notes (entityType firm / object / section / contract / tenant), sekce v note_sections.
 */

const natural = (a, b) => String(a).localeCompare(String(b), 'cs', { numeric: true, sensitivity: 'base' })
const lsGet = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def } catch { return def } }
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* jen pohodlí */ } }
const splitKey = (key) => { const i = (key || '').indexOf(':'); return i < 0 ? ['', ''] : [key.slice(0, i), key.slice(i + 1)] }

export default function Notes({ onOpen }) {
  const { firms = [], notes = [], noteSections = [], contracts = [], tenants = [], assets = [], getFirm,
    addNote, addNoteSection, renameNoteSection, deleteNoteSection, confirmAction, isReadOnly } = useApp()
  const { itemsByFirm, firmOfObject } = useObjectFirms()

  const [firmFilter, setFirmFilter] = useState(() => lsGet('rf_notes_firm', ''))
  const [sel, setSelRaw] = useState(() => lsGet('rf_notes_sel', ''))
  const [closed, setClosed] = useState(() => new Set(lsGet('rf_notes_closed', [])))
  const [q, setQ] = useState('')
  const [dlg, setDlg] = useState(null) // { mode: 'add' | 'rename', parentType, parentId, id, name }

  const setSel = (k) => { setSelRaw(k); lsSet('rf_notes_sel', k); setQ('') }
  const toggle = (k) => setClosed(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); lsSet('rf_notes_closed', [...n]); return n })
  const pickFirm = (f) => { setFirmFilter(f); lsSet('rf_notes_firm', f) }

  const visibleFirms = firms.filter(f => !firmFilter || f.name === firmFilter)
  const childrenOf = (type, id) => noteSections.filter(s => s.parentType === type && s.parentId === id).sort((a, b) => natural(a.name, b.name))
  const notesOfNode = (type, id) => notes.filter(n => n.entityType === type && n.entityId === id)
  const countDeep = (type, id) => notesOfNode(type, id).length + childrenOf(type, id).reduce((s, c) => s + countDeep('section', c.id), 0)
  const sectionById = (id) => noteSections.find(s => s.id === id)

  // Cesta uzlu nahoru k firmě: [{ key, label, type }]
  const pathOf = (key) => {
    const out = []
    let [type, id] = splitKey(key)
    for (let guard = 0; guard < 50 && type; guard++) {
      if (type === 'section') {
        const s = sectionById(id)
        if (!s) break
        out.unshift({ key: `section:${s.id}`, label: s.name, type })
        type = s.parentType; id = s.parentId
      } else if (type === 'object') {
        out.unshift({ key: `object:${id}`, label: id, type })
        type = 'firm'; id = firmOfObject(id)
      } else if (type === 'firm' || type === 'related') {
        if (type === 'related') out.unshift({ key, label: 'Ze smluv a nájemníků', type })
        out.unshift({ key: `firm:${id}`, label: id, type: 'firm' })
        break
      } else break
    }
    return out
  }
  const firmOfNode = (key) => pathOf(key)[0]?.label || ''

  // Poznámky ze smluv a od nájemců jedné firmy (jen přehled; úpravy v detailu)
  const relatedOf = (firm) => {
    const unitOf = (c) => assets.find(a => a.id === c.assetId)?.unit || '?'
    const tName = (id) => tenants.find(t => t.id === id)?.name || '?'
    const firmContracts = contracts.filter(c => firmOf(contractSubject(c, assets)) === firm)
    const items = []
    firmContracts.forEach(c => notes.filter(n => n.entityType === 'contract' && n.entityId === c.id)
      .forEach(n => items.push({ note: n, group: contractSubject(c, assets), label: `${unitOf(c)} – ${tName(c.tenantId)}`, onOpen: () => onOpen && onOpen('contract', c.id) })))
    // 📌 původní pole „Poznámky ke smlouvě“ (bez data) – za datovanými poznámkami, podle jednotky
    firmContracts.filter(c => c.contractNotes && c.contractNotes.trim()).forEach(c => items.push({
      note: { id: 'pin:' + c.id, text: c.contractNotes.trim(), createdAt: '📌 Poznámka ve smlouvě' }, pinned: true, unit: unitOf(c),
      group: contractSubject(c, assets), label: `${unitOf(c)} – ${tName(c.tenantId)}${isContractOccupying(c) ? '' : ' (ukončená)'}`, onOpen: () => onOpen && onOpen('contract', c.id),
    }))
    const tIds = new Set(firmContracts.map(c => c.tenantId))
    notes.filter(n => n.entityType === 'tenant' && tIds.has(n.entityId))
      .forEach(n => items.push({ note: n, group: 'Nájemníci', label: tName(n.entityId), onOpen: () => onOpen && onOpen('tenant', n.entityId) }))
    return items.sort((a, b) => (a.pinned ? 1 : 0) - (b.pinned ? 1 : 0)
      || (a.pinned ? natural(a.unit, b.unit) : String(b.note.createdAt).localeCompare(String(a.note.createdAt))))
  }

  // Výchozí výběr: uložený (pokud ještě existuje a je ve viditelné firmě), jinak první firma
  const nodeExists = (key) => {
    const [type, id] = splitKey(key)
    if (type === 'section') return !!sectionById(id)
    if (type === 'object') return Object.values(itemsByFirm).some(list => list.includes(id))
    return firms.some(f => f.name === id)
  }
  const current = sel && nodeExists(sel) && visibleFirms.some(f => f.name === firmOfNode(sel)) ? sel : (visibleFirms[0] ? `firm:${visibleFirms[0].name}` : '')

  const totalCount = notes.filter(n => ['firm', 'object', 'section'].includes(n.entityType)).length

  // ── Strom ──
  const Row = ({ k, depth, icon, label, count, hasKids, badge, muted }) => {
    const active = current === k && !q
    const open = !closed.has(k)
    return (
      <div onClick={() => { setSel(k); if (hasKids && !open) toggle(k) }}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `6px 10px 6px ${10 + depth * 16}px`, cursor: 'pointer', borderRadius: 8, margin: '1px 6px',
          background: active ? 'var(--tone-green-soft)' : 'transparent', color: active ? 'var(--tone-green-text)' : muted ? 'var(--text2)' : 'var(--text)',
          fontWeight: active || depth === 0 ? 800 : 600, fontSize: 13 }}
        onMouseOver={e => { if (!active) e.currentTarget.style.background = 'var(--bg2)' }}
        onMouseOut={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
        <span onClick={e => { if (hasKids) { e.stopPropagation(); toggle(k) } }}
          style={{ width: 14, flexShrink: 0, textAlign: 'center', color: 'var(--text3)', fontSize: 10, visibility: hasKids ? 'visible' : 'hidden' }}>{open ? '▼' : '▶'}</span>
        {badge || <span style={{ flexShrink: 0 }}>{icon}</span>}
        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        {count > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)' }}>{count}</span>}
      </div>
    )
  }
  const renderSections = (type, id, depth) => childrenOf(type, id).map(s => {
    const k = `section:${s.id}`
    const kids = childrenOf('section', s.id)
    return (
      <React.Fragment key={k}>
        <Row k={k} depth={depth} icon="📁" label={s.name} count={countDeep('section', s.id)} hasKids={kids.length > 0} />
        {kids.length > 0 && !closed.has(k) && renderSections('section', s.id, depth + 1)}
      </React.Fragment>
    )
  })
  const renderFirm = (f) => {
    const fk = `firm:${f.name}`
    const objs = itemsByFirm[f.name] || []
    const rel = relatedOf(f.name)
    return (
      <div key={f.name} style={{ paddingBottom: 6, marginBottom: 4, borderBottom: '1px solid var(--border2)' }}>
        <Row k={fk} depth={0} label={f.name} count={notesOfNode('firm', f.name).length} hasKids badge={<FirmBadge firm={f} size={22} />} />
        {!closed.has(fk) && <>
          {objs.map(o => {
            const ok = `object:${o}`
            const kids = childrenOf('object', o)
            return (
              <React.Fragment key={ok}>
                <Row k={ok} depth={1} icon="🏢" label={o} count={countDeep('object', o)} hasKids={kids.length > 0} />
                {kids.length > 0 && !closed.has(ok) && renderSections('object', o, 2)}
              </React.Fragment>
            )
          })}
          {renderSections('firm', f.name, 1)}
          <Row k={`related:${f.name}`} depth={1} icon="📑" label="Ze smluv a nájemníků" count={rel.length} muted />
          {!isReadOnly && (
            <div onClick={() => setDlg({ mode: 'add', parentType: 'firm', parentId: f.name, name: '' })}
              style={{ padding: '5px 10px 5px 42px', fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer' }}>+ Nová sekce</div>
          )}
        </>}
      </div>
    )
  }

  // ── Obsah vybraného uzlu ──
  const [selType, selId] = splitKey(current)
  const path = current ? pathOf(current) : []
  const titleIcon = { firm: '🏛', object: '🏢', section: '📁', related: '📑' }[selType] || '📝'
  const titleText = selType === 'related' ? 'Ze smluv a nájemníků' : selType === 'section' ? (sectionById(selId)?.name || '') : selId

  const askDelete = (s) => {
    const subs = (function count(id) { return childrenOf('section', id).reduce((n, c) => n + 1 + count(c.id), 0) })(s.id)
    const cnt = countDeep('section', s.id)
    const parts = [cnt ? `${cnt} ${cnt === 1 ? 'poznámka' : cnt < 5 ? 'poznámky' : 'poznámek'}` : '', subs ? `${subs} ${subs === 1 ? 'podsekce' : subs < 5 ? 'podsekce' : 'podsekcí'}` : ''].filter(Boolean)
    confirmAction({
      title: 'Smazat sekci',
      text: `Sekce „${s.name}“ se smaže${parts.length ? ` i s obsahem: ${parts.join(' a ')}` : ''}. Nelze vrátit.`,
      okLabel: 'Smazat', danger: true,
      onOk: async () => { if (await deleteNoteSection(s.id)) { const up = path[path.length - 2]; setSel(up ? up.key : '') } },
    })
  }

  const renderContent = () => {
    if (!current) return <EmptyState icon="📝" title="Žádná firma" text="Firmy se zakládají v Nastavení → Firmy a sekce." />
    if (selType === 'related') {
      const items = relatedOf(selId)
      const groups = [...new Set(items.map(i => i.group))].sort((a, b) => (a === 'Nájemníci') - (b === 'Nájemníci') || natural(a, b))
      return (
        <>
          <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text3)', borderBottom: '1px solid var(--border2)' }}>Poznámky ze smluv (vč. 📌 Poznámky ke smlouvě z formuláře) a od nájemníků této firmy – upravují se v detailu (klik na štítek).</div>
          {!items.length && <div style={{ padding: 16 }}><EmptyState compact icon="📑" title="Zatím žádné poznámky ke smlouvám ani nájemníkům" /></div>}
          {groups.map(g => (
            <React.Fragment key={g}>
              <div style={{ padding: '6px 16px', fontSize: 10.5, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', background: 'var(--bg2)', borderTop: '1px solid var(--border2)' }}>{g}</div>
              {items.filter(i => i.group === g).map(i => <NoteItem key={i.note.id} note={i.note} label={i.label} onOpen={i.onOpen} readOnly />)}
            </React.Fragment>
          ))}
        </>
      )
    }
    const own = notesOfNode(selType, selId)
    const subs = childrenOf(selType, selId)
    return (
      <>
        {subs.length > 0 && (
          <div style={{ padding: '9px 16px', borderBottom: '1px solid var(--border2)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700 }}>Podsekce:</span>
            {subs.map(s => (
              <button key={s.id} type="button" className="btn btn-sm" onClick={() => setSel(`section:${s.id}`)}>📁 {s.name}{countDeep('section', s.id) ? ` · ${countDeep('section', s.id)}` : ''}</button>
            ))}
          </div>
        )}
        {!isReadOnly && (
          <div style={{ padding: '12px 16px', borderBottom: own.length ? 'none' : '1px solid transparent' }}>
            <NoteEditor key={current} placeholder={`Napsat poznámku – ${titleText}…`} onSave={(t) => addNote(selType, selId, t)} />
          </div>
        )}
        {own.map(n => <NoteItem key={n.id} note={n} readOnly={isReadOnly} />)}
        {!own.length && isReadOnly && <div style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--text3)' }}>Zatím žádné poznámky.</div>}
      </>
    )
  }

  // ── Hledání napříč viditelnými firmami ──
  const searchResults = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (term.length < 2) return null
    const out = []
    const visible = new Set(visibleFirms.map(f => f.name))
    notes.filter(n => (n.text || '').toLowerCase().includes(term)).forEach(n => {
      if (['firm', 'object', 'section'].includes(n.entityType)) {
        const key = `${n.entityType}:${n.entityId}`
        const p = pathOf(key)
        if (!p.length || !visible.has(p[0].label)) return
        out.push({ note: n, label: p.map(x => x.label).join(' › '), onOpen: () => setSel(key) })
      }
    })
    visibleFirms.forEach(f => relatedOf(f.name).forEach(i => {
      if ((i.note.text || '').toLowerCase().includes(term)) out.push({ note: i.note, label: `${f.name} › ${i.label}`, onOpen: i.onOpen })
    }))
    const seen = new Set()
    return out.filter(r => { const k = r.note.id + r.label; if (seen.has(k)) return false; seen.add(k); return true })
      .sort((a, b) => String(b.note.createdAt).localeCompare(String(a.note.createdAt)))
  }, [q, notes, noteSections, firmFilter, contracts, tenants, assets])

  const selSection = selType === 'section' ? sectionById(selId) : null
  const canAddSub = !isReadOnly && ['firm', 'object', 'section'].includes(selType)

  return (
    <div>
      <div className="page-header" data-icon="📝" style={{ marginBottom: 18 }}>
        <div>
          <div className="page-title">Poznámky</div>
          <div className="page-sub">Po firmách a budovách, vlastní sekce a podsekce · poznámky ze smluv a od nájemníků</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 700 }}>{totalCount} {totalCount === 1 ? 'poznámka' : totalCount >= 2 && totalCount <= 4 ? 'poznámky' : 'poznámek'} · {noteSections.length} {noteSections.length === 1 ? 'sekce' : noteSections.length >= 2 && noteSections.length <= 4 ? 'sekce' : 'sekcí'}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <input data-local-search className="btn" value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Hledat ve všech poznámkách…"
            onKeyDown={e => { if (e.key === 'Escape' && q) { e.preventDefault(); e.stopPropagation(); setQ('') } }}
            style={{ width: '100%', textAlign: 'left', cursor: 'text', boxSizing: 'border-box' }} />
        </div>
        <select className="btn" value={firmFilter} onChange={e => pickFirm(e.target.value)} style={{ cursor: 'pointer' }}>
          <option value="">Všechny firmy</option>
          {firms.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '290px minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '6px 0', position: 'sticky', top: 0,
          maxHeight: 'calc(80vh / var(--ui-zoom, 1))', overflowY: 'auto' }}>
          {visibleFirms.map(renderFirm)}
        </div>

        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {searchResults ? (
            <>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border2)', fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>
                🔍 Výsledky hledání <span style={{ fontSize: 12.5, color: 'var(--text3)', fontWeight: 600 }}>({searchResults.length})</span>
              </div>
              {!searchResults.length && <div style={{ padding: 16 }}><EmptyState compact icon="🔍" title="Nic nenalezeno" text="Zkuste jiný text nebo jinou firmu." /></div>}
              {searchResults.map(r => <NoteItem key={r.note.id + r.label} note={r.note} label={r.label} onOpen={r.onOpen} readOnly />)}
            </>
          ) : (
            <>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border2)' }}>
                {path.length > 1 && (
                  <div style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 600, marginBottom: 3 }}>
                    {path.slice(0, -1).map((p, i) => (
                      <React.Fragment key={p.key}>{i > 0 && ' › '}<span onClick={() => setSel(p.key)} style={{ cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>{p.label}</span></React.Fragment>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {selType === 'firm' ? <FirmBadge firm={getFirm ? getFirm(selId) : firms.find(f => f.name === selId)} size={24} /> : <span style={{ fontSize: 17 }}>{titleIcon}</span>}
                  <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{titleText}</span>
                  <div style={{ flex: 1 }} />
                  {canAddSub && <button type="button" className="btn btn-sm" onClick={() => setDlg({ mode: 'add', parentType: selType, parentId: selId, name: '' })}>+ {selType === 'firm' ? 'Nová sekce' : 'Podsekce'}</button>}
                  {selSection && !isReadOnly && <>
                    <button type="button" className="btn btn-sm" onClick={() => setDlg({ mode: 'rename', id: selSection.id, name: selSection.name })}>✏️ Přejmenovat</button>
                    <button type="button" className="btn btn-sm btn-tone-red" onClick={() => askDelete(selSection)} title="Smazat sekci">🗑</button>
                  </>}
                </div>
              </div>
              {renderContent()}
            </>
          )}
        </div>
      </div>

      {dlg && <SectionNameDialog dlg={dlg} parentLabel={dlg.mode === 'add' ? (dlg.parentType === 'section' ? sectionById(dlg.parentId)?.name : dlg.parentId) : ''}
        onClose={() => setDlg(null)}
        onSave={async (name) => {
          if (dlg.mode === 'add') {
            const s = await addNoteSection(dlg.parentType, dlg.parentId, name)
            if (s) { setDlg(null); setClosed(prev => { const n = new Set(prev); n.delete(`${dlg.parentType}:${dlg.parentId}`); lsSet('rf_notes_closed', [...n]); return n }); setSel(`section:${s.id}`) }
          } else if (await renameNoteSection(dlg.id, name)) setDlg(null)
        }} />}
    </div>
  )
}

function SectionNameDialog({ dlg, parentLabel, onClose, onSave }) {
  const [name, setName] = useState(dlg.name || '')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => { e.preventDefault(); if (!name.trim() || busy) return; setBusy(true); await onSave(name); setBusy(false) }
  return (
    <DialogShell icon="📁" tone="amber" title={dlg.mode === 'add' ? 'Nová sekce poznámek' : 'Přejmenovat sekci'} subtitle={dlg.mode === 'add' && parentLabel ? `pod „${parentLabel}“` : undefined}
      width={440} onClose={onClose} busy={busy}
      footer={<><button type="button" className="btn" onClick={onClose}>Zrušit</button><button type="submit" form="note-section-form" className="btn btn-primary" disabled={!name.trim() || busy}>{dlg.mode === 'add' ? 'Založit' : 'Uložit'}</button></>}>
      <form id="note-section-form" onSubmit={submit}>
        <label className="dlg-lbl">Název sekce</label>
        <input className="btn" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="např. Vyúčtování 2026"
          style={{ width: '100%', textAlign: 'left', cursor: 'text', boxSizing: 'border-box' }} />
      </form>
    </DialogShell>
  )
}
