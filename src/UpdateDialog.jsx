import React, { useState } from 'react'
import { invoke } from '@tauri-apps/api/tauri'

export default function UpdateDialog({ version, body, onClose }) {
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState(null)

  async function handleInstall() {
    setInstalling(true)
    setError(null)
    try {
      await invoke('install_update')
      // Po stažení Tauri restartuje app automaticky
    } catch (e) {
      setError('Instalace selhala: ' + e)
      setInstalling(false)
    }
  }

  return (
    <div
      onClick={e => { if (!installing && e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'modalBgIn 0.15s ease'
      }}
    >
      <div style={{
        background: 'var(--bg)',
        borderRadius: 18,
        padding: '36px 40px',
        width: 420,
        boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
        animation: 'modalIn 0.18s ease',
        display: 'flex', flexDirection: 'column', gap: 0
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #0A3D2B, #1A8A62)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0
          }}>🚀</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)' }}>
              Dostupná aktualizace
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>
              RentFlow {version}
            </div>
          </div>
        </div>

        {/* Release notes */}
        {body && (
          <div style={{
            background: 'var(--bg2)',
            borderRadius: 10,
            padding: '12px 16px',
            fontSize: 13,
            color: 'var(--text)',
            lineHeight: 1.6,
            marginBottom: 24,
            maxHeight: 160,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            border: '1px solid var(--border, #e5e7eb)'
          }}>
            {body}
          </div>
        )}

        {!body && <div style={{ marginBottom: 24 }} />}

        {/* Progress / error */}
        {installing && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 13, color: 'var(--text3)', marginBottom: 16
          }}>
            <div style={{
              width: 16, height: 16, borderRadius: '50%',
              border: '2px solid var(--accent)',
              borderTopColor: 'transparent',
              animation: 'spin 0.7s linear infinite',
              flexShrink: 0
            }} />
            Stahování a instalace… aplikace se po dokončení restartuje.
          </div>
        )}

        {error && (
          <div style={{
            fontSize: 12, color: '#EF4444', marginBottom: 12,
            background: 'rgba(239,68,68,0.08)', padding: '8px 12px',
            borderRadius: 8
          }}>
            {error}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {!installing && (
            <button
              className="btn"
              onClick={onClose}
              style={{ background: 'var(--bg2)', color: 'var(--text3)', border: '1px solid var(--border, #e5e7eb)' }}
            >
              Připomenout později
            </button>
          )}
          <button
            className="btn"
            onClick={handleInstall}
            disabled={installing}
            style={{
              background: installing
                ? 'var(--text3)'
                : 'linear-gradient(135deg, #0A3D2B, #1A8A62)',
              color: '#fff',
              opacity: installing ? 0.7 : 1,
              cursor: installing ? 'not-allowed' : 'pointer',
              minWidth: 140
            }}
          >
            {installing ? 'Instaluji…' : '⬇ Instalovat'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes modalBgIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.96) translateY(8px) } to { opacity: 1; transform: none } }
      `}</style>
    </div>
  )
}
