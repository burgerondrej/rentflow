import React from 'react'

export default function Sidebar({ active, onNav, width, onResizeStart, urgentContracts, unreadCount }) {
  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.5" opacity=".9"/><rect x="9" y="1" width="6" height="6" rx="1.5" opacity=".9"/><rect x="1" y="9" width="6" height="6" rx="1.5" opacity=".9"/><rect x="9" y="9" width="6" height="6" rx="1.5" opacity=".3"/></svg> },
    
    { section: 'Adresář' },
    { id: 'tenants', label: 'Nájemníci', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.3"/><path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
    
    { section: 'Předměty nájmu' },
    { id: 'residential', label: 'Bytové jednotky', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 14V7l6-5 6 5v7H2z" stroke="currentColor" strokeWidth="1.3"/><rect x="5.5" y="9" width="2" height="5" rx=".5" fill="currentColor" opacity=".7"/><rect x="8.5" y="9" width="2" height="3.5" rx=".5" fill="currentColor" opacity=".7"/></svg> },
    { id: 'commercial', label: 'Komerční prostory', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M5 8h6M5 10h3" stroke="currentColor" strokeLinecap="round"/></svg> },
    { id: 'ads', label: 'Reklamní plochy', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="7" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M5 10v4M11 10v4M4 14h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
    { id: 'parking', label: 'Parkovací stání', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M6 11V5h2.5a2 2 0 110 4H6" stroke="currentColor" strokeWidth="1.3"/></svg> },
    { id: 'ostatni', label: 'Ostatní', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M5 5h6M5 8h6M5 11h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
    
    { section: 'Administrativa' },
    { id: 'contracts', label: 'Smlouvy', badge: urgentContracts?.toString() || '0', badgeType: 'red', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/><line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/><line x1="5" y1="11" x2="8" y2="11" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg> },
    { id: 'payments', label: 'Platby', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M6 7h3a1.5 1.5 0 010 3H7m1-4v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
    { id: 'operational-costs', label: 'Provozní náklady', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1 6h14" stroke="currentColor" strokeWidth="1.3"/><path d="M5 10h2M9 10h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
    { id: 'maintenance', label: 'Revize a údržba', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M10.5 2.5a2 2 0 10-2.83 2.83l-5.3 5.3a2 2 0 102.83 2.83l5.3-5.3a2 2 0 100-5.66z" stroke="currentColor" strokeWidth="1.3"/><line x1="4.5" y1="11.5" x2="6.5" y2="13.5" stroke="currentColor" strokeWidth="1.3"/></svg> },
    { id: 'docs', label: 'Dokumenty', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M4 2h8l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3"/><path d="M12 2v3h3" stroke="currentColor" strokeWidth="1.3"/></svg> },
    { id: 'kanban', label: 'Kanban', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.3"/><rect x="6.5" y="2" width="3" height="8" rx="1" stroke="currentColor" strokeWidth="1.3"/><rect x="11" y="2" width="4" height="10" rx="1" stroke="currentColor" strokeWidth="1.3"/></svg> },
    
    { section: 'Systém' },
    { id: 'alerts', label: 'Upozornění', badge: unreadCount?.toString() || '0', badgeType: 'blue', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 2l6 11H2L8 2z" stroke="currentColor" strokeWidth="1.3"/><line x1="8" y1="6" x2="8" y2="9" stroke="currentColor" strokeWidth="1.3"/><circle cx="8" cy="11" r=".5" fill="currentColor"/></svg> },
    { id: 'export', label: 'Export a tisk', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 11v2a1 1 0 001 1h8a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
    { id: 'history', label: 'Historie změn', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 14A6 6 0 108 2a6 6 0 000 12z" stroke="currentColor" strokeWidth="1.3"/><path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
    { id: 'trash', label: 'Koš', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M5 4v10a1 1 0 001 1h4a1 1 0 001-1V4M6 4V2a1 1 0 011-1h2a1 1 0 011 1v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
  ]

  return (
    <nav style={{ width, minWidth: 180, maxWidth: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '20px 12px 16px', position: 'relative', borderRight: '1px solid rgba(0,0,0,0.25)' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(155deg,#0A3D2B 0%,#12654A 40%,#1A8A62 72%,#0E5540 100%)', pointerEvents: 'none' }} />
      <div onMouseDown={onResizeStart} style={{ position: 'absolute', top: 0, right: -4, width: 8, height: '100%', cursor: 'col-resize', zIndex: 10 }} />
      
      <div style={{ padding: '8px 12px 28px', fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.98)', letterSpacing: '-.4px', position: 'relative', textAlign: 'center' }}>
        Rent<span style={{ color: '#4ade80' }}>Flow</span>
      </div>
      
      <div style={{ flex: 1, position: 'relative', overflowY: 'auto' }}>
        {NAV_ITEMS.map((item, i) => {
          if (item.section) return <div key={i} style={{ fontSize: 10, fontWeight: 700, color: 'rgba(160,255,210,0.90)', letterSpacing: '.8px', padding: '8px 14px 3px', textTransform: 'uppercase', marginTop: i > 0 ? 4 : 0 }}>{item.section}</div>
          const isActive = active === item.id
          return (
            <div key={item.id} onClick={() => onNav(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 13.5, color: '#ffffff', background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent', fontWeight: isActive ? 700 : 500, marginBottom: 1, border: isActive ? '1px solid rgba(180,255,220,0.22)' : '1px solid transparent', opacity: isActive ? 1 : 0.88, textShadow: isActive ? '0 0 12px rgba(158,255,212,0.4)' : 'none' }}>
              <span style={{ flexShrink: 0, width: 17, height: 17 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && item.badge !== '0' && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: item.badgeType === 'red' ? 'rgba(230,40,40,0.80)' : 'rgba(40,120,230,0.80)', color: '#fff' }}>{item.badge}</span>}
            </div>
          )
        })}
      </div>
    </nav>
  )
}