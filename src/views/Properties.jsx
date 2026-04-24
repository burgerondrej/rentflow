import React, { useState } from 'react'
import { useApp } from '../AppContext.jsx'

const STATUS_COLOR = { green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', blue: 'var(--blue)', gray: 'var(--text3)' }
const BADGE_CLS    = { green: 'badge-green', amber: 'badge-amber', red: 'badge-red', blue: 'badge-blue', gray: 'badge-gray' }

export default function Properties({ onOpenTenant, activeSubject }) {
  const { properties, tenants, contracts } = useApp()
  const [open, setOpen] = useState({ 0: true, 1: true, 2: true, 6: true })
  const [selectedUnit, setSelectedUnit] = useState(null)
  
  const [revisions] = useState([
    { id: 1, type: 'Elektřina', date: '15. 05. 2027', status: 'ok' },
    { id: 2, type: 'Plyn / Kotelna', date: '20. 10. 2026', status: 'ok' },
    { id: 3, type: 'Hasicí přístroje', date: '01. 12. 2025', status: 'urgent' }
  ])

  const filtered = activeSubject && activeSubject !== 'all'
    ? properties.filter(p => p.subject === activeSubject)
    : properties

  const toggle = (i) => setOpen(prev => ({ ...prev, [i]: !prev[i] }))

  const currentTenant = selectedUnit ? tenants.find(t => t.id === selectedUnit.tenantId && t.status !== 'archive') : null
  
  const pastTenants = selectedUnit ? tenants.filter(t => {
    if (t.status !== 'archive') return false
    const unitName = selectedUnit.name.split('—')[0].trim().toLowerCase()
    const tenantUnit = (t.unitDetail || '').toLowerCase()
    return tenantUnit.includes(unitName) || unitName.includes(tenantUnit)
  }) : []

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Nemovitosti</div>
          <div className="page-sub">{filtered.reduce((s, p) => s + p.count, 0)} jednotek celkem</div>
        </div>
        <button className="btn btn-primary btn-sm">+ Přidat objekt</button>
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text3)' }}>
          Žádné nemovitosti pro tento subjekt.
        </div>
      )}

      {filtered.map((firm, fi) => {
        const isOpen = open[fi] !== false
        return (
          <div key={firm.id} className="tree-firm">
            <div className="tree-firm-header" onClick={() => toggle(fi)}>
              <svg style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform .18s', flexShrink: 0 }}
                width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M4 3l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="3" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M1 7h14M5 3V1M11 3V1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <span style={{ flex: 1 }}>{firm.subject}</span>
              <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 400, marginLeft: 4 }}>{firm.count} jednotek</span>
              <span className={`badge ${BADGE_CLS[firm.badge]}`} style={{ marginLeft: 8 }}>{firm.occupancy} % obsazeno</span>
            </div>

            {isOpen && (
              <div className="tree-units">
                {firm.units.map((u) => (
                  <div key={u.id} className="tree-unit" onClick={() => setSelectedUnit(u)} style={{ cursor: 'pointer' }}>
                    <div className="unit-dot" style={{ background: STATUS_COLOR[u.status] || 'var(--text3)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{u.tenant}</div>
                    </div>
                    <span className={`badge ${BADGE_CLS[u.status] || 'badge-gray'}`}>{u.badge}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {selectedUnit && (
        <>
          <div className="overlay" onClick={() => setSelectedUnit(null)} />
          <div className="detail-panel">
            <div className="detail-header">
              <div style={{ flex: 1 }}>
                <div className="detail-title">{selectedUnit.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Detail jednotky / objektu</div>
              </div>
              <button className="detail-close" onClick={() => setSelectedUnit(null)}>✕</button>
            </div>
            <div className="detail-body">
              <div className="detail-section">
                <div className="detail-section-label">Platné revize a kontroly</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {revisions.map(rev => (
                    <div key={rev.id} style={{ padding: '8px 10px', background: 'var(--bg2)', borderRadius: 'var(--r)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '.5px solid var(--card-border)' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{rev.type}</div>
                        <div style={{ fontSize: 10.5, color: rev.status === 'urgent' ? 'var(--red-t)' : 'var(--text3)' }}>Platnost do: {rev.date}</div>
                      </div>
                      <span className={`badge ${rev.status === 'urgent' ? 'badge-red' : 'badge-green'}`} style={{ fontSize: 9 }}>{rev.status === 'urgent' ? 'Expirováno' : 'V pořádku'}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="detail-section">
                <div className="detail-section-label">Aktuální nájemník</div>
                {currentTenant ? (
                  <div style={{ padding: '10px 12px', background: 'var(--bg2)', border: '.5px solid var(--card-border)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{currentTenant.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Nájem: {currentTenant.rent?.toLocaleString('cs-CZ')} Kč</div>
                    </div>
                    <button className="btn btn-sm" onClick={() => { setSelectedUnit(null); onOpenTenant(currentTenant.id); }}>👤 Profil</button>
                  </div>
                ) : <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Jednotka je momentálně prázdná.</div>}
              </div>
              <div className="detail-section">
                <div className="detail-section-label">Historie nájemníků (Archiv)</div>
                {pastTenants.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Žádní bývalí nájemníci.</div> : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {pastTenants.map(pt => (
                      <div key={pt.id} style={{ padding: '8px 10px', border: '.5px solid var(--card-border)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 500 }}>{pt.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{pt.since} – {pt.contractEnd}</div>
                        </div>
                        <button className="btn btn-sm" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => { setSelectedUnit(null); onOpenTenant(pt.id); }}>Detail</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}