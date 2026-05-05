import React, { useState } from 'react'
import { useApp } from '../AppContext.jsx'


// ── Pomocná komponenta: selector subjektů ────────────────────────────────────
function SubjectSelector({ subjects, active, onSelect, label = 'Vyberte subjekt' }) {
  const cols = subjects.length <= 5 ? 'repeat(auto-fill, minmax(160px, 1fr))' : 'repeat(3, 1fr)'
  return (
    <div style={{ background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 16, padding: 12, marginBottom: 24 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10, paddingLeft: 4 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 6 }}>
        {subjects.map(sub => {
          const isActive = active === sub
          const sub2 = sub.includes('\u2013') ? sub.split('\u2013').slice(1).join('\u2013').trim() : sub
          const group = sub.includes(' – ') ? sub.split(' – ')[0] : ''
          return (
            <button key={sub} onClick={() => onSelect(sub)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              padding: '8px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
              border: isActive ? '2px solid var(--accent)' : '1.5px solid var(--border)',
              background: isActive ? 'linear-gradient(135deg, #0A3D2B 0%, #1A8A62 100%)' : 'var(--bg)',
              boxShadow: isActive ? '0 4px 14px rgba(18,101,74,0.30)' : 'none',
              transition: 'all 0.15s ease',
            }}>
              {group && (
                <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2, whiteSpace: 'nowrap' }}>
                  {group}
                </span>
              )}
              <span style={{ fontSize: 14, fontWeight: isActive ? 700 : 600, color: isActive ? '#fff' : 'var(--text)', lineHeight: 1.3, whiteSpace: 'nowrap' }}>
                {sub2}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}


export default function Maintenance() {
  const { revisions = [], assets = [], addRevision, deleteRevision, mainObjects = [] } = useApp()
  const [showForm, setShowForm] = useState(false)
  
  // Zvolená firma pro filtraci zobrazení (výchozí "Vše")
  const [activeSub, setActiveSub] = useState(mainObjects[0] || '')
  
  // Stavy pro nový formulář
  const [newSubject, setNewSubject] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newAssetId, setNewAssetId] = useState('')
  const [newLastDate, setNewLastDate] = useState('')
  const [newInterval, setNewInterval] = useState('12')

  const calculateNextDate = (lastDateStr, intervalMonths) => {
    if (!lastDateStr) return null
    try {
      const parts = lastDateStr.split('.').map(p => p.trim())
      if (parts.length === 3) {
        const lastDate = new Date(parts[2], parts[1] - 1, parts[0])
        lastDate.setMonth(lastDate.getMonth() + parseInt(intervalMonths))
        return lastDate
      }
    } catch (e) { return null }
    return null
  }

  const getStatus = (nextDate) => {
    if (!nextDate) return { color: '#94A3B8', label: 'Chyba data', bg: '#F1F5F9' }
    const today = new Date()
    const diff = (nextDate - today) / (1000 * 60 * 60 * 24)
    if (diff < 0) return { color: '#DC2626', label: 'Propadlé', bg: '#FEF2F2' }
    if (diff < 60) return { color: '#EA580C', label: 'Blíží se', bg: '#FFF7ED' }
    return { color: '#16A34A', label: 'V pořádku', bg: '#F0FDF4' }
  }

  const enrichedRevisions = revisions.map(r => {
    const nextDate = calculateNextDate(r.lastDate, r.interval)
    return { ...r, nextDate, status: getStatus(nextDate) }
  })

  // Filtrace: nejdřív podle subject (nový způsob), fallback přes asset (stará data)
  const filteredRevisions = enrichedRevisions.filter(r => {
    if (r.subject) return r.subject === activeSub
    const asset = assets.find(a => a.id === r.assetId)
    return asset && asset.subject === activeSub
  })

  const stats = {
    urgent: filteredRevisions.filter(r => r.status.label === 'Propadlé').length,
    warning: filteredRevisions.filter(r => r.status.label === 'Blíží se').length,
    ok: filteredRevisions.filter(r => r.status.label === 'V pořádku').length
  }

  const handleSave = () => {
    if (!newSubject || !newTitle || !newLastDate) return alert('Vyplňte všechny povinné údaje.')
    addRevision({
      title: newTitle,
      assetId: null,
      subject: newSubject,
      lastDate: newLastDate,
      interval: parseInt(newInterval)
    })
    setShowForm(false)
    setNewTitle(''); setNewLastDate(''); setNewSubject('')
  }
  
  return (
    <div style={{ paddingBottom: 60 }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <div className="page-title">Revize a údržba</div>
          <div className="page-sub">Přehled o revizích a nutných technických krocích</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Nová revize</button>
      </div>

      <SubjectSelector subjects={mainObjects} active={activeSub} onSelect={setActiveSub} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: 24, borderRadius: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Propadlé</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#DC2626', marginTop: 8 }}>{stats.urgent}</div>
        </div>
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', padding: 24, borderRadius: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#9A3412', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Revize končící za méně než 60 dnů</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#EA580C', marginTop: 8 }}>{stats.warning}</div>
        </div>
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: 24, borderRadius: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px' }}>V pořádku</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#16A34A', marginTop: 8 }}>{stats.ok}</div>
        </div>
      </div>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Typ revize a Předmět</th>
              <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Poslední kontrola</th>
              <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Interval</th>
              <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Příští termín</th>
              <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Stav</th>
            </tr>
          </thead>
          <tbody>
            {filteredRevisions.length > 0 ? filteredRevisions.map(r => {
              const asset = assets.find(a => a.id === r.assetId)
              const locationLabel = r.subject || (asset ? `${asset.subject} — ${asset.unit}` : '—')
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border2)', transition: '0.2s' }}>
                  <td style={{ padding: '18px 24px' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{r.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{locationLabel}</div>
                  </td>
                  <td style={{ padding: '18px 24px', fontSize: 14, color: 'var(--text)' }}>{r.lastDate}</td>
                  <td style={{ padding: '18px 24px', fontSize: 14, color: 'var(--text2)' }}>
                    {r.interval >= 12 ? `${r.interval / 12} rok/y` : `${r.interval} měsíců`}
                  </td>
                  <td style={{ padding: '18px 24px', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                    {r.nextDate ? r.nextDate.toLocaleDateString('cs-CZ') : '—'}
                  </td>
                  <td style={{ padding: '18px 24px', textAlign: 'right' }}>
                    <span style={{ 
                      padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      background: r.status.bg, color: r.status.color, border: `1px solid ${r.status.color}40`
                    }}>
                      {r.status.label}
                    </span>
                    <button onClick={() => deleteRevision(r.id)} style={{ marginLeft: 12, background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>🗑️</button>
                  </td>
                </tr>
              )
            }) : (
              <tr><td colSpan="5" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Zatím zde nemáš evidované žádné revize.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg)', width: 500, borderRadius: 16, padding: 32, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>Přidat novou revizi</div>
            
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Objekt / Budova</label>
              <select className="btn" style={{ width: '100%', textAlign: 'left' }} value={newSubject} onChange={e => setNewSubject(e.target.value)}>
                <option value="">-- Vyberte objekt --</option>
                {mainObjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Název revize (např. Plynový kotel)</label>
              <input type="text" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }} value={newTitle} onChange={e => setNewTitle(e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Poslední kontrola (DD.MM.RRRR)</label>
                <input type="text" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }} placeholder="např. 15.04.2025" value={newLastDate} onChange={e => setNewLastDate(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Opakování</label>
                <select className="btn" style={{ width: '100%', textAlign: 'left' }} value={newInterval} onChange={e => setNewInterval(e.target.value)}>
                  <option value="6">Každých 6 měsíců</option>
                  <option value="12">1 rok</option>
                  <option value="24">2 roky</option>
                  <option value="36">3 roky</option>
                  <option value="60">5 let</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 32 }}>
              <button className="btn" onClick={() => setShowForm(false)}>Zrušit</button>
              <button className="btn btn-primary" onClick={handleSave}>Uložit revizi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}