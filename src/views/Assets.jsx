import React, { useState, useRef } from 'react'
import { useApp } from '../AppContext.jsx'
import AssetForm from '../AssetForm.jsx'


// Sekce pro bytové jednotky



const CONFIG = {
  residential: { title: 'Bytové jednotky', sub: 'Správa bytů', btnLabel: '+ Nová bytová jednotka', tenantLabel: 'Nájemce', priceLabel: 'Nájemné' },
  commercial:  { title: 'Komerční prostory', sub: 'Správa kanceláří', btnLabel: '+ Nový komerční prostor', tenantLabel: 'Nájemce', priceLabel: 'Nájemné' },
  ads:         { title: 'Reklamní plochy', sub: 'Billboardy a reklamy', btnLabel: '+ Nová reklamní plocha', tenantLabel: 'Klient', priceLabel: 'Měsíční nájemné' },
  parking:     { title: 'Parkovací stání', sub: 'Parkovací místa', btnLabel: '+ Nové parkovací stání', tenantLabel: 'Klient', priceLabel: 'Měsíční nájemné' },
  ostatni:     { title: 'Ostatní', sub: 'Interní a skupinové smlouvy', btnLabel: '+ Nový záznam', tenantLabel: 'Smluvní strana', priceLabel: 'Částka' }
}

function useDragOrder(initialItems) {
  const [order, setOrder] = useState(null)
  const dragId = useRef(null)
  const dragOver = useRef(null)

  const getOrdered = (items) => {
    if (!order) return items
    const map = {}
    items.forEach(i => { map[i.id] = i })
    const result = order.filter(id => map[id]).map(id => map[id])
    items.forEach(i => { if (!order.includes(i.id)) result.push(i) })
    return result
  }

  const handlers = (id) => ({
    draggable: true,
    onDragStart: () => { dragId.current = id },
    onDragOver: (e) => { e.preventDefault(); dragOver.current = id },
    onDrop: (items) => {
      if (!dragId.current || dragId.current === dragOver.current) return
      const ids = getOrdered(items).map(i => i.id)
      const from = ids.indexOf(dragId.current)
      const to = ids.indexOf(dragOver.current)
      if (from === -1 || to === -1) return
      const newIds = [...ids]
      newIds.splice(from, 1)
      newIds.splice(to, 0, dragId.current)
      setOrder(newIds)
      dragId.current = null
      dragOver.current = null
    }
  })

  return { getOrdered, handlers }
}

