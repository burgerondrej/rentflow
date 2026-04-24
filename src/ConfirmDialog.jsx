import React, { useEffect } from 'react'

/**
 * Hezký potvrzovací dialog — nahrazuje window.confirm()
 * Props: title, text, danger, okLabel, cancelLabel, onOk, onClose
 */
export default function ConfirmDialog({ title, text, danger = false, okLabel = 'Potvrdit', cancelLabel = 'Zrušit', onOk, onClose }) {
  const handleOk = () => { onOk?.(); onClose() }

  // Klávesa Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(10, 20, 15, 0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />

      {/* Dialog box */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 2001,
        background: '#ffffff',
        borderRadius: 18,
        padding: '32px 32px 28px',
        width: 400,
        boxShadow: '0 32px 64px rgba(0,0,0,0.22), 0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.07)',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        {/* Ikona */}
        <div style={{
          width: 52, height: 52, borderRadius: 16,
          background: danger ? '#FEE2E2' : '#ECFDF5',
          border: `1.5px solid ${danger ? '#FECACA' : '#BBF7D0'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, marginBottom: 20,
          boxShadow: danger
            ? '0 4px 12px rgba(220,38,38,0.12)'
            : '0 4px 12px rgba(18,101,74,0.10)',
        }}>
          {danger ? '🗑️' : '⚠️'}
        </div>

        {/* Nadpis */}
        <div style={{
          fontSize: 18, fontWeight: 700,
          color: '#111827',
          marginBottom: 10, lineHeight: 1.3,
        }}>
          {title}
        </div>

        {/* Popis */}
        {text && (
          <div style={{
            fontSize: 14, color: '#6B7280',
            lineHeight: 1.6, marginBottom: 28,
          }}>
            {text}
          </div>
        )}

        {/* Tlačítka */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              minWidth: 100, padding: '10px 18px',
              borderRadius: 10, border: '1.5px solid #E5E7EB',
              background: '#F9FAFB', color: '#374151',
              fontWeight: 600, fontSize: 14, cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
              transition: 'background 0.15s',
            }}
            onMouseOver={e => e.currentTarget.style.background = '#F3F4F6'}
            onMouseOut={e => e.currentTarget.style.background = '#F9FAFB'}
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleOk}
            style={{
              minWidth: 120, padding: '10px 18px',
              borderRadius: 10, border: 'none',
              background: danger ? '#DC2626' : '#12654A',
              color: '#fff',
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
              boxShadow: danger
                ? '0 4px 12px rgba(220,38,38,0.30)'
                : '0 4px 12px rgba(18,101,74,0.28)',
              transition: 'opacity 0.15s, transform 0.15s',
            }}
            onMouseOver={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseOut={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none' }}
          >
            {okLabel}
          </button>
        </div>
      </div>
    </>
  )
}
