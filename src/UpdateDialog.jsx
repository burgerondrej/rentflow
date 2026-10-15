import React, { useState } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import DialogShell from './DialogShell.jsx'

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
    <DialogShell icon="🚀" title="Dostupná aktualizace" subtitle={`RentFlow ${version}`} width={440} zIndex={9999}
      onClose={onClose} busy={installing}
      footer={<>
        {!installing && <button className="btn" onClick={onClose}>Připomenout později</button>}
        <button className="btn btn-primary" onClick={handleInstall} disabled={installing}
          style={{ minWidth: 140, opacity: installing ? 0.7 : 1, cursor: installing ? 'not-allowed' : 'pointer' }}>
          {installing ? 'Instaluji…' : '⬇ Instalovat'}
        </button>
      </>}>
      {/* Release notes */}
      {body && (
        <div style={{
          background: 'var(--bg2)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--text)',
          lineHeight: 1.6, maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', border: '1px solid var(--border)'
        }}>
          {body}
        </div>
      )}
      {!body && <div style={{ fontSize: 13, color: 'var(--text2)' }}>Je k dispozici nová verze aplikace.</div>}

      {/* Progress / error */}
      {installing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text3)', marginTop: 14 }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--accent)', borderTopColor: 'transparent',
            animation: 'spin 0.7s linear infinite', flexShrink: 0
          }} />
          Stahování a instalace… aplikace se po dokončení restartuje.
        </div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: '#EF4444', marginTop: 12, background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 8 }}>
          {error}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </DialogShell>
  )
}