export default function Assets({ type, activeSubject, onOpen }) {
  const { assets = [], contracts = [], tenants = [] , residentialSubjects = [] } = useApp()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState({})
  const { getOrdered, handlers } = useDragOrder([])

  const conf = CONFIG[type]

  const naturalSort = (a, b) => a.unit.localeCompare(b.unit, 'cs', { numeric: true, sensitivity: 'base' })

  let allFiltered = assets.filter(a => a.type === type)
  if (activeSubject && activeSubject !== 'all') {
    allFiltered = allFiltered.filter(a => a.subject === activeSubject)
  }
  if (search) {
    const term = search.toLowerCase()
    allFiltered = allFiltered.filter(a =>
      (a.unit || '').toLowerCase().includes(term) ||
      (a.subject || '').toLowerCase().includes(term)
    )
  }

  const filtered = allFiltered.filter(a => a.status !== 'archived').sort(naturalSort)
  const archivedAssets = allFiltered.filter(a => a.status === 'archived').sort(naturalSort)

  const renderCard = (asset, isDragging = false) => {
    const activeContract = contracts.find(c => c.assetId === asset.id && c.status === 'active')
    const currentTenant = activeContract ? tenants.find(t => t.id === activeContract.tenantId) : null
    const isFree = !activeContract && asset.status !== 'occupied'

    let cardBg = 'var(--bg2)', headerBg = 'rgba(0,0,0,0.03)', accentColor = 'var(--text2)', icon = '📄', cardBorder = 'var(--border)'
    if (asset.type === 'residential') { cardBg = 'var(--asset-residential-bg)'; headerBg = 'var(--asset-residential-header)'; accentColor = 'var(--asset-residential-accent)'; cardBorder = 'var(--asset-residential-border)'; icon = '🏠' }
    if (asset.type === 'commercial')  { cardBg = 'var(--asset-commercial-bg)';  headerBg = 'var(--asset-commercial-header)';  accentColor = 'var(--asset-commercial-accent)';  cardBorder = 'var(--asset-commercial-border)';  icon = '🏢' }
    if (asset.type === 'ads')         { cardBg = 'var(--asset-ads-bg)';         headerBg = 'var(--asset-ads-header)';         accentColor = 'var(--asset-ads-accent)';         cardBorder = 'var(--asset-ads-border)';         icon = '🪧' }
    if (asset.type === 'parking')     { cardBg = 'var(--asset-parking-bg)';     headerBg = 'var(--asset-parking-header)';     accentColor = 'var(--asset-parking-accent)';     cardBorder = 'var(--asset-parking-border)';     icon = '🅿️' }
    if (asset.type === 'ostatni')     { cardBg = 'var(--asset-ostatni-bg)';     headerBg = 'var(--asset-ostatni-header)';     accentColor = 'var(--asset-ostatni-accent)';     cardBorder = 'var(--asset-ostatni-border)';     icon = '📋' }

    const dh = handlers(asset.id)
    return (
      <div
        key={asset.id}
        draggable={dh.draggable}
        onDragStart={dh.onDragStart}
        onDragOver={dh.onDragOver}
        onDrop={() => dh.onDrop(filtered)}
        onClick={() => onOpen(asset.id)}
        className="card card-interactive"
        style={{
          cursor: 'grab', marginBottom: 0, padding: 0, overflow: 'hidden', borderRadius: 12,
          border: `1px solid ${cardBorder}`, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          background: cardBg, transition: 'opacity 0.15s',
          opacity: isDragging ? 0.5 : 1,
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: headerBg, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 13, cursor: 'grab', opacity: 0.4 }}>⠿</span>
            <span style={{ fontSize: 13 }}>{icon}</span>
            <div style={{ fontSize: 14, fontWeight: 700, color: accentColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {asset.unit}
            </div>
          </div>
          <div style={{ marginBottom: 0, flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: isFree ? '#DCFCE7' : '#FEE2E2', color: isFree ? '#166534' : '#991B1B', border: `1px solid ${isFree ? '#86EFAC' : '#FECACA'}` }}>
            {isFree ? 'Volné' : 'Obsazeno'}
          </div>
        </div>
        <div style={{ padding: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {asset.size && <span className="badge" style={{ background: 'rgba(255,255,255,0.7)', color: 'var(--text)', border: '1px solid rgba(0,0,0,0.05)' }}>{asset.size}</span>}
            {asset.floor && <span className="badge" style={{ background: 'rgba(255,255,255,0.7)', color: 'var(--text)', border: '1px solid rgba(0,0,0,0.05)' }}>{asset.floor}</span>}
            {asset.format && <span className="badge" style={{ background: 'rgba(255,255,255,0.7)', color: 'var(--text)', border: '1px solid rgba(0,0,0,0.05)' }}>{asset.format}</span>}
          </div>
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 12 }}>
            {isFree ? (
              <div style={{ fontSize: 12.5, color: 'var(--text2)', fontStyle: 'italic' }}>{asset.subject}</div>
            ) : (
              <>
                {/* Nájemce – vždy celá šířka */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{conf.tenantLabel}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentTenant ? currentTenant.name : 'Neznámý'}
                  </div>
                </div>
                {/* Finanční řádek */}
                {(() => {
                  const isCommercial = asset.type === 'commercial'
                  const isResidential = asset.type === 'residential'
                  const deposit = Number(activeContract?.deposit || 0)
                  const depositWater = Number(activeContract?.depositWater || 0)
                  // Komerční zálohy = energie + voda (oboje bez DPH)
                  const totalDeposit = isCommercial ? deposit + depositWater : deposit
                  const showDeposit = isResidential
                    ? deposit > 0
                    : isCommercial
                      ? totalDeposit > 0
                      : false
                  const cols = showDeposit ? '1fr 1fr' : '1fr'
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                          {conf.priceLabel}{isCommercial ? ' bez DPH' : ''}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                          {activeContract ? `${((activeContract.rent || 0) + (activeContract.parking || 0)).toLocaleString('cs-CZ')} Kč` : '—'}
                        </div>
                      </div>
                      {showDeposit && (
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                            {isCommercial ? 'Zálohy bez DPH' : 'Zálohy energií'}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                            {totalDeposit.toLocaleString('cs-CZ')} Kč
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const toggleSection = (s) => setCollapsedSections(p => ({ ...p, [s]: !p[s] }))

  // Pro bytové jednotky — render po sekcích (57a, 53/55, UJ) – styl jako Smlouvy
  const renderResidentialSections = () => {
    const sections = [...residentialSubjects]
    const others = filtered.filter(a => !residentialSubjects.includes(a.subject))
    if (others.length > 0) sections.push('Ostatní')

    return sections.map(sectionName => {
      const items = sectionName === 'Ostatní'
        ? getOrdered(others)
        : getOrdered(filtered.filter(a => a.subject === sectionName))
      if (items.length === 0) return null

      const isCollapsed = collapsedSections[sectionName]
      const shortName = sectionName.includes(' – ') ? sectionName.split(' – ').slice(1).join(' – ') : sectionName
      const activeCount = items.filter(a => a.status === 'occupied' || contracts.some(c => c.assetId === a.id && c.status === 'active')).length

      let sectionIcon = '🏠'

      return (
        <div key={sectionName} style={{ marginBottom: 40 }}>
          {/* Section header – stejný styl jako Smlouvy */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '2.5px solid var(--border)', paddingBottom: 11, marginBottom: 18 }}>
            <span style={{ fontSize: 18 }}>{sectionIcon}</span>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
              {shortName}
            </div>
            <span style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--bg2)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 8, fontWeight: 600 }}>
              {activeCount} obsazeno / {items.length} celkem
            </span>
            <button
              onClick={() => toggleSection(sectionName)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text3)', padding: '2px 6px', borderRadius: 6 }}
            >
              {isCollapsed ? '▸ Rozbalit' : '▾ Sbalit'}
            </button>
          </div>

          {!isCollapsed && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {items.map(a => renderCard(a))}
            </div>
          )}
          {isCollapsed && (
            <div style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0', fontStyle: 'italic' }}>
              Sekce sbalena – {items.length} {items.length === 1 ? 'jednotka' : items.length < 5 ? 'jednotky' : 'jednotek'}
            </div>
          )}
        </div>
      )
    })
  }

  // Generická sekční funkce pro parking a ads – dle format pole
  const renderFormatSections = (sectionNames, icon) => {
    const sections = [...sectionNames]
    const others = filtered.filter(a => !a.format || !sectionNames.includes(a.format))
    if (others.length > 0) sections.push('Ostatní')

    return sections.map(sectionName => {
      const items = sectionName === 'Ostatní'
        ? getOrdered(others)
        : getOrdered(filtered.filter(a => a.format === sectionName))
      if (items.length === 0) return null

      const isCollapsed = collapsedSections[sectionName]
      const activeCount = items.filter(a => a.status === 'occupied' || contracts.some(c => c.assetId === a.id && c.status === 'active')).length

      return (
        <div key={sectionName} style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '2.5px solid var(--border)', paddingBottom: 11, marginBottom: 18 }}>
            <span style={{ fontSize: 18 }}>{icon}</span>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
              {sectionName}
            </div>
            <span style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--bg2)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 8, fontWeight: 600 }}>
              {activeCount} obsazeno / {items.length} celkem
            </span>
            <button
              onClick={() => toggleSection(sectionName)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text3)', padding: '2px 6px', borderRadius: 6 }}
            >
              {isCollapsed ? '▸ Rozbalit' : '▾ Sbalit'}
            </button>
          </div>
          {!isCollapsed && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {items.map(a => renderCard(a))}
            </div>
          )}
          {isCollapsed && (
            <div style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0', fontStyle: 'italic' }}>
              Sekce sbalena – {items.length} {items.length === 1 ? 'položka' : items.length < 5 ? 'položky' : 'položek'}
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <div style={{ paddingBottom: 60 }}>
      <div className="page-header">
        <div>
          <div className="page-title">{conf.title}</div>
          <div className="page-sub">{filtered.length} položek</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text" placeholder="Hledat..." className="btn"
              style={{ width: 180, cursor: 'text', textAlign: 'left', paddingLeft: 30 }}
              value={search} onChange={e => setSearch(e.target.value)}
            />
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text3)' }}>
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>{conf.btnLabel}</button>
        </div>
      </div>

      {type === 'residential'
        ? renderResidentialSections()
        : type === 'parking'
        ? renderFormatSections([...new Set(filtered.map(a => a.format).filter(Boolean))], '🅿️')
        : type === 'ads'
        ? renderFormatSections([...new Set(filtered.map(a => a.format).filter(Boolean))], '🪧')
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {getOrdered(filtered).map(a => renderCard(a))}
          </div>
        )
      }

      {filtered.length === 0 && archivedAssets.length === 0 && (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text3)' }}>
          Pro tuto kategorii nejsou evidovány žádné položky.
        </div>
      )}

      {archivedAssets.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 16, userSelect: 'none' }} onClick={() => setShowArchived(p => !p)}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {showArchived ? '▾' : '▸'} Archivované ({archivedAssets.length})
            </div>
          </div>
          {showArchived && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, opacity: 0.6 }}>
              {archivedAssets.map(a => renderCard(a))}
            </div>
          )}
        </div>
      )}

      {showForm && <AssetForm type={type} onClose={() => setShowForm(false)} />}
    </div>
  )
}
