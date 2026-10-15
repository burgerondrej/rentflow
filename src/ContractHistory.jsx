import React, { useEffect, useState } from 'react'
import { useApp } from './AppContext.jsx'

const ACTION_TONE = { 'Přidání': 'green', 'Úprava': 'blue', 'Smazání': 'red', 'Archivace': 'amber', 'Obnova': 'violet', 'Automatické prodloužení': 'violet' }

/**
 * Historie změn smlouvy – záznamy z historie změn (logs), které se týkají smlouvy:
 * „předmět – nájemce“ (úpravy, platby, dodatky), ID smlouvy (ukončení, smazání), ID jejích plateb (úpravy částek)
 * a skupina plateb. Pozn.: u navazujících smluv stejného nájemce na stejném předmětu se zobrazí i starší záznamy.
 */
export default function ContractHistory({ contract }) {
  const { tenants = [], assets = [], payments = [], searchLogs } = useApp()
  const [rows, setRows] = useState(null)
  const unit = assets.find(a => a.id === contract.assetId)?.unit
  const tenant = tenants.find(t => t.id === contract.tenantId)?.name

  useEffect(() => {
    let alive = true
    const terms = [contract.id]
    if (unit && tenant) terms.push(`${unit} – ${tenant}`)
    if (contract.groupLabel) terms.push(`group:${contract.groupLabel}`)
    payments.filter(p => p.contractId === contract.id || (contract.groupLabel && p.groupLabel === contract.groupLabel))
      .slice(0, 150).forEach(p => terms.push(p.id))
    setRows(null)
    Promise.resolve(searchLogs ? searchLogs(terms) : []).then(r => { if (alive) setRows(r || []) })
    return () => { alive = false }
  }, [contract.id, unit, tenant, contract.groupLabel, payments.length])

  if (rows === null) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text3)' }}>Načítám historii…</div>
  if (rows.length === 0) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>Žádné záznamy v historii změn.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 2 }}>{rows.length} {rows.length === 1 ? 'záznam' : rows.length < 5 ? 'záznamy' : 'záznamů'} · nejnovější nahoře</div>
      {rows.map(l => {
        const tone = ACTION_TONE[l.action] || 'gray'
        return (
          <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '118px minmax(0, 1fr)', gap: 10, padding: '8px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{l.timestamp}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{l.user}</div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, padding: '1px 8px', borderRadius: 999, background: `var(--tone-${tone}-soft)`, color: `var(--tone-${tone}-text)`, border: `1px solid var(--tone-${tone}-border)` }}>{l.action}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text2)', fontWeight: 600 }}>{l.module}</span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text)', wordBreak: 'break-word' }}>{l.detail}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
