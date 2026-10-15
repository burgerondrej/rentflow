import React from 'react'
import DialogShell from './DialogShell.jsx'

/**
 * Potvrzovací dialog — nahrazuje window.confirm() (jednotná kostra DialogShell)
 * Props: title, text (text i React uzel), danger, okLabel, cancelLabel, onOk, onClose
 */
export default function ConfirmDialog({ title, text, danger = false, okLabel = 'Potvrdit', cancelLabel = 'Zrušit', onOk, onClose }) {
  const handleOk = () => { onOk?.(); onClose() }

  return (
    <DialogShell
      icon={danger ? '🗑️' : '⚠️'} tone={danger ? 'red' : 'amber'} title={title} width={440} zIndex={3000}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{cancelLabel}</button>
        <button className="btn" onClick={handleOk} autoFocus
          style={{ background: danger ? '#DC2626' : 'var(--accent)', borderColor: danger ? '#DC2626' : 'var(--accent)', color: '#fff', fontWeight: 700 }}>
          {okLabel}
        </button>
      </>}
    >
      {text && <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>{text}</div>}
    </DialogShell>
  )
}
