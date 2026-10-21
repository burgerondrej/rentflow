import React, { useState, useRef, useEffect } from 'react'
import { useApp } from '../AppContext.jsx'
import { getEffectiveValuesToday, isEndingArchived, applyContractOrder, parseDate, firmOf, firmColors, selectionMatches, assetTypeStyle, hasSuccessor } from '../utils.js'
import ContractForm from '../ContractForm.jsx' // IMPORT FORMULÁŘE
import { FirmBadge } from '../FirmUI.jsx'
import { StatusPill, contractStatus } from '../StatusUI.jsx'
import { Segmented, EmptyState } from '../UI.jsx'
import { useNewShortcut, peekContractsFilter, clearContractsFilter } from '../shortcuts.js'
import { cauceInfo, fmtKc, CauceSettleDialog } from '../CauceUI.jsx'
import { contractSubject } from '../utils.js'

export default function Contracts({ activeSubject, onOpen }) {
  const { contracts = [], tenants = [], assets = [], subjects = [], residentialSubjects = [], billingGroups = [], subjectGroups = [], getFirm, theme, cauceSettlements = [] } = useApp()
  const [settleFor, setSettleFor] = useState(null) // smlouva, u které se vypořádává kauce
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  useNewShortcut(() => setShowForm(true)) // Ctrl+N
  const [tab, setTab] = useState('valid') // 'valid' = platné (vč. ukončených s budoucím koncem) | 'ended' = ukončené | 'cauce' = kauce
  // Filtr končících smluv: all | 30 | 60 | 90 | expired (z menu přijde „30“)
  const [endFilter, setEndFilter] = useState(() => peekContractsFilter() || 'all')
  useEffect(() => {
    clearContractsFilter()
    const onReq = (e) => { setEndFilter(e.detail || 'all'); setTab('valid'); clearContractsFilter() }
    window.addEventListener('rf-contracts-filter', onReq)
    return () => window.removeEventListener('rf-contracts-filter', onReq)
  }, [])
  const [cardOrder, setCardOrder] = useState(() => {
    try { const s = localStorage.getItem('rf_contract_order'); return s ? JSON.parse(s) : null } catch { return null }
  })
  const dragId = useRef(null)
  const dragOverId = useRef(null)

  const getOrdered = (items) => applyContractOrder(items, cardOrder, contracts)


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

  // Helper: platné finanční hodnoty k dnešnímu datu (importováno z utils.js)
  const effectiveToday = (c) => getEffectiveValuesToday(c)

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

    const eff = effectiveToday(c)
    const assetSubject = (asset.type === 'ostatni') ? asset.subject : (c.billingSubject || asset.subject)
    return { ...c, tenantName: tenant.name, assetUnit: asset.unit, assetType: asset.type, assetSubject, daysLeft,
      totalDeposit: eff.deposit + eff.depositWater,
      effRent: eff.rent, effParking: eff.parking, effFlatFee: eff.flatFee }
  })

  let filtered = enrichedContracts
  if (search) {
    const term = search.toLowerCase()
    filtered = filtered.filter(c => 
      (c.tenantName && c.tenantName.toLowerCase().includes(term)) ||
      (c.assetUnit && c.assetUnit.toLowerCase().includes(term))
    )
  }

  // Platná = aktivní, nebo ukončená, jejíž poslední den nájmu teprve přijde
  const isValid = (c) => c.status === 'active' || isEndingArchived(c)
  const validCount = filtered.filter(c => isValid(c) && selectionMatches(activeSubject, c.assetSubject)).length
  const endedCount = filtered.filter(c => !isValid(c) && selectionMatches(activeSubject, c.assetSubject)).length
  const endTs = (c) => parseDate(c.end)?.getTime() || 0
  // Končící = platná smlouva bez navazující smlouvy; „Do N dní“ zahrnuje i propadlé (stejně jako červený odznak v menu)
  const isEnding = (c) => isValid(c) && !hasSuccessor(c, contracts) && c.daysLeft !== null
  const endMatch = (c, f = endFilter) => f === 'all' ? true
    : f === 'expired' ? isEnding(c) && c.status === 'active' && c.daysLeft < 0
    : isEnding(c) && c.daysLeft <= Number(f)
  const endCount = (f) => filtered.filter(c => selectionMatches(activeSubject, c.assetSubject) && endMatch(c, f)).length

  // ── Kauce: držené / k vrácení / vyřízené (převedené na navazující smlouvu se nevypisují – drží je nová smlouva) ──
  const CAUCE_ORDER = { toReturn: 0, held: 1, settled: 2 }
  const cauceRows = contracts
    .filter(c => selectionMatches(activeSubject, contractSubject(c, assets)))
    .map(c => ({ c, info: cauceInfo(c, contracts, cauceSettlements) }))
    .filter(r => r.info && r.info.status !== 'transferred')
    .filter(r => !search || [tenants.find(t => t.id === r.c.tenantId)?.name, assets.find(a => a.id === r.c.assetId)?.unit].some(v => v && v.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => CAUCE_ORDER[a.info.status] - CAUCE_ORDER[b.info.status] || b.info.amount - a.info.amount)
  const cauceHeldTotal = cauceRows.filter(r => r.info.status !== 'settled').reduce((sum, r) => sum + r.info.amount, 0)
  const cauceOpenCount = cauceRows.filter(r => r.info.status !== 'settled').length

  const renderCauce = () => {
    if (cauceRows.length === 0) return <EmptyState icon="💰" title="Žádné kauce" text="U smluv v tomto výběru není evidovaná kauce." />
    const pill = (info) => info.status === 'toReturn' ? <StatusPill kind="ending" text="K vrácení" size="sm" />
      : info.status === 'held' ? <StatusPill kind="occupied" text="Drží se" size="sm" />
      : <StatusPill kind="paid" text="Vyřízeno" size="sm" />
    const heads = ['Nájemce / jednotka', 'Smlouva', 'Stav', 'Kauce', '']
    return (
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'clip' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
              {heads.map((h, i) => (
                <th key={i} style={{ padding: '12px 14px', textAlign: i >= 3 ? 'right' : 'left', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cauceRows.map(({ c, info }) => {
              const subj = contractSubject(c, assets)
              const firm = getFirm ? getFirm(subj) : null
              const st = info.settlement
              return (
                <tr key={c.id} onClick={() => onOpen && onOpen(c.id)} style={{ borderBottom: '1px solid var(--border2)', cursor: 'pointer' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FirmBadge firm={firm} size={22} />
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--text)' }}>{tenants.find(t => t.id === c.tenantId)?.name || '—'}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{assets.find(a => a.id === c.assetId)?.unit || '—'} · {subj}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--text2)' }}>
                    {info.status === 'held' ? 'platná' : `ukončena ${c.end || ''}`}
                    {st && <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>vráceno {fmtKc(st.returned)}{st.offsetAmount > 0 ? ` · započteno ${fmtKc(st.offsetAmount)}` : ''}{st.date ? ` · ${st.date}` : ''}</div>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>{pill(info)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 900, fontSize: 14, color: info.status === 'settled' ? 'var(--text3)' : 'var(--text)', whiteSpace: 'nowrap' }}>{fmtKc(info.amount)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <button className={`btn btn-sm ${info.status === 'toReturn' ? 'btn-tone-amber' : ''}`} style={{ fontWeight: 700, whiteSpace: 'nowrap' }}
                      onClick={e => { e.stopPropagation(); setSettleFor(c) }}>{st ? 'Upravit' : 'Vypořádat'}</button>
                  </td>
                </tr>
              )
            })}
            <tr style={{ background: 'var(--bg2)' }}>
              <td colSpan={3} style={{ padding: '12px 14px', fontWeight: 900, fontSize: 13 }}>Celkem drženo (platné + k vrácení)</td>
              <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, fontSize: 15, whiteSpace: 'nowrap' }}>{fmtKc(cauceHeldTotal)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  const renderCard = (c, isArchived = false) => {
    const isEndingSoon = c.daysLeft !== null && c.daysLeft <= 60 && c.daysLeft >= 0
    const isExpired = c.daysLeft !== null && c.daysLeft < 0
    // Ukončená smlouva, jejíž poslední den nájmu teprve přijde
    const isEndingLater = isArchived && isEndingArchived(c)

    // Barvy podle typu předmětu – jedna sada pro celou aplikaci (styles.css)
    const ts = assetTypeStyle(c.assetType)
    const cardBg = ts.bg, headerBg = ts.header, accentColor = ts.accent, icon = ts.icon
    const cardBorderColor = ts.border, innerBorderColor = ts.border

    return (
      <div 
        key={c.id} 
        className="card card-interactive"
        style={{ 
          cursor: 'pointer', marginBottom: 0, opacity: isArchived ? 0.8 : 1, padding: 0, overflow: 'hidden', borderRadius: 14,
          boxShadow: '0 3px 12px rgba(0,0,0,0.08)',
          background: cardBg,
          border: `1.5px solid ${isArchived ? 'var(--border)' : cardBorderColor}`,
          // Barevný proužek firmy (pronajímatele) – JIHOTANK vs. JIHOTANK CB na první pohled
          borderLeft: `5px solid ${getFirm && getFirm(c.assetSubject) ? firmColors(getFirm(c.assetSubject).color, theme).mid : 'var(--border)'}`,
        }} 
        onClick={() => onOpen(c.id)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', background: headerBg, borderBottom: `1.5px solid ${isArchived ? 'var(--border)' : cardBorderColor}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <FirmBadge firm={getFirm ? getFirm(c.assetSubject) : null} size={24} />
            <span style={{ fontSize: 16 }}>{icon}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: accentColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.1px' }}>
                {c.assetUnit || 'Neznámý předmět'}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: accentColor, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.assetSubject || ''}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
            {(() => { const st = contractStatus(c); return <StatusPill kind={st.kind} text={st.text} size="sm" /> })()}
          </div>
        </div>

        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ padding: '9px 12px', background: 'var(--bg)', borderRadius: 10, border: `1.5px solid ${innerBorderColor}` }}>
            <div style={{ fontSize: 10, color: accentColor, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.6px', marginBottom: 2 }}>Nájemce</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.tenantName || 'Neznámý'}</div>
          </div>

          {(() => {
            const isDphSubject = c.vatExempt === 2 ? true : c.vatExempt === 1 ? false : (billingGroups.find(g => firmOf(c.assetSubject) === g.val)?.isVatPayer ?? true)
            const showDph = (c.assetType === 'commercial' || c.assetType === 'ads' || c.assetType === 'parking') && isDphSubject
            return (
              <div style={{ display: 'grid', gridTemplateColumns: c.totalDeposit > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 0, background: 'var(--bg)', borderRadius: 10, border: `1.5px solid ${innerBorderColor}` }}>
                <div style={{ padding: '9px 12px', borderRight: `1.5px solid ${innerBorderColor}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                    <span style={{ fontSize: 11 }}>🗓️</span>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)' }}>Platnost do</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{c.end || 'Neurčito'}</div>
                  {!isArchived && isEndingSoon && <div style={{ fontSize: 10, color: 'var(--amber-t)', fontWeight: 600, marginTop: 2 }}>Končí za {c.daysLeft} dní</div>}
                  {!isArchived && isExpired && <div style={{ fontSize: 10, color: 'var(--red-t)', fontWeight: 600, marginTop: 2 }}>Propadlá ({Math.abs(c.daysLeft)} dní)</div>}
                </div>
                <div style={{ padding: '9px 12px', textAlign: 'center', borderRight: c.totalDeposit > 0 ? `1.5px solid ${innerBorderColor}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3, justifyContent: 'center' }}>
                    <span style={{ fontSize: 11 }}>💰</span>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)' }}>{{ 'Čtvrtletně': 'Čtvrtletní nájem', 'Pololetně': 'Pololetní nájem', 'Ročně': 'Roční nájem' }[c.paymentFrequency] || 'Měsíční nájem'}</div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: showDph ? 'var(--price-netto)' : 'var(--text)', whiteSpace: 'nowrap' }}>{((c.effRent || 0) + (c.effParking || 0)).toLocaleString('cs-CZ')} Kč</div>
                  {showDph && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>bez DPH</div>}
                </div>
                {c.totalDeposit > 0 && (
                  <div style={{ padding: '9px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3, justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: 11 }}>⚡</span>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)' }}>Zálohy celkem</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: showDph ? 'var(--price-netto)' : 'var(--text)', whiteSpace: 'nowrap' }}>{c.totalDeposit.toLocaleString('cs-CZ')} Kč</div>
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
      <div className="page-header" data-icon="📑">
        <div>
          <div className="page-title">Smlouvy</div>
          <div className="page-sub">
            {validCount} platných · {endedCount} ukončených{endCount('30') ? ` · ${endCount('30')} končí do 30 dní` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Segmented size="sm" value={tab} onChange={setTab} items={[{ id: 'valid', label: 'Platné', count: validCount }, { id: 'ended', label: 'Ukončené', count: endedCount }, { id: 'cauce', label: '💰 Kauce', count: cauceOpenCount }]} />
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

      {tab === 'valid' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '-8px 0 18px' }}>
          {[
            { id: 'all', label: 'Vše', tone: 'gray' },
            { id: '30', label: '⚠ Končí do 30 dní', tone: 'red' },
            { id: '60', label: 'Končí do 60 dní', tone: 'amber' },
            { id: '90', label: 'Končí do 90 dní', tone: 'amber' },
            { id: 'expired', label: 'Propadlé', tone: 'red' },
          ].map(ch => {
            const on = endFilter === ch.id
            const n = ch.id === 'all' ? validCount : endCount(ch.id)
            return (
              <button key={ch.id} type="button" className="btn btn-sm" onClick={() => setEndFilter(ch.id)}
                title={ch.id === 'all' || ch.id === 'expired' ? '' : 'Vč. propadlých; bez smluv, které už mají navazující smlouvu'}
                style={on ? { background: `var(--tone-${ch.tone}-text)`, borderColor: `var(--tone-${ch.tone}-text)`, color: 'var(--bg)', fontWeight: 800 }
                          : { background: `var(--tone-${ch.tone}-bg)`, borderColor: `var(--tone-${ch.tone}-border)`, color: `var(--tone-${ch.tone}-text)`, fontWeight: 700 }}>
                {ch.label} <span style={{ opacity: 0.85 }}>({n})</span>
              </button>
            )
          })}
        </div>
      )}

      {tab === 'cauce' && renderCauce()}
      {tab !== 'cauce' && <div style={{ display: 'flex', flexDirection: 'column', gap: 40, marginTop: 10 }}>
        {tab === 'valid' && endFilter !== 'all' && endCount(endFilter) === 0 && (
          <EmptyState good icon="✓" title="Žádné smlouvy v tomto výběru" text="Nic nekončí ani nepropadlo – vše je v pořádku." />
        )}
        {subjects.map(subject => {
          if (!selectionMatches(activeSubject, subject)) return null

          const allInSubject = filtered.filter(c => c.assetSubject === subject)
          // Záložka Platné: aktivní (řazení tažením) + ukončené s budoucím koncem; Ukončené: od nejnovějšího konce
          const subjectContracts = allInSubject.filter(c => tab === 'valid' ? isValid(c) && endMatch(c) : !isValid(c))
          if (subjectContracts.length === 0) return null
          const activeInSubject = tab === 'valid' ? getOrdered(subjectContracts.filter(c => c.status === 'active')) : []
          const archivedInSubject = subjectContracts.filter(c => c.status !== 'active')
            .sort((a, b) => tab === 'ended' ? endTs(b) - endTs(a) : 0)

          const subjectFirm = getFirm ? getFirm(subject) : null
          const subjectFc = subjectFirm ? firmColors(subjectFirm.color, theme) : null

          return (
            <div key={subject}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: `2.5px solid ${subjectFc ? subjectFc.mid + '55' : 'var(--border)'}`, paddingBottom: 11, marginBottom: 18 }}>
                <FirmBadge firm={subjectFirm} size={30} />
                <div style={{ fontSize: 13, fontWeight: 800, color: subjectFc ? subjectFc.txt : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1.2px' }}>{subject}</div>
                <div className="badge" style={{ background: 'var(--bg2)', color: 'var(--text2)', fontSize: 12, fontWeight: 600 }}>{tab === 'valid' ? `${activeInSubject.length} aktivních` : `${subjectContracts.length} ukončených`}</div>
              </div>

              {subjectContracts.length === 0 ? (
                <EmptyState compact icon="📑" title="Zatím žádné smlouvy" />
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
      </div>}

      {/* VYKRESLENÍ FORMULÁŘE */}
      {settleFor && <CauceSettleDialog contract={settleFor} onClose={() => setSettleFor(null)} />}
      {showForm && <ContractForm onClose={() => setShowForm(false)} />}
    </div>
  )
}