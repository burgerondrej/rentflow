import React, { useState, useRef } from 'react'
import { useApp } from '../AppContext.jsx'
import AssetForm from '../AssetForm.jsx'
import { getCurrentAssetContract, isContractOccupying, selectionMatches, firmOf, firmColors, assetTypeStyle, getEffectiveValuesToday } from '../utils.js'
import { FirmBadge } from '../FirmUI.jsx'
import { StatusPill } from '../StatusUI.jsx'


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
  const { assets = [], contracts = [], tenants = [] , residentialSubjects = [], firms = [], getFirm, theme } = useApp()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState({})
  const { getOrdered, handlers } = useDragOrder([])

  const conf = CONFIG[type]

  const naturalSort = (a, b) => a.unit.localeCompare(b.unit, 'cs', { numeric: true, sensitivity: 'base' })

  let allFiltered = assets.filter(a => a.type === type)
  if (activeSubject && activeSubject !== 'all') {
    allFiltered = allFiltered.filter(a => selectionMatches(activeSubject, a.subject))
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
    const activeContract = getCurrentAssetContract(contracts, asset.id)
    const currentTenant = activeContract ? tenants.find(t => t.id === activeContract.tenantId) : null
    const isFree = !activeContract && asset.status !== 'occupied'

    // Barvy a ikona typu – jedna sada pro celou aplikaci (styles.css)
    const ts = assetTypeStyle(asset.type)
    const cardBg = ts.bg, headerBg = ts.header, accentColor = ts.accent, icon = ts.icon, cardBorder = ts.border
    const aFirm = getFirm ? getFirm(asset.subject) : null

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
          cursor: 'grab', marginBottom: 0, padding: 0, overflow: 'hidden', borderRadius: 14,
          border: `1.5px solid ${cardBorder}`, boxShadow: '0 3px 12px rgba(0,0,0,0.08)',
          borderLeft: `5px solid ${getFirm && getFirm(asset.subject) ? firmColors(getFirm(asset.subject).color, theme).mid : cardBorder}`,
          background: cardBg, transition: 'opacity 0.15s',
          opacity: isDragging ? 0.5 : 1,
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', background: headerBg, borderBottom: `1.5px solid ${cardBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 13, cursor: 'grab', opacity: 0.5 }}>⠿</span>
            <FirmBadge firm={aFirm} size={24} />
            <span style={{ fontSize: 16 }}>{icon}</span>
            <div style={{ fontSize: 15, fontWeight: 800, color: accentColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.1px' }}>
              {asset.unit}
            </div>
          </div>
          <StatusPill kind={isFree ? 'free' : 'occupied'} size="sm" />
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(asset.size || asset.floor || asset.format) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[asset.size, asset.floor, asset.format].filter(Boolean).map((v, i) => (
                <span key={i} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)', background: 'var(--bg)', border: `1.5px solid ${cardBorder}`, borderRadius: 8, padding: '3px 9px' }}>{v}</span>
              ))}
            </div>
          )}
          {/* Nájemce / volné */}
          <div style={{ padding: '9px 12px', background: 'var(--bg)', borderRadius: 10, border: `1.5px solid ${cardBorder}` }}>
            <div style={{ fontSize: 10, color: accentColor, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.6px', marginBottom: 2 }}>{isFree ? 'Stav' : conf.tenantLabel}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: isFree ? '#16A34A' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isFree ? 'Volné k pronájmu' : (currentTenant ? currentTenant.name : 'Neznámý')}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.subject}</div>
          </div>
          {/* Platnost, nájem, zálohy – aktuálně platné hodnoty (dodatky) */}
          {!isFree && activeContract && (() => {
            const ev = getEffectiveValuesToday(activeContract)
            const isCommercial = asset.type === 'commercial'
            const isResidential = asset.type === 'residential'
            const totalDeposit = isCommercial ? ev.deposit + ev.depositWater : ev.deposit
            const showDeposit = (isResidential || isCommercial) && totalDeposit > 0
            const included = activeContract.paymentFrequency === 'Zahrnuto v nájemném'
            const cell = (label, emoji, value, align, last) => (
              <div style={{ padding: '9px 12px', textAlign: align, borderRight: last ? 'none' : `1.5px solid ${cardBorder}` }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)', marginBottom: 3 }}>{emoji} {label}</div>
                {value}
              </div>
            )
            return (
              <div style={{ display: 'grid', gridTemplateColumns: showDeposit ? '1fr 1fr 1fr' : '1fr 1fr', background: 'var(--bg)', borderRadius: 10, border: `1.5px solid ${cardBorder}` }}>
                {cell('Platnost do', '🗓️', <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{activeContract.end || 'Neurčito'}</div>, 'left', false)}
                {cell(conf.priceLabel + (isCommercial ? ' bez DPH' : ''), '💰',
                  <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)' }}>{included ? 'zahrnuto' : `${(ev.rent + ev.parking + ev.flatFee).toLocaleString('cs-CZ')} Kč`}</div>, 'center', !showDeposit)}
                {showDeposit && cell(isCommercial ? 'Zálohy bez DPH' : 'Zálohy energií', '⚡',
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{totalDeposit.toLocaleString('cs-CZ')} Kč</div>, 'right', true)}
              </div>
            )
          })()}
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
      const activeCount = items.filter(a => a.status === 'occupied' || contracts.some(c => c.assetId === a.id && isContractOccupying(c))).length

      let sectionIcon = '🏠'

      return (
        <div key={sectionName} style={{ marginBottom: 40 }}>
          {/* Section header – stejný styl jako Smlouvy */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '2.5px solid var(--border)', paddingBottom: 11, marginBottom: 18 }}>
            {getFirm && getFirm(sectionName) ? <FirmBadge firm={getFirm(sectionName)} size={28} /> : <span style={{ fontSize: 18 }}>{sectionIcon}</span>}
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
  // Sekce VŽDY v rámci jedné firmy: firma → umístění (format). Stejné umístění dvou firem = dvě sekce.
  const firmIndex = (name) => { const i = firms.findIndex(f => f.name === name); return i < 0 ? 999 : i }
  const renderFormatSections = (sectionNames, icon) => {
    const keys = []
    filtered.forEach(a => {
      const k = `${firmOf(a.subject)}\u0001${a.format && sectionNames.includes(a.format) ? a.format : 'Ostatní'}`
      if (!keys.includes(k)) keys.push(k)
    })
    keys.sort((x, y) => {
      const [fx, sx] = x.split('\u0001'), [fy, sy] = y.split('\u0001')
      if (fx !== fy) return firmIndex(fx) - firmIndex(fy)
      if (sx === 'Ostatní') return 1
      if (sy === 'Ostatní') return -1
      return sectionNames.indexOf(sx) - sectionNames.indexOf(sy)
    })

    return keys.map(key => {
      const [firmName, sectionName] = key.split('\u0001')
      const sectionFirm = firms.find(f => f.name === firmName)
      const items = getOrdered(filtered.filter(a => firmOf(a.subject) === firmName &&
        (sectionName === 'Ostatní' ? (!a.format || !sectionNames.includes(a.format)) : a.format === sectionName)))
      if (items.length === 0) return null

      const isCollapsed = collapsedSections[key]
      const activeCount = items.filter(a => a.status === 'occupied' || contracts.some(c => c.assetId === a.id && isContractOccupying(c))).length

      return (
        <div key={key} style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: `2.5px solid ${sectionFirm ? firmColors(sectionFirm.color, theme).mid + '55' : 'var(--border)'}`, paddingBottom: 11, marginBottom: 18 }}>
            {sectionFirm ? <FirmBadge firm={sectionFirm} size={28} /> : <span style={{ fontSize: 18 }}>{icon}</span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{icon} {sectionName}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: sectionFirm ? firmColors(sectionFirm.color, theme).sub : 'var(--text3)' }}>{firmName}</div>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--bg2)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 8, fontWeight: 600 }}>
              {activeCount} obsazeno / {items.length} celkem
            </span>
            <button
              onClick={() => toggleSection(key)}
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
      <div className="page-header" data-icon={assetTypeStyle(type).icon} data-type={type}>
        <div>
          <div className="page-title">{conf.title}</div>
          <div className="page-sub">{(() => {
            const occ = filtered.filter(a => a.status === 'occupied' || contracts.some(c => c.assetId === a.id && isContractOccupying(c))).length
            return `${filtered.length} položek · ${occ} obsazeno · ${filtered.length - occ} volných`
          })()}</div>
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
        ? renderFormatSections([...new Set(filtered.map(a => a.format).filter(Boolean))], '📢')
        : (
          // Komerční / ostatní: sekce po firmách (striktně odděleno)
          [...new Set(filtered.map(a => firmOf(a.subject)))].sort((x, y) => firmIndex(x) - firmIndex(y)).map(firmName => {
            const firm = firms.find(f => f.name === firmName)
            const items = getOrdered(filtered.filter(a => firmOf(a.subject) === firmName))
            const activeCount = items.filter(a => a.status === 'occupied' || contracts.some(c => c.assetId === a.id && isContractOccupying(c))).length
            return (
              <div key={firmName} style={{ marginBottom: 40 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: `2.5px solid ${firm ? firmColors(firm.color, theme).mid + '55' : 'var(--border)'}`, paddingBottom: 11, marginBottom: 18 }}>
                  {firm && <FirmBadge firm={firm} size={28} />}
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>{firmName}</div>
                  <span style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--bg2)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 8, fontWeight: 600 }}>
                    {activeCount} obsazeno / {items.length} celkem
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                  {items.map(a => renderCard(a))}
                </div>
              </div>
            )
          })
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, opacity: 0.8 }}>
              {archivedAssets.map(a => renderCard(a))}
            </div>
          )}
        </div>
      )}

      {showForm && <AssetForm type={type} onClose={() => setShowForm(false)} />}
    </div>
  )
}
