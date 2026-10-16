import React, { useState } from 'react'
import { useApp } from '../AppContext.jsx'
import DialogShell from '../DialogShell.jsx'
import { setPaymentsFilterOnOpen } from '../shortcuts.js'
import DataCheck, { computeDataChecks, dataCheckAlerts } from '../DataCheck.jsx'
import { parseDate, PERIOD_LEN, getMonthRent, isContractBillable, isContractInMonth, isContractOccupying, contractSubject, firmColors, firmOf, firmSelection, overdueDays, contractMonthStatus, groupMonthStatus, hasSuccessor } from '../utils.js'
import { FirmBadge, useObjectFirms } from '../FirmUI.jsx'
import { buildCalendarEvents, CALENDAR_TYPE_ICON } from './Calendar.jsx'

const MONTHS_LC = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']

export default function Dashboard({ onNav, onOpen, onOpenDetail }) {
  const { contracts = [], assets = [], tenants = [], tasks = [], revisions = [], payments = [], subjects = [], getFirm, theme, firms = [], setNavSelection, objectFirms = [] } = useApp() || {}
  const [expandedGroup, setExpandedGroup] = useState(null) // { days, colorVar, list }
  // Kontrola dat – proužek s počtem důležitých nálezů
  const [showCheck, setShowCheck] = useState(false)
  const [dismissedSig, setDismissedSig] = useState(() => { try { return localStorage.getItem('rf_datacheck_dismissed') || '' } catch { return '' } })
  const checkAlert = dataCheckAlerts(computeDataChecks({ contracts, assets, tenants, payments, subjects, objectFirms, firms }))

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Platné smlouvy (aktivní + ukončené s budoucím koncem) BEZ navazující smlouvy na předmětu –
  // prodloužená / předaná smlouva už není „končící“
  const activeContracts = contracts.filter(c => c && isContractOccupying(c) && !hasSuccessor(c, contracts))

  const enrichedForExpirations = activeContracts.map(c => {
    let daysLeft = null
    if (c.end) {
      const endDate = parseDate(c.end)
      if (endDate) daysLeft = Math.round((endDate - today) / (1000 * 60 * 60 * 24))
    }
    return { ...c, daysLeft }
  }).filter(c => c.daysLeft !== null && c.daysLeft >= 0 && c.daysLeft <= 180 && c.paymentFrequency !== 'Zahrnuto v nájemném')
    .sort((a, b) => a.daysLeft - b.daysLeft)

  const exp30  = enrichedForExpirations.filter(c => c.daysLeft <= 30)
  const exp60  = enrichedForExpirations.filter(c => c.daysLeft > 30  && c.daysLeft <= 60)
  const exp90  = enrichedForExpirations.filter(c => c.daysLeft > 60  && c.daysLeft <= 90)
  const exp180 = enrichedForExpirations.filter(c => c.daysLeft > 90  && c.daysLeft <= 180)
  const MAX_VISIBLE = 3

  const renderFooterText = (count, days) => {
    if (count === 0) return `Žádným smlouvám nekončí platnost za méně než ${days} dní.`
    if (count === 1) return `1 smlouvě končí platnost za méně než ${days} dní.`
    return `${count} smlouvám končí platnost za méně než ${days} dní.`
  }

  const renderContractItem = (c) => {
    const tenant = tenants.find(t => t.id === c.tenantId)
    const asset  = assets.find(a => a.id === c.assetId)
    return (
      <div key={c.id} onClick={() => onOpen && onOpen(c.id)} className="card-interactive"
        style={{ padding: '10px 12px', background: 'var(--dash-item-bg)', border: '1px solid var(--dash-item-border)',
          borderRadius: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{asset?.unit || 'Neznámý předmět'}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{tenant?.name || 'Neznámý nájemce'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{c.daysLeft} dnů</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.end}</div>
        </div>
      </div>
    )
  }

  const renderExpirationCard = (list, days, colorVar) => {
    const visible = list.slice(0, MAX_VISIBLE)
    const hidden  = list.length - MAX_VISIBLE
    return (
      <div style={{ background: `var(--dash-${colorVar}-bg)`, border: `1px solid var(--dash-${colorVar}-border)`,
        borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: `var(--dash-${colorVar}-title)`, marginBottom: 12 }}>&lt; {days} dnů</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
          {visible.map(renderContractItem)}
        </div>
        {hidden > 0 && (
          <button onClick={() => setExpandedGroup({ days, colorVar, list })}
            style={{ background: 'none', border: `1px solid var(--dash-${colorVar}-border)`, borderRadius: 7,
              padding: '5px 10px', fontSize: 11, fontWeight: 700, color: `var(--dash-${colorVar}-title)`,
              cursor: 'pointer', marginBottom: 8, width: '100%' }}>
            + {hidden} dalších…
          </button>
        )}
        <div style={{ fontSize: 12, fontWeight: 700, color: `var(--dash-${colorVar}-sub)`, marginTop: 'auto',
          paddingTop: 10, borderTop: `1px solid var(--dash-${colorVar}-sep)` }}>
          {renderFooterText(list.length, days)}
        </div>
      </div>
    )
  }

  // colorVar a list jsou uloženy v expandedGroup objektu

  const effRentForMonth = (c, year, month) =>
    getMonthRent(c, year, month) / (PERIOD_LEN[c.paymentFrequency] || 1)

  const fiveMonths = [-2, -1, 0, 1, 2].map(offset => {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1)
    const monthName = d.toLocaleDateString('cs-CZ', { month: 'long' })
    return {
      label: `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${d.getFullYear()}`,
      year: d.getFullYear(), month: d.getMonth(),
      start: d, end: new Date(d.getFullYear(), d.getMonth() + 1, 0),
      isCurrent: offset === 0
    }
  })

  // ── Karty firem: plnění za aktuální měsíc, neuhrazeno, po splatnosti, končící smlouvy ──
  // Vždy STRIKTNĚ za jednu firmu (přesná shoda názvu firmy)
  const firmMonth = (firmName, y, m) => {
    const key = `${y}-${m}`
    const cs = contracts.filter(c => isContractBillable(c) && c.paymentFrequency !== 'Zahrnuto v nájemném' &&
      isContractInMonth(c, y, m) && firmOf(contractSubject(c, assets)) === firmName)
    let exp = 0, rec = 0
    const seenGroups = new Set()
    for (const c of cs) {
      exp += getMonthRent(c, y, m) / (PERIOD_LEN[c.paymentFrequency] || 1)
      if (c.groupLabel) {
        if (seenGroups.has(c.groupLabel)) continue
        seenGroups.add(c.groupLabel)
        const gp = payments.find(p => p.groupLabel === c.groupLabel && p.month === key && p.paymentType !== 'deposit')
        if (gp) rec += Number(gp.amount) || 0
      } else {
        const p = payments.find(p => p.contractId === c.id && p.month === key && p.paymentType !== 'deposit')
        if (p) rec += Number(p.amount) || 0
      }
    }
    return { exp, rec, n: cs.length }
  }
  // Počet neuhrazených položek po splatnosti za aktuální měsíc (smlouvy / skupiny firmy)
  // + příští měsíc, pokud už je po splatnosti (platba předem – „15. den předchozího měsíce“)
  // Vrací { n, months: [{ y, m }] } – měsíce, ve kterých je něco po splatnosti (od nejstaršího)
  const firmOverdue = (firmName) => {
    const cy = today.getFullYear(), cm = today.getMonth()
    let n = 0
    const months = []
    for (const [y, m] of [[cy, cm], cm === 11 ? [cy + 1, 0] : [cy, cm + 1]]) {
      const before = n
      const cs = contracts.filter(c => isContractBillable(c) && c.paymentFrequency !== 'Zahrnuto v nájemném' &&
        isContractInMonth(c, y, m) && firmOf(contractSubject(c, assets)) === firmName)
      const seen = new Set()
      for (const c of cs) {
        // Stejné pravidlo jako filtr „Po splatnosti“ v Platbách: neuhrazeno úplně (vč. záloh bytů) a po splatnosti
        const ctx = { payments, contracts, assets }
        if (c.groupLabel) {
          if (seen.has(c.groupLabel)) continue
          seen.add(c.groupLabel)
          if (groupMonthStatus(c.groupLabel, y, m, ctx).status !== 'paid' && overdueDays(c, y, m) > 0) n++
        } else {
          if (!contractMonthStatus(c, y, m, ctx).complete && overdueDays(c, y, m) > 0) n++
        }
      }
      if (n > before) months.push({ y, m })
    }
    return { n, months }
  }
  const firmCards = firms.map(f => {
    const st = firmMonth(f.name, today.getFullYear(), today.getMonth())
    const cur = { ...st, pct: st.exp > 0 ? Math.min(1, st.rec / st.exp) : null }
    const ending = activeContracts.filter(c => firmOf(contractSubject(c, assets)) === f.name && c.paymentFrequency !== 'Zahrnuto v nájemném' &&
      (() => { const e = parseDate(c.end); return e && e >= today && (e - today) / 86400000 <= 60 })()).length
    return { firm: f, cur, unpaid: Math.max(0, cur.exp - cur.rec), ending, overdue: firmOverdue(f.name) }
  }).filter(x => x.cur.n > 0)
  const openFirmPayments = (f, filter) => {
    setPaymentsFilterOnOpen(filter || null)
    const secs = f.sections.filter(s => contracts.some(c => contractSubject(c, assets) === s))
    if (setNavSelection) setNavSelection(secs.length > 1 ? firmSelection(f.name) : (secs[0] || firmSelection(f.name)))
    if (onNav) onNav('payments')
  }

  // ── Nejbližší termíny (stejné události jako Kalendář) ──
  const { firmOfObject } = useObjectFirms()
  const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60)
  const upcoming = buildCalendarEvents({ contracts, assets, tenants, revisions, tasks, firms, firmOfObject, onOpen: (type, id) => onOpen && onOpen(id), onNav })
    .filter(e => e.date >= today && e.date <= horizon)
    .sort((a, b) => a.date - b.date)
    .slice(0, 5)

  // Aktivní úkoly bez dlouhodobých (sloupec „Dlouhodobé úkoly“ zůstává jen v Kanbanu)
  const activeTasks       = tasks.filter(t => t.status !== 'done' && t.status !== 'longterm').slice(0, 5)
  const upcomingRevisions = revisions.slice(0, 5)

  return (
    <div style={{ paddingBottom: 60 }}>

      {/* POPUP — zobrazit vše */}
      {expandedGroup && (
        <DialogShell icon="⏰" tone={{ red: 'red', orange: 'amber', yellow: 'amber', green: 'green' }[expandedGroup.colorVar] || 'amber'}
          title={`Smlouvy končící za méně než ${expandedGroup.days} dní`} subtitle={`${expandedGroup.list.length} ${expandedGroup.list.length === 1 ? 'smlouva' : expandedGroup.list.length < 5 ? 'smlouvy' : 'smluv'}`}
          width={540} onClose={() => setExpandedGroup(null)}
          bodyStyle={{ background: `var(--dash-${expandedGroup.colorVar}-bg)`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {expandedGroup.list.map(renderContractItem)}
        </DialogShell>
      )}

      <div className="page-header" data-icon="📊">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Přehled expirací smluv, úkolů, blížících se revizí a měsíčních plateb nájemného</div>
        </div>
      </div>

      {/* Upozornění na Kontrolu dat – jen když je co řešit; zavřít lze do další změny dat */}
      {checkAlert.total > 0 && dismissedSig !== checkAlert.signature && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 18, borderRadius: 12,
          background: 'var(--tone-amber-soft)', border: '1.5px solid var(--tone-amber-border)', color: 'var(--tone-amber-text)', fontSize: 13, fontWeight: 700 }}>
          <span style={{ fontSize: 18 }}>🩺</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            Kontrola dat našla {checkAlert.total} {checkAlert.total === 1 ? 'položku' : checkAlert.total < 5 ? 'položky' : 'položek'} k ověření
            <span style={{ fontWeight: 600, color: 'var(--text2)' }}> ({checkAlert.groups.map(g => `${g.title.toLowerCase()}: ${g.items.length}`).join(', ')})</span>
          </span>
          <button className="btn btn-sm btn-tone-amber" style={{ fontWeight: 800, borderRadius: 999 }} onClick={() => setShowCheck(true)}>Zobrazit ➔</button>
          <button className="btn btn-sm" title="Skrýt do další změny" style={{ padding: '3px 8px' }}
            onClick={() => { setDismissedSig(checkAlert.signature); try { localStorage.setItem('rf_datacheck_dismissed', checkAlert.signature) } catch { /* ignore */ } }}>✕</button>
        </div>
      )}
      {showCheck && <DataCheck onClose={() => setShowCheck(false)} onOpen={(type, id) => { setShowCheck(false); onOpenDetail ? onOpenDetail(type, id) : (type === 'contract' && onOpen && onOpen(id)) }} />}

      {/* 0. KARTY FIREM – kliknutím do Plateb dané firmy */}
      {firmCards.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginBottom: 28 }}>
          {firmCards.map(({ firm: f, cur, unpaid, ending, overdue }) => {
            const c = firmColors(f.color, theme)
            const pct = cur.pct ?? 1
            const r = 19, circ = 2 * Math.PI * r
            const done = pct >= 0.999
            return (
              <div key={f.name} onClick={() => openFirmPayments(f)} className="card-interactive" style={{
                cursor: 'pointer', background: 'var(--bg)', border: '1px solid var(--border)', borderTop: `5px solid ${c.mid}`,
                borderRadius: 14, padding: '12px 14px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <FirmBadge firm={f} size={28} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{cur.n} sml.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <svg width="52" height="52" viewBox="0 0 52 52" style={{ flexShrink: 0 }}>
                    <circle cx="26" cy="26" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
                    <circle cx="26" cy="26" r={r} fill="none" stroke={done ? '#16A34A' : c.mid} strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={`${(circ * pct).toFixed(1)} ${circ.toFixed(1)}`} transform="rotate(-90 26 26)" />
                    <text x="26" y="30" textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--text)">{Math.round(pct * 100)}%</text>
                  </svg>
                  <div style={{ lineHeight: 1.35 }}>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>Neuhrazeno tento měsíc</div>
                    <div style={{ fontSize: 17, fontWeight: 900, color: unpaid > 0.5 ? '#DC2626' : '#16A34A' }}>{Math.round(unpaid).toLocaleString('cs-CZ')} Kč</div>
                  </div>
                </div>
                <div style={{ height: 10 }} />
                {overdue.n > 0 && (
                  <div title="Otevřít Platby (nejstarší měsíc) jen s položkami po splatnosti" onClick={e => { e.stopPropagation(); openFirmPayments(f, { filter: 'overdue', year: overdue.months[0].y, month: overdue.months[0].m }) }}
                    style={{ fontSize: 11.5, fontWeight: 800, color: '#DC2626', marginBottom: 3, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>⚠ {overdue.n} po splatnosti ({overdue.months.map(x => MONTHS_LC[x.m]).join(', ')}) ➔</div>
                )}
                <div style={{ fontSize: 11.5, fontWeight: 600, color: ending ? '#D97706' : 'var(--text3)' }}>
                  {ending ? `${ending} ${ending === 1 ? 'smlouva končí' : ending < 5 ? 'smlouvy končí' : 'smluv končí'} do 60 dní` : 'Žádná smlouva brzy nekončí'}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Nejbližší termíny */}
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', marginBottom: 28, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>📅 Nejbližší termíny</div>
          <button className="btn btn-sm" onClick={() => onNav && onNav('calendar')}>Otevřít kalendář ›</button>
        </div>
        {upcoming.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>V příštích 60 dnech nic není.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {upcoming.map((e, i) => {
              const days = Math.round((e.date - today) / 86400000)
              const f = firms.find(x => x.name === e.firm)
              const mid = f ? firmColors(f.color, theme).mid : '#64748B'
              return (
                <div key={i} onClick={e.onClick} style={{ display: 'grid', gridTemplateColumns: '92px 26px minmax(0, 1fr) auto', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', boxShadow: `inset 5px 0 0 ${mid}` }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{e.date.getDate()}. {e.date.getMonth() + 1}. {e.date.getFullYear()}</span>
                  {f ? <FirmBadge firm={f} size={24} /> : <span />}
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{CALENDAR_TYPE_ICON[e.type]} {e.title}</span>
                    {e.sub && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.sub}</span>}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: days <= 7 ? '#DC2626' : days <= 30 ? '#D97706' : 'var(--text2)', whiteSpace: 'nowrap' }}>{days === 0 ? 'dnes' : `za ${days} ${days === 1 ? 'den' : days < 5 ? 'dny' : 'dní'}`}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 1. EXPIRUJÍCÍ SMLOUVY */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        {renderExpirationCard(exp30,  30,  'red')}
        {renderExpirationCard(exp60,  60,  'orange')}
        {renderExpirationCard(exp90,  90,  'yellow')}
        {renderExpirationCard(exp180, 180, 'green')}
      </div>

      {/* 2. KANBAN + REVIZE */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
        <div style={{ background: 'var(--dash-blue-bg)', border: '1px solid var(--dash-blue-border)', borderRadius: 12, padding: 20, minHeight: 280, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--dash-blue-title)' }}>Aktivní úkoly (Kanban)</div>
            <button className="btn btn-sm" style={{ background: 'var(--dash-inner-bg)', border: '1px solid var(--dash-blue-btn-border)', color: 'var(--dash-blue-btn-color)' }} onClick={() => onNav && onNav('kanban')}>Přejít na tabuli</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
            {activeTasks.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--dash-blue-empty)', opacity: 0.85, fontStyle: 'italic', padding: '12px 0' }}>Žádné aktivní úkoly.</div>
            ) : activeTasks.map(task => (
              <div key={task.id} style={{ background: 'var(--dash-inner-bg)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--dash-inner-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{task.title}</div>
                  {task.tag && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{task.tag}</div>}
                </div>
                <div className="badge" style={{ background: task.status === 'progress' ? '#FEF08A' : task.status === 'waiting' ? 'var(--tone-red-soft)' : task.status === 'longterm' ? 'var(--tone-violet-soft)' : task.status === 'signature' ? '#F5D0FE' : 'var(--bg3)', color: 'var(--text2)', marginBottom: 0 }}>
                  {task.status === 'todo' ? 'Je třeba udělat' : task.status === 'progress' ? 'V řešení' : task.status === 'waiting' ? 'Čeká' : task.status === 'longterm' ? 'Dlouhodobé' : task.status === 'signature' ? 'Čeká na podpis' : 'Ostatní'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--dash-purple-bg)', border: '1px solid var(--dash-purple-border)', borderRadius: 12, padding: 20, minHeight: 280, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--dash-purple-title)' }}>Blížící se revize</div>
            <button className="btn btn-sm" style={{ background: 'var(--dash-inner-bg)', border: '1px solid var(--dash-purple-btn-border)', color: 'var(--dash-purple-btn-color)' }} onClick={() => onNav && onNav('maintenance')}>Zobrazit všechny</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
            {upcomingRevisions.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--dash-purple-empty)', opacity: 0.85, fontStyle: 'italic', padding: '12px 0' }}>Žádné evidované revize.</div>
            ) : upcomingRevisions.map(rev => (
              <div key={rev.id} style={{ background: 'var(--dash-inner-bg)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--dash-inner-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{rev.title}</div>
                  {rev.notes && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{rev.notes}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dash-purple-title)' }}>{rev.lastDate || '—'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. MĚSÍČNÍ PŘEHLED PO SUBJEKTECH */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Přehled nájemného po subjektech</div>

        {subjects.map(subject => {
          // Aktivní i ukončené smlouvy – měsíce se filtrují podle data platnosti níže
          const subContracts = contracts.filter(c => {
            if (!isContractBillable(c)) return false
            if (c.paymentFrequency === 'Zahrnuto v nájemném') return false
            return contractSubject(c, assets) === subject
          })
          if (subContracts.length === 0) return null

          const subMonths = fiveMonths.map(m => {
            const monthKey = `${m.year}-${m.month}`
            let total = 0
            subContracts.forEach(c => {
              const startD = parseDate(c.start) || new Date(2000, 0, 1)
              const endD   = parseDate(c.end)   || new Date(2100, 0, 1)
              if (startD > m.end || endD < m.start) return
              total += effRentForMonth(c, m.year, m.month)
            })

            const seenPaid = new Set()
            let paid = 0
            subContracts.forEach(c => {
              const startD = parseDate(c.start) || new Date(2000, 0, 1)
              const endD   = parseDate(c.end)   || new Date(2100, 0, 1)
              if (startD > m.end || endD < m.start) return
              if (c.groupLabel) {
                if (seenPaid.has(c.groupLabel)) return
                seenPaid.add(c.groupLabel)
                const gp = payments.find(p =>
                  (p.groupLabel === c.groupLabel || p.contractId === `group:${c.groupLabel}`) &&
                  p.month === monthKey && p.paymentType !== 'deposit'
                )
                if (gp) paid += Number(gp.amount) || 0
              } else {
                const p = payments.find(p =>
                  p.contractId === c.id && p.month === monthKey && p.paymentType !== 'deposit'
                )
                if (p) paid += Number(p.amount) || 0
              }
            })

            return { ...m, total, paid, remaining: Math.max(0, total - paid) }
          })

          const subFirm = getFirm ? getFirm(subject) : null
          const subFc = subFirm ? firmColors(subFirm.color, theme) : null
          return (
            <div key={subject} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ background: subFc ? subFc.mid : 'linear-gradient(135deg, #12654A 0%, #1A8A62 100%)', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {subFirm && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.3px', color: '#fff', background: 'rgba(255,255,255,0.22)', borderRadius: 6, padding: '3px 7px' }}>{subFirm.short}</span>}
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{subject}</span>
                </span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{subContracts.length} {subContracts.length === 1 ? 'aktivní smlouva' : subContracts.length < 5 ? 'aktivní smlouvy' : 'aktivních smluv'}</span>
              </div>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                  {subMonths.map((data, i) => (
                    <div key={i} style={{
                      background: data.isCurrent ? 'var(--dash-cur-bg)' : 'var(--bg2)',
                      border: data.isCurrent ? '2px solid var(--dash-cur-border)' : '1px solid var(--border)',
                      borderRadius: 10, padding: '12px 10px', position: 'relative'
                    }}>
                      {data.isCurrent && (
                        <div style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', background: 'var(--dash-cur-badge-bg)', color: 'var(--dash-cur-badge-color)', fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                          Aktuální měsíc
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: data.isCurrent ? 'var(--dash-cur-label)' : 'var(--text2)', fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>
                        {data.label}
                      </div>
                      {data.total === 0 ? (
                        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>Bez nájmu</div>
                      ) : (
                        <>
                          <div style={{ textAlign: 'center', marginBottom: 8 }}>
                            <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 2 }}>Celkové nájemné k úhradě</div>
                            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
                              {Math.round(data.total).toLocaleString('cs-CZ')} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)' }}>Kč</span>
                            </div>
                          </div>
                          <div style={{ height: 3, borderRadius: 99, background: 'var(--border)', overflow: 'hidden', marginBottom: 6 }}>
                            <div style={{ height: '100%', borderRadius: 99, background: data.remaining === 0 ? '#22c55e' : '#f59e0b', width: `${Math.min(100, data.total > 0 ? (data.paid / data.total) * 100 : 0)}%`, transition: 'width 0.5s ease' }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ fontSize: 9, color: 'var(--tone-green-text)', fontWeight: 700 }}>✓ Již uhrazeno</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tone-green-text)' }}>{Math.round(data.paid).toLocaleString('cs-CZ')} Kč</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 9, color: data.remaining > 0 ? '#dc2626' : 'var(--text3)', fontWeight: 700 }}>
                              {data.remaining > 0 ? '⏳ Dosud neuhrazeno' : '✓ Vše uhrazeno'}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: data.remaining > 0 ? '#dc2626' : 'var(--tone-green-text)' }}>
                              {data.remaining > 0 ? `${Math.round(data.remaining).toLocaleString('cs-CZ')} Kč` : '—'}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
