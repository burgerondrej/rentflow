import React, { useState } from 'react'
import { invoke } from '@tauri-apps/api/tauri'

export default function ActivationScreen({ onActivated }) {
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async () => {
    if (!password) return
    setLoading(true)
    setError('')
    try {
      const ok = await invoke('verify_activation', { password })
      if (ok) {
        onActivated()
      } else {
        setError('Nesprávné heslo. Zkuste to znovu.')
        setPassword('')
      }
    } catch (e) {
      setError('Chyba při ověřování hesla.')
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'linear-gradient(155deg, #0A3D2B 0%, #12654A 40%, #1A8A62 72%, #0E5540 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '48px 40px',
        width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <svg width="40" height="40" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="90" fill="#0A3D2B" />
            <text x="58" y="130" fontFamily="Georgia, serif" fontWeight="bold" fontSize="80" fill="white">R</text>
            <circle cx="148" cy="75"  r="8" fill="#4ade80" opacity="1" />
            <circle cx="148" cy="100" r="8" fill="#4ade80" opacity="0.65" />
            <circle cx="148" cy="125" r="8" fill="#4ade80" opacity="0.35" />
          </svg>
          <span style={{ fontSize: 24, fontWeight: 700, color: '#0A3D2B', letterSpacing: '-0.5px' }}>RentFlow</span>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>Aktivace aplikace</div>
          <div style={{ fontSize: 13, color: '#606563' }}>Zadejte aktivační heslo pro pokračování</div>
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            placeholder="Aktivační heslo"
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            onKeyDown={handleKey}
            autoFocus
            style={{
              width: '100%', padding: '12px 16px', fontSize: 15,
              border: error ? '1.5px solid #DC2626' : '1.5px solid #d1d5db',
              borderRadius: 8, outline: 'none', boxSizing: 'border-box',
              fontFamily: 'DM Sans, sans-serif',
              transition: 'border-color 0.15s',
            }}
          />
          {error && (
            <div style={{ fontSize: 13, color: '#DC2626', textAlign: 'center' }}>{error}</div>
          )}
          <button
            onClick={handleSubmit}
            disabled={loading || !password}
            style={{
              width: '100%', padding: '12px', fontSize: 15, fontWeight: 600,
              background: loading || !password ? '#9ca3af' : 'linear-gradient(135deg, #12654A, #1A8A62)',
              color: '#fff', border: 'none', borderRadius: 8, cursor: loading || !password ? 'default' : 'pointer',
              fontFamily: 'DM Sans, sans-serif', transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Ověřuji...' : 'Aktivovat'}
          </button>
        </div>
      </div>
    </div>
  )
}
