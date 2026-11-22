import React, { useMemo, useState } from 'react'
import DialogShell from './DialogShell.jsx'
import { useApp } from './AppContext.jsx'
import { assetTypeOfSection, firmOf, isContractBillable, OWN_SUBJECT_TYPES } from './utils.js'

/**
 * Hromadný přesun předmětů do jiné sekce stejného typu a stejné firmy (moveAsset po jednom – ID, smlouvy i platby zůstávají).
 * Hlídá skupiny plateb: skupina rozdělená do dvou sekcí by se v Platbách ukázala v obou → nabídne přesunout i zbytek skupiny.
 */
export default function BulkMoveDialog({ ids, type, onClose, onDone }) {
  const { assets = [], contracts = [], subjectData = [], moveAsset, showToast } = useApp()
  const sel = assets.filter(a => ids.includes(a.id))
  const firms = [...new Set(sel.map(a => firmOf(a.subject)))]
  const targets = subjectData.filter(s => assetTypeOfSection(s.assetType) === type && firms.length === 1 && firmOf(s.name) === firms[0])
  const [target, setTarget] = useState(() => targets.find(s => !sel.every(a => a.subject === s.name))?.name || '')
  const [withGroups, setWithGroups] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)

  // Skupiny plateb vybraných předmětů, jejichž další členové zůstanou mimo cílovou sekci
  const groupInfo = useMemo(() => {
    const valid = contracts.filter(c => isContractBillable(c))
    const labels = [...new Set(valid.filter(c => ids.includes(c.assetId) && c.groupLabel).map(c => c.groupLabel))]
    const extra = new Set()
    const split = []
    labels.forEach(l => {
      const others = valid.filter(c => c.groupLabel === l && !ids.includes(c.assetId))
        .map(c => assets.find(a => a.id === c.assetId)).filter(a => a && a.subject !== target && a.type === type && firmOf(a.subject) === firms[0])
      if (others.length) { split.push({ label: l, units: others.map(a => a.unit) }); others.forEach(a => extra.add(a.id)) }
    })
    return { split, extra: [...extra] }
  }, [ids, target, contracts, assets])

  const moveIds = [...ids, ...(withGroups ? groupInfo.extra : [])]
  const toMove = assets.filter(a => moveIds.includes(a.id) && a.subject !== target)
  const contractCount = contracts.filter(c => isContractBillable(c) && toMove.some(a => a.id === c.assetId)).length
  const keepLandlord = contracts.filter(c => isContractBillable(c) && toMove.some(a => a.id === c.assetId) && c.billingSubject && !OWN_SUBJECT_TYPES.includes(type)).length

  const run = async () => {
    if (!target || !toMove.length) return
    setBusy(true)
    let ok = 0
    for (const a of toMove) {
      if (await moveAsset(a.id, { subject: target })) ok++
      setProgress(p => p + 1)
    }
    setBusy(false)
    showToast(`Přesunuto ${ok} z ${toMove.length} do „${target}“.`, ok === toMove.length ? 'success' : 'warning')
    onDone()
  }

  return (
    <DialogShell icon="📦" tone="blue" title="Přesunout do sekce" subtitle={`${ids.length} vybraných předmětů`} width={520} onClose={onClose} busy={busy}
      footer={<><button className="btn" onClick={onClose} disabled={busy}>Zrušit</button>
        <button className="btn btn-primary" onClick={run} disabled={busy || !target || !toMove.length}>{busy ? `Přesouvám… ${progress}/${toMove.length}` : `Přesunout ${toMove.length}`}</button></>}>
      {firms.length !== 1 ? (
        <div style={{ fontSize: 13, color: 'var(--tone-red-text)', fontWeight: 600 }}>Vybrané předměty patří různým firmám. Hromadně lze přesouvat jen v rámci jedné firmy.</div>
      ) : (
        <>
          <label className="dlg-lbl">Cílová sekce ({firms[0]})</label>
          <select className="btn" value={target} onChange={e => setTarget(e.target.value)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}>
            <option value="">— vyberte sekci —</option>
            {targets.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
          {targets.length <= 1 && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>Další sekci založíte v Nastavení → Firmy a sekce.</div>}

          {target && (
            <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
              <div>Přesune se <b style={{ color: 'var(--text)' }}>{toMove.length}</b> předmětů{contractCount ? <> s <b style={{ color: 'var(--text)' }}>{contractCount}</b> platnými smlouvami</> : ''}. Smlouvy, platby i skupiny zůstávají – mění se jen sekce.</div>
              {keepLandlord > 0 && <div style={{ marginTop: 4 }}>{keepLandlord} {keepLandlord === 1 ? 'smlouva má' : keepLandlord < 5 ? 'smlouvy mají' : 'smluv má'} přepsaného pronajímatele (např. Bürger Pavel) – v Platbách zůstanou u něj.</div>}
              {moveIds.length > toMove.length && <div style={{ marginTop: 4, color: 'var(--text3)' }}>{moveIds.length - toMove.length} už v cílové sekci {moveIds.length - toMove.length === 1 ? 'je' : 'jsou'} – přeskočí se.</div>}
            </div>
          )}

          {target && groupInfo.split.length > 0 && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--tone-amber-soft)', border: '1px solid var(--tone-amber-border)', fontSize: 12.5, color: 'var(--tone-amber-text)' }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>⚠ Skupiny plateb by se rozdělily do dvou sekcí</div>
              {groupInfo.split.map(g => <div key={g.label}>„{g.label}“ – mimo výběr: {g.units.join(', ')}</div>)}
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, fontWeight: 700, cursor: 'pointer' }}>
                <input type="checkbox" checked={withGroups} onChange={e => setWithGroups(e.target.checked)} />
                Přesunout i tyto předměty (skupina zůstane pohromadě – doporučeno)
              </label>
            </div>
          )}
        </>
      )}
    </DialogShell>
  )
}
