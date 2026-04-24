import React, { useState } from 'react'
import { useApp } from './AppContext.jsx'

export default function TenantForm({ onClose }) {
  const { addTenant } = useApp()
  const [tenantType, setTenantType] = useState(null) // null | 'company' | 'person'
  const [revealed, setRevealed] = useState(false)

  const [formData, setFormData] = useState({
    // Společná
    name: '', bankAccount: '',
    // Firma
    ico: '', dic: '', contactPerson: '', phone: '', email: '',
    whatsapp: '', billingEmail: '', address: '',
    // Osoba
    birthDate: '', idCard: '', personPhone: '', personEmail: '', personAddress: '',
  })
  const set = (k, v) => setFormData(prev => ({ ...prev, [k]: v }))

  const handleTypeSelect = (type) => {
    setTenantType(type)
    setTimeout(() => setRevealed(true), 30) // malé zpoždění pro CSS přechod
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const today = new Date().toLocaleDateString('cs-CZ')
    const isCompany = tenantType === 'company'
    addTenant({
      name: formData.name,
      phone: isCompany ? formData.phone : formData.personPhone,
      email: isCompany ? formData.email : formData.personEmail,
      ico: isCompany ? formData.ico : null,
      dic: isCompany ? formData.dic : null,
      address: isCompany ? formData.address : formData.personAddress,
      bankAccount: formData.bankAccount,
      tenantType: tenantType,
      contactPerson: isCompany ? formData.contactPerson : null,
      whatsapp: isCompany ? formData.whatsapp : null,
      billingEmail: isCompany ? formData.billingEmail : null,
      birthDate: !isCompany ? formData.birthDate : null,
      idCard: !isCompany ? formData.idCard : null,
      status: 'active',
      tags: [],
      added: today,
      avatarBg: '#E2E8F0',
      avatarColor: '#475569'
    })
    onClose()
  }

  const lbl = (text, sub) => (
    <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
      {text}{sub && <span style={{ color: 'var(--text3)', fontWeight: 400 }}> — {sub}</span>}
    </label>
  )
  const inp = { width: '100%', textAlign: 'left', cursor: 'text' }

  return (
    <>
      <div className="overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, backdropFilter: 'blur(3px)' }} />
      <div className="modal" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--bg)', borderRadius: 16, width: '100%', maxWidth: 500, zIndex: 1001, boxShadow: '0 32px 64px -12px rgba(0,0,0,0.25)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Gradient header */}
        <div style={{ background: 'linear-gradient(135deg, #0A3D2B 0%, #12654A 50%, #1A8A62 100%)', padding: '22px 28px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.18)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                {tenantType === 'company' ? '🏢' : tenantType === 'person' ? '👤' : '🧑‍💼'}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Nový nájemce</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>
                  {tenantType === 'company' ? 'Právnická osoba – firma' : tenantType === 'person' ? 'Fyzická osoba – soukromá' : 'Nejprve vyberte typ nájemce'}
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', padding: '22px 28px', flex: 1 }}>

        {/* ── VÝBĚR TYPU ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: tenantType ? 20 : 8 }}>
          {[
            { type: 'company', icon: '🏢', label: 'Firma', sub: 'Právnická osoba' },
            { type: 'person',  icon: '👤', label: 'Soukromá osoba', sub: 'Fyzická osoba' },
          ].map(({ type, icon, label, sub }) => {
            const isSelected = tenantType === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeSelect(type)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 8, padding: '20px 16px', borderRadius: 14, cursor: 'pointer',
                  border: isSelected ? '2px solid var(--accent)' : '2px solid var(--border)',
                  background: isSelected ? 'rgba(18,101,74,0.06)' : 'var(--bg)',
                  transition: 'all 0.2s ease',
                  boxShadow: isSelected ? '0 0 0 3px rgba(18,101,74,0.12)' : 'none',
                }}
              >
                <span style={{ fontSize: 32 }}>{icon}</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: isSelected ? 'var(--accent)' : 'var(--text)' }}>{label}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{sub}</div>
              </button>
            )
          })}
        </div>

        {/* ── ANIMOVANÝ ROZVOJ FORMULÁŘE ── */}
        <div style={{
          overflow: 'hidden',
          maxHeight: revealed ? '1000px' : '0px',
          opacity: revealed ? 1 : 0,
          transition: 'max-height 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease',
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ══ FIRMA ══ */}
            {tenantType === 'company' && (
              <>
                <div>
                  {lbl('Název společnosti *')}
                  <input type="text" className="btn" style={inp} value={formData.name} onChange={e => set('name', e.target.value)} required autoFocus />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    {lbl('IČ')}
                    <input type="text" className="btn" style={inp} placeholder="12345678" value={formData.ico} onChange={e => set('ico', e.target.value)} />
                  </div>
                  <div>
                    {lbl('DIČ')}
                    <input type="text" className="btn" style={inp} placeholder="CZ12345678" value={formData.dic} onChange={e => set('dic', e.target.value)} />
                  </div>
                </div>

                {/* Kontaktní osoba + podřízené položky */}
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    {lbl('Kontaktní osoba')}
                    <input type="text" className="btn" style={inp} placeholder="Jméno a příjmení" value={formData.contactPerson} onChange={e => set('contactPerson', e.target.value)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>
                    <div>
                      {lbl('Kontaktní telefon')}
                      <input type="text" className="btn" style={inp} placeholder="+420 xxx xxx xxx" value={formData.phone} onChange={e => set('phone', e.target.value)} />
                    </div>
                    <div>
                      {lbl('Kontaktní e-mail')}
                      <input type="text" className="btn" style={inp} value={formData.email} onChange={e => set('email', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div>
                  {lbl('WhatsApp skupina', 'kontaktní telefon')}
                  <input type="text" className="btn" style={inp} placeholder="+420 xxx xxx xxx" value={formData.whatsapp} onChange={e => set('whatsapp', e.target.value)} />
                </div>

                <div>
                  {lbl('E-mail pro fakturaci')}
                  <input type="text" className="btn" style={inp} value={formData.billingEmail} onChange={e => set('billingEmail', e.target.value)} />
                </div>

                <div>
                  {lbl('Sídlo firmy')}
                  <input type="text" className="btn" style={inp} value={formData.address} onChange={e => set('address', e.target.value)} />
                </div>

                <div>
                  {lbl('Bankovní účet společnosti')}
                  <input type="text" className="btn" style={inp} placeholder="123456789/0800" value={formData.bankAccount} onChange={e => set('bankAccount', e.target.value)} />
                </div>
              </>
            )}

            {/* ══ FYZICKÁ OSOBA ══ */}
            {tenantType === 'person' && (
              <>
                <div>
                  {lbl('Jméno a příjmení *')}
                  <input type="text" className="btn" style={inp} value={formData.name} onChange={e => set('name', e.target.value)} required autoFocus />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    {lbl('Rodné číslo / Datum narození')}
                    <input type="text" className="btn" style={inp} placeholder="1. 1. 1980" value={formData.birthDate} onChange={e => set('birthDate', e.target.value)} />
                  </div>
                  <div>
                    {lbl('Číslo OP / pasu')}
                    <input type="text" className="btn" style={inp} placeholder="123456789" value={formData.idCard} onChange={e => set('idCard', e.target.value)} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    {lbl('Kontaktní telefon')}
                    <input type="text" className="btn" style={inp} placeholder="+420 xxx xxx xxx" value={formData.personPhone} onChange={e => set('personPhone', e.target.value)} />
                  </div>
                  <div>
                    {lbl('Kontaktní e-mail')}
                    <input type="text" className="btn" style={inp} value={formData.personEmail} onChange={e => set('personEmail', e.target.value)} />
                  </div>
                </div>

                <div>
                  {lbl('Trvalé bydliště')}
                  <input type="text" className="btn" style={inp} value={formData.personAddress} onChange={e => set('personAddress', e.target.value)} />
                </div>

                <div>
                  {lbl('Bankovní účet')}
                  <input type="text" className="btn" style={inp} placeholder="123456789/0800" value={formData.bankAccount} onChange={e => set('bankAccount', e.target.value)} />
                </div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button type="button" className="btn" onClick={onClose}>Zrušit</button>
              <button type="submit" className="btn btn-primary">Uložit nájemce</button>
            </div>
          </form>
        </div>

        {/* Tlačítko Zrušit pokud typ ještě nevybrán */}
        {!tenantType && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="btn" onClick={onClose}>Zrušit</button>
          </div>
        )}

        </div>{/* end scrollable body */}
      </div>
    </>
  )
}
