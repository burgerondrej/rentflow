import React, { useState, useRef } from 'react'
import { useApp } from '../AppContext.jsx'
import TenantForm from '../TenantForm.jsx'

// 26 výrazných tmavých barev — každé písmeno abecedy dostane svou vlastní
const LETTER_COLORS = [
  '#1565C0', // A – modrá
  '#2E7D32', // B – zelená
  '#6A1B9A', // C – fialová
  '#00838F', // D – teal
  '#C62828', // E – červená
  '#4527A0', // F – tmavě fialová
  '#558B2F', // G – olivová zelená
  '#0277BD', // H – světle modrá
  '#EF6C00', // I – oranžová
  '#283593', // J – indigová
  '#00695C', // K – tmavá teal
  '#AD1457', // L – růžová
  '#4E342E', // M – hnědá
  '#37474F', // N – modro-šedá
  '#1B5E20', // O – tmavě zelená
  '#880E4F', // P – malinová
  '#0D47A1', // Q – tmavě modrá
  '#BF360C', // R – cihlová
  '#1A237E', // S – tmavě indigová
  '#006064', // T – tmavá cyan
  '#4A148C', // U – tmavě purpurová
  '#33691E', // V – tmavě zelená
  '#1B5E20', // W
  '#827717', // X – olivová
  '#E65100', // Y – tmavě oranžová
  '#212121', // Z – antracit
]

// Česká abeceda vč. háčků/čárek — správné pořadí pro řazení i barvy
const CZ_ALPHA = [
  'A','Á','B','C','Č','D','Ď','E','É','Ě','F','G','H',
  'CH','I','Í','J','K','L','M','N','Ň','O','Ó','P','Q',
  'R','Ř','S','Š','T','Ť','U','Ú','Ů','V','W','X','Y','Ý','Z','Ž'
]

// Vrátí barvu podle počátečního písmene — stejné písmeno = vždy stejná barva
const getAccentColor = (name) => {
  if (!name) return LETTER_COLORS[0]
  const first = name[0].toUpperCase()
  // Najdi index v české abecedě, pak mapuj na paletu
  const idx = CZ_ALPHA.indexOf(first)
  if (idx !== -1) return LETTER_COLORS[idx % LETTER_COLORS.length]
  // Fallback pro nečeská písmena
  return LETTER_COLORS[first.charCodeAt(0) % LETTER_COLORS.length]
}

// Správné české řazení písmen (Č za C, Š za S atd.)
const czSort = (a, b) => a.localeCompare(b, 'cs', { sensitivity: 'base' })

const CONTRACT_TYPE_ICON = { residential: '🏠', commercial: '🏢', ads: '📢', parking: '🅿️' }

