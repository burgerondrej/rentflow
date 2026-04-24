import React from 'react'

export default function Modal({ title, onClose, children, width = 520 }) {
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 400 }}
        onClick={onClose}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width, maxWidth: '95vw', maxHeight: '90vh',
        background: 'var(--bg)', borderRadius: 'var(--rl)',
        boxShadow: '0 16px 48px rgba(0,0,0,.22)',
        zIndex: 401, display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '.5px solid var(--card-border)', flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 'var(--r)', border: '.5px solid var(--card-border)',
            background: 'transparent', cursor: 'pointer', color: 'var(--text2)', fontSize: 15,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {children}
        </div>
      </div>
    </>
  )
}

// Reusable form field components
export function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: .3, textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

export function Input({ ...props }) {
  return (
    <input style={{
      width: '100%', padding: '8px 10px',
      border: '.5px solid var(--card-border)', borderRadius: 'var(--r)',
      fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
      fontFamily: 'inherit', outline: 'none',
    }} {...props}
      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
      onBlur={e => e.target.style.borderColor = 'var(--card-border)'}
    />
  )
}

export function Select({ children, ...props }) {
  return (
    <select style={{
      width: '100%', padding: '8px 10px',
      border: '.5px solid var(--card-border)', borderRadius: 'var(--r)',
      fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
      fontFamily: 'inherit', outline: 'none', appearance: 'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' fill='none'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%23999' stroke-width='1.3' stroke-linecap='round'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
    }} {...props}>
      {children}
    </select>
  )
}

export function Textarea({ ...props }) {
  return (
    <textarea style={{
      width: '100%', padding: '8px 10px',
      border: '.5px solid var(--card-border)', borderRadius: 'var(--r)',
      fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
      fontFamily: 'inherit', outline: 'none', resize: 'vertical', minHeight: 72,
    }} {...props}
      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
      onBlur={e => e.target.style.borderColor = 'var(--card-border)'}
    />
  )
}

export function FormRow({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {children}
    </div>
  )
}

export function FormActions({ onCancel, submitLabel = 'Uložit', onSubmit }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '.5px solid var(--card-border)' }}>
      <button className="btn" onClick={onCancel}>Zrušit</button>
      <button className="btn btn-primary" onClick={onSubmit}>{submitLabel}</button>
    </div>
  )
}
