import React, { useState } from 'react'
import { useApp } from '../AppContext.jsx'
import { parseDate, getEffectiveValues, PERIOD_LEN } from '../utils.js'

export default function Dashboard({ onNav, onOpen }) {
  const { contracts = [], assets = [], tenants = [], tasks = [], revisions = [], payments = [], subjects = [] } = useApp() || {}
  const [expandedGroup, setExpandedGroup] = useState(null) // { days, colorVar, list }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const activeContracts = contracts.filter(c => c && c.status === 'active')

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

  const effRentForMonth = (c, year, month) => {
    const v = getEffectiveValues(c, year, month)
    return (v.rent + v.parking + v.flatFee) / (PERIOD_LEN[c.paymentFrequency] || 1)
  }

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

  const activeTasks       = tasks.filter(t => t.status !== 'done').slice(0, 5)
  const upcomingRevisions = revisions.slice(0, 5)

  return (
    <div style={{ paddingBottom: 60 }}>

      {/* POPUP — zobrazit vše */}
      {expandedGroup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 2000 }} onClick={() => setExpandedGroup(null)}>
          <div style={{ background: `var(--dash-${expandedGroup.colorVar}-bg)`, border: `2px solid var(--dash-${expandedGroup.colorVar}-border)`,
            borderRadius: 16, padding: 28, width: 520, maxHeight: '80vh',
            boxShadow: '0 20px 50px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', animation: 'modalIn 0.18s ease' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: `var(--dash-${expandedGroup.colorVar}-title)` }}>
                Smlouvy končící za méně než {expandedGroup.days} dní ({expandedGroup.list.length})
              </div>
              <button onClick={() => setExpandedGroup(null)}
                style={{ background: `var(--dash-${expandedGroup.colorVar}-border)`, border: 'none', width: 32, height: 32, borderRadius: 8,
                  cursor: 'pointer', fontWeight: 800, color: `var(--dash-${expandedGroup.colorVar}-title)`, fontSize: 16 }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {expandedGroup.list.map(renderContractItem)}
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Přehled expirací smluv, úkolů, blížících se revizí a měsíčních plateb nájemného</div>
        </div>
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
              <div style={{ fontSize: 13, color: 'var(--dash-blue-empty)', opacity: 0.6, fontStyle: 'italic', padding: '12px 0' }}>Žádné aktivní úkoly.</div>
            ) : activeTasks.map(task => (
              <div key={task.id} style={{ background: 'var(--dash-inner-bg)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--dash-inner-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{task.title}</div>
                  {task.tag && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{task.tag}</div>}
                </div>
                <div className="badge" style={{ background: task.status === 'progress' ? '#FEF08A' : task.status === 'waiting' ? '#FEE2E2' : task.status === 'longterm' ? '#EDE9FE' : task.status === 'signature' ? '#F5D0FE' : 'var(--bg3)', color: 'var(--text2)', marginBottom: 0 }}>
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
              <div style={{ fontSize: 13, color: 'var(--dash-purple-empty)', opacity: 0.6, fontStyle: 'italic', padding: '12px 0' }}>Žádné evidované revize.</div>
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
          const subContracts = activeContracts.filter(c => {
            if (c.paymentFrequency === 'Zahrnuto v nájemném') return false
            const asset = assets.find(a => a.id === c.assetId)
            const effectiveSubject = c.billingSubject || asset?.subject || ''
            return effectiveSubject === subject
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

          return (
            <div key={subject} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ background: 'linear-gradient(135deg, #12654A 0%, #1A8A62 100%)', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{subject}</span>
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
                            <span style={{ fontSize: 9, color: '#15803d', fontWeight: 700 }}>✓ Již uhrazeno</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d' }}>{Math.round(data.paid).toLocaleString('cs-CZ')} Kč</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 9, color: data.remaining > 0 ? '#dc2626' : 'var(--text3)', fontWeight: 700 }}>
                              {data.remaining > 0 ? '⏳ Dosud neuhrazeno' : '✓ Vše uhrazeno'}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: data.remaining > 0 ? '#dc2626' : '#15803d' }}>
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
