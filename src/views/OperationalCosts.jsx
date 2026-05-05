import React, { useState } from 'react'
import { useApp } from '../AppContext.jsx'
import ConfirmDialog from '../ConfirmDialog.jsx'

const CATEGORIES = [
  'Pojištění','Účetní firma','Úklid společných prostor','Údržba objektu',
  'Správa objektu','Daň z nemovitosti','Revize Lamilux','Revize hasící přístroje',
  'Revize výtahu','Revize tepelného čerpadla','Revize kotle',
]

const FREQUENCIES = ['Měsíčně', 'Čtvrtletně', 'Pololetně', 'Ročně']

const FREQ_COLOR = {
  'Měsíčně':    { bg: '#dcfce7', color: '#15803d' },
  'Čtvrtletně': { bg: '#dbeafe', color: '#1d4ed8' },
  'Pololetně':  { bg: '#fef9c3', color: '#854d0e' },
  'Ročně':      { bg: '#f3e8ff', color: '#6b21a8' },
}

// EMPTY_FORM is now created inside component using mainObjects[0]

export default function OperationalCosts() {
  const { operationalCosts = [], addOperationalCost, updateOperationalCost, deleteOperationalCost, isReadOnly, mainObjects = [] } = useApp() || {}
  const [activeObj, setActiveObj] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ objectName: '', category: CATEGORIES[0], amount: '', frequency: 'Ročně', notes: '', vatIncluded: false })
  const [confirmDialog, setConfirmDialog] = useState(null)
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  // Nastaví první objekt po načtení mainObjects z DB
  React.useEffect(() => { if (mainObjects.length > 0 && !activeObj) setActiveObj(mainObjects[0]) }, [mainObjects, activeObj])

  const filtered = operationalCosts.filter(c => c.objectName === activeObj)

  const openAdd = () => { setEditId(null); setForm({ objectName: activeObj, category: CATEGORIES[0], amount: '', frequency: 'Ročně', notes: '', vatIncluded: false }); setShowForm(true) }
  const openEdit = (oc) => {
    setEditId(oc.id)
    setForm({
      objectName: oc.objectName || activeObj,
      category: oc.category || CATEGORIES[0],
      amount: oc.amount?.toString() || '',
      frequency: oc.frequency || 'Ročně',
      notes: oc.notes || '',
      vatIncluded: !!oc.vatIncluded,
    })
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      objectName: form.objectName,
      category: form.category,
      amount: Number(form.amount) || 0,
      frequency: form.frequency,
      periodFrom: null,
      periodTo: null,
      notes: form.notes || null,
      vatIncluded: form.vatIncluded,
    }
    try {
      if (editId) { await updateOperationalCost(editId, payload) } else { await addOperationalCost(payload) }
      setShowForm(false); setEditId(null)
    } catch (err) { alert('Chyba při ukládání: ' + err) }
  }

  const handleDelete = (oc) => {
    setConfirmDialog({
      title: 'Smazat náklad?',
      text: `Opravdu chcete smazat „${oc.category}" pro objekt ${oc.objectName}?`,
      danger: true, okLabel: 'Smazat',
      onOk: async () => { await deleteOperationalCost(oc.id); setConfirmDialog(null) },
      onClose: () => setConfirmDialog(null),
    })
  }

  const freqMult = { 'Měsíčně': 12, 'Čtvrtletně': 4, 'Pololetně': 2, 'Ročně': 1 }

  // Roční netto součet (všechny položky — zadaná částka je vždy bez DPH)
  const annualNetto = filtered.reduce((sum, oc) => {
    return sum + (Number(oc.amount) || 0) * (freqMult[oc.frequency] || 1)
  }, 0)

  // Roční celkové náklady — pro položky s DPH brutto, bez DPH jen netto
  const annualTotal = filtered.reduce((sum, oc) => {
    const base = (Number(oc.amount) || 0) * (freqMult[oc.frequency] || 1)
    return sum + (oc.vatIncluded ? base * 1.21 : base)
  }, 0)

  const lbl = (text, req) => (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
      {text}{req && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
    </label>
  )

  return (
    <div style={{ paddingBottom: 60 }}>
      {confirmDialog && <ConfirmDialog title={confirmDialog.title} text={confirmDialog.text} danger={confirmDialog.danger} okLabel={confirmDialog.okLabel} onOk={confirmDialog.onOk} onClose={confirmDialog.onClose} />}

      <div className="page-header">
        <div>
          <div className="page-title">Provozní náklady</div>
          <div className="page-sub">Přehled provozních nákladů na režii objektů</div>
        </div>
        {!isReadOnly && <button className="btn btn-primary" onClick={openAdd}>+ Přidat náklad</button>}
      </div>

      {/* Selector subjektů */}
      <div style={{ background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 16, padding: 12, marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10, paddingLeft: 4 }}>Vyberte objekt</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
          {mainObjects.map(obj => {
            const isActive = activeObj === obj
            const group = obj.includes(' – ') ? obj.split(' – ')[0] : ''
            const sub2 = obj.includes('–') ? obj.split('–').slice(1).join('–').trim() : obj
            return (
              <button key={obj} onClick={() => setActiveObj(obj)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                padding: '8px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                border: isActive ? '2px solid var(--accent)' : '1.5px solid var(--border)',
                background: isActive ? 'linear-gradient(135deg, #0A3D2B 0%, #1A8A62 100%)' : 'var(--bg)',
                boxShadow: isActive ? '0 4px 14px rgba(18,101,74,0.30)' : 'none',
                transition: 'all 0.15s ease',
              }}>
                {group && <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>{group}</span>}
                <span style={{ fontSize: 14, fontWeight: isActive ? 700 : 600, color: isActive ? '#fff' : 'var(--text)', lineHeight: 1.3, whiteSpace: 'nowrap' }}>{sub2}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Souhrn */}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>Počet položek</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{filtered.length}</div>
          </div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>Roční náklady bez DPH</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--price-netto)' }}>{annualNetto.toLocaleString('cs-CZ')} Kč</div>
          </div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>Roční náklady celkem</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--price-brutto)' }}>{annualTotal.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</div>
          </div>
        </div>
      )}

      {/* Seznam */}
      {filtered.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏗️</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Žádné provozní náklady</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Pro objekt {activeObj} zatím nejsou evidovány žádné náklady.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(oc => {
            const fc = FREQ_COLOR[oc.frequency] || { bg: 'var(--bg2)', color: 'var(--text2)' }
            const amount = Number(oc.amount) || 0
            const amountBrutto = amount * 1.21
            const catIcon = {
              'Pojištění': '🛡️', 'Účetní firma': '📊', 'Úklid společných prostor': '🧹',
              'Údržba objektu': '🔧', 'Správa objektu': '🏢', 'Daň z nemovitosti': '🏛️',
              'Revize Lamilux': '☀️', 'Revize hasící přístroje': '🧯',
              'Revize výtahu': '🛗', 'Revize tepelného čerpadla': '♨️', 'Revize kotle': '🔥',
            }[oc.category] || '📋'
            const catColor = {
              'Pojištění': '#2563eb', 'Účetní firma': '#7c3aed', 'Úklid společných prostor': '#0891b2',
              'Údržba objektu': '#d97706', 'Správa objektu': '#059669', 'Daň z nemovitosti': '#dc2626',
              'Revize Lamilux': '#f59e0b', 'Revize hasící přístroje': '#ef4444',
              'Revize výtahu': '#6366f1', 'Revize tepelného čerpadla': '#0ea5e9', 'Revize kotle': '#f97316',
            }[oc.category] || 'var(--accent)'
            return (
              <div key={oc.id} style={{
                background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12,
                display: 'flex', alignItems: 'stretch', overflow: 'hidden',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}>
                <div style={{ width: 4, background: catColor, flexShrink: 0 }} />
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', background: catColor + '12', flexShrink: 0 }}>
                  <span style={{ fontSize: 22 }}>{catIcon}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0, padding: '13px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{oc.category}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: fc.bg, color: fc.color }}>{oc.frequency}</span>
                  </div>
                  {oc.notes && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>📝 {oc.notes}</div>}
                  <div style={{ fontSize: 11, color: catColor, fontWeight: 600, marginTop: 4, opacity: 0.8 }}>
                    {oc.objectName}
                  </div>
                </div>
                {/* Částka — podmíněně s/bez DPH */}
                <div style={{ textAlign: 'right', padding: '13px 16px', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  {oc.vatIncluded ? (
                    <>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--price-netto)' }}>{amount.toLocaleString('cs-CZ')} Kč</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>bez DPH</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--price-brutto)' }}>{amountBrutto.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>s DPH 21 %</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{amount.toLocaleString('cs-CZ')} Kč</div>
                  )}
                </div>
                {!isReadOnly && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center', padding: '8px 12px 8px 0', flexShrink: 0 }}>
                    <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => openEdit(oc)}>Upravit</button>
                    <button className="btn" style={{ padding: '4px 10px', fontSize: 12, color: '#dc2626' }} onClick={() => handleDelete(oc)}>Smazat</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Formulář */}
      {showForm && (
        <>
          <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, backdropFilter: 'blur(3px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--bg)', borderRadius: 16, width: '100%', maxWidth: 480, zIndex: 1001, boxShadow: '0 32px 64px -12px rgba(0,0,0,0.25)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#0A3D2B 0%,#12654A 60%,#1A8A62 100%)', padding: '20px 24px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{editId ? 'Upravit náklad' : 'Nový provozní náklad'}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', marginTop: 2 }}>{form.objectName}</div>
                </div>
                <button onClick={() => setShowForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  {lbl('Objekt')}
                  <select className="btn" style={{ width: '100%', cursor: 'pointer' }} value={form.objectName} onChange={e => set('objectName', e.target.value)}>
                    {mainObjects.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  {lbl('Kategorie nákladu', true)}
                  <select className="btn" style={{ width: '100%', cursor: 'pointer' }} value={form.category} onChange={e => set('category', e.target.value)} required>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    {lbl('Částka (Kč)', true)}
                    <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }} min="0" value={form.amount} onChange={e => set('amount', e.target.value)} required />
                    {form.vatIncluded && Number(form.amount) > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                        s DPH 21 %: <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{(Number(form.amount) * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                      </div>
                    )}
                  </div>
                  <div>
                    {lbl('Frekvence')}
                    <select className="btn" style={{ width: '100%', cursor: 'pointer' }} value={form.frequency} onChange={e => set('frequency', e.target.value)}>
                      {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                </div>

                {/* DPH checkbox */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={form.vatIncluded}
                      onChange={e => set('vatIncluded', e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Fakturováno s DPH 21 %</span>
                  </label>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, paddingLeft: 26 }}>
                    Zadaná částka je bez DPH. S DPH se zobrazí automaticky.
                  </div>
                </div>

                <div>
                  {lbl('Poznámka')}
                  <input type="text" className="btn" style={{ width: '100%', cursor: 'text' }} placeholder="Volitelná poznámka…" value={form.notes} onChange={e => set('notes', e.target.value)} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                  <button type="button" className="btn" onClick={() => setShowForm(false)}>Zrušit</button>
                  <button type="submit" className="btn btn-primary">{editId ? '✓ Uložit změny' : '✓ Přidat náklad'}</button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
