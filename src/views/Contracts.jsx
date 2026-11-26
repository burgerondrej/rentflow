import React, { useState, useRef, useEffect } from 'react'
import { NoteBadge, notesOf } from '../NotesUI.jsx'
import { useApp } from '../AppContext.jsx'
import { getEffectiveValuesToday, isEndingArchived, applyContractOrder, parseDate, firmOf, firmColors, selectionMatches, assetTypeStyle, hasSuccessor } from '../utils.js'
import ContractForm from '../ContractForm.jsx' // IMPORT FORMULÁŘE
import { FirmBadge } from '../FirmUI.jsx'
import { StatusPill, contractStatus } from '../StatusUI.jsx'
import { Segmented, EmptyState } from '../UI.jsx'
import { useNewShortcut, peekContractsFilter, clearContractsFilter } from '../shortcuts.js'
import { cauceInfo, fmtKc, CauceSettleDialog } from '../CauceUI.jsx'
import { contractSubject, contractVatPayer, OWN_SUBJECT_TYPES, rentIncreaseLock, selectionLabel, currentTerm } from '../utils.js'
import { spanText } from '../ContractInsights.jsx'

export default function Contracts({ activeSubject, onOpen }) {
  const { contracts = [], tenants = [], assets = [], subjects = [], residentialSubjects = [], billingGroups = [], subjectGroups = [], getFirm, theme, cauceSettlements = [], showToast, contractOrder = null, saveContractOrder, confirmAction, isReadOnly, notes = [] } = useApp()
  const [settleFor, setSettleFor] = useState(null) // smlouva, u které se vypořádává kauce
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  useNewShortcut(() => setShowForm(true)) // Ctrl+N
  // Karty / Tabulka (pamatuje se) + řazení tabulky
  const [viewMode, setViewModeState] = useState(() => { try { return localStorage.getItem('rf_contracts_view') || 'cards' } catch { return 'cards' } })
  const setViewMode = (v) => { setViewModeState(v); try { localStorage.setItem('rf_contracts_view', v) } catch { /* ignore */ } }
  const [sort, setSort] = useState({ key: '', dir: 1 })
  const [dragOverRow, setDragOverRow] = useState(null) // tabulka: řádek, nad kterým se táhne
  const [tab, setTab] = useState('valid') // 'valid' = platné (vč. ukončených s budoucím koncem) | 'ended' = ukončené | 'cauce' = kauce
  // Filtr končících smluv: all | 30 | 60 | 90 | expired (z menu přijde „30“)
  const [endFilter, setEndFilter] = useState(() => peekContractsFilter() || 'all')
  useEffect(() => {
    clearContractsFilter()
    const onReq = (e) => { setEndFilter(e.detail || 'all'); setTab('valid'); clearContractsFilter() }
    window.addEventListener('rf-contracts-filter', onReq)
    return () => window.removeEventListener('rf-contracts-filter', onReq)
  }, [])
  // Ruční pořadí smluv je v DB (AppContext → app_prefs „contract_order“), sdílí ho i Platby
  const cardOrder = contractOrder
  const dragId = useRef(null)
  const dragOverId = useRef(null)

  const getOrdered = (items) => applyContractOrder(items, cardOrder, contracts)
  // Poznámky smlouvy pro ikonku 📝: záznamy + staré pole „Poznámky ke smlouvě“
  const noteInfo = (c) => {
    const list = notesOf(notes, 'contract', c.id)
    const pin = c.contractNotes && c.contractNotes.trim()
    return { count: list.length + (pin ? 1 : 0), latest: list[0] || (pin ? { createdAt: '📌 Poznámka ve smlouvě', text: c.contractNotes } : null) }
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
    // Změnit jen pořadí této sekce – pořadí ostatních sekcí zůstává (dřív se přepsalo celé pořadí jen touto sekcí)
    const section = new Set(ids)
    saveContractOrder([...(cardOrder || []).filter(id => !section.has(id)), ...newIds])
    dragId.current = null; dragOverId.current = null
  }

  // Parkování: srovnat smlouvy sekce podle čísla stání (č. 2 < č. 10). Sekce zůstává na svých místech v celkovém pořadí
  // (Platby „Vše“ firmy se nepřehází), mění se jen pořadí uvnitř ní. Skupiny plateb se tím nemění – v Platbách se skupina ukáže na místě svého prvního člena.
  const sortSectionByUnit = (subject) => {
    const list = enrichedContracts.filter(c => c.assetSubject === subject && c.assetType === 'parking')
    if (!list.length) return
    const sorted = [...list].sort((a, b) => String(a.assetUnit || '').localeCompare(String(b.assetUnit || ''), 'cs', { numeric: true, sensitivity: 'base' })
      || (parseDate(a.start)?.getTime() || 0) - (parseDate(b.start)?.getTime() || 0)).map(c => c.id)
    const section = new Set(sorted)
    const base = cardOrder || []
    const queue = [...sorted]
    const merged = base.map(id => section.has(id) ? queue.shift() : id)
    confirmAction({
      title: 'Seřadit parkování podle čísel',
      text: `Smlouvy v sekci „${subject}“ (${list.length}) se seřadí podle čísla stání. Vlastní pořadí v této sekci se přepíše, ostatní sekce zůstanou. Platby, skupiny ani data se nemění – jen pořadí zobrazení (i v Platbách).`,
      okLabel: 'Seřadit',
      onOk: () => { saveContractOrder([...merged, ...queue]); showToast('Parkování seřazeno podle čísel.', 'success') },
    })
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
    const assetSubject = OWN_SUBJECT_TYPES.includes(asset.type) ? asset.subject : (c.billingSubject || asset.subject)
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

  // Možnost navýšení nájmu (byty a komerční, ne „Zahrnuto v nájemném“) – stejné pravidlo jako bublina v detailu a půdorys
  const increaseInfo = (c) => {
    if ((c.assetType !== 'residential' && c.assetType !== 'commercial') || c.paymentFrequency === 'Zahrnuto v nájemném') return null
    const lock = rentIncreaseLock(c)
    return lock ? { t: 'amber', text: `navýšení možné od ${lock.until}`, short: `od ${lock.until}`, ts: parseDate(lock.until)?.getTime() || 0 } : { t: 'green', text: 'nájem lze navýšit', short: 'lze', ts: 0 }
  }
  const sqmOf = (c) => { const a = assets.find(x => x.id === c.assetId); const m = String(a?.size || '').match(/(\d+(?:[.,]\d+)?)\s*m²/); return m ? Number(m[1].replace(',', '.')) : null }
  const today0 = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })()

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
          '--glow': getFirm && getFirm(c.assetSubject) ? firmColors(getFirm(c.assetSubject).color, theme).mid : accentColor,
        }} 
        onClick={() => onOpen(c.id)}
        data-morph={`contract:${c.id}`}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.tenantName || 'Neznámý'}</div>
              {(() => { const ni = noteInfo(c); return <NoteBadge count={ni.count} latest={ni.latest} /> })()}
            </div>
          </div>

          {(() => {
            const isDphSubject = contractVatPayer(c, assets, billingGroups)
            const showDph = (c.assetType === 'commercial' || c.assetType === 'ads' || c.assetType === 'parking' || c.assetType === 'land' || c.assetType === 'vehicle' || c.assetType === 'service') && isDphSubject
            return (
              <div style={{ display: 'grid', gridTemplateColumns: c.totalDeposit > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 0, background: 'var(--bg)', borderRadius: 10, border: `1.5px solid ${innerBorderColor}` }}>
                <div style={{ padding: '9px 12px', borderRight: `1.5px solid ${innerBorderColor}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                    <span style={{ fontSize: 11 }}>🗓️</span>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)' }}>Platnost do</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{c.end || 'Na dobu neurčitou'}</div>
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

          {/* Uplynulá doba smlouvy + možnost navýšení nájmu */}
          {!isArchived && (() => {
            const st = parseDate(currentTerm(c)?.from || c.start), en = parseDate(c.end) // u prodloužení dodatkem od aktuálního období
            const showProg = st && en && en > st
            const pct = showProg ? Math.min(100, Math.max(0, (today0 - st) / (en - st) * 100)) : 0
            const inc = increaseInfo(c)
            if (!showProg && !inc) return null
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {showProg && (
                  <div>
                    <div style={{ height: 6, background: 'var(--bg)', border: `1px solid ${innerBorderColor}`, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: accentColor }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text2)', fontWeight: 600, marginTop: 3 }}>
                      <span>{today0 < st ? 'zatím nezačala' : `uplynulo ${Math.round(pct)} %`}</span>
                      <span>{today0 >= en ? 'skončila' : today0 < st ? `začne za ${spanText(today0, st)}` : `zbývá ${spanText(today0, en)}`}</span>
                    </div>
                  </div>
                )}
                {inc && (
                  <span style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: `var(--tone-${inc.t}-soft)`, color: `var(--tone-${inc.t}-text)`, border: `1px solid var(--tone-${inc.t}-border)` }}>{inc.text}</span>
                )}
              </div>
            )
          })()}
        </div>
      </div>
    )
  }

  // ── Tabulkový režim (řazení klikem na záhlaví; bez řazení = stejné pořadí jako karty) ──
  const SORTS = {
    unit: (c) => String(c.assetUnit || ''), tenant: (c) => String(c.tenantName || ''), rent: (c) => (c.effRent || 0) + (c.effParking || 0),
    m2: (c) => sqmOf(c) ?? -1, start: (c) => parseDate(currentTerm(c)?.from || c.start)?.getTime() || 0, end: (c) => parseDate(c.end)?.getTime() || Infinity,
    inc: (c) => { const i = increaseInfo(c); return i ? i.ts : Infinity },
  }
  const sortRows = (rows) => {
    if (!sort.key) return rows
    const f = SORTS[sort.key]
    return [...rows].sort((a, b) => { const x = f(a), y = f(b); return (typeof x === 'string' ? x.localeCompare(y, 'cs', { numeric: true }) : x - y) * sort.dir })
  }
  // dropItems = aktivní smlouvy sekce (pořadí jako u karet, rf_contract_order); tažení jen bez řazení podle sloupce
  const renderTable = (rows, dropItems = []) => {
    const canDrag = !sort.key && tab === 'valid'
    const heads = [['unit', 'Předmět'], ['tenant', 'Nájemce'], ['rent', 'Nájem'], ['m2', 'm²'], ['start', 'Od'], ['end', 'Do'], ['inc', 'Navýšení'], ['', 'Stav']]
    return (
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'clip' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
              {heads.map(([k, h], i) => (
                <th key={i} onClick={k ? () => setSort(s => s.key !== k ? { key: k, dir: 1 } : s.dir > 0 ? { key: k, dir: -1 } : { key: '', dir: 1 }) : undefined}
                  title={k ? 'Řadit (3. klik = vlastní pořadí, které jde měnit tažením)' : undefined}
                  style={{ padding: '10px 12px', textAlign: k === 'rent' || k === 'm2' ? 'right' : 'left', fontSize: 10.5, color: k && sort.key === k ? 'var(--accent)' : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', cursor: k ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none' }}>
                  {h}{k && sort.key === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortRows(rows).map(c => {
              const ts = assetTypeStyle(c.assetType)
              const inc = c.status === 'active' || isEndingArchived(c) ? increaseInfo(c) : null
              const m2 = sqmOf(c)
              const soon = c.daysLeft !== null && c.daysLeft <= 60 && (c.status === 'active' || isEndingArchived(c))
              const per = { 'Čtvrtletně': ' / čtvrtl.', 'Pololetně': ' / pololetí', 'Ročně': ' / rok' }[c.paymentFrequency] || ''
              const st = contractStatus(c)
              return (
                <tr key={c.id} onClick={() => onOpen(c.id)} className="ct-row" data-morph={`contract:${c.id}`}
                  draggable={canDrag && c.status === 'active'}
                  onDragStart={canDrag && c.status === 'active' ? () => { dragId.current = c.id } : undefined}
                  onDragOver={canDrag && c.status === 'active' ? (e => { e.preventDefault(); dragOverId.current = c.id; if (dragOverRow !== c.id) setDragOverRow(c.id) }) : undefined}
                  onDragEnd={() => setDragOverRow(null)}
                  onDrop={canDrag && c.status === 'active' ? () => { handleDrop(dropItems); setDragOverRow(null) } : undefined}
                  style={{ borderBottom: '1px solid var(--border2)', cursor: canDrag && c.status === 'active' ? 'grab' : 'pointer',
                    boxShadow: dragOverRow === c.id ? 'inset 0 3px 0 var(--accent)' : undefined }}>
                  <td style={{ padding: '9px 12px', fontWeight: 800, fontSize: 13.5, color: ts.accent, minWidth: 140 }}>
                    {canDrag && c.status === 'active' && <span title="Přetáhnout – změnit pořadí" style={{ color: 'var(--text3)', marginRight: 6, cursor: 'grab' }}>⠿</span>}
                    {ts.icon} {c.assetUnit || '—'}{(() => { const ni = noteInfo(c); return <NoteBadge count={ni.count} latest={ni.latest} style={{ marginLeft: 6, fontSize: 10.5, padding: '1px 6px' }} /> })()}</td>
                  <td title={c.tenantName || ''} style={{ padding: '9px 12px', fontWeight: 700, fontSize: 13.5, color: 'var(--text)', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.tenantName || '—'}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13.5, whiteSpace: 'nowrap' }}>{c.paymentFrequency === 'Zahrnuto v nájemném' ? <span style={{ color: 'var(--text3)', fontWeight: 600 }}>v nájmu</span> : `${Math.round((c.effRent || 0) + (c.effParking || 0)).toLocaleString('cs-CZ')} Kč${per}`}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 13, color: 'var(--text2)' }}>{m2 != null ? m2.toLocaleString('cs-CZ') : '—'}</td>
                  <td style={{ padding: '9px 12px', fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' }} title={currentTerm(c) ? `prodlouženo dodatkem · původně od ${c.start}` : undefined}>{currentTerm(c)?.from || c.start || '—'}</td>
                  <td style={{ padding: '9px 12px', fontSize: 13, whiteSpace: 'nowrap', fontWeight: soon ? 800 : 500, color: soon ? (c.daysLeft < 0 ? 'var(--tone-red-text)' : 'var(--tone-amber-text)') : 'var(--text2)' }}>{c.end || 'Na dobu neurčitou'}</td>
                  <td style={{ padding: '9px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', color: inc ? `var(--tone-${inc.t}-text)` : 'var(--text3)' }}>{inc ? inc.short : '—'}</td>
                  <td style={{ padding: '9px 12px' }}><StatusPill kind={st.kind} text={st.text} size="sm" /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // ── Export tabulky (Excel CSV / PDF): přesně to, co je vidět – firma, záložka, filtry, hledání, řazení; firmy ve vlastních blocích ──
  const exportGroups = () => subjects.filter(sub => selectionMatches(activeSubject, sub)).map(subject => {
    const sc = filtered.filter(c => c.assetSubject === subject).filter(c => tab === 'valid' ? isValid(c) && endMatch(c) : !isValid(c))
    const act = tab === 'valid' ? getOrdered(sc.filter(c => c.status === 'active')) : []
    const arch = sc.filter(c => c.status !== 'active').sort((a, b) => tab === 'ended' ? endTs(b) - endTs(a) : 0)
    return { subject, rows: sortRows([...act, ...arch]) }
  }).filter(g => g.rows.length)
  const rowVals = (c) => {
    const inc = c.status === 'active' || isEndingArchived(c) ? increaseInfo(c) : null
    const incl = c.paymentFrequency === 'Zahrnuto v nájemném'
    return {
      unit: c.assetUnit || '', tenant: c.tenantName || '',
      rent: incl ? '' : Math.round((c.effRent || 0) + (c.effParking || 0)), freq: incl ? 'zahrnuto v nájmu' : (c.paymentFrequency || 'Měsíčně'),
      m2: sqmOf(c) ?? '', start: currentTerm(c)?.from || c.start || '', end: c.end || 'Na dobu neurčitou', inc: inc ? inc.text : '', status: contractStatus(c).text,
    }
  }
  const exportDesc = () => [
    selectionLabel(activeSubject),
    tab === 'valid' ? 'platné smlouvy' : 'ukončené smlouvy',
    tab === 'valid' && endFilter !== 'all' ? (endFilter === 'expired' ? 'propadlé' : `končí do ${endFilter} dní`) : '',
    search ? `hledání „${search}“` : '',
  ].filter(Boolean).join(' · ')
  const todayCz = `${today0.getDate()}. ${today0.getMonth() + 1}. ${today0.getFullYear()}`
  const exportFileBase = () => `Smlouvy ${selectionLabel(activeSubject)} ${todayCz.replace(/\s/g, '')}`.replace(/[\\/:*?"<>|]/g, '-')
  const exportCsv = async () => {
    try {
      const esc = (v) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
      const lines = [['Sekce', 'Předmět', 'Nájemce', 'Nájem (Kč)', 'Frekvence', 'm²', 'Od', 'Do', 'Navýšení nájmu', 'Stav'].join(';')]
      exportGroups().forEach(g => g.rows.forEach(c => { const v = rowVals(c); lines.push([g.subject, v.unit, v.tenant, v.rent, v.freq, v.m2, v.start, v.end, v.inc, v.status].map(esc).join(';')) }))
      const { save } = await import('@tauri-apps/api/dialog')
      const outPath = await save({ defaultPath: `${exportFileBase()}.csv`, filters: [{ name: 'Excel (CSV)', extensions: ['csv'] }] })
      if (!outPath) return
      const { writeTextFile } = await import('@tauri-apps/api/fs')
      await writeTextFile(outPath, '\uFEFF' + lines.join('\r\n')) // BOM kvůli diakritice v Excelu
      showToast && showToast('Tabulka smluv uložena pro Excel (CSV).', 'success')
    } catch (e) { console.error('Export CSV:', e); showToast && showToast('Export se nepodařil: ' + e) }
  }
  const exportPdf = async () => {
    try {
      const esc = (t) => String(t ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
      const body = exportGroups().map(g => {
        const firm = getFirm ? getFirm(g.subject) : null
        const col = firm ? firmColors(firm.color, 'light').mid : '#12654A'
        const tr = g.rows.map(c => { const v = rowVals(c); const warn = v.inc.startsWith('navýšení') ? ' class="w"' : ''
          return `<tr><td class="b">${esc(v.unit)}</td><td>${esc(v.tenant)}</td><td class="r b">${v.rent === '' ? 'v nájmu' : esc(v.rent.toLocaleString('cs-CZ')) + ' Kč'}${v.freq !== 'Měsíčně' && v.rent !== '' ? ` <span class="s">/ ${esc(v.freq.toLowerCase())}</span>` : ''}</td><td class="r">${esc(v.m2 === '' ? '—' : v.m2.toLocaleString('cs-CZ'))}</td><td>${esc(v.start || '—')}</td><td>${esc(v.end)}</td><td${warn}>${esc(v.inc || '—')}</td><td>${esc(v.status)}</td></tr>` }).join('')
        return `<h2 style="border-color:${col};color:${col}">${esc(g.subject)} <span>${g.rows.length}</span></h2>
          <table><thead><tr><th>Předmět</th><th>Nájemce</th><th class="r">Nájem</th><th class="r">m²</th><th>Od</th><th>Do</th><th>Navýšení nájmu</th><th>Stav</th></tr></thead><tbody>${tr}</tbody></table>`
      }).join('')
      const html = `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><title>Smlouvy</title><style>
        @page { size: A4 landscape; margin: 10mm; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1c1b; font-size: 10.5px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #12654A; padding-bottom: 5px; margin-bottom: 10px; }
        .title { font-size: 19px; font-weight: 800; color: #12654A; } .sub { font-size: 11px; color: #555; margin-top: 2px; }
        .date { font-size: 11.5px; font-weight: 700; color: #374151; text-align: right; }
        h2 { font-size: 12.5px; text-transform: uppercase; letter-spacing: .8px; border-bottom: 2px solid; padding-bottom: 3px; margin: 14px 0 6px; }
        h2 span { color: #6B7280; font-weight: 600; letter-spacing: 0; }
        table { width: 100%; border-collapse: collapse; } tr { page-break-inside: avoid; }
        th { text-align: left; background: #F3F4F6; color: #374151; padding: 4px 6px; border-bottom: 1.5px solid #D1D5DB; font-size: 9.5px; text-transform: uppercase; }
        td { padding: 3.5px 6px; border-bottom: 1px solid #E5E7EB; } .b { font-weight: 700; } .r { text-align: right; white-space: nowrap; }
        .s { color: #6B7280; font-weight: 400; } td.w { color: #B45309; font-weight: 700; }
      </style></head><body><div class="head"><div><div class="title">Smlouvy</div><div class="sub">${esc(exportDesc())}</div></div><div class="date">Stav k ${todayCz}</div></div>${body}</body></html>`
      const { save } = await import('@tauri-apps/api/dialog')
      const outPath = await save({ defaultPath: `${exportFileBase()}.pdf`, filters: [{ name: 'PDF soubor', extensions: ['pdf'] }] })
      if (!outPath) return
      const { invoke } = await import('@tauri-apps/api/tauri')
      await invoke('export_to_pdf', { html, outPath })
      try { const { open } = await import('@tauri-apps/api/shell'); await open(outPath) } catch { /* uloženo, jen se neotevřelo */ }
      showToast && showToast('PDF tabulky smluv je uložené a otevřené.', 'success')
    } catch (e) { console.error('Export PDF:', e); showToast && showToast('PDF se nepodařilo vytvořit: ' + e) }
  }
  if (import.meta.env.DEV) window.__rfContractsExport = () => ({ groups: exportGroups().map(g => ({ subject: g.subject, rows: g.rows.map(rowVals) })), desc: exportDesc() })
  const exportButtons = viewMode === 'table' && (
    <div style={{ display: 'flex', gap: 6 }}>
      <button className="btn btn-sm" onClick={exportCsv} title="Uložit tabulku pro Excel (CSV) – stejné filtry a řazení">⬇ Excel</button>
      <button className="btn btn-sm" onClick={exportPdf} title="Tabulka smluv do PDF k tisku">🖨 PDF</button>
    </div>
  )

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
              placeholder="Hledat nájemce nebo předmět..." data-local-search="1" 
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
          <div style={{ flex: 1 }} />
          {exportButtons}
          <Segmented size="sm" value={viewMode} onChange={setViewMode} items={[{ id: 'cards', label: '▦ Karty' }, { id: 'table', label: '☰ Tabulka' }]} />
        </div>
      )}
      {tab === 'ended' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, margin: '-8px 0 18px' }}>
          {exportButtons}
          <Segmented size="sm" value={viewMode} onChange={setViewMode} items={[{ id: 'cards', label: '▦ Karty' }, { id: 'table', label: '☰ Tabulka' }]} />
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
                {tab === 'valid' && !isReadOnly && subjectContracts.some(c => c.assetType === 'parking') && (
                  <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => sortSectionByUnit(subject)} title="Srovná smlouvy této sekce podle čísla stání">🔢 Seřadit podle čísel</button>
                )}
              </div>

              {subjectContracts.length === 0 ? (
                <EmptyState compact icon="📑" title="Zatím žádné smlouvy" />
              ) : (() => {
                // Karty / tabulka jedné skupiny smluv (tažení mění pořadí jen v rámci této skupiny)
                const renderList = (act, arch) => viewMode === 'table' ? renderTable([...act, ...arch], act) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16 }}>
                    {act.map(c => (
                      <div key={c.id}
                        draggable
                        onDragStart={() => { dragId.current = c.id }}
                        onDragOver={e => { e.preventDefault(); dragOverId.current = c.id }}
                        onDrop={() => handleDrop(act)}
                        style={{ cursor: 'grab' }}
                      >
                        {renderCard(c, false)}
                      </div>
                    ))}
                    {arch.map(c => renderCard(c, true))}
                  </div>
                )
                // Parkování: podbloky podle umístění stání (jako Portfolio → Parkovací stání). Jen zobrazení – sekce, skupiny i Platby beze změny.
                const isParking = subjectContracts.every(c => c.assetType === 'parking')
                if (!isParking) return renderList(activeInSubject, archivedInSubject)
                const fmtOf = (c) => (assets.find(a => a.id === c.assetId)?.format || '').trim() || 'Ostatní'
                const order = []
                ;[...subjectContracts].sort((a, b) => String(a.assetUnit || '').localeCompare(String(b.assetUnit || ''), 'cs', { numeric: true, sensitivity: 'base' }))
                  .forEach(c => { const f = fmtOf(c); if (!order.includes(f)) order.push(f) })
                order.sort((x, y) => (x === 'Ostatní') - (y === 'Ostatní'))
                if (order.length < 2) return renderList(activeInSubject, archivedInSubject)
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                    {order.map(f => {
                      const act = activeInSubject.filter(c => fmtOf(c) === f), arch = archivedInSubject.filter(c => fmtOf(c) === f)
                      return (
                        <div key={f}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px', paddingLeft: 10, borderLeft: `4px solid ${subjectFc ? subjectFc.mid : 'var(--border)'}` }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>🅿️ {f}</span>
                            <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>{tab === 'valid' ? `${act.length} aktivních` : `${act.length + arch.length} ukončených`}{tab === 'valid' && arch.length ? ` · ${arch.length} končí` : ''}</span>
                          </div>
                          {renderList(act, arch)}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
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