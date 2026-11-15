import React, { useState } from 'react'
import { useApp } from './AppContext.jsx'
import DialogShell from './DialogShell.jsx'
import { assetTypeStyle, ASSET_TYPES } from './utils.js'



const CONFIG = {
  residential: { title: 'Nová bytová jednotka' },
  commercial:  { title: 'Nový komerční prostor' },
  ads:         { title: 'Nová reklamní plocha' },
  parking:     { title: 'Nové parkovací stání' },
  land:        { title: 'Nový pozemek / plocha' },
  vehicle:     { title: 'Nové auto' },
  service:     { title: 'Nová servisní smlouva' },
  ostatni:     { title: 'Nový záznam — Ostatní' }
}

export default function AssetForm({ type, onClose }) {
  const { addAsset, subjects = [], firms = [], subjectData = [] } = useApp()
  // Pozemky, Auta a Servisní smlouvy: jen sekce daného typu (pronajímatel = sekce)
  const typedOnly = type === 'land' || type === 'vehicle' || type === 'service'
  const sectionFits = (s) => !typedOnly || subjectData.find(x => x.name === s)?.assetType === type
  const conf = CONFIG[type]

  const [formData, setFormData] = useState({
    subject:         '',
    unit:            '',
    disposition:     '',
    size:            '',
    floor:           '',
    adsLocation:     '',
    adsDimensions:   '',
    landSize:        '',
    landLocation:    '',
    plate:           '',
    note:            '',
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
    } else if (type === 'land') {
      size = formData.landSize ? `${formData.landSize} m²` : ''
      format = formData.landLocation
    } else if (type === 'vehicle') {
      format = formData.plate
    } else if (type === 'service') {
      // unit = název smlouvy, notes = popis služby
    } else if (type === 'ostatni') {
      // unit = název, notes = popis — žádná plocha ani podlaží
    }

    addAsset({ type, subject: type === 'ostatni' ? 'Ostatní' : formData.subject, unit, size, floor, format, status: 'free',
      balcony: type === 'residential' ? formData.balcony || null : null,
      commerceType: type === 'commercial' ? formData.commerceType || null : null,
      notes: type === 'ostatni' ? formData.description || null : typedOnly ? formData.note || null : null })
    onClose()
  }

  const lbl = (text) => <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{text}</label>
  const inp = { width: '100%', textAlign: 'left', cursor: 'text' }

  const ASSET_ICON = { residential: '🏠', commercial: '🏢', ads: '📢', parking: '🅿️', land: '🌳', vehicle: '🚗', service: '🤝', ostatni: '📄' }
  const ASSET_SUB  = {
    residential: 'Bytový fond – obytná jednotka',
    commercial:  'Komerční prostory',
    ads:         'Reklamní a billboardové plochy',
    parking:     'Parkovací stání a plochy',
    land:        'Pozemky, ploty a další plochy',
    vehicle:     'Pronájem vozidel',
    service:     'Správa, administrativa a další služby',
    ostatni:     'Interní / skupinové záznamy',
  }

  const ts = assetTypeStyle(type)
  return (
    <DialogShell icon={ASSET_ICON[type] || '📄'} iconStyle={{ background: ts.bg, borderColor: ts.border }}
      title={conf.title} subtitle={ASSET_SUB[type] || ''} width={480} onClose={onClose} zIndex={1000}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Zrušit</button>
        <button type="submit" form="asset-form" className="btn btn-primary">Uložit položku</button>
      </>}>
        <form id="asset-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {type !== 'ostatni' && (
            <div>
              {lbl('Subjekt / Budova *')}
              <select className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} value={formData.subject} onChange={e => set('subject', e.target.value)} required>
                <option value="" disabled>— Vyberte subjekt —</option>
                {/* Seskupeno po firmách – JIHOTANK a JIHOTANK CB nesmí jít zaměnit */}
                {firms.filter(f => f.name !== 'Ostatní' && f.sections.some(sectionFits)).map(f => (
                  <optgroup key={f.name} label={`${f.short} · ${f.name}`}>
                    {f.sections.filter(sectionFits).map(s => <option key={s} value={s}>{s}</option>)}
                  </optgroup>
                ))}
              </select>
              {typedOnly && !firms.some(f => f.sections.some(sectionFits)) && (
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tone-amber-text)', marginTop: 6 }}>
                  Zatím není žádná sekce typu „{ASSET_TYPES[type]?.label}“ – založ ji v Nastavení → Firmy (např. „{firms.find(f => f.name !== 'Ostatní')?.name || 'Firma'} – {type === 'land' ? 'Pozemky' : ASSET_TYPES[type]?.label}“).
                </div>
              )}
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

          {typedOnly && (
            <>
              <div>
                {lbl(type === 'land' ? 'Název pozemku / plochy *' : type === 'service' ? 'Název servisní smlouvy *' : 'Auto (značka a model) *')}
                <input type="text" className="btn" style={inp} placeholder={type === 'land' ? 'např. Pozemek U Staré trati' : type === 'service' ? 'např. Správa a administrativa – ABC s.r.o.' : 'např. Mercedes-Benz S 580 L'} value={formData.unit} onChange={e => set('unit', e.target.value)} required autoFocus />
              </div>
              {type === 'land' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    {lbl('Výměra')}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="text" className="btn" style={{ flex: 1, textAlign: 'left', cursor: 'text' }} placeholder="1200" value={formData.landSize} onChange={e => set('landSize', e.target.value)} />
                      <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>m²</span>
                    </div>
                  </div>
                  <div>
                    {lbl('Umístění / parcela')}
                    <input type="text" className="btn" style={inp} placeholder="parc. č. 123/4" value={formData.landLocation} onChange={e => set('landLocation', e.target.value)} />
                  </div>
                </div>
              ) : type === 'vehicle' && (
                <div>
                  {lbl('SPZ')}
                  <input type="text" className="btn" style={inp} placeholder="1C2 3456" value={formData.plate} onChange={e => set('plate', e.target.value)} />
                </div>
              )}
              <div>
                {lbl(type === 'service' ? 'Popis služby / poznámka' : 'Poznámka')}
                <textarea className="btn" style={{ ...inp, height: 70, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} value={formData.note} onChange={e => set('note', e.target.value)} />
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

        </form>
    </DialogShell>
  )
}
