import React, { useState, useEffect, useRef } from 'react'
import { useApp } from './AppContext.jsx'

export default function SearchModal({ onClose, onOpenTenant, onOpenContract, onNav }) {
  const { tenants, contracts, properties } = useApp()
  const [query, setQuery] = useState('')
  const inputRef = useRef()

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50) }, [])

  const q = query.toLowerCase().trim()

  const tenantResults = q.length > 0
    ? tenants.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.unit?.toLowerCase().includes(q) ||
        t.subject?.toLowerCase().includes(q) ||
        t.phone?.includes(q) ||
        t.email?.toLowerCase().includes(q)
      ).slice(0, 5)
    : tenants.slice(0, 3)

  const contractResults = q.length > 0
    ? contracts.filter(c =>
        c.tenant?.toLowerCase().includes(q) ||
        c.unit?.toLowerCase().includes(q) ||
        c.tags?.some(t => t.includes(q))
      ).slice(0, 3)
    : []

  const propResults = q.length > 0
    ? properties.filter(p => p.subject.toLowerCase().includes(q)).slice(0, 3)
    : properties.slice(0, 2)

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', zIndex: 200 }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
        width: 545, maxWidth: '95vw', background: 'var(--bg)',
        borderRadius: 'var(--rl)', overflow: 'hidden',
        boxShadow: '0 8px 36px rgba(0,0,0,.18)', zIndex: 201,
      }} onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 16px', borderBottom: '.5px solid var(--card-border)' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Hledat nájemníka, nemovitost, smlouvu…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, color: 'var(--text)', fontFamily: 'inherit' }}
            onKeyDown={e => e.key === 'Escape' && onClose()}
          />
          <kbd style={{ fontSize: 10.5, background: 'var(--bg2)', border: '.5px solid var(--card-border)', borderRadius: 4, padding: '1px 5px', color: 'var(--text3)' }}>Esc</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          {tenantResults.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: .6, color: 'var(--text3)', padding: '9px 16px 3px', textTransform: 'uppercase' }}>
                Nájemníci
              </div>
              {tenantResults.map(t => (
                <div key={t.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 16px', cursor: 'pointer', transition: 'background .1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => { onOpenTenant(t.id); onClose() }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 6, background: t.avatarBg, color: t.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>
                    {t.initials}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
                      {t.unitDetail} · {t.rent?.toLocaleString('cs-CZ')} Kč/měs
                    </div>
                  </div>
                  {t.daysLeft !== undefined && t.daysLeft <= 30 && (
                    <span className="badge badge-red" style={{ marginLeft: 'auto' }}>{t.daysLeft} dní</span>
                  )}
                </div>
              ))}
            </>
          )}

          {propResults.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: .6, color: 'var(--text3)', padding: '9px 16px 3px', textTransform: 'uppercase' }}>
                Nemovitosti
              </div>
              {propResults.map((p, i) => (
                <div key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 16px', cursor: 'pointer', transition: 'background .1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => { onNav('properties'); onClose() }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 14V7l6-5 6 5v7H2z" stroke="currentColor" strokeWidth="1.2"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{p.subject}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>{p.count} jednotek · {p.occupancy} % obsazeno</div>
                  </div>
                </div>
              ))}
            </>
          )}

          {contractResults.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: .6, color: 'var(--text3)', padding: '9px 16px 3px', textTransform: 'uppercase' }}>
                Smlouvy
              </div>
              {contractResults.map(c => (
                <div key={c.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 16px', cursor: 'pointer', transition: 'background .1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => { onOpenContract(c.id); onClose() }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 6, background: c.status === 'red' ? 'var(--red-bg)' : 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.2"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{c.tenant}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
                      {((c.rent || 0) + (c.parking || 0)).toLocaleString('cs-CZ')} Kč/měs · do {c.end}
                    </div>
                  </div>
                  {c.daysLeft !== null && c.daysLeft <= 30 && (
                    <span className="badge badge-red" style={{ marginLeft: 'auto' }}>{c.daysLeft} dní</span>
                  )}
                </div>
              ))}
            </>
          )}

          {q.length > 0 && tenantResults.length === 0 && propResults.length === 0 && contractResults.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              Žádné výsledky pro „{query}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '9px 16px', borderTop: '.5px solid var(--card-border)', display: 'flex', gap: 12, fontSize: 11, color: 'var(--text3)' }}>
          <span><kbd style={{ fontSize: 10.5, background: 'var(--bg2)', border: '.5px solid var(--card-border)', borderRadius: 4, padding: '1px 5px' }}>↵</kbd> otevřít</span>
          <span><kbd style={{ fontSize: 10.5, background: 'var(--bg2)', border: '.5px solid var(--card-border)', borderRadius: 4, padding: '1px 5px' }}>Esc</kbd> zavřít</span>
        </div>
      </div>
    </>
  )
}
