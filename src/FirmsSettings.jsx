import React, { useState } from 'react'
import { useApp } from './AppContext.jsx'
import DialogShell from './DialogShell.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import { FirmBadge } from './FirmUI.jsx'
import { sectionOf, firmColors, FIRM_COLOR_KEYS, ASSET_TYPES, SUBJECT_SEP } from './utils.js'
import { METER_FIELDS, defaultMeters, sectionMeters } from './MeterUI.jsx'

const TYPE_OPTIONS = Object.entries(ASSET_TYPES).map(([k, v]) => ({ k, label: `${v.icon} ${v.label}` }))
const COLOR_LABEL = { wine: 'Bordó', royal: 'Modrá', violet: 'Fialová', teal: 'Tyrkysová', orange: 'Oranžová', slate: 'Břidlicová' }

/**
 * Nastavení → Firmy a sekce (jen admin). Firma = část názvu sekce před " – ".
 * Každá změna: záloha → operace v Rustu (přejmenování propíše všechny odkazy) → znovunačtení dat.
 */
export default function FirmsSettings({ onClose }) {
  const { firms = [], subjectData = [], objectFirms = [], assets = [], contracts = [], theme, manageSubjects, showToast } = useApp()
  const [edit, setEdit] = useState(null) // { kind: 'firm'|'section'|'newSection'|'newFirm'|'object'|'newObject', ... }
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)

  const subjOf = (name) => subjectData.find(s => s.name === name)
  const assetCount = (name) => assets.filter(a => a.subject === name).length
  const contractCount = (name) => contracts.filter(c => c.billingSubject === name).length
  const allNames = subjectData.map(s => s.name)

  const run = async (command, args, okMsg) => {
    setBusy(true)
    const ok = await manageSubjects(command, args)
    setBusy(false)
    if (ok) { setEdit(null); if (okMsg) showToast(okMsg, 'success') }
    return ok
  }

  // Pořadí: přesun firmy (celý blok sekcí) nebo sekce uvnitř firmy
  const moveFirm = (idx, dir) => {
    const j = idx + dir
    if (j < 0 || j >= firms.length) return
    const order = firms.map(f => f.sections)
    ;[order[idx], order[j]] = [order[j], order[idx]]
    run('reorder_subjects', { names: order.flat() })
  }
  const moveSection = (firm, idx, dir) => {
    const secs = [...firm.sections]
    const j = idx + dir
    if (j < 0 || j >= secs.length) return
    ;[secs[idx], secs[j]] = [secs[j], secs[idx]]
    run('reorder_subjects', { names: firms.flatMap(f => f.name === firm.name ? secs : f.sections) })
  }

  const inp = { width: '100%', textAlign: 'left', cursor: 'text', boxSizing: 'border-box' }
  const iconBtn = (label, title, onClick, disabled) => (
    <button type="button" className="btn btn-sm" title={title} disabled={disabled || busy} onClick={onClick}
      style={{ padding: '3px 8px', minWidth: 28, justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}>{label}</button>
  )
  const colorPicker = (value, onChange) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {FIRM_COLOR_KEYS.map(k => {
        const c = firmColors(k, theme)
        return (
          <button key={k} type="button" title={COLOR_LABEL[k]} onClick={() => onChange(k)}
            style={{ width: 28, height: 28, borderRadius: '50%', background: c.mid, cursor: 'pointer',
              border: value === k ? '3px solid var(--text)' : '2px solid var(--bg)', boxShadow: '0 0 0 1px var(--border2)' }} />
        )
      })}
    </div>
  )
  const formBox = (children, onSave, saveLabel = 'Uložit') => (
    <div style={{ padding: '12px 14px', background: 'var(--bg2)', borderTop: '1px solid var(--border)' }}>
      {children}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn btn-sm" disabled={busy} onClick={() => setEdit(null)}>Zrušit</button>
        <button className="btn btn-sm btn-primary" disabled={busy} onClick={onSave}>{busy ? '⏳ Ukládám…' : saveLabel}</button>
      </div>
    </div>
  )
  const field = (label, el, span) => (
    <div style={{ gridColumn: span ? '1 / -1' : undefined }}>
      <label className="dlg-lbl">{label}</label>{el}
    </div>
  )
  const grid = (children) => <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>{children}</div>

  // ── Uložení ──
  const saveFirm = (f) => {
    const name = (edit.name || '').trim()
    const short = (edit.short || '').trim().toUpperCase()
    if (!name) return showToast('Vyplňte název firmy.', 'warning')
    if (!short) return showToast('Vyplňte zkratku firmy.', 'warning')
    if (firms.some(x => x.name !== f.name && x.short.toUpperCase() === short)) return showToast(`Zkratku ${short} už má jiná firma.`, 'warning')
    const doIt = () => run('update_firm', { oldFirm: f.name, newFirm: name, shortName: short, color: edit.color }, 'Firma uložena.')
    if (name !== f.name) {
      const n = f.sections.reduce((s, sec) => s + assetCount(sec), 0)
      setConfirm({ title: 'Přejmenovat firmu?', text: `„${f.name}“ → „${name}“. Změna se propíše do všech sekcí (${f.sections.length}), předmětů (${n}), smluv, dokumentů, revizí, budov a štítků úkolů. Předtím se udělá záloha.`, okLabel: 'Přejmenovat', onOk: doIt })
    } else doIt()
  }
  // Měřidla sekce (jen byty a komerční): '' = výchozí podle typu, jinak výčet klíčů
  const metersArg = () => {
    if (!edit.meters || (edit.type !== 'residential' && edit.type !== 'commercial')) return ''
    const sel = METER_FIELDS.map(f => f.key).filter(k => (edit.meters || []).includes(k))
    return sel.join(',') === defaultMeters(edit.type).join(',') ? '' : (sel.join(',') || 'none')
  }
  const sectionFullName = (firmName, part) => (part || '').trim() ? `${firmName}${SUBJECT_SEP}${part.trim()}` : firmName
  const saveSection = (f, oldName) => {
    const newName = sectionFullName(f.name, edit.part)
    if (newName !== oldName && allNames.includes(newName)) return showToast(`Sekce „${newName}“ už existuje.`, 'warning')
    const doIt = () => run('update_section', { oldName, newName, assetType: edit.type, isVatPayer: !!edit.vat, meters: metersArg() }, 'Sekce uložena.')
    if (newName !== oldName) {
      setConfirm({ title: 'Přejmenovat sekci?', text: `„${oldName}“ → „${newName}“. Změna se propíše do předmětů (${assetCount(oldName)}), smluv (${contractCount(oldName)}), dokumentů a revizí. Předtím se udělá záloha.`, okLabel: 'Přejmenovat', onOk: doIt })
    } else doIt()
  }
  const addSection = (f) => {
    const name = sectionFullName(f.name, edit.part)
    if (!(edit.part || '').trim()) return showToast('Vyplňte název sekce.', 'warning')
    if (allNames.includes(name)) return showToast(`Sekce „${name}“ už existuje.`, 'warning')
    run('add_section', { name, assetType: edit.type, isVatPayer: !!edit.vat, shortName: f.short, color: f.color, meters: metersArg() }, `Sekce „${name}“ přidána.`)
  }
  const addFirm = () => {
    const firm = (edit.name || '').trim()
    const short = (edit.short || '').trim().toUpperCase()
    if (!firm || !short) return showToast('Vyplňte název a zkratku firmy.', 'warning')
    if (firm.includes(SUBJECT_SEP)) return showToast('Název firmy nesmí obsahovat „ – “.', 'warning')
    if (firms.some(x => x.name === firm)) return showToast(`Firma „${firm}“ už existuje.`, 'warning')
    if (firms.some(x => x.short.toUpperCase() === short)) return showToast(`Zkratku ${short} už má jiná firma.`, 'warning')
    run('add_section', { name: sectionFullName(firm, edit.part), assetType: edit.type, isVatPayer: !!edit.vat, shortName: short, color: edit.color, meters: metersArg() }, `Firma „${firm}“ přidána.`)
  }
  const saveObject = (oldName) => {
    const name = (edit.name || '').trim()
    if (!name) return showToast('Vyplňte název budovy.', 'warning')
    run('save_object', { oldName: oldName || '', name, firm: edit.firm }, oldName ? 'Budova uložena.' : `Budova „${name}“ přidána.`)
  }

  const sectionForm = (onSave, label) => formBox(grid(<>
    {field('Název sekce (za „FIRMA – “)', <input className="btn" style={inp} value={edit.part} onChange={e => setEdit({ ...edit, part: e.target.value })} placeholder="např. Komerční prostory" />, true)}
    {field('Typ předmětů', <select className="btn" style={{ ...inp, cursor: 'pointer' }} value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value, meters: defaultMeters(e.target.value) })}>
      {!ASSET_TYPES[edit.type] && <option value={edit.type}>{edit.type}</option>}
      {TYPE_OPTIONS.map(o => <option key={o.k} value={o.k}>{o.label}</option>)}
    </select>)}
    {field('DPH', <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text)', paddingTop: 6, cursor: 'pointer' }}>
      <input type="checkbox" checked={!!edit.vat} onChange={e => setEdit({ ...edit, vat: e.target.checked })} /> Plátce DPH</label>)}
    {(edit.type === 'residential' || edit.type === 'commercial') && field('Měřidla (stavy měřidel ve smlouvách)', <div style={{ display: 'flex', gap: '6px 14px', flexWrap: 'wrap', paddingTop: 6 }}>
      {METER_FIELDS.map(f => (
        <label key={f.key} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={(edit.meters || []).includes(f.key)}
            onChange={e => setEdit({ ...edit, meters: e.target.checked ? [...(edit.meters || []), f.key] : (edit.meters || []).filter(k => k !== f.key) })} /> {f.label}
        </label>
      ))}
    </div>)}
  </>), onSave, label)

  const objectForm = () => formBox(grid(<>
    {field('Název budovy', <input className="btn" style={inp} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />)}
    {field('Patří firmě', <select className="btn" style={{ ...inp, cursor: 'pointer' }} value={edit.firm} onChange={e => setEdit({ ...edit, firm: e.target.value })}>
      {firms.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}
    </select>)}
  </>), () => saveObject(edit.kind === 'object' ? edit.old : ''), edit.kind === 'object' ? 'Uložit' : 'Přidat budovu')

  return (
    <DialogShell icon="🏢" title="Firmy a sekce" subtitle="Pronajímatelé, jejich sekce a budovy · každá změna se předem zazálohuje"
      width={780} onClose={onClose} busy={busy}
      footer={<button className="btn" onClick={onClose} disabled={busy}>Zavřít</button>}>
      {firms.map((f, fi) => {
        const fc = firmColors(f.color, theme)
        const buildings = objectFirms.filter(o => o.firm === f.name)
        const editingFirm = edit?.kind === 'firm' && edit.firm === f.name
        return (
          <div key={f.name} style={{ border: '1.5px solid var(--border)', borderRadius: 14, marginBottom: 12, overflow: 'hidden', background: 'var(--bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: fc.bg, borderLeft: `6px solid ${fc.mid}` }}>
              <FirmBadge firm={f} size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: fc.txt }}>{f.name}</div>
                <div style={{ fontSize: 11.5, color: fc.sub }}>{f.sections.length} {f.sections.length === 1 ? 'sekce' : f.sections.length < 5 ? 'sekce' : 'sekcí'} · {COLOR_LABEL[f.color] || f.color}</div>
              </div>
              {iconBtn('↑', 'Posunout firmu nahoru', () => moveFirm(fi, -1), fi === 0)}
              {iconBtn('↓', 'Posunout firmu dolů', () => moveFirm(fi, 1), fi === firms.length - 1)}
              {iconBtn('✏️', 'Upravit firmu', () => setEdit({ kind: 'firm', firm: f.name, name: f.name, short: f.short, color: f.color }))}
            </div>
            {editingFirm && formBox(grid(<>
              {field('Název firmy', <input className="btn" style={inp} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />)}
              {field('Zkratka (2–4 znaky)', <input className="btn" style={inp} maxLength={5} value={edit.short} onChange={e => setEdit({ ...edit, short: e.target.value })} />)}
              {field('Barva firmy', colorPicker(edit.color, (k) => setEdit({ ...edit, color: k })), true)}
            </>), () => saveFirm(f))}

            {f.sections.map((name, si) => {
              const s = subjOf(name)
              const t = ASSET_TYPES[s?.assetType]
              const cnt = assetCount(name)
              const editing = edit?.kind === 'section' && edit.name === name
              return (
                <div key={name}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px 7px 26px', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ width: 22 }}>{t?.icon || '📄'}</span>
                    <span style={{ fontWeight: 700, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name === f.name ? '(bez sekce)' : sectionOf(name)}</span>
                    <span className="badge badge-gray">{cnt === 0 ? '0 – skrytá' : `${cnt} předm.`}</span>
                    <span className="badge" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>{s?.isVatPayer ? 'DPH' : 'bez DPH'}</span>
                    {iconBtn('↑', 'Nahoru', () => moveSection(f, si, -1), si === 0)}
                    {iconBtn('↓', 'Dolů', () => moveSection(f, si, 1), si === f.sections.length - 1)}
                    {iconBtn('✏️', 'Upravit sekci', () => setEdit({ kind: 'section', name, part: name === f.name ? '' : sectionOf(name), type: s?.assetType || 'commercial', vat: !!s?.isVatPayer, meters: sectionMeters(s) }))}
                    {iconBtn('🗑️', cnt ? 'Sekci s předměty nelze smazat' : 'Smazat prázdnou sekci', () => setConfirm({ title: 'Smazat sekci?', text: `Sekce „${name}“ bude odstraněna. Předtím se udělá záloha.`, danger: true, okLabel: 'Smazat', onOk: () => run('delete_section', { name }, 'Sekce smazána.') }), cnt > 0)}
                  </div>
                  {editing && sectionForm(() => saveSection(f, name))}
                </div>
              )
            })}
            {edit?.kind === 'newSection' && edit.firm === f.name ? sectionForm(() => addSection(f), 'Přidat sekci') : (
              <div style={{ padding: '7px 12px 7px 26px', borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-sm" disabled={busy} style={{ color: 'var(--accent)', fontWeight: 700 }}
                  onClick={() => setEdit({ kind: 'newSection', firm: f.name, part: '', type: 'commercial', vat: f.isVatPayer !== false, meters: defaultMeters('commercial') })}>+ Přidat sekci</button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '8px 12px 8px 26px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 12.5 }}>
              <span style={{ fontWeight: 700, color: 'var(--text2)', marginRight: 4 }}>🏛️ Budovy:</span>
              {buildings.length === 0 && <span style={{ color: 'var(--text3)' }}>žádné</span>}
              {buildings.map(o => (
                <button key={o.name} className="btn btn-sm" disabled={busy} title="Upravit budovu"
                  onClick={() => setEdit({ kind: 'object', at: f.name, old: o.name, name: o.name, firm: o.firm })}>{o.name} ✏️</button>
              ))}
              <button className="btn btn-sm" disabled={busy} style={{ color: 'var(--accent)', fontWeight: 700 }}
                onClick={() => setEdit({ kind: 'newObject', at: f.name, name: '', firm: f.name })}>+ budova</button>
            </div>
            {(edit?.kind === 'object' || edit?.kind === 'newObject') && edit.at === f.name && objectForm()}
          </div>
        )
      })}

      {/* Budovy bez firmy */}
      {objectFirms.some(o => !o.firm || !firms.some(f => f.name === o.firm)) && (
        <div style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 12 }}>
          Budovy bez firmy: {objectFirms.filter(o => !o.firm || !firms.some(f => f.name === o.firm)).map(o => (
            <button key={o.name} className="btn btn-sm" style={{ marginLeft: 6 }} disabled={busy}
              onClick={() => setEdit({ kind: 'object', at: '', old: o.name, name: o.name, firm: firms[0]?.name || '' })}>{o.name} ✏️</button>
          ))}
          {edit?.kind === 'object' && edit.at === '' && <div style={{ border: '1.5px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginTop: 8 }}>{objectForm()}</div>}
        </div>
      )}

      {edit?.kind === 'newFirm' ? (
        <div style={{ border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {formBox(grid(<>
            {field('Název firmy', <input className="btn" style={inp} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />)}
            {field('Zkratka (2–4 znaky)', <input className="btn" style={inp} maxLength={5} value={edit.short} onChange={e => setEdit({ ...edit, short: e.target.value })} />)}
            {field('Barva firmy', colorPicker(edit.color, (k) => setEdit({ ...edit, color: k })), true)}
            {field('První sekce (prázdné = bez sekce)', <input className="btn" style={inp} value={edit.part} onChange={e => setEdit({ ...edit, part: e.target.value })} placeholder="např. Komerční prostory" />)}
            {field('Typ předmětů', <select className="btn" style={{ ...inp, cursor: 'pointer' }} value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value, meters: defaultMeters(e.target.value) })}>
              {TYPE_OPTIONS.map(o => <option key={o.k} value={o.k}>{o.label}</option>)}
            </select>)}
            {field('DPH', <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text)', paddingTop: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!edit.vat} onChange={e => setEdit({ ...edit, vat: e.target.checked })} /> Plátce DPH</label>)}
          </>), addFirm, 'Přidat firmu')}
        </div>
      ) : (
        <button className="btn" disabled={busy} style={{ color: 'var(--accent)', fontWeight: 700 }}
          onClick={() => setEdit({ kind: 'newFirm', name: '', short: '', color: FIRM_COLOR_KEYS.find(k => !firms.some(f => f.color === k)) || 'slate', part: '', type: 'commercial', vat: true })}>+ Přidat firmu</button>
      )}

      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </DialogShell>
  )
}
