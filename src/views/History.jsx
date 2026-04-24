import React from 'react'
import { useApp } from '../AppContext.jsx'

export default function History() {
  const { logs = [] } = useApp() || {}

  const getActionBadge = (action) => {
    switch(action) {
      case 'Přidání': return { bg: '#DCFCE7', color: '#166534', border: '#BBF7D0' }
      case 'Úprava': return { bg: '#FEF9C3', color: '#854D0E', border: '#FEF08A' }
      case 'Smazání': return { bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' }
      case 'Obnova': return { bg: '#E0F2FE', color: '#0369A1', border: '#BAE6FD' }
      default: return { bg: '#F1F5F9', color: '#475569', border: '#E2E8F0' }
    }
  }

  return (
    <div style={{ paddingBottom: 60, maxWidth: 1100 }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <div>
          <div className="page-title">Log aktivity</div>
          <div className="page-sub">Historie změn a činností uživatelů v systému</div>
        </div>
      </div>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', width: '15%' }}>Datum a čas</th>
              <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', width: '15%' }}>Uživatel</th>
              <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', width: '10%' }}>Akce</th>
              <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', width: '15%' }}>Sekce</th>
              <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', width: '45%' }}>Podrobnosti</th>
            </tr>
          </thead>
          <tbody>
            {logs.length > 0 ? logs.map(log => {
              const badge = getActionBadge(log.action)
              return (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--border2)' }}>
                  <td style={{ padding: '16px 24px', fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>
                    {log.timestamp}
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* TADY JE PŘEJMENOVÁNÍ NA PAVLA - BARVA AVATARU */}
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: log.user === 'Pavel' ? '#DBEAFE' : '#DCFCE7', color: log.user === 'Pavel' ? '#1E3A8A' : '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>
                        {log.user.charAt(0)}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{log.user}</span>
                    </div>
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <span style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: '16px 24px', fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>
                    {log.module}
                  </td>
                  <td style={{ padding: '16px 24px', fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
                    {log.detail}
                  </td>
                </tr>
              )
            }) : (
              <tr>
                <td colSpan="5" style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
                  <div style={{ fontSize: 32, marginBottom: 16 }}>📝</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Zatím nebyla zaznamenána žádná aktivita.</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Zkuste přidat úkol, nájemníka nebo smazat soubor.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}