export default function Tenants({ onOpen }) {
  const { tenants = [], contracts = [], assets = [], isReadOnly } = useApp()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState({})
  const dragId = useRef(null)
  const dragOverId = useRef(null)
  const [cardOrder, setCardOrder] = useState(null)

  const toggleGroup = (letter) =>
    setCollapsedGroups(p => ({ ...p, [letter]: !p[letter] }))

  const getOrdered = (items) => {
    if (!cardOrder) return items
    const map = {}; items.forEach(i => { map[i.id] = i })
    const result = cardOrder.filter(id => map[id]).map(id => map[id])
    items.forEach(i => { if (!cardOrder.includes(i.id)) result.push(i) })
    return result
  }
  const handleDrop = (items) => {
    if (!dragId.current || dragId.current === dragOverId.current) return
    const ids = getOrdered(items).map(i => i.id)
    const from = ids.indexOf(dragId.current), to = ids.indexOf(dragOverId.current)
    if (from === -1 || to === -1) return
    const newIds = [...ids]; newIds.splice(from, 1); newIds.splice(to, 0, dragId.current)
    setCardOrder(newIds)
    dragId.current = null; dragOverId.current = null
  }

  let allFiltered = tenants
  if (search) {
    const term = search.toLowerCase()
    allFiltered = allFiltered.filter(t =>
      (t.name && t.name.toLowerCase().includes(term)) ||
      (t.tags && t.tags.some(tag => tag.toLowerCase().includes(term)))
    )
  }
  const filtered = allFiltered.filter(t => t.status !== 'archived')
  const archived = allFiltered.filter(t => t.status === 'archived')

  const renderCard = (t) => {
    const accent = getAccentColor(t.name)
    const initials = t.initials || (t.name || '??').substring(0, 2).toUpperCase()
    const activeContracts = contracts.filter(c => c.tenantId === t.id && c.status === 'active')
    const hasActive = activeContracts.length > 0
    // Součty po pronajímateli — residential nikdy nezobrazuje DPH
    const calcRents = activeContracts.reduce((acc, c) => {
      const asset = assets.find(a => a.id === c.assetId)
      const effSub = c.billingSubject || asset?.subject || ''
      const isBurger = effSub.startsWith('Bürger Pavel')
      const isResidential = asset?.type === 'residential'
      const rent = (Number(c.rent) || 0) + (isResidential && c.parking > 0 ? Number(c.parking || 0) : 0) + (Number(c.flatFee) || 0)
      if (isBurger) acc.burger += rent
      else if (isResidential) acc.metroNoDph += rent
      else acc.metroDph += rent
      return acc
    }, { metroDph: 0, metroNoDph: 0, burger: 0 })
    calcRents.metro = calcRents.metroDph + calcRents.metroNoDph
    const totalRent = calcRents.metro + calcRents.burger

    return (
      <div
        key={t.id}
        draggable
        onDragStart={() => { dragId.current = t.id }}
        onDragOver={e => { e.preventDefault(); dragOverId.current = t.id }}
        onDrop={() => handleDrop(filtered)}
        onClick={() => onOpen(t.id)}
        style={{
          background: accent + '1A',
          border: '1px solid var(--border)',
          borderRadius: 16,
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          borderLeft: `5px solid ${accent}`,
        }}
        onMouseOver={e => {
          e.currentTarget.style.transform = 'translateY(-3px)'
          e.currentTarget.style.boxShadow = `0 12px 32px rgba(0,0,0,0.12), 0 0 0 1px ${accent}40`
          e.currentTarget.style.borderColor = accent
        }}
        onMouseOut={e => {
          e.currentTarget.style.transform = ''
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)'
          e.currentTarget.style.borderColor = 'var(--border)'
        }}
      >
        {/* Header řádek */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px 10px' }}>
          {/* Avatar */}
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: accent,
            boxShadow: `0 4px 12px ${accent}55`,
          }} />
          {/* Jméno + status */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: hasActive ? '#22C55E' : '#DC2626', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: hasActive ? '#16A34A' : '#DC2626', fontWeight: 600 }}>
                {activeContracts.length === 0
                  ? 'Žádná aktivní smlouva'
                  : activeContracts.length === 1
                    ? '1 aktivní smlouva'
                    : activeContracts.length < 5
                      ? `${activeContracts.length} aktivní smlouvy`
                      : `${activeContracts.length} aktivních smluv`}
              </span>
            </div>
          </div>
        </div>

        {/* Souhrnné částky po pronajímateli */}
        {hasActive && (calcRents.metro > 0 || calcRents.burger > 0) && (
          <div style={{ display: 'flex', gap: 8, padding: '0 14px 12px', flexWrap: 'wrap' }}>
            {calcRents.metro > 0 && (
              <div style={{ flex: 1, minWidth: 130, background: 'rgba(255,255,255,0.5)', border: `1px solid ${accent}30`, borderRadius: 10, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '0.4px', flexShrink: 0 }}>METROPOLE CB</div>
                <div style={{ textAlign: 'right' }}>
                  {calcRents.metroDph > 0 && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--price-netto)' }}>{calcRents.metroDph.toLocaleString('cs-CZ')} <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)' }}>Kč bez DPH</span></div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--price-brutto)' }}>{(calcRents.metroDph * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč s DPH</div>
                    </>
                  )}
                  {calcRents.metroNoDph > 0 && (
                    <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--price-netto)', marginTop: calcRents.metroDph > 0 ? 3 : 0 }}>{calcRents.metroNoDph.toLocaleString('cs-CZ')} <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)' }}>Kč</span></div>
                  )}
                </div>
              </div>
            )}
            {calcRents.burger > 0 && (
              <div style={{ flex: 1, minWidth: 130, background: 'rgba(255,255,255,0.5)', border: `1px solid ${accent}30`, borderRadius: 10, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '0.4px', flexShrink: 0 }}>Bürger Pavel</div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: accent }}>{calcRents.burger.toLocaleString('cs-CZ')} <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)' }}>Kč</span></div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500 }}>neplátce DPH</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Kontakty */}
        {(t.phone || t.email) && (
          <div style={{ padding: '0 18px 10px', display: 'flex', flexDirection: 'column', gap: 4, background: accent + '10' }}>
            {t.phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text2)' }}>
                <span style={{ opacity: 0.7 }}>📞</span> {t.phone}
              </div>
            )}
            {t.email && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text2)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                <span style={{ opacity: 0.7 }}>✉️</span> {t.email}
              </div>
            )}
          </div>
        )}

        {/* Aktivní smlouvy – předmět + firma + zálohy + DPH */}
        {hasActive && (
          <div>
            {/* Oddělovací čára + label */}
            <div style={{ margin: '0 14px', paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Aktivní smlouvy</span>
            </div>
          <div style={{ margin: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(() => {
              // Seskup smlouvy: stejný groupLabel → jedna hlavička
              const groups = []
              const seen = new Set()
              for (const c of activeContracts) {
                if (c.groupLabel) {
                  if (!seen.has(c.groupLabel)) {
                    seen.add(c.groupLabel)
                    groups.push({ type: 'group', label: c.groupLabel, contracts: activeContracts.filter(x => x.groupLabel === c.groupLabel) })
                  }
                } else {
                  groups.push({ type: 'single', contract: c })
                }
              }
              return groups.slice(0, 4).map((item, idx) => {
                if (item.type === 'group') {
                  const totalGroupRent = item.contracts.reduce((s, c) => s + Number(c.rent || 0), 0)
                  const firstC = item.contracts[0]
                  const firstAsset = assets.find(a => a.id === firstC?.assetId)
                  const effSub = firstC?.billingSubject || firstAsset?.subject || ''
                  const groupDph = firstC?.vatExempt === 2 ? true : firstC?.vatExempt === 1 ? false : !effSub.startsWith('Bürger Pavel')
                  const gType = firstAsset?.type || 'parking'
                  const gIcon = gType === 'ads' ? '📢' : gType === 'commercial' ? '🏢' : '🅿️'
                  const gSubLabel = gType === 'ads' ? `${item.contracts.length} reklamních ploch` : gType === 'commercial' ? `${item.contracts.length} komerčních prostor` : `${item.contracts.length} parkovacích stání`
                  return (
                    <div key={item.label} style={{ background: accent + '18', borderRadius: 10, border: `1px solid ${accent}35`, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${accent}25` }}>
                        <span style={{ fontSize: 13 }}>{gIcon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
                          <div style={{ fontSize: 10.5, color: accent, fontWeight: 700 }}>{gSubLabel}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--price-netto)' }}>{totalGroupRent.toLocaleString('cs-CZ')} Kč</div>
                          {groupDph && totalGroupRent > 0 && <div style={{ fontSize: 10.5, color: 'var(--price-brutto)', fontWeight: 600 }}>{(totalGroupRent * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč s DPH</div>}
                        </div>
                      </div>
                      <div style={{ padding: '6px 12px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {item.contracts.map(c => {
                          const asset = assets.find(a => a.id === c.assetId)
                          const rent = Number(c.rent || 0)
                          return (
                            <div key={c.id}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: 'var(--text2)' }}>— {asset?.unit || '?'}</span>
                                <div style={{ textAlign: 'right' }}>
                                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{rent.toLocaleString('cs-CZ')} Kč</span>
                                  {groupDph && rent > 0 && <div style={{ fontSize: 10, color: 'var(--price-brutto)' }}>{(rent * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s DPH</div>}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                }
                const c = item.contract
                const asset = assets.find(a => a.id === c.assetId)
                const icon = CONTRACT_TYPE_ICON[asset?.type] || '📄'
                const effectiveSubject = c.billingSubject || asset?.subject || ''
                const isDphSubject = c.vatExempt === 2 ? true
                  : c.vatExempt === 1 ? false
                  : !effectiveSubject.startsWith('Bürger Pavel')
                const showDph = (asset?.type === 'commercial' || asset?.type === 'ads' || asset?.type === 'parking') && isDphSubject
                const rent = Number(c.rent || 0) + (asset?.type === 'residential' && c.parking > 0 ? Number(c.parking || 0) : 0)
                const deposit = Number(c.deposit || 0)
                return (
                <div key={c.id} style={{
                  background: accent + '18',
                  borderRadius: 10, padding: '8px 12px',
                  border: `1px solid ${accent}35`,
                }}>
                  {/* Header řádek */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: deposit > 0 ? 5 : 0 }}>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>{icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {asset?.unit || 'Neznámý předmět'}
                      </div>
                      <div style={{ fontSize: 10.5, color: accent, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {asset?.subject || '—'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--price-netto)' }}>{rent.toLocaleString('cs-CZ')} Kč</div>
                      {showDph && <div style={{ fontSize: 10, color: 'var(--text2)' }}>bez DPH</div>}
                    </div>
                  </div>
                  {/* DPH nájemné */}
                  {showDph && rent > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 21 }}>
                      <span style={{ fontSize: 10.5, color: 'var(--text2)' }}>Nájemné s DPH 21 %</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--price-brutto)' }}>{(rent * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                    </div>
                  )}
                  {/* Zálohy */}
                  {(asset?.type === 'residential' || asset?.type === 'commercial') && deposit > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 21, marginTop: 3 }}>
                      <span style={{ fontSize: 10.5, color: 'var(--text2)' }}>{showDph ? 'Zálohy bez DPH' : 'Zálohy'}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--price-netto)' }}>{deposit.toLocaleString('cs-CZ')} Kč</span>
                    </div>
                  )}
                  {showDph && deposit > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 21 }}>
                      <span style={{ fontSize: 10.5, color: 'var(--text2)' }}>Zálohy s DPH 21 %</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--price-brutto)' }}>{(deposit * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                    </div>
                  )}
                  {/* Zálohy voda 12% */}
                  {asset?.type === 'commercial' && showDph && Number(c.depositWater || 0) > 0 && (() => {
                    const dw = Number(c.depositWater)
                    return (<>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 21, marginTop: 3 }}>
                        <span style={{ fontSize: 10.5, color: 'var(--text2)' }}>Zálohy voda bez DPH</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--price-netto)' }}>{dw.toLocaleString('cs-CZ')} Kč</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 21 }}>
                        <span style={{ fontSize: 10.5, color: 'var(--text2)' }}>Zálohy voda s DPH 12 %</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--price-brutto)' }}>{(dw * 1.12).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                      </div>
                    </>)
                  })()}
                </div>
              )
            })
            })()}
            {activeContracts.length > 4 && (
              <div style={{ fontSize: 11, color: 'var(--text3)', paddingLeft: 4, fontStyle: 'italic' }}>
                +{activeContracts.length - 4} další smlouvy
              </div>
            )}
          </div>
          </div>
        )}

        {/* Tagy */}
        {t.tags && t.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '0 14px 14px', background: accent + '0E' }}>
            {t.tags.slice(0, 4).map(tag => (
              <span key={tag} style={{
                padding: '2px 8px', borderRadius: 5, fontSize: 10.5, fontWeight: 700,
                background: accent + '18', color: accent,
                border: `1px solid ${accent}30`
              }}>
                {tag}
              </span>
            ))}
            {t.tags.length > 4 && <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>+{t.tags.length - 4}</span>}
          </div>
        )}
      </div>
    )
  }

  // Rozdělit na firmy a osoby (starší záznamy bez typu jdou do "ostatní")
  const companies = filtered.filter(t => t.tenantType === 'company')
  const persons   = filtered.filter(t => t.tenantType === 'person')
  const untyped   = filtered.filter(t => !t.tenantType)

  // Abecední skupiny — sjednocená písmena z obou stran
  const getGroups = (list) => {
    const g = {}
    getOrdered(list)
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'cs', { sensitivity: 'base', numeric: true }))
      .forEach(t => {
        const letter = (t.name || '?')[0].toUpperCase()
        if (!g[letter]) g[letter] = []
        g[letter].push(t)
      })
    return g
  }
  const companyGroups = getGroups(companies)
  const personGroups  = getGroups(persons)
  const allLetters = [...new Set([...Object.keys(companyGroups), ...Object.keys(personGroups)])].sort(czSort)

  const hasAnyTenant = filtered.length > 0 || archived.length > 0

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* Hlavička */}
      <div className="page-header">
        <div>
          <div className="page-title">Adresář nájemníků</div>
          <div className="page-sub">
            {filtered.length} nájemníků · {companies.length} firem · {persons.length} fyzických osob
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text" placeholder="Hledat jméno nebo štítek..."
              className="btn"
              style={{ width: 240, cursor: 'text', textAlign: 'left', paddingLeft: 30 }}
              value={search} onChange={e => setSearch(e.target.value)}
            />
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text3)' }}>
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          {!isReadOnly && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Nový nájemce</button>
          )}
        </div>
      </div>

      {/* Statistická lišta */}
      {!search && filtered.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
          {[
            { label: 'Celkem nájemníků', value: filtered.length, color: '#12654A', bg: '#F0FDF4', border: '#BBF7D0', icon: '🧑‍💼' },
            { label: 'Firmy', value: companies.length, color: '#3730a3', bg: '#EEF2FF', border: '#C7D2FE', icon: '🏢' },
            { label: 'Fyzické osoby', value: persons.length, color: '#0369a1', bg: '#F0F9FF', border: '#BAE6FD', icon: '👤' },
            { label: 'S aktivní smlouvou', value: filtered.filter(t => contracts.some(c => c.tenantId === t.id && c.status === 'active')).length, color: '#166534', bg: '#DCFCE7', border: '#86EFAC', icon: '✅' },
            { label: 'Bez smlouvy', value: filtered.filter(t => !contracts.some(c => c.tenantId === t.id && c.status === 'active')).length, color: '#6B7280', bg: 'var(--bg2)', border: 'var(--border)', icon: '⭕' },
          ].map(stat => (
            <div key={stat.label} style={{ background: stat.bg, border: `1.5px solid ${stat.border}`, borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, flex: '1 1 0', minWidth: 140 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{stat.icon}</div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 900, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: stat.color, fontWeight: 600, marginTop: 3, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Při hledání — flat grid */}
      {search ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {filtered.map(t => renderCard(t))}
        </div>
      ) : (
        <>
          {/* ── ABECEDNÍ NAVBAR ── */}
          {allLetters.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 20, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--border)' }}>
              {allLetters.map(letter => (
                <button
                  key={letter}
                  onClick={() => {
                    const el = document.getElementById(`tenant-group-${letter}`)
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  style={{
                    width: 32, height: 32, borderRadius: 8, fontSize: 13, fontWeight: 800,
                    background: 'var(--accent)', color: '#fff', border: 'none',
                    cursor: 'pointer', transition: 'opacity 0.15s',
                  }}
                  onMouseOver={e => e.currentTarget.style.opacity = '0.75'}
                  onMouseOut={e => e.currentTarget.style.opacity = '1'}
                >
                  {letter}
                </button>
              ))}
            </div>
          )}
          {/* ── SPLIT LAYOUT: Firmy | Fyzické osoby ── */}
          {(companies.length > 0 || persons.length > 0) && (
            <>
              {/* Záhlaví sloupců */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2px 1fr', gap: 0, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '2px solid var(--border)' }}>
                  <span style={{ fontSize: 20 }}>🏢</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Firmy</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{companies.length} nájemců</div>
                  </div>
                </div>
                <div /> {/* mezera pro čáru */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '2px solid var(--border)', paddingLeft: 20 }}>
                  <span style={{ fontSize: 20 }}>👤</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Soukromé osoby</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{persons.length} nájemců</div>
                  </div>
                </div>
              </div>

              {/* Abecední řádky */}
              {allLetters.map(letter => {
                const cGroup = companyGroups[letter] || []
                const pGroup = personGroups[letter]  || []
                const isCollapsed = collapsedGroups[letter]
                return (
                  <div key={letter} id={`tenant-group-${letter}`} style={{ marginBottom: 28 }}>
                    {/* Skupina header — táhne se přes oba sloupce */}
                    <div
                      onClick={() => toggleGroup(letter)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        cursor: 'pointer', userSelect: 'none',
                        marginBottom: isCollapsed ? 0 : 14,
                        paddingBottom: 10,
                        borderBottom: '2px solid var(--border)',
                      }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: 'var(--accent)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, fontWeight: 900, flexShrink: 0
                      }}>
                        {letter}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        {cGroup.length > 0 && <span style={{ color: '#1E40AF' }}>{cGroup.length} {cGroup.length === 1 ? 'firma' : cGroup.length < 5 ? 'firmy' : 'firem'}</span>}
                        {cGroup.length > 0 && pGroup.length > 0 && <span style={{ color: 'var(--text3)', margin: '0 8px' }}>·</span>}
                        {pGroup.length > 0 && <span style={{ color: '#166534' }}>{pGroup.length} {pGroup.length === 1 ? 'osoba' : pGroup.length < 5 ? 'osoby' : 'osob'}</span>}
                      </div>
                      <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{isCollapsed ? 'Rozbalit' : 'Sbalit'}</span>
                        <span style={{ transition: 'transform 0.2s', display: 'inline-block', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
                      </div>
                    </div>

                    {/* Dvousloupcový obsah */}
                    {!isCollapsed && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2px 1fr', gap: 0, alignItems: 'start' }}>
                        {/* Levý sloupec — Firmy */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: 10, paddingRight: 16, alignContent: 'start' }}>
                          {cGroup.length > 0
                            ? cGroup.map(t => renderCard(t))
                            : <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', padding: '8px 0' }}>Žádná firma na „{letter}"</div>
                          }
                        </div>
                        {/* Svislá dělicí čára */}
                        <div style={{ background: 'var(--border)', width: 2, minHeight: 40, alignSelf: 'stretch' }} />
                        {/* Pravý sloupec — Fyzické osoby */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: 10, paddingLeft: 16, alignContent: 'start' }}>
                          {pGroup.length > 0
                            ? pGroup.map(t => renderCard(t))
                            : <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', padding: '8px 0' }}>Žádná osoba na „{letter}"</div>
                          }
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {/* Nájemci bez nastaveného typu (starší záznamy) */}
          {untyped.length > 0 && (
            <div style={{ marginTop: allLetters.length > 0 ? 40 : 0 }}>
              {allLetters.length > 0 && (
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 16 }}>
                  Starší záznamy bez přiřazeného typu
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                {untyped.map(t => renderCard(t))}
              </div>
            </div>
          )}
        </>
      )}

      {!hasAnyTenant && (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text3)' }}>
          Žádný nájemce nenalezen.
        </div>
      )}

      {/* Archiv */}
      {archived.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 16, userSelect: 'none' }}
            onClick={() => setShowArchived(p => !p)}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {showArchived ? '▾' : '▸'} Archiv nájemníků ({archived.length})
            </div>
          </div>
          {showArchived && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: 16, opacity: 0.6 }}>
              {archived.map(t => renderCard(t))}
            </div>
          )}
        </div>
      )}

      {showForm && <TenantForm onClose={() => setShowForm(false)} />}
    </div>
  )
}
