import React, { useState } from 'react'
import { useApp } from './AppContext.jsx'



const CONFIG = {
  residential: { title: 'Nová bytová jednotka' },
  commercial:  { title: 'Nový komerční prostor' },
  ads:         { title: 'Nová reklamní plocha' },
  parking:     { title: 'Nové parkovací stání' },
  ostatni:     { title: 'Nový záznam — Ostatní' }
}

export default function AssetForm({ type, onClose }) {
  const { addAsset, subjects = [] } = useApp()
  const conf = CONFIG[type]

  const [formData, setFormData] = useState({
    subject:         '',
    unit:            '',
    disposition:     '',
    size:            '',
    floor:           '',
    adsLocation:     '',
    adsDimensions:   '',
    parkingLocation: '',
    parkingLabel:    '',
    balcony:         '',
    commerceType:    'Kancelářský prostor',
    description:     '',
  })

  const set = (k, v) => setFormData(prev => ({ ...prev, [k]: v }))

  const handleSubmit = (e) => {
    e.preventDefault()
    let unit = formData.unit
    let size = ''
    let floor = formData.floor
    let format = ''

    if (type === 'residential') {
      size = formData.disposition
        ? `${formData.disposition} / ${formData.size} m²`
        : formData.size ? `${formData.size} m²` : ''
    } else if (type === 'commercial') {
      size = formData.size ? `${formData.size} m²` : ''
    } else if (type === 'ads') {
      size = formData.adsDimensions
      format = formData.adsLocation
    } else if (type === 'parking') {
      size = formData.parkingLabel
      format = formData.parkingLocation
    } else if (type === 'ostatni') {
      // unit = název, notes = popis — žádná plocha ani podlaží
    }

    addAsset({ type, subject: type === 'ostatni' ? 'Ostatní' : formData.subject, unit, size, floor, format, status: 'free',
      balcony: type === 'residential' ? formData.balcony || null : null,
      commerceType: type === 'commercial' ? formData.commerceType || null : null,
      notes: type === 'ostatni' ? formData.description || null : null })
    onClose()
  }

  const lbl = (text) => <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{text}</label>
  const inp = { width: '100%', textAlign: 'left', cursor: 'text' }

  const ASSET_GRADIENT = {
    residential: 'linear-gradient(135deg, #166534 0%, #16a34a 60%, #22c55e 100%)',
    commercial:  'linear-gradient(135deg, #3730a3 0%, #6d28d9 60%, #7c3aed 100%)',
    ads:         'linear-gradient(135deg, #c2410c 0%, #ea580c 60%, #f97316 100%)',
    parking:     'linear-gradient(135deg, #1e40af 0%, #2563eb 60%, #3b82f6 100%)',
    ostatni:     'linear-gradient(135deg, #0f766e 0%, #0d9488 60%, #14b8a6 100%)',
  }
  const ASSET_ICON = { residential: '🏠', commercial: '🏢', ads: '🪧', parking: '🅿️', ostatni: '📄' }
  const ASSET_SUB  = {
    residential: 'Bytový fond – obytná jednotka',
    commercial:  'Komerční prostory',
    ads:         'Reklamní a billboardové plochy',
    parking:     'Parkovací stání a plochy',
    ostatni:     'Interní / skupinové záznamy',
  }

  return (
    <>
      <div className="overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, backdropFilter: 'blur(3px)' }} />
      <div className="modal" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--bg)', borderRadius: 16, width: '100%', maxWidth: 480, zIndex: 1001, boxShadow: '0 32px 64px -12px rgba(0,0,0,0.25)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Gradient header */}
        <div style={{ background: ASSET_GRADIENT[type] || ASSET_GRADIENT.residential, padding: '22px 28px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.18)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{ASSET_ICON[type] || '📄'}</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{conf.title}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>{ASSET_SUB[type] || ''}</div>
              </div>
            </div>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Scrollable form */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '22px 28px' }}>

          {type !== 'ostatni' && (
            <div>
              {lbl('Subjekt / Budova *')}
              <select className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} value={formData.subject} onChange={e => set('subject', e.target.value)} required>
                <option value="" disabled>— Vyberte subjekt —</option>
                {subjects.filter(s => s !== 'Ostatní').map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {type === 'residential' && (
            <>
              <div>
                {lbl('Označení jednotky (např. B.1.1, UJ4, …) *')}
                <input type="text" className="btn" style={inp} value={formData.unit} onChange={e => set('unit', e.target.value)} required autoFocus />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  {lbl('Dispozice (např. 2+kk)')}
                  <input type="text" className="btn" style={inp} placeholder="2+kk" value={formData.disposition} onChange={e => set('disposition', e.target.value)} />
                </div>
                <div>
                  {lbl('Plocha')}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="text" className="btn" style={{ flex: 1, textAlign: 'left', cursor: 'text' }} placeholder="65" value={formData.size} onChange={e => set('size', e.target.value)} />
                    <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>m²</span>
                  </div>
                </div>
              </div>
              <div>
                {lbl('Podlaží')}
                <input type="text" className="btn" style={inp} placeholder="2. NP" value={formData.floor} onChange={e => set('floor', e.target.value)} />
              </div>
              <div>
                {lbl('Balkón / Terasa — plocha')}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="text" className="btn" style={{ flex: 1, textAlign: 'left', cursor: 'text' }} placeholder="8" value={formData.balcony} onChange={e => set('balcony', e.target.value)} />
                  <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>m²</span>
                </div>
              </div>
            </>
          )}

          {type === 'commercial' && (
            <>
              <div>
                {lbl('Označení komerčního prostoru (např. kancelář 1, obchod vlevo dole, …) *')}
                <input type="text" className="btn" style={inp} value={formData.unit} onChange={e => set('unit', e.target.value)} required autoFocus />
              </div>
              <div>
                {lbl('Typ komerčního prostoru')}
                <select className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} value={formData.commerceType} onChange={e => set('commerceType', e.target.value)}>
                  <option value="Kancelářský prostor">Kancelářský prostor</option>
                  <option value="Obchodní prostor">Obchodní prostor</option>
                  <option value="Skladový prostor">Skladový prostor</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  {lbl('Plocha')}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="text" className="btn" style={{ flex: 1, textAlign: 'left', cursor: 'text' }} value={formData.size} onChange={e => set('size', e.target.value)} />
                    <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>m²</span>
                  </div>
                </div>
                <div>
                  {lbl('Podlaží')}
                  <input type="text" className="btn" style={inp} value={formData.floor} onChange={e => set('floor', e.target.value)} />
                </div>
              </div>
            </>
          )}

          {type === 'ads' && (
            <>
              <div>
                {lbl('Název reklamní plochy *')}
                <input type="text" className="btn" style={inp} value={formData.unit} onChange={e => set('unit', e.target.value)} required autoFocus />
              </div>
              <div>
                {lbl('Rozměr reklamní plochy (např. 5 x 2 m)')}
                <input type="text" className="btn" style={inp} placeholder="5 x 2 m" value={formData.adsDimensions} onChange={e => set('adsDimensions', e.target.value)} />
              </div>
              <div>
                {lbl('Umístění reklamní plochy')}
                <input type="text" className="btn" style={inp} placeholder="Umístění reklamní plochy" value={formData.adsLocation} onChange={e => set('adsLocation', e.target.value)} />
              </div>
            </>
          )}

          {type === 'parking' && (
            <>
              <div>
                {lbl('Parkovací stání (název / číslo) *')}
                <input type="text" className="btn" style={inp} value={formData.unit} onChange={e => set('unit', e.target.value)} required autoFocus />
              </div>
              <div>
                {lbl('Umístění parkovacího stání')}
                <input type="text" className="btn" style={inp} placeholder="Umístění parkovacího stání" value={formData.parkingLocation} onChange={e => set('parkingLocation', e.target.value)} />
              </div>
              <div>
                {lbl('Označení parkovacího stání')}
                <input type="text" className="btn" style={inp} value={formData.parkingLabel} onChange={e => set('parkingLabel', e.target.value)} />
              </div>
            </>
          )}

          {type === 'ostatni' && (
            <>
              <div>
                {lbl('Název *')}
                <input type="text" className="btn" style={inp} placeholder="např. Nájemní smlouva A ↔ B" value={formData.unit} onChange={e => set('unit', e.target.value)} required autoFocus />
              </div>
              <div>
                {lbl('Stručný popis')}
                <textarea
                  className="btn"
                  style={{ ...inp, height: 90, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                  placeholder="Popište, o jaký typ smlouvy nebo vztahu se jedná…"
                  value={formData.description}
                  onChange={e => set('description', e.target.value)}
                />
              </div>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn" onClick={onClose}>Zrušit</button>
            <button type="submit" className="btn btn-primary">Uložit položku</button>
          </div>
        </form>
        </div>{/* end scrollable */}
      </div>
    </>
  )
}
