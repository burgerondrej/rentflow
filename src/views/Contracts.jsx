import React, { useState, useRef, useEffect } from 'react'
import { useApp } from '../AppContext.jsx'
import ContractForm from '../ContractForm.jsx' // IMPORT FORMULÁŘE

const SUBJECT_ORDER = [
  'METROPOLE CB – Komerční prostory',
  'METROPOLE CB – Novohradská 53/55',
  'METROPOLE CB – Novohradská 57a',
  'METROPOLE CB – Parkování',
  'METROPOLE CB – Reklamní plochy',
  'METROPOLE CB – Ubytovací jednotky',
  'Bürger Pavel – Parkování',
  'Bürger Pavel – Reklamní plochy',
  'JIHOTANK',
  'JIHOTANK CB',
  'Ostatní',
]

export default function Contracts({ activeSubject, onOpen }) {
  const { contracts = [], tenants = [], assets = [] } = useApp()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [cardOrder, setCardOrder] = useState(() => {
    try { const s = localStorage.getItem('rf_contract_order'); return s ? JSON.parse(s) : null } catch { return null }
  })
  const dragId = useRef(null)
  const dragOverId = useRef(null)

  const getOrdered = (items) => {
    if (!cardOrder) return items
    const map = {}
    items.forEach(i => { map[i.id] = i })
    const result = cardOrder.filter(id => map[id]).map(id => map[id])
    items.forEach(i => { if (!cardOrder.includes(i.id)) result.push(i) })
    return result
  }

  const handleDrop = (items) => {
    if (!dragId.current || dragId.current === dragOverId.current) return
    const ids = getOrdered(items).map(i => i.id)
    const from = ids.indexOf(dragId.current)
    const to = ids.indexOf(dragOverId.current)
    if (from === -1 || to === -1) return
    const newIds = [...ids]
    newIds.splice(from, 1)
    newIds.splice(to, 0, dragId.current)
    setCardOrder(newIds)
    try { localStorage.setItem('rf_contract_order', JSON.stringify(newIds)) } catch {}
    dragId.current = null; dragOverId.current = null
  }

  const enrichedContracts = contracts.map(c => {
    const tenant = tenants.find(t => t.id === c.tenantId) || {}
    const asset = assets.find(a => a.id === c.assetId) || {}
    
    let daysLeft = null
    if (c.end) {
      const endParts = c.end.split('.').map(p => p.trim())
      if (endParts.length === 3) {
        const endDate = new Date(parseInt(endParts[2]), parseInt(endParts[1]) - 1, parseInt(endParts[0]))
        const now = new Date(); now.setHours(0, 0, 0, 0)
        daysLeft = Math.round((endDate - now) / (1000 * 60 * 60 * 24))
      }
    }

    const assetSubject = (asset.type === 'ostatni') ? asset.subject : (c.billingSubject || asset.subject)
    return { ...c, tenantName: tenant.name, assetUnit: asset.unit, assetType: asset.type, assetSubject, daysLeft,
      totalDeposit: (Number(c.deposit) || 0) + (Number(c.depositWater) || 0) }
  })

  let filtered = enrichedContracts
  if (search) {
    const term = search.toLowerCase()
    filtered = filtered.filter(c => 
      (c.tenantName && c.tenantName.toLowerCase().includes(term)) ||
      (c.assetUnit && c.assetUnit.toLowerCase().includes(term))
    )
  }

  const renderCard = (c, isArchived = false) => {
    const isEndingSoon = c.daysLeft !== null && c.daysLeft <= 60 && c.daysLeft >= 0
    const isExpired = c.daysLeft !== null && c.daysLeft < 0

    let cardBg = 'var(--bg2)' 
    let headerBg = 'rgba(0,0,0,0.03)'
    let accentColor = 'var(--text2)'
    let icon = '📄'
    let cardBorderColor = 'var(--border)' 
    let innerBorderColor = 'rgba(0,0,0,0.05)' 

    if (c.assetType === 'residential') { 
      cardBg = '#F4FCF6'; headerBg = '#E6F6EB'; accentColor = '#0F6E56'; icon = '🏠'
      cardBorderColor = '#BBF7D0'; innerBorderColor = '#81E6D9' 
    }
    if (c.assetType === 'commercial') { 
      cardBg = '#F8F5FF'; headerBg = '#F1EBFE'; accentColor = '#5B21B6'; icon = '🏢'
      cardBorderColor = '#D6BCFA'; innerBorderColor = '#D6BCFA' 
    }
    if (c.assetType === 'ads') { 
      cardBg = '#FFF8F0'; headerBg = '#FEF0DF'; accentColor = '#C2410C'; icon = '📢'
      cardBorderColor = '#FBD38D'; innerBorderColor = '#FBD38D' 
    }
    if (c.assetType === 'parking') { 
      cardBg = '#F0F7FF'; headerBg = '#E0F0FE'; accentColor = '#0B509E'; icon = '🅿️'
      cardBorderColor = '#90CDF4'; innerBorderColor = '#90CDF4' 
    }
    if (c.assetType === 'ostatni') { 
      cardBg = '#F0FDFA'; headerBg = '#CCFBF1'; accentColor = '#0F766E'; icon = '📄'
      cardBorderColor = '#99F6E4'; innerBorderColor = '#99F6E4' 
    }

    return (
      <div 
        key={c.id} 
        className="card card-interactive"
        style={{ 
          cursor: 'pointer', marginBottom: 0, opacity: isArchived ? 0.6 : 1, padding: 0, overflow: 'hidden', borderRadius: 12,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          background: cardBg, 
          border: `1px solid ${isArchived ? 'var(--border)' : cardBorderColor}` 
        }} 
        onClick={() => onOpen(c.id)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: headerBg, borderBottom: `1px solid ${isArchived ? 'var(--border)' : cardBorderColor}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 13 }}>{icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: accentColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.assetUnit || 'Neznámý předmět'}
              </div>
              <div style={{ fontSize: 11, color: accentColor, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.assetSubject || ''}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
            <div className={`badge ${isArchived ? 'badge-gray' : isEndingSoon ? 'badge-amber' : isExpired ? 'badge-red' : 'badge-green'}`} style={{ marginBottom: 0, fontSize: 10.5 }}>
              {isArchived ? 'Ukončeno' : isEndingSoon ? `Končí za ${c.daysLeft} dní` : isExpired ? 'Propadlá' : 'Aktivní'}
            </div>
          </div>
        </div>

        <div style={{ padding: 14 }}>
          <div style={{ padding: '8px 10px', background: '#FFFFFF', borderRadius: 8, border: `1px solid ${innerBorderColor}`, marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 3 }}>Nájemce</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.tenantName || 'Neznámý'}</div>
          </div>

          {(() => {
            const isDphSubject = c.vatExempt === 2 ? true : c.vatExempt === 1 ? false : !c.assetSubject?.startsWith('Bürger Pavel')
            const showDph = (c.assetType === 'commercial' || c.assetType === 'ads' || c.assetType === 'parking') && isDphSubject
            return (
              <div style={{ display: 'grid', gridTemplateColumns: c.totalDeposit > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 0 }}>
                <div style={{ padding: '8px 14px', borderRight: `1px solid ${innerBorderColor}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <span style={{ fontSize: 11 }}>🗓️</span>
                    <div style={{ fontSize: 10.5, color: 'var(--text2)' }}>Platnost do</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{c.end || 'Neurčito'}</div>
                  {!isArchived && isEndingSoon && <div style={{ fontSize: 10, color: 'var(--amber-t)', fontWeight: 600, marginTop: 2 }}>Končí za {c.daysLeft} dní</div>}
                  {!isArchived && isExpired && <div style={{ fontSize: 10, color: 'var(--red-t)', fontWeight: 600, marginTop: 2 }}>Propadlá ({Math.abs(c.daysLeft)} dní)</div>}
                </div>
                <div style={{ padding: '8px 14px', textAlign: 'center', borderRight: c.totalDeposit > 0 ? `1px solid ${innerBorderColor}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2, justifyContent: 'center' }}>
                    <span style={{ fontSize: 11 }}>💰</span>
                    <div style={{ fontSize: 10.5, color: 'var(--text2)' }}>Měsíční nájem</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: showDph ? 'var(--price-netto)' : 'var(--text)' }}>{((c.rent || 0) + (c.parking || 0)).toLocaleString('cs-CZ')} Kč</div>
                  {showDph && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>bez DPH</div>}
                </div>
                {c.totalDeposit > 0 && (
                  <div style={{ padding: '8px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2, justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: 11 }}>⚡</span>
                      <div style={{ fontSize: 10.5, color: 'var(--text2)' }}>Zálohy celkem</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: showDph ? 'var(--price-netto)' : 'var(--text)' }}>{c.totalDeposit.toLocaleString('cs-CZ')} Kč</div>
                    {showDph && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>bez DPH</div>}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 60 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Smlouvy</div>
          <div className="page-sub">
            Přehled jednotlivých smluv podle subjektů
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <input 
              type="text" 
              placeholder="Hledat nájemce nebo předmět..." 
              className="btn" 
              style={{ width: 240, cursor: 'text', textAlign: 'left', paddingLeft: 30 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text3)' }}>
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          {/* TLAČÍTKO OTEVÍRÁ FORMULÁŘ */}
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Nová smlouva</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 40, marginTop: 10 }}>
        {SUBJECT_ORDER.map(subject => {
          if (activeSubject !== 'all' && activeSubject !== subject) return null

          const subjectContracts = filtered.filter(c => c.assetSubject === subject)
          // Ostatní sekci skryj pokud je prázdná
          if (subject === 'Ostatní' && subjectContracts.length === 0) return null
          const activeInSubject = getOrdered(subjectContracts.filter(c => c.status === 'active'))
          const archivedInSubject = subjectContracts.filter(c => c.status !== 'active')

          let subjectIcon = '🏢'
          if (subject.includes('Novohradská')) subjectIcon = '🏠'
          if (subject.includes('Ubytovací')) subjectIcon = '🛏️'
          if (subject.includes('Bürger Pavel')) subjectIcon = '👤'
          if (subject.includes('JIHOTANK')) subjectIcon = '⛽'
          if (subject === 'Ostatní') subjectIcon = '📄'

          return (
            <div key={subject}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '2.5px solid var(--border)', paddingBottom: 11, marginBottom: 18 }}>
                <span style={{ fontSize: 17 }}>{subjectIcon}</span>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1.2px' }}>{subject}</div>
                <div className="badge" style={{ background: 'var(--bg2)', color: 'var(--text2)', fontSize: 12, fontWeight: 600 }}>{activeInSubject.length} aktivních</div>
              </div>

              {subjectContracts.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text3)', padding: '10px 0', fontStyle: 'italic', paddingLeft: 33 }}>
                  Zatím žádné evidované smlouvy.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16 }}>
                  {activeInSubject.map(c => (
                    <div key={c.id}
                      draggable
                      onDragStart={() => { dragId.current = c.id }}
                      onDragOver={e => { e.preventDefault(); dragOverId.current = c.id }}
                      onDrop={() => handleDrop(subjectContracts.filter(x => x.status === 'active'))}
                      style={{ cursor: 'grab' }}
                    >
                      {renderCard(c, false)}
                    </div>
                  ))}
                  {archivedInSubject.map(c => renderCard(c, true))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* VYKRESLENÍ FORMULÁŘE */}
      {showForm && <ContractForm onClose={() => setShowForm(false)} />}
    </div>
  )
}