import React, { useState, useEffect } from 'react'
import { useApp } from './AppContext.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import { open as dialogOpen } from '@tauri-apps/api/dialog'
import { readBinaryFile, writeBinaryFile, createDir } from '@tauri-apps/api/fs'
import { appDataDir, join } from '@tauri-apps/api/path'
import { open as shellOpen } from '@tauri-apps/api/shell'


const TYPE_META = {
  tenant:      { headerClass: 'modal-header-tenant',   icon: '👤', label: 'Karta nájemce' },
  residential: { headerClass: 'modal-header-residential', icon: '🏠', label: 'Bytová jednotka' },
  commercial:  { headerClass: 'modal-header-commercial',  icon: '🏢', label: 'Komerční prostor' },
  ads:         { headerClass: 'modal-header-ads',        icon: '📢', label: 'Reklamní plocha' },
  parking:     { headerClass: 'modal-header-parking',    icon: '🅿️', label: 'Parkovací místo' },
  ostatni:     { headerClass: 'modal-header-ostatni',    icon: '📋', label: 'Ostatní' },
  contract:    { headerClass: 'modal-header-contract',   icon: '📄', label: 'Detail smlouvy' },
}

export default function DetailPanel({ type, id, onClose, onOpen }) {
  const { tenants = [], assets = [], contracts = [], documents = [], payments = [], updateTenant, updateAsset, updateContract, addDocument, deleteDocument, addPayment, deletePayment, deleteTenant, deleteAsset, deleteContract, archiveTenant, archiveAsset, archiveContract, addAsset, addAmendment, deleteAmendment, isReadOnly, subjectData = [], subjects = [], subjectGroups = [], billingGroups = [], parkingBillingOptions = [], adsBillingOptions = [] } = useApp()

  const SEP = ' – '
  const PREDEFINED_TAGS = [
    // Sekce z bytových a komerčních subjektů (adresy/typy bez firemního prefixu)
    ...subjectData.filter(s => s.assetType === 'residential' || s.assetType === 'commercial')
      .map(s => s.name.includes(SEP) ? s.name.split(SEP).slice(1).join(SEP) : null)
      .filter(Boolean),
    // Skupiny pronajímatelů
    ...subjectGroups,
    // Konkrétní subjekty ads/parking s DPH (pro tagování)
    ...subjectData.filter(s => (s.assetType === 'ads' || s.assetType === 'parking') && s.isVatPayer).map(s => s.name),
    // Generické tagy
    'Byt', 'Kancelář', 'Obchod', 'Sklad', 'Parkovací staní',
  ]
  
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({})
  const [customTagInput, setCustomTagInput] = useState('')
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [closing, setClosing] = useState(false)

  const [docForm, setDocForm] = useState(false)
  const [docName, setDocName] = useState('')
  const [docCategory, setDocCategory] = useState('Smlouva')
  const [pickedFile, setPickedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [payForm, setPayForm] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState('')
  const [amendForm, setAmendForm] = useState(false)
  const [amendData, setAmendData] = useState({ effectiveFrom: '', rent: '', deposit: '', depositWater: '', flatFee: '', parking: '', note: '' })

  // Helper: vrátí platné finanční hodnoty smlouvy k dnešnímu datu (respektuje amendments)
  const effectiveToday = (c) => {
    const base = {
      rent: Number(c.rent) || 0,
      deposit: Number(c.deposit) || 0,
      depositWater: Number(c.depositWater) || 0,
      flatFee: Number(c.flatFee) || 0,
      parking: Number(c.parking) || 0,
    }
    if (!c.amendments || c.amendments.length === 0) return base
    const now = new Date()
    const todayTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const vals = { ...base }
    for (const a of c.amendments) {
      const parts = (a.effectiveFrom || '').split('.').map(p => p.trim())
      if (parts.length !== 3) continue
      const aDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime()
      if (aDate > todayTs) break
      if (a.rent        !== null && a.rent        !== undefined) vals.rent        = Number(a.rent)
      if (a.deposit     !== null && a.deposit     !== undefined) vals.deposit     = Number(a.deposit)
      if (a.depositWater !== null && a.depositWater !== undefined) vals.depositWater = Number(a.depositWater)
      if (a.flatFee     !== null && a.flatFee     !== undefined) vals.flatFee     = Number(a.flatFee)
      if (a.parking     !== null && a.parking     !== undefined) vals.parking     = Number(a.parking)
    }
    return vals
  }

  // Esc to close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleClose = () => {
    setClosing(true)
    setTimeout(() => onClose(), 160)
  }

  useEffect(() => {
    setIsEditing(false)
    setFormData({})
    setCustomTagInput('')
    setDocForm(false)
    setDocName('')
    setPayForm(false)
    setPayAmount('')
    setPayDate(new Date().toISOString().split('T')[0]) // defaultně dnešek ve formátu pro <input type="date">
  }, [id, type])

  const handleAddTag = (tagToAdd) => {
    const trimmed = tagToAdd.trim()
    if (!trimmed) return
    if (!formData.tags.includes(trimmed)) {
      setFormData(prev => ({ ...prev, tags: [...prev.tags, trimmed] }))
    }
    setCustomTagInput('')
  }

  const handleRemoveTag = (tagToRemove) => {
    setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tagToRemove) }))
  }

  // --- SPOLEČNÁ FUNKCE PRO DOKUMENTY ---
  const processFilePath = async (filePath) => {
    if (!filePath || typeof filePath !== 'string') return
    const parts = filePath.replace(/\\/g, '/').split('/')
    const filename = parts[parts.length - 1]
    const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : 'pdf'
    setPickedFile({ srcPath: filePath, filename, ext })
    if (!docName) setDocName(filename.replace(/\.[^.]+$/, ''))
  }

  const handlePickFile = async () => {
    try {
      const selected = await dialogOpen({ multiple: false, title: 'Vyberte soubor' })
      if (selected && typeof selected === 'string') await processFilePath(selected)
    } catch (e) { console.error(e) }
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      const file = files[0]
      const filePath = file.path || null
      if (filePath) {
        await processFilePath(filePath)
      } else {
        const reader = new FileReader()
        reader.onload = (ev) => {
          const filename = file.name
          const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : 'pdf'
          setPickedFile({ srcPath: null, filename, ext, arrayBuffer: ev.target.result })
          if (!docName) setDocName(filename.replace(/\.[^.]+$/, ''))
        }
        reader.readAsArrayBuffer(file)
      }
    }
  }

  const handleAddDoc = async (defaultSubject) => {
    if (!pickedFile) return
    setUploading(true)
    try {
      const appData = await appDataDir()
      const docsDir = await join(appData, 'rentflow', 'documents')
      await createDir(docsDir, { recursive: true })
      const safeName = `${Date.now()}_${pickedFile.filename}`
      const destPath = await join(docsDir, safeName)
      let content
      if (pickedFile.srcPath) {
        content = await readBinaryFile(pickedFile.srcPath)
      } else if (pickedFile.arrayBuffer) {
        content = new Uint8Array(pickedFile.arrayBuffer)
      }
      await writeBinaryFile(destPath, content)
      addDocument({
        name: docName || pickedFile.filename.replace(/\.[^.]+$/, ''),
        type: docCategory,
        subject: defaultSubject || 'Neznámá firma',
        ext: pickedFile.ext,
        relatedId: safeName,
        relatedType: 'file',
        contractLinkId: id,
        contractLinkType: type
      })
      setDocName('')
      setPickedFile(null)
      setDocForm(false)
    } catch (e) {
      console.error(e)
      alert('Chyba při nahrávání souboru: ' + e)
    } finally {
      setUploading(false)
    }
  }

  const getExtColor = (ext) => {
    if (ext === 'pdf') return '#EF4444'
    if (['doc','docx'].includes(ext)) return '#2563EB'
    if (['xls','xlsx'].includes(ext)) return '#16A34A'
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) return '#D97706'
    return '#6B7280'
  }
  const getExtLabel = (ext) => {
    if (!ext) return 'FILE'
    return ext.toUpperCase().slice(0, 4)
  }

  const renderDocsSection = (defaultSubject) => {
    const entityDocs = documents.filter(d => d.contractLinkId === id || d.relatedId === id)

    return (
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginTop: 0 }}>
        <div style={{ background: 'linear-gradient(135deg, #12654A 0%, #1A8A62 100%)', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.92)', letterSpacing: '0.8px' }}>📎 Související dokumenty</span>
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: 11, padding: '3px 10px' }}
            onClick={() => { setDocForm(!docForm); setPickedFile(null); setDocName('') }}>
            {docForm ? 'Zrušit' : '+ Nahrát'}
          </button>
        </div>
        <div style={{ padding: '12px 16px' }}>
          {docForm && (
            <div style={{ background: 'var(--bg2)', padding: 12, borderRadius: 8, marginBottom: 12, border: '1px solid var(--border)' }}>
              {/* Drop zone / file picker */}
              {pickedFile ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, marginBottom: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: getExtColor(pickedFile.ext), fontWeight: 800, fontSize: 9, flexShrink: 0 }}>
                    {getExtLabel(pickedFile.ext)}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pickedFile.filename}</div>
                  </div>
                  <button type="button" className="btn btn-sm" style={{ flexShrink: 0, fontSize: 11 }} onClick={handlePickFile}>Změnit</button>
                </div>
              ) : (
                <div
                  onDrop={handleDrop}
                  onDragOver={e => e.preventDefault()}
                  onClick={handlePickFile}
                  style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: '16px 12px', textAlign: 'center', cursor: 'pointer', marginBottom: 8, color: 'var(--text3)', fontSize: 12, userSelect: 'none' }}
                >
                  📂 Přetáhněte soubor sem nebo <span style={{ color: 'var(--accent)', fontWeight: 600 }}>klikněte pro výběr</span>
                </div>
              )}
              <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left', marginBottom: 8 }} placeholder="Název dokumentu" value={docName} onChange={e => setDocName(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="btn" style={{ flex: 1, textAlign: 'left' }} value={docCategory} onChange={e => setDocCategory(e.target.value)}>
                  <option value="Smlouva">Smlouva</option>
                  <option value="Dodatek k NS">Dodatek k NS</option>
                  <option value="Protokol">Protokol</option>
                  <option value="Faktura">Faktura</option>
                  <option value="Revize">Revize</option>
                  <option value="Půdorys">Půdorys</option>
                  <option value="Půdorys parkovacích stání">Půdorys parkovacích stání</option>
                  <option value="Ostatní">Ostatní</option>
                </select>
                <button className="btn btn-primary" onClick={() => handleAddDoc(defaultSubject)} disabled={!pickedFile || uploading}>
                  {uploading ? 'Nahrávám…' : 'Uložit'}
                </button>
              </div>
            </div>
          )}
          {entityDocs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {entityDocs.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: getExtColor(d.ext || 'pdf'), background: '#FEE2E2', padding: '2px 6px', borderRadius: 4 }}>
                      {getExtLabel(d.ext || 'pdf')}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{d.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{d.uploadedAt} • {d.type}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {d.relatedId && d.relatedType === 'file' && (
                      <button className="btn btn-sm" style={{ padding: '4px 8px', fontSize: 11 }}
                        onClick={async () => {
                          try {
                            const { appDataDir: _appDataDir, join: _join } = await import('@tauri-apps/api/path')
                            const base = await _appDataDir()
                            const fullPath = await _join(base, 'rentflow', 'documents', d.relatedId)
                            await shellOpen(fullPath)
                          } catch(e) { alert('Nelze otevřít: ' + e) }
                        }}>
                        📂 Otevřít
                      </button>
                    )}
                    <button className="btn btn-sm btn-ghost" style={{ color: '#DC2626', padding: '4px 8px' }} onClick={() => deleteDocument(d.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Zatím nejsou připojeny žádné soubory.</div>
          )}
        </div>
      </div>
    )
  }

  // --- NOVÉ: VYKRESLENÍ HISTORIE PLATEB (Jen pro Smlouvy) ---
  const renderPaymentsSection = (contract) => {
    const contractPayments = payments.filter(p => p.contractId === contract.id)
    
    const handleAddPaymentClick = () => {
      if (!payAmount || !payDate) return
      
      const d = new Date(payDate)
      // Tento klíč je zásadní pro to, aby platbu zachytil tvůj Dashboard!
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`
      
      addPayment({
        contractId: contract.id,
        amount: Number(payAmount),
        date: d.toLocaleDateString('cs-CZ'),
        month: monthKey
      })
      
      setPayForm(false)
      setPayAmount('')
    }

    return (
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginTop: 0 }}>
        <div style={{ background: 'linear-gradient(135deg, #12654A 0%, #1A8A62 100%)', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.92)', letterSpacing: '0.8px' }}>💳 Historie plateb</span>
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: 11, padding: '3px 10px' }} onClick={() => {
            setPayForm(!payForm)
            if (!payForm) setPayAmount(contract.rent || 0)
          }}>
            {payForm ? 'Zrušit' : '+ Přidat platbu'}
          </button>
        </div>
        <div style={{ padding: '12px 16px' }}>
          {payForm && (
            <div style={{ background: '#F0FDF4', padding: 12, borderRadius: 8, marginBottom: 12, border: '1px solid #BBF7D0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>Částka (Kč)</label>
                  <input type="number" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text', background: '#fff' }} value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>Datum úhrady</label>
                  <input type="date" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text', background: '#fff' }} value={payDate} onChange={e => setPayDate(e.target.value)} />
                </div>
              </div>
              <button className="btn" style={{ width: '100%', background: '#22C55E', color: '#fff', border: 'none' }} onClick={handleAddPaymentClick}>Uložit platbu</button>
            </div>
          )}
          {contractPayments.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {contractPayments.slice().reverse().map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#16A34A' }}>+ {Number(p.amount).toLocaleString('cs-CZ')} Kč</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>Přijato: {p.date}</div>
                  </div>
                  <button className="btn btn-sm btn-ghost" style={{ color: '#DC2626', padding: '4px 8px' }} onClick={() => deletePayment(p.id)}>✕</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Zatím neevidujeme žádné platby k této smlouvě.</div>
          )}
        </div>
      </div>
    )
  }

  // ── KARTA NÁJEMCE ──
  const renderTenant = () => {
    const t = tenants.find(x => x.id === id)
    if (!t) return <div style={{ padding: '24px 32px' }}>Nájemce nenalezen.</div>
    const activeContracts = contracts.filter(c => c.tenantId === id && c.status === 'active')

    let defaultSubject = billingGroups.find(g => !g.isVatPayer)?.val || ''
    if (activeContracts.length > 0) {
      const relatedAsset = assets.find(a => a.id === activeContracts[0].assetId)
      if (relatedAsset) defaultSubject = relatedAsset.subject
    }

    const handleEditClick = () => {
      setFormData({
        name: t.name || '', phone: t.phone || '', email: t.email || '',
        ico: t.ico || '', dic: t.dic || '', address: t.address || '',
        bankAccount: t.bankAccount || '', tags: t.tags ? [...t.tags] : [],
        contactPerson: t.contactPerson || '', whatsapp: t.whatsapp || '',
        billingEmail: t.billingEmail || '', birthDate: t.birthDate || '', idCard: t.idCard || '',
      })
      setIsEditing(true)
    }

    const handleSave = (e) => {
      e.preventDefault()
      updateTenant(id, { ...t, ...formData })
      setIsEditing(false)
    }

    const isCompany = t.tenantType === 'company'
    const lbl2 = (text) => <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{text}</label>

    if (isEditing) {
      return (
        <form onSubmit={handleSave} style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>Úprava klienta</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8, padding: '6px 10px', background: 'var(--bg2)', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
            {isCompany ? '🏢 Firma' : '👤 Fyzická osoba'}
          </div>

          <div>
            {lbl2(isCompany ? 'Název společnosti *' : 'Jméno a příjmení *')}
            <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required autoFocus />
          </div>

          {isCompany ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  {lbl2('IČ')}
                  <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.ico} onChange={e => setFormData({...formData, ico: e.target.value})} />
                </div>
                <div>
                  {lbl2('DIČ')}
                  <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.dic} onChange={e => setFormData({...formData, dic: e.target.value})} />
                </div>
              </div>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  {lbl2('Kontaktní osoba')}
                  <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.contactPerson} onChange={e => setFormData({...formData, contactPerson: e.target.value})} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>
                  <div>
                    {lbl2('Kontaktní telefon')}
                    <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                  </div>
                  <div>
                    {lbl2('Kontaktní e-mail')}
                    <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                  </div>
                </div>
              </div>
              <div>
                {lbl2('WhatsApp skupina')}
                <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: e.target.value})} />
              </div>
              <div>
                {lbl2('E-mail fakturace')}
                <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.billingEmail} onChange={e => setFormData({...formData, billingEmail: e.target.value})} />
              </div>
              <div>
                {lbl2('Sídlo firmy')}
                <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
              </div>
              <div>
                {lbl2('Bankovní účet společnosti')}
                <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} placeholder="123456789/0800" value={formData.bankAccount} onChange={e => setFormData({...formData, bankAccount: e.target.value})} />
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  {lbl2('Rodné číslo / Datum narození')}
                  <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} placeholder="1. 1. 1980" value={formData.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} />
                </div>
                <div>
                  {lbl2('Číslo OP / pasu')}
                  <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.idCard} onChange={e => setFormData({...formData, idCard: e.target.value})} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  {lbl2('Kontaktní telefon')}
                  <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                </div>
                <div>
                  {lbl2('Kontaktní e-mail')}
                  <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                </div>
              </div>
              <div>
                {lbl2('Trvalé bydliště')}
                <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
              </div>
              <div>
                {lbl2('Bankovní účet')}
                <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} placeholder="123456789/0800" value={formData.bankAccount} onChange={e => setFormData({...formData, bankAccount: e.target.value})} />
              </div>
            </>
          )}

          <div style={{ marginTop: 8, padding: 12, background: 'var(--bg2)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12 }}>Správa Tagů</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {formData.tags && formData.tags.length > 0 ? formData.tags.map(tag => (
                <span key={tag} className="badge" style={{ background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6, paddingRight: 6 }}>
                  {tag}
                  <div onClick={() => handleRemoveTag(tag)} style={{ cursor: 'pointer', background: 'rgba(0,0,0,0.1)', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 'bold' }}>✕</div>
                </span>
              )) : <span style={{ fontSize: 12, color: 'var(--text3)' }}>Zatím žádné tagy.</span>}
            </div>
            <select className="btn" style={{ width: '100%', cursor: 'pointer', textAlign: 'left', marginBottom: 8, padding: '8px 12px' }} value="" onChange={(e) => { if (e.target.value) handleAddTag(e.target.value) }}>
              <option value="">+ Vybrat předpřipravený tag...</option>
              {PREDEFINED_TAGS.map(tag => {
                const isSelected = formData.tags.includes(tag)
                return <option key={tag} value={tag} disabled={isSelected}>{isSelected ? `✓ ${tag}` : tag}</option>
              })}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" className="btn" style={{ flex: 1, cursor: 'text', textAlign: 'left' }} placeholder="Nebo napište vlastní tag..." value={customTagInput} onChange={e => setCustomTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(customTagInput) } }} />
              <button type="button" className="btn" onClick={() => handleAddTag(customTagInput)}>Přidat</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => setIsEditing(false)}>Zrušit</button>
            <button type="submit" className="btn btn-primary">Uložit změny</button>
          </div>
        </form>
      )
    }

    return (
      <div style={{ padding: '24px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -20, position: 'relative', zIndex: 2 }}>
          {!isReadOnly && <button className="btn btn-sm" onClick={handleEditClick}>Upravit</button>}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: t.avatarBg || 'var(--bg3)', color: t.avatarColor || 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 }}>
            {t.initials || t.name.substring(0,2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Přidán: {t.added}</div>
          </div>
        </div>

        {t.tags && t.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 }}>
            {t.tags.map(tag => <span key={tag} className="badge" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>{tag}</span>)}
          </div>
        )}

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)' }}>Kontaktní údaje</div>
              {t.tenantType && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: isCompany ? '#EFF6FF' : '#F0FDF4', color: isCompany ? '#1E40AF' : '#166534', border: `1px solid ${isCompany ? '#BFDBFE' : '#BBF7D0'}` }}>
                  {isCompany ? '🏢 Firma' : '👤 Fyzická osoba'}
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
              {isCompany ? (
                <>
                  {t.contactPerson && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>Kontaktní osoba:</span><span style={{ fontWeight: 600 }}>{t.contactPerson}</span></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>Telefon:</span><span style={{ fontWeight: 500 }}>{t.phone || '—'}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>E-mail:</span><span style={{ fontWeight: 500 }}>{t.email || '—'}</span></div>
                  {t.whatsapp && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>WhatsApp:</span><span style={{ fontWeight: 500 }}>{t.whatsapp}</span></div>}
                  {t.billingEmail && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>E-mail fakturace:</span><span style={{ fontWeight: 500 }}>{t.billingEmail}</span></div>}
                  {t.ico && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>IČ:</span><span style={{ fontWeight: 500 }}>{t.ico}</span></div>}
                  {t.dic && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>DIČ:</span><span style={{ fontWeight: 500 }}>{t.dic}</span></div>}
                  {t.address && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>Sídlo firmy:</span><span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{t.address}</span></div>}
                  {t.bankAccount && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>Bankovní účet:</span><span style={{ fontWeight: 500 }}>{t.bankAccount}</span></div>}
                </>
              ) : (
                <>
                  {t.birthDate && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>Rodné číslo / Datum narození:</span><span style={{ fontWeight: 500 }}>{t.birthDate}</span></div>}
                  {t.idCard && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>Číslo OP / pasu:</span><span style={{ fontWeight: 500 }}>{t.idCard}</span></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>Telefon:</span><span style={{ fontWeight: 500 }}>{t.phone || '—'}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>E-mail:</span><span style={{ fontWeight: 500 }}>{t.email || '—'}</span></div>
                  {t.address && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>Trvalé bydliště:</span><span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{t.address}</span></div>}
                  {t.bankAccount && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>Bankovní účet:</span><span style={{ fontWeight: 500 }}>{t.bankAccount}</span></div>}
                </>
              )}
              {/* Fallback pro starší záznamy bez tenantType */}
              {!t.tenantType && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>Telefon:</span><span style={{ fontWeight: 500 }}>{t.phone || '—'}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>E-mail:</span><span style={{ fontWeight: 500 }}>{t.email || '—'}</span></div>
                  {t.ico && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>IČO:</span><span style={{ fontWeight: 500 }}>{t.ico}</span></div>}
                  {t.dic && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>DIČ:</span><span style={{ fontWeight: 500 }}>{t.dic}</span></div>}
                  {t.address && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>Adresa:</span><span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{t.address}</span></div>}
                  {t.bankAccount && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>Bankovní účet:</span><span style={{ fontWeight: 500 }}>{t.bankAccount}</span></div>}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12 }}>Aktivní smlouvy ({activeContracts.length})</div>
            {activeContracts.length > 0 && (() => {
              const calcRents = activeContracts.reduce((acc, c) => {
                const asset = assets.find(a => a.id === c.assetId)
                const effSub = c.billingSubject || asset?.subject || ''
                const isBurger = billingGroups.find(g => !g.isVatPayer && effSub.startsWith(g.val)) !== undefined
                const isResidential = asset?.type === 'residential'
                const pLen = { 'Čtvrtletně': 3, 'Pololetně': 6, 'Ročně': 12 }[c.paymentFrequency] || 1
                const rent = ((effectiveToday(c).rent) + (isResidential && c.parking > 0 ? (effectiveToday(c).parking) : 0) + (effectiveToday(c).flatFee)) / pLen
                if (isBurger) acc.burger += rent
                else if (isResidential) acc.metroNoDph += rent
                else acc.metroDph += rent
                return acc
              }, { metroDph: 0, metroNoDph: 0, burger: 0 })
              calcRents.metro = calcRents.metroDph + calcRents.metroNoDph
              const showBoth = calcRents.metro > 0 && calcRents.burger > 0
              return (
                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                  {calcRents.metro > 0 && (
                    <div style={{ flex: 1, minWidth: 160, background: '#F0FDFA', border: '1px solid #5EEAD4', borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#0F766E', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>{subjectGroups.find(g => billingGroups.find(b => b.val === g)?.isVatPayer && subjects.some(s => s.includes(' – ') && s.startsWith(g)))}</div>
                      {calcRents.metroDph > 0 && (
                        <>
                          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--price-netto)' }}>{calcRents.metroDph.toLocaleString('cs-CZ')} <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)' }}>Kč bez DPH</span></div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--price-brutto)' }}>{(calcRents.metroDph * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč s DPH 21 %</div>
                        </>
                      )}
                      {calcRents.metroNoDph > 0 && (
                        <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--price-netto)', marginTop: calcRents.metroDph > 0 ? 4 : 0 }}>{calcRents.metroNoDph.toLocaleString('cs-CZ')} <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)' }}>Kč</span></div>
                      )}
                    </div>
                  )}
                  {calcRents.burger > 0 && (
                    <div style={{ flex: 1, minWidth: 160, background: '#FAF5FF', border: '1px solid #C4B5FD', borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>{billingGroups.find(g => !g.isVatPayer)?.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: '#7C3AED' }}>{calcRents.burger.toLocaleString('cs-CZ')} <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)' }}>Kč</span></div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>neplátce DPH</div>
                    </div>
                  )}
                </div>
              )
            })()}
            {activeContracts.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text3)' }}>Tento kontakt aktuálně nic nepronajímá.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(() => {
                  const typeIcon  = { residential: '🏠', commercial: '🏢', ads: '📢', parking: '🅿️', ostatni: '📄' }
                  const typeLabel = { residential: 'Bytová jednotka', commercial: 'Komerční prostor', ads: 'Reklamní plocha', parking: 'Parkovací stání', ostatni: 'Ostatní' }
                  const typeColor = { residential: '#166534', commercial: '#5B21B6', ads: '#C2410C', parking: '#0B509E', ostatni: '#0F766E' }
                  const typeBg    = { residential: '#F0FDF4', commercial: '#F5F3FF', ads: '#FFF7ED', parking: '#EFF6FF', ostatni: '#F0FDFA' }
                  const typeBdr   = { residential: '#BBF7D0', commercial: '#DDD6FE', ads: '#FED7AA', parking: '#BFDBFE', ostatni: '#99F6E4' }
                  const displayItems = []
                  const seenGroups = new Set()
                  for (const c of activeContracts) {
                    if (c.groupLabel) {
                      if (!seenGroups.has(c.groupLabel)) {
                        seenGroups.add(c.groupLabel)
                        displayItems.push({ kind: 'group', label: c.groupLabel, contracts: activeContracts.filter(x => x.groupLabel === c.groupLabel) })
                      }
                    } else {
                      displayItems.push({ kind: 'single', contract: c })
                    }
                  }
                  return displayItems.map((item, idx) => {
                    if (item.kind === 'group') {
                      const totalRent = item.contracts.reduce((s, c) => s + effectiveToday(c).rent, 0)
                      const firstC = item.contracts[0]
                      const firstAsset = assets.find(a => a.id === firstC?.assetId)
                      const effSub = firstC?.billingSubject || firstAsset?.subject || ''
                      const groupDph = firstC?.vatExempt === 2 ? true : firstC?.vatExempt === 1 ? false : (billingGroups.find(g => effSub.startsWith(g.val))?.isVatPayer ?? true)
                      const groupAssetType = firstAsset?.type || 'parking'
                      const groupIcon = groupAssetType === 'ads' ? '📢' : groupAssetType === 'commercial' ? '🏢' : '🅿️'
                      const groupTypeLabel = groupAssetType === 'ads' ? 'Skupina reklamních ploch' : groupAssetType === 'commercial' ? 'Skupina komerčních prostor' : 'Skupina parkovacích stání'
                      return (
                        <div key={item.label} style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 14, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #BFDBFE' }}>
                            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{groupIcon}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 800, color: '#0B509E' }}>{item.label}</div>
                              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{groupTypeLabel} · {item.contracts.length} smluv</div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--price-netto)' }}>{totalRent.toLocaleString('cs-CZ')} Kč</div>
                              {groupDph && totalRent > 0 && <div style={{ fontSize: 11, color: 'var(--price-brutto)', fontWeight: 600 }}>{(totalRent * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč s DPH</div>}
                              <div style={{ fontSize: 10, color: 'var(--text3)' }}>celkem/měs.</div>
                            </div>
                          </div>
                          <div style={{ padding: '8px 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {item.contracts.map(c => {
                              const asset = assets.find(a => a.id === c.assetId)
                              const rent = effectiveToday(c).rent
                              return (
                                <div key={c.id} style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.6)', borderRadius: 8, cursor: 'pointer', border: '1px solid #BFDBFE' }}
                                  onClick={() => onOpen('contract', c.id)}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0B509E' }}>{asset?.unit || '?'}</div>
                                      {(c.start || c.end) && <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{c.start || '—'} → {c.end || 'neurčito'}</div>}
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--price-netto)' }}>{rent.toLocaleString('cs-CZ')} Kč</div>
                                      {groupDph && rent > 0 && <div style={{ fontSize: 10.5, color: 'var(--price-brutto)', fontWeight: 600 }}>{(rent * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč s DPH</div>}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    }
                    const c = item.contract
                    const asset = assets.find(a => a.id === c.assetId)
                    const aType = asset?.type || 'residential'
                    const col = typeColor[aType] || 'var(--text)'
                    const bg  = typeBg[aType]  || 'var(--bg2)'
                    const bdr = typeBdr[aType] || 'var(--border)'
                  const effectiveSub = c.billingSubject || asset?.subject || ''
                  const isDphSubject = c.vatExempt === 2 ? true : c.vatExempt === 1 ? false : (billingGroups.find(g => effectiveSub.startsWith(g.val))?.isVatPayer ?? true)
                  const showDph = (aType === 'commercial' || aType === 'ads' || aType === 'parking' || aType === 'ostatni') && isDphSubject
                  const _eff = effectiveToday(c)
                  const rent = _eff.rent + (aType === 'residential' && c.includedParkingSpots > 0 ? _eff.parking : 0)
                  const deposit = _eff.deposit
                  const depositWater = _eff.depositWater
                  return (
                    <div key={c.id}
                      style={{ background: bg, border: `1px solid ${bdr}`, borderRadius: 14, overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
                      onClick={() => onOpen('contract', c.id)}
                      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.1)` }}
                      onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
                    >
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${bdr}`, background: `${bg}` }}>
                        <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{typeIcon[aType] || '📄'}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: col, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset?.unit || 'Neznámý předmět'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{typeLabel[aType]} · {asset?.subject || ''}</div>
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: col, background: 'rgba(255,255,255,0.7)', padding: '3px 10px', borderRadius: 20, border: `1px solid ${bdr}`, flexShrink: 0 }}>Otevřít →</div>
                      </div>
                      {/* Finanční řádky */}
                      <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {/* Nájemné */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>
                            {showDph ? 'Nájemné bez DPH' : 'Nájemné'}
                            {['Čtvrtletně','Pololetně','Ročně'].includes(c.paymentFrequency) && (
                              <span style={{ fontWeight: 400, fontSize: 10, display: 'block', marginTop: 1 }}>
                                {{ 'Čtvrtletně': 'čtvrtletní', 'Pololetně': 'pololetní', 'Ročně': 'roční' }[c.paymentFrequency]}
                              </span>
                            )}
                          </span>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--price-netto)' }}>{rent.toLocaleString('cs-CZ')} Kč</span>
                            {['Čtvrtletně','Pololetně','Ročně'].includes(c.paymentFrequency) && rent > 0 && (() => {
                              const pLen = { 'Čtvrtletně': 3, 'Pololetně': 6, 'Ročně': 12 }[c.paymentFrequency]
                              return <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>= {(rent / pLen).toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} Kč/měs.</div>
                            })()}
                          </div>
                        </div>
                        {showDph && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: 'var(--text3)' }}>s DPH 21 %</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--price-brutto)' }}>{(rent * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                          </div>
                        )}
                        {/* Celkové nájemné za dobu smlouvy */}
                        {c.rentTotal > 0 && ['Čtvrtletně','Pololetně','Ročně'].includes(c.paymentFrequency) && (
                          <>
                            <div style={{ height: 1, background: bdr, margin: '2px 0' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Celkem za dobu smlouvy</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)' }}>{Number(c.rentTotal).toLocaleString('cs-CZ')} Kč</span>
                            </div>
                          </>
                        )}
                        {/* Zálohy energie */}
                        {(aType === 'residential' || aType === 'commercial') && deposit > 0 && (
                          <>
                            <div style={{ height: 1, background: bdr, margin: '2px 0' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>{showDph ? 'Zálohy energie bez DPH' : 'Zálohy energií a služeb'}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--price-netto)' }}>{deposit.toLocaleString('cs-CZ')} Kč</span>
                            </div>
                            {showDph && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: 'var(--text3)' }}>s DPH 21 %</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--price-brutto)' }}>{(deposit * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                              </div>
                            )}
                          </>
                        )}
                        {/* Zálohy voda */}
                        {aType === 'commercial' && showDph && depositWater > 0 && (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>Zálohy voda bez DPH</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--price-netto)' }}>{depositWater.toLocaleString('cs-CZ')} Kč</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: 'var(--text3)' }}>s DPH 12 %</span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--price-brutto)' }}>{(depositWater * 1.12).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                            </div>
                          </>
                        )}
                        {/* Paušální poplatek */}
                        {aType === 'commercial' && _eff.flatFee > 0 && (
                          <>
                            <div style={{ height: 1, background: bdr, margin: '2px 0' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>{showDph ? 'Paušál energií bez DPH' : 'Paušál energií a služeb'}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--price-netto)' }}>{_eff.flatFee.toLocaleString('cs-CZ')} Kč</span>
                            </div>
                            {showDph && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: 'var(--text3)' }}>s DPH 21 %</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--price-brutto)' }}>{(_eff.flatFee * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                              </div>
                            )}
                          </>
                        )}
                        {/* Platnost */}
                        {(c.start || c.end) && (
                          <>
                            <div style={{ height: 1, background: bdr, margin: '2px 0' }} />
                            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                              Platnost: <strong style={{ color: 'var(--text2)' }}>{c.start || '—'}</strong> → <strong style={{ color: 'var(--text2)' }}>{c.end || 'neurčito'}</strong>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )
                  })
                  })()
                }
              </div>
            )}
          </div>
        </div>

        {renderDocsSection(defaultSubject)}

        {!isReadOnly && <div style={{ display: 'flex', gap: 8, marginTop: 24, padding: '16px 0 4px', borderTop: '1px solid var(--border)' }}>
          <button
            className="btn btn-sm"
            style={{ flex: 1, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}
            onClick={() => { archiveTenant(id); onClose() }}
          >
            📦 Archivovat
          </button>
          <button
            className="btn btn-sm"
            style={{ flex: 1, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' }}
            onClick={() => setConfirmDialog({
              title: 'Smazat nájemce?',
              text: `„${t.name}" bude přesunut do koše. Odtud ho lze obnovit.`,
              danger: true, okLabel: 'Přesunout do koše',
              onOk: () => { deleteTenant(id); onClose() }
            })}
          >
            🗑 Přesunout do koše
          </button>
        </div>}

      </div>
    )
  }
  const renderAsset = () => {
    const a = assets.find(x => x.id === id)
    if (!a) return <div style={{ padding: '24px 32px' }}>Předmět nenalezen.</div>
    const activeContract = contracts.find(c => c.assetId === id && c.status === 'active')
    const currentTenant = activeContract ? tenants.find(t => t.id === activeContract.tenantId) : null

    const handleEditClick = () => {
      setFormData({
        unit: a.unit || '', size: a.size || '', floor: a.floor || '',
        format: a.format || '', notes: a.notes || '',
        dueDay: activeContract?.dueDay || '15. den v měsíci',
        dueDayCustom: activeContract?.dueDayCustom || '',
        terminationMonths: activeContract?.terminationMonths || '',
        renewalMethod: activeContract?.renewalMethod || 'Formou dodatku',
        invoiceDue: activeContract?.invoiceDue || '',
        valorizationEnabled: activeContract?.valorizationEnabled || false,
        valorizationDate: activeContract?.valorizationDate || '',
        contractVersion: activeContract?.contractVersion || '',
        occupants: activeContract?.occupants || '',
        permanentResidents: activeContract?.permanentResidents || '',
      })
      setIsEditing(true)
    }

    const handleSave = (e) => {
      e.preventDefault()
      updateAsset(id, formData)
      setIsEditing(false)
    }

    if (isEditing) {
      if (a.type === 'ostatni') {
        return (
          <form onSubmit={handleSave} style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Úprava záznamu</div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Název *</label>
              <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} required autoFocus />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Stručný popis</label>
              <textarea className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left', height: 90, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setIsEditing(false)}>Zrušit</button>
              <button type="submit" className="btn btn-primary">Uložit změny</button>
            </div>
          </form>
        )
      }
      return (
        <form onSubmit={handleSave} style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Úprava parametrů</div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Název jednotky / plochy *</label>
            <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} required autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {(a.type !== 'parking') && (
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Velikost</label>
                <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.size} onChange={e => setFormData({...formData, size: e.target.value})} />
              </div>
            )}
            {a.type === 'residential' || a.type === 'commercial' ? (
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Podlaží</label>
                <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.floor} onChange={e => setFormData({...formData, floor: e.target.value})} />
              </div>
            ) : null}
            {a.type === 'ads' ? (
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Umístění</label>
                <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.format} onChange={e => setFormData({...formData, format: e.target.value})} />
              </div>
            ) : null}
          </div>
          {a.type === 'parking' && (
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Poznámka</label>
              <textarea className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left', height: 80, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                placeholder="Volitelná poznámka k parkovacímu stání…"
                value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} />
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Den splatnosti</label>
            <select className="btn" style={{ width: '100%', cursor: 'pointer', textAlign: 'left' }}
              value={formData.dueDay === 'Vlastní' || formData.dueDay === '15. den v měsíci' || formData.dueDay === 'Dle vystavené faktury' || formData.dueDay === 'Konkrétní datum' ? formData.dueDay : 'Vlastní'}
              onChange={e => setFormData({...formData, dueDay: e.target.value, dueDayCustom: ''})}>
              <option value="15. den v měsíci">15. den v měsíci</option>
              <option value="Dle vystavené faktury">Dle vystavené faktury</option>
              <option value="Konkrétní datum">Konkrétní datum (vždy stejný den v roce)…</option>
              <option value="Vlastní">Vlastní text…</option>
            </select>
            {formData.dueDay === 'Vlastní' && (
              <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left', marginTop: 8 }}
                placeholder="např. 1. den v měsíci" value={formData.dueDayCustom || ''} onChange={e => setFormData({...formData, dueDayCustom: e.target.value})} />
            )}
            {formData.dueDay === 'Konkrétní datum' && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Den a měsíc (rok se ignoruje — platí každý rok):</div>
                <input type="date" className="btn" style={{ width: '100%', cursor: 'pointer', textAlign: 'left' }}
                  value={(() => { const parts = (formData.dueDayCustom || '').replace(/\.$/, '').split('.'); return parts.length >= 2 ? '2000-' + parts[1].trim().padStart(2,'0') + '-' + parts[0].trim().padStart(2,'0') : '2000-01-01' })()}
                  onChange={e => { const [,m,d] = e.target.value.split('-'); setFormData({...formData, dueDayCustom: parseInt(d) + '. ' + parseInt(m) + '.'}) }} />
                {formData.dueDayCustom && <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, marginTop: 5 }}>Splatnost: vždy do {formData.dueDayCustom} daného roku</div>}
              </div>
            )}
          </div>

          <div style={{ padding: '14px 16px', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12, letterSpacing: '0.5px' }}>Podmínky smlouvy</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Výpovědní lhůta</label>
                <select className="btn" style={{ width: '100%', cursor: 'pointer', textAlign: 'left' }} value={formData.terminationMonths || ''} onChange={e => setFormData({...formData, terminationMonths: e.target.value})}>
                  <option value="">— Nevyplněno —</option>
                  {[1,2,3,4,5,6,9,12].map(m => <option key={m} value={m}>{m} {m === 1 ? 'měsíc' : m < 5 ? 'měsíce' : 'měsíců'} před koncem</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Způsob prodloužení smlouvy</label>
                <select className="btn" style={{ width: '100%', cursor: 'pointer', textAlign: 'left' }} value={formData.renewalMethod || 'Formou dodatku'} onChange={e => setFormData({...formData, renewalMethod: e.target.value})}>
                  <option value="Formou dodatku">Formou dodatku</option>
                  <option value="Formou nové smlouvy">Formou nové smlouvy</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Splatnost faktury</label>
                <select className="btn" style={{ width: '100%', cursor: 'pointer', textAlign: 'left' }} value={formData.invoiceDue || 'Do 15. dne v měsíci'} onChange={e => setFormData({...formData, invoiceDue: e.target.value})}>
                  <option value="Do 15. dne v měsíci">Do 15. dne v měsíci</option>
                  <option value="Dle vystavené faktury">Dle vystavené faktury</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: formData.valorizationEnabled ? 10 : 0 }}>
              <input type="checkbox" id="edit-val" checked={!!formData.valorizationEnabled} onChange={e => setFormData({...formData, valorizationEnabled: e.target.checked})} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }} />
              <label htmlFor="edit-val" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>Valorizace nájemného je možná</label>
            </div>
            {formData.valorizationEnabled && (
              <div style={{ marginTop: 8 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Datum poslední valorizace</label>
                <input type="date" className="btn" style={{ width: '100%', cursor: 'pointer', textAlign: 'left' }} value={formData.valorizationDate || ''} onChange={e => setFormData({...formData, valorizationDate: e.target.value})} />
              </div>
            )}
          </div>

          {/* Verze smlouvy + obsazenost — pro bytové jednotky */}
          {a.type === 'residential' && (
            <div style={{ padding: '14px 16px', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12, letterSpacing: '0.5px' }}>Počet osob a trvalé pobyty</div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Verze smlouvy</label>
                <select className="btn" style={{ width: '100%', cursor: 'pointer', textAlign: 'left' }} value={formData.contractVersion || ''} onChange={e => setFormData({...formData, contractVersion: e.target.value})}>
                  <option value="">— Nevyplněno —</option>
                  <option value="Nová verze smlouvy">Nová verze smlouvy</option>
                  <option value="Stará verze smlouvy">Stará verze smlouvy</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Počet osob v bytě</label>
                  <input type="number" min="0" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.occupants || ''} onChange={e => setFormData({...formData, occupants: e.target.value})} placeholder="0" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Z toho s trvalým bydlištěm</label>
                  <input type="number" min="0" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.permanentResidents || ''} onChange={e => setFormData({...formData, permanentResidents: e.target.value})} placeholder="0" />
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => setIsEditing(false)}>Zrušit</button>
            <button type="submit" className="btn btn-primary">Uložit změny</button>
          </div>
        </form>
      )
    }

    return (
      <div style={{ padding: '24px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -20, position: 'relative', zIndex: 2 }}>
          {!isReadOnly && <button className="btn btn-sm" onClick={handleEditClick}>Upravit</button>}
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 4 }}>{a.subject}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{a.unit}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <span className={`badge ${a.status === 'free' ? 'badge-green' : 'badge-gray'}`}>{a.status === 'free' ? 'Volné k pronájmu' : 'Pronajato'}</span>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12 }}>Parametry objektu</div>
            {a.type === 'ostatni' ? (
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                {a.notes
                  ? <span style={{ whiteSpace: 'pre-wrap' }}>{a.notes}</span>
                  : <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>Bez popisu.</span>
                }
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                {a.size && a.type !== 'parking' && <div><div style={{ color: 'var(--text2)', fontSize: 11, marginBottom: 2 }}>
                  {a.type === 'residential' ? 'Dispozice / Plocha' : 'Plocha / Rozměr'}
                </div><div style={{ fontWeight: 600 }}>{a.size}</div></div>}
                {a.floor && <div><div style={{ color: 'var(--text2)', fontSize: 11, marginBottom: 2 }}>Podlaží</div><div style={{ fontWeight: 600 }}>{a.floor}</div></div>}
                {a.format && <div style={{ gridColumn: a.size && a.floor ? '1 / -1' : 'auto' }}><div style={{ color: 'var(--text2)', fontSize: 11, marginBottom: 2 }}>
                  {a.type === 'ads' ? 'Umístění' : a.type === 'parking' ? 'Umístění' : 'Formát'}
                </div><div style={{ fontWeight: 600 }}>{a.format}</div></div>}
                {a.balcony && <div><div style={{ color: 'var(--text2)', fontSize: 11, marginBottom: 2 }}>Balkón / Terasa</div><div style={{ fontWeight: 600 }}>{a.balcony} m²</div></div>}
                {a.commerceType && <div style={{ gridColumn: '1 / -1' }}><div style={{ color: 'var(--text2)', fontSize: 11, marginBottom: 2 }}>Typ provozu</div><div style={{ fontWeight: 600 }}>{a.commerceType}</div></div>}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12 }}>Aktuální stav</div>
            {currentTenant && activeContract ? (
              <div style={{ padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }} onClick={() => onOpen('contract', activeContract.id)}>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Pronajato na klienta:</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{currentTenant.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <span style={{ color: 'var(--text2)' }}>Smlouva do: {activeContract.end}</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent)' }}>Otevřít smlouvu ➔</span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text3)' }}>Předmět je aktuálně volný.</div>
            )}
          </div>
        </div>

        {renderDocsSection(a.subject)}

        {a.type === 'parking' && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)' }}>Poznámka</div>
              </div>
              {a.notes
                ? <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{a.notes}</div>
                : <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Žádná poznámka. Klikni Upravit pro přidání.</div>
              }
            </div>
          </div>
        )}

        {!isReadOnly && <div style={{ display: 'flex', gap: 8, marginTop: 24, padding: '16px 0 4px', borderTop: '1px solid var(--border)' }}>
          <button
            className="btn btn-sm"
            style={{ flex: 1, background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE' }}
            onClick={async () => {
              const newId = await addAsset({
                type: a.type,
                subject: a.subject,
                unit: `${a.unit} (kopie)`,
                size: a.size || '',
                floor: a.floor || '',
                format: a.format || '',
                status: 'free',
                balcony: a.balcony || null,
                commerceType: a.commerceType || null,
                notes: a.notes || null,
              })
              if (newId) { onClose(); setTimeout(() => onOpen('asset', newId), 200) }
            }}
          >
            ⧉ Duplikovat
          </button>
          <button
            className="btn btn-sm"
            style={{ flex: 1, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}
            onClick={() => { archiveAsset(id); onClose() }}
          >
            📦 Archivovat
          </button>
          <button
            className="btn btn-sm"
            style={{ flex: 1, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' }}
            onClick={() => setConfirmDialog({
              title: 'Smazat předmět nájmu?',
              text: `„${a.unit}" bude přesunut do koše. Odtud ho lze obnovit.`,
              danger: true, okLabel: 'Přesunout do koše',
              onOk: () => { deleteAsset(id); onClose() }
            })}
          >
            🗑 Přesunout do koše
          </button>
        </div>}

      </div>
    )
  }

  // ── KARTA SMLOUVY ──
  const renderContract = () => {
    const c = contracts.find(x => x.id === id)
    if (!c) return <div style={{ padding: '24px 32px' }}>Smlouva nenalezena.</div>
    
    const t = tenants.find(x => x.id === c.tenantId)
    const a = assets.find(x => x.id === c.assetId)
    const effectiveSubject = c.billingSubject || a?.subject || ''
    const isDphSubject = c.vatExempt === 2 ? true
      : c.vatExempt === 1 ? false
      : (billingGroups.find(g => effectiveSubject.startsWith(g.val))?.isVatPayer ?? true)
    const isMetropoleParkingAsset = (parkingBillingOptions[0]?.label ? a?.subject === parkingBillingOptions[0].label : false)
    const isMetropoleAdsAsset = (adsBillingOptions[0]?.label ? a?.subject === adsBillingOptions[0].label : false)
    // isDphSubject pro edit formulář (reaguje na živý výběr billingSubject)
    const formEffSub = formData.billingSubject || a?.subject || ''
    const formIsDphSubject = (formData.vatExempt || 0) === 2 ? true
      : (formData.vatExempt || 0) === 1 ? false
      : (billingGroups.find(g => formEffSub.startsWith(g.val))?.isVatPayer ?? true)

    const czToIso = (cz) => {
      if (!cz) return ''
      const parts = cz.split('.').map(p => p.trim())
      if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
      return ''
    }
    const isoToCz = (iso) => {
      if (!iso) return ''
      const [y, m, d] = iso.split('-')
      if (!y || !m || !d) return iso
      return `${parseInt(d)}. ${parseInt(m)}. ${y}`
    }

    const subtractMonthsFromDate = (czDate, months) => {
      const parts = czDate.split('.').map(p => p.trim())
      if (parts.length !== 3) return null
      let d = parseInt(parts[0]) - 1
      let m = parseInt(parts[1]) - 1
      let y = parseInt(parts[2])
      if (d < 1) { m--; if (m < 0) { m = 11; y-- }; d = new Date(y, m + 1, 0).getDate() }
      m -= parseInt(months)
      while (m < 0) { m += 12; y-- }
      const lastDay = new Date(y, m + 1, 0).getDate()
      d = Math.min(d, lastDay)
      return `${d}. ${m + 1}. ${y}`
    }
    const computeTerminationDate = (endCz, months) => {
      if (!endCz || !months) return null
      return subtractMonthsFromDate(endCz, months)
    }

    const handleEditClick = () => {
      setFormData({
        rent: c.rent || 0,
        deposit: c.deposit || 0,
        depositWater: c.depositWater || 0,
        cauce: c.cauce || 0,
        parking: c.parking || 0,
        start: czToIso(c.start),
        end: czToIso(c.end),
        dueDay: (() => {
          const d = c.dueDay || '15. den v měsíci'
          if (d === '15. den v měsíci' || d === 'Dle vystavené faktury') return d
          if (/^\d+\.\s*\d+\.?$/.test(d.trim())) return 'Konkrétní datum'
          return 'Vlastní'
        })(),
        dueDayCustom: (() => {
          const d = c.dueDay || ''
          if (/^\d+\.\s*\d+\.?$/.test(d.trim())) return d  // Konkrétní datum
          if (d === '15. den v měsíci' || d === 'Dle vystavené faktury' || !d) return ''
          return d  // Vlastní text
        })(),
        terminationMonths: c.terminationMonths ? String(c.terminationMonths) : '',
        renewalMethod: c.renewalMethod || 'Formou dodatku',
        valorizationEnabled: !!(c.valorizationEnabled),
        valorizationDate: c.valorizationDate ? czToIso(c.valorizationDate) : '',
        invoiceDue: c.invoiceDue || '',
        contractVersion: c.contractVersion || '',
        occupants: c.occupants != null ? String(c.occupants) : '',
        permanentResidents: c.permanentResidents != null ? String(c.permanentResidents) : '',
        paymentFrequency: c.paymentFrequency || 'Měsíčně',
        calendarYearBilling: !!c.calendarYearBilling,
        coResidents: c.coResidents || '',
        contractNotes: c.contractNotes || '',
        includedParkingEnabled: !!(c.includedParkingSpots && c.includedParkingSpots > 0),
        includedParkingSpots: c.includedParkingSpots ? String(c.includedParkingSpots) : '',
        includedParkingRent: (c.includedParkingSpots > 0 && c.parking) ? String(c.parking) : '',
        billingSubject: (() => {
          // Pro ads/parking assety mimo DPH-plátce billingSubject nemá smysl — vymazat
          if ((a?.type === 'ads' || a?.type === 'parking') && !(adsBillingOptions[0]?.label ? a?.subject?.startsWith(adsBillingOptions[0].label.split(' – ')[0]) : false)) return ''
          return c.billingSubject || ''
        })(),
        vatExempt: c.vatExempt || 0,
        groupLabel: c.groupLabel || '',
        autoRenewalType: c.autoRenewalType || '',
        energySettlements: c.energySettlements ? [...c.energySettlements] : [],
        handoverDate: c.handoverDate ? czToIso(c.handoverDate) : '',
        flatFee: c.flatFee ? String(c.flatFee) : '',
        flatFeeEnabled: !!(c.flatFee && c.flatFee > 0),
        rentTotal: c.rentTotal ? String(c.rentTotal) : '',
      })
      setIsEditing(true)
    }

    const handleSave = (e) => {
      e.preventDefault()
      updateContract(id, { 
        rent: Number(formData.rent), 
        deposit: Number(formData.deposit), 
        depositWater: Number(formData.depositWater) || 0,
        cauce: Number(formData.cauce),
        parking: (a?.type === 'residential' && formData.includedParkingEnabled) ? (Number(formData.includedParkingRent) || 0) : Number(formData.parking || 0),
        start: isoToCz(formData.start), 
        end: isoToCz(formData.end),
        dueDay: (formData.dueDay === 'Vlastní' || formData.dueDay === 'Konkrétní datum') ? formData.dueDayCustom : formData.dueDay,
        terminationMonths: formData.terminationMonths ? parseInt(formData.terminationMonths) : null,
        renewalMethod: formData.renewalMethod || null,
        valorizationEnabled: formData.valorizationEnabled ? 1 : 0,
        valorizationDate: formData.valorizationEnabled && formData.valorizationDate ? isoToCz(formData.valorizationDate) : null,
        invoiceDue: formData.invoiceDue || null,
        contractVersion: formData.contractVersion || null,
        occupants: formData.occupants ? parseInt(formData.occupants) : null,
        permanentResidents: formData.permanentResidents ? parseInt(formData.permanentResidents) : null,
        paymentFrequency: formData.paymentFrequency || null,
        calendarYearBilling: !!(formData.paymentFrequency === 'Ročně' && formData.calendarYearBilling),
        coResidents: formData.coResidents || null,
        contractNotes: formData.contractNotes || null,
        energySettlements: formData.energySettlements || [],
        handoverDate: formData.handoverDate ? isoToCz(formData.handoverDate) : null,
        includedParkingSpots: formData.includedParkingEnabled ? (parseInt(formData.includedParkingSpots) || 0) : 0,
        billingSubject: formData.billingSubject || null,
        vatExempt: formData.vatExempt || 0,
        groupLabel: formData.groupLabel || null,
        autoRenewalType: formData.autoRenewalType || null,
        flatFee: formData.flatFeeEnabled ? (Number(formData.flatFee) || 0) : 0,
        rentTotal: Number(formData.rentTotal) || 0,
      })
      setIsEditing(false)
    }

    if (isEditing) {
      return (
        <form onSubmit={handleSave} style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Úprava smlouvy</div>

          {(isMetropoleParkingAsset || isMetropoleAdsAsset || a?.type === 'ostatni') && (
            <div style={{ padding: '12px 14px', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '0.5px', marginBottom: 10 }}>Pronajímatel</div>
              {a?.type === 'ostatni' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Vyberte, za který subjekt je smlouva uzavírána. Ovlivňuje DPH a zaúčtování příjmů.</div>
                  {[
                    ...billingGroups,
                  ].map(({ val, label, sub }) => {
                    const selected = (formData.billingSubject || '') === val
                    return (
                      <button key={val} type="button" onClick={() => setFormData({...formData, billingSubject: val})}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                          borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                          border: selected ? '2px solid var(--accent)' : '2px solid var(--border)',
                          background: selected ? 'rgba(18,101,74,0.07)' : 'var(--bg)',
                        }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {selected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: selected ? 'var(--accent)' : 'var(--text)' }}>{label}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)' }}>{sub}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  {(isMetropoleParkingAsset ? [
                    ...parkingBillingOptions,
                  ] : [
                    ...adsBillingOptions,
                  ]).map(({ val, label, sub }) => {
                    const selected = (formData.billingSubject || '') === val
                    return (
                      <button key={val} type="button" onClick={() => setFormData({...formData, billingSubject: val})}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                          borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                          border: selected ? '2px solid var(--accent)' : '2px solid var(--border)',
                          background: selected ? 'rgba(18,101,74,0.07)' : 'var(--bg)',
                        }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {selected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: selected ? 'var(--accent)' : 'var(--text)' }}>{label}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)' }}>{sub}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {(a?.type === 'parking' || a?.type === 'ads') && formData.paymentFrequency !== 'Zahrnuto v nájemném' && (
            <div style={{ padding: '12px 14px', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '0.5px', marginBottom: 10 }}>DPH</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { val: 0, label: 'Dle subjektu', icon: '🔄' },
                  { val: 2, label: 'S DPH (21 %)', icon: '📋' },
                  { val: 1, label: 'Bez DPH', icon: '🚫' },
                ].map(({ val, label, icon }) => {
                  const sel = (formData.vatExempt || 0) === val
                  return (
                    <button key={val} type="button" onClick={() => setFormData({...formData, vatExempt: val})}
                      style={{ flex: 1, padding: '8px 6px', borderRadius: 9, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                        border: sel ? '2px solid var(--accent)' : '2px solid var(--border)',
                        background: sel ? 'rgba(18,101,74,0.08)' : 'var(--bg)',
                        color: sel ? 'var(--accent)' : 'var(--text2)',
                      }}>
                      <div>{icon}</div>
                      <div style={{ marginTop: 3 }}>{label}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {formData.paymentFrequency !== 'Zahrnuto v nájemném' && (
            <div>
              {(() => {
                const freqLabelMap = { 'Čtvrtletně': 'Čtvrtletní', 'Pololetně': 'Pololetní', 'Ročně': 'Roční' }
                const base = freqLabelMap[formData.paymentFrequency] || 'Měsíční'
                const withDph = (a?.type === 'commercial' || a?.type === 'ads' || a?.type === 'parking') && isDphSubject
                return (
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
                    {withDph ? `${base} nájemné bez DPH (Kč)` : `${base} nájemné (Kč)`}
                  </label>
                )
              })()}
              <input type="number" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.rent} onChange={e => setFormData({...formData, rent: e.target.value})} required />
              {(a?.type === 'commercial' || a?.type === 'ads' || a?.type === 'parking') && isDphSubject && Number(formData.rent) > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  s DPH: <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{(Number(formData.rent) * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                </div>
              )}
              {['Čtvrtletně','Pololetně','Ročně'].includes(formData.paymentFrequency) && Number(formData.rent) > 0 && (() => {
                const pLen = { 'Čtvrtletně': 3, 'Pololetně': 6, 'Ročně': 12 }[formData.paymentFrequency]
                return <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>= <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{(Number(formData.rent) / pLen).toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} Kč / měsíc</span></div>
              })()}
            </div>
            )}
            {(a?.type === 'residential' || a?.type === 'commercial') && (
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
                  {a?.type === 'commercial' && isDphSubject ? 'Zálohy energie/služby bez DPH (Kč)' : 'Zálohy energií a služeb (Kč)'}
                </label>
                <input type="number" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.deposit} onChange={e => setFormData({...formData, deposit: e.target.value})} />
                {a?.type === 'commercial' && isDphSubject && Number(formData.deposit) > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                    s DPH (21 %): <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{(Number(formData.deposit) * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                  </div>
                )}
              </div>
            )}
          </div>
          {a?.type === 'commercial' && isDphSubject && (
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Zálohy energií a služeb — voda a srážkovné bez DPH (Kč) — DPH 12 %</label>
              <input type="number" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.depositWater} onChange={e => setFormData({...formData, depositWater: e.target.value})} />
              {Number(formData.depositWater) > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  s DPH (12 %): <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{(Number(formData.depositWater) * 1.12).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                </div>
              )}
            </div>
          )}
          {a?.type === 'commercial' && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 4 }}>
                <input type="checkbox" checked={!!formData.flatFeeEnabled}
                  onChange={e => setFormData({...formData, flatFeeEnabled: e.target.checked})}
                  style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Paušální poplatek energií a služeb</span>
              </label>
              <div style={{ fontSize: 11, color: 'var(--text3)', paddingLeft: 23, marginBottom: formData.flatFeeEnabled ? 8 : 0 }}>Místo záloh — paušál se počítá jako součást nájmu (DPH 21 %).</div>
              {formData.flatFeeEnabled && (
                <>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{isDphSubject ? 'Paušál bez DPH (Kč)' : 'Paušální poplatek (Kč)'}</label>
                  <input type="number" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.flatFee} onChange={e => setFormData({...formData, flatFee: e.target.value})} />
                  {isDphSubject && Number(formData.flatFee) > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                      s DPH (21 %): <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{(Number(formData.flatFee) * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {(a?.type === 'ads' || a?.type === 'parking' || a?.type === 'ostatni') && (
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Frekvence plateb</label>
              <select className="btn" style={{ width: '100%', cursor: 'pointer' }}
                value={formData.paymentFrequency || 'Měsíčně'}
                onChange={e => setFormData({...formData, paymentFrequency: e.target.value, calendarYearBilling: false})}>
                {['Měsíčně', 'Čtvrtletně', 'Pololetně', 'Ročně'].map(f => <option key={f}>{f}</option>)}
                {a?.type === 'parking' && <option value="Zahrnuto v nájemném">Zahrnuto v nájemném</option>}
              </select>
              {formData.paymentFrequency === 'Ročně' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={!!formData.calendarYearBilling}
                    onChange={e => setFormData({...formData, calendarYearBilling: e.target.checked})}
                    style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>Platby dle kalendářního roku (Jan–Dec)</span>
                </label>
              )}
            </div>
          )}
          {(a?.type === 'ads' || a?.type === 'parking' || a?.type === 'ostatni') && formData.paymentFrequency !== 'Zahrnuto v nájemném' && (
            <div>
              {['Čtvrtletně','Pololetně','Ročně'].includes(formData.paymentFrequency) && (
                <>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Celkové nájemné za dobu smlouvy (Kč)</label>
                  <input type="number" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left', marginBottom: 8 }}
                    placeholder="Volitelné — pouze informativní"
                    value={formData.rentTotal || ''} onChange={e => setFormData({...formData, rentTotal: e.target.value})} />
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>Informativní pole — nevstupuje do výpočtů plateb.</div>
                </>
              )}
            </div>
          )}
          {a?.type === 'parking' && formData.paymentFrequency === 'Zahrnuto v nájemném' && (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#166534' }}>
              🅿️ Parkovací stání je zahrnuto v nájemném — částka se nezadává.
            </div>
          )}
          {(a?.type === 'residential' || a?.type === 'commercial') && (
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Složená kauce (Kč)</label>
              <input type="number" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }} value={formData.cauce} onChange={e => setFormData({...formData, cauce: e.target.value})} />
            </div>
          )}
          {(a?.type === 'residential' || a?.type === 'commercial') && (
            <div style={{ padding: '12px 14px', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="dp-incl-park" checked={!!formData.includedParkingEnabled}
                  onChange={e => setFormData({ ...formData, includedParkingEnabled: e.target.checked, includedParkingSpots: e.target.checked ? formData.includedParkingSpots : '', includedParkingRent: e.target.checked ? formData.includedParkingRent : '' })}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }} />
                <label htmlFor="dp-incl-park" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
                  Nájemné zahrnuje parkovací stání
                </label>
              </div>
              {formData.includedParkingEnabled && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Počet parkovacích míst</label>
                      <input type="number" min="1" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }}
                        placeholder="1"
                        value={formData.includedParkingSpots}
                        onChange={e => setFormData({...formData, includedParkingSpots: e.target.value})} />
                    </div>
                    {a?.type === 'residential' && (
                    <div>
                      <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Nájemné za parkování (Kč/měs)</label>
                      <input type="number" min="0" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }}
                        placeholder="0"
                        value={formData.includedParkingRent || ''}
                        onChange={e => setFormData({...formData, includedParkingRent: e.target.value})} />
                    </div>
                    )}
                  </div>
                  {a?.type === 'residential' && ((Number(formData.rent) || 0) + (Number(formData.includedParkingRent) || 0)) > 0 && (
                    <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>Celkové měsíční nájemné</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#166534' }}>
                        {((Number(formData.rent) || 0) + (Number(formData.includedParkingRent) || 0)).toLocaleString('cs-CZ')} Kč
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Platnost od</label>
              <input type="date" className="btn" style={{ width: '100%', cursor: 'pointer', textAlign: 'left' }} value={formData.start} onChange={e => setFormData({...formData, start: e.target.value})} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Platnost do</label>
              <input type="date" className="btn" style={{ width: '100%', cursor: 'pointer', textAlign: 'left' }} value={formData.end} onChange={e => setFormData({...formData, end: e.target.value})} />
            </div>
          </div>

          {formData.paymentFrequency === 'Zahrnuto v nájemném' ? (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#166534' }}>
              🅿️ Splatnost se řídí nadřazenou smlouvou — parkovací stání je zahrnuto v nájemném.
            </div>
          ) : (
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Den splatnosti</label>
            <select className="btn" style={{ width: '100%', cursor: 'pointer', textAlign: 'left' }}
              value={['15. den v měsíci','Dle vystavené faktury','Konkrétní datum','Vlastní'].includes(formData.dueDay) ? formData.dueDay : 'Vlastní'}
              onChange={e => setFormData({...formData, dueDay: e.target.value, dueDayCustom: ''})}>
              <option value="15. den v měsíci">15. den v měsíci</option>
              <option value="Dle vystavené faktury">Dle vystavené faktury</option>
              <option value="Konkrétní datum">Konkrétní datum (vždy stejný den v roce)…</option>
              <option value="Vlastní">Vlastní text…</option>
            </select>
            {formData.dueDay === 'Vlastní' && (
              <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left', marginTop: 8 }}
                placeholder="např. 1. den v měsíci" value={formData.dueDayCustom || ''} onChange={e => setFormData({...formData, dueDayCustom: e.target.value})} />
            )}
            {formData.dueDay === 'Konkrétní datum' && (() => {
              const parseFixed = (val) => {
                if (!val) return ''
                if (val.includes('-')) { const [,m,d] = val.split('-'); return `2000-${m}-${d}` }
                const parts = val.replace(/\.$/, '').split('.')
                if (parts.length >= 2) return `2000-${parts[1].trim().padStart(2,'0')}-${parts[0].trim().padStart(2,'0')}`
                return ''
              }
              return (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Vyber den a měsíc (rok se ignoruje — datum platí každý rok):</div>
                  <input type="date" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                    value={parseFixed(formData.dueDayCustom) || '2000-01-01'}
                    onChange={e => { const [,m,d] = e.target.value.split('-'); setFormData({...formData, dueDayCustom: `${parseInt(d)}. ${parseInt(m)}.`}) }} />
                  {formData.dueDayCustom && <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, marginTop: 5 }}>Splatnost: vždy do {formData.dueDayCustom} daného roku</div>}
                </div>
              )
            })()}
          </div>
          )}

          {/* Podmínky smlouvy – komerční/reklamy/parking/ostatní */}
          {(a?.type === 'commercial' || a?.type === 'ads' || a?.type === 'parking' || a?.type === 'ostatni') && (
            formData.paymentFrequency === 'Zahrnuto v nájemném' ? (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#166534' }}>
                🅿️ Způsob prodloužení smlouvy se řídí nadřazenou smlouvou — parkovací stání je zahrnuto v nájemném.
              </div>
            ) : (
            <div style={{ padding: '14px 16px', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12, letterSpacing: '0.5px' }}>Podmínky smlouvy</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: a?.type === 'commercial' ? 12 : 0 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Výpovědní lhůta</label>
                  <select className="btn" style={{ width: '100%', cursor: 'pointer' }} value={formData.terminationMonths || ''} onChange={e => setFormData({...formData, terminationMonths: e.target.value})}>
                    <option value="">— Nevyplněno —</option>
                    {[1,2,3,4,5,6,9,12].map(m => <option key={m} value={m}>{m} {m===1?'měsíc':m<5?'měsíce':'měsíců'} před koncem</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Způsob prodloužení</label>
                  <select className="btn" style={{ width: '100%', cursor: 'pointer' }} value={formData.renewalMethod || 'Formou dodatku'} onChange={e => { const v = e.target.value; setFormData({...formData, renewalMethod: v, autoRenewalType: v !== 'Automatické prodloužení' ? '' : formData.autoRenewalType}); }}>
                    <option value="Formou dodatku">Formou dodatku</option>
                    <option value="Formou nové smlouvy">Formou nové smlouvy</option>
                    {a?.type === 'commercial' && <option value="Automatické prodloužení">Automatické prodloužení</option>}
                  </select>
                </div>
              </div>
              {a?.type === 'commercial' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: formData.valorizationEnabled ? 10 : 0 }}>
                    <input type="checkbox" id="edit-val-com" checked={!!formData.valorizationEnabled} onChange={e => setFormData({...formData, valorizationEnabled: e.target.checked})} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                    <label htmlFor="edit-val-com" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>Valorizace nájemného lze uplatňovat</label>
                  </div>
                  {formData.valorizationEnabled && (
                    <div>
                      <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Datum poslední valorizace</label>
                      <input type="date" className="btn" style={{ width: '100%', cursor: 'pointer', textAlign: 'left' }} value={formData.valorizationDate || ''} onChange={e => setFormData({...formData, valorizationDate: e.target.value})} />
                      {formData.valorizationDate && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Naposledy: {formData.valorizationDate.split('-').reverse().join('. ')}</div>}
                    </div>
                  )}
                </>
              )}
            </div>
            )
          )}

          {/* Automatické prodloužení – jen komerční */}
          {a?.type === 'commercial' && formData.paymentFrequency !== 'Zahrnuto v nájemném' && formData.renewalMethod === 'Automatické prodloužení' && (
            <div style={{ padding: '12px 14px', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '0.5px', marginBottom: 10 }}>Automatické prodloužení</label>
              <select className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                value={formData.autoRenewalType || ''}
                onChange={e => setFormData({...formData, autoRenewalType: e.target.value})}>
                <option value="">— Bez automatického prodloužení —</option>
                <option value="repeat_2y">Automatické a opakované prodloužení o 2 roky</option>
                <option value="repeat_5y">Automatické a opakované prodloužení o 5 let</option>
                <option value="once_2y">Automatické (neopakované) prodloužení o 2 roky</option>
              </select>
              {formData.autoRenewalType && (
                <div style={{ marginTop: 8, background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#92400E' }}>
                  ⚠️ Smlouva se automaticky prodlouží pokud nebude ukončena {formData.terminationMonths || 6} měsíců před koncem platnosti.
                </div>
              )}
            </div>
          )}

          {/* Podmínky smlouvy – bytové */}
          {a?.type === 'residential' && (
            <div style={{ padding: '14px 16px', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12, letterSpacing: '0.5px' }}>Podmínky smlouvy</div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Způsob prodloužení</label>
                <select className="btn" style={{ width: '100%', cursor: 'pointer' }} value={formData.renewalMethod || 'Formou dodatku'} onChange={e => setFormData({...formData, renewalMethod: e.target.value})}>
                  <option value="Formou dodatku">Formou dodatku</option>
                  <option value="Formou nové smlouvy">Formou nové smlouvy</option>
                </select>
              </div>
            </div>
          )}

          {/* Osoby sdílející byt – jen bytové */}
          {a?.type === 'residential' && (
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Osoby sdílející byt dle Nájemní smlouvy</label>
              <textarea className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left', height: 90, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, fontSize: 13 }}
                placeholder={"Jméno a příjmení, datum narození…\n(každá osoba na nový řádek)"}
                value={formData.coResidents || ''} onChange={e => setFormData({...formData, coResidents: e.target.value})} />
            </div>
          )}

          {/* Datum předání – residential + commercial */}
          {(a?.type === 'residential' || a?.type === 'commercial') && (
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Datum předání předmětu nájmu Nájemci</label>
              <input type="date" className="btn" style={{ width: '100%', cursor: 'pointer', textAlign: 'left' }}
                value={formData.handoverDate || ''} onChange={e => setFormData({...formData, handoverDate: e.target.value})} />
            </div>
          )}

          {/* Vyúčtování energií – residential + commercial */}
          {(a?.type === 'residential' || a?.type === 'commercial') && (
            <div style={{ padding: '14px 16px', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12, letterSpacing: '0.5px' }}>⚡ Vyúčtování energií a služeb</div>
              {(formData.energySettlements || []).map((s, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <select className="btn" style={{ cursor: 'pointer', padding: '6px 8px' }}
                    value={s.year}
                    onChange={e => {
                      const updated = [...(formData.energySettlements || [])]
                      updated[i] = { ...updated[i], year: parseInt(e.target.value) }
                      setFormData({...formData, energySettlements: updated})
                    }}>
                    {Array.from({length: 14}, (_, k) => 2022 + k).map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select className="btn" style={{ cursor: 'pointer', padding: '6px 8px', width: 110 }}
                      value={Number(s.amount) >= 0 ? 'doplatek' : 'preplatek'}
                      onChange={e => {
                        const updated = [...(formData.energySettlements || [])]
                        const abs = Math.abs(Number(updated[i].amount) || 0)
                        updated[i] = { ...updated[i], amount: e.target.value === 'doplatek' ? abs : -abs }
                        setFormData({...formData, energySettlements: updated})
                      }}>
                      <option value="doplatek">Doplatek</option>
                      <option value="preplatek">Přeplatek</option>
                    </select>
                    <input type="number" className="btn" style={{ flex: 1, cursor: 'text', textAlign: 'left' }}
                      placeholder="Kč" min="0"
                      value={Math.abs(Number(s.amount) || 0) || ''}
                      onChange={e => {
                        const updated = [...(formData.energySettlements || [])]
                        const sign = Number(updated[i].amount) < 0 ? -1 : 1
                        updated[i] = { ...updated[i], amount: sign * (Number(e.target.value) || 0) }
                        setFormData({...formData, energySettlements: updated})
                      }} />
                  </div>
                  <button type="button" className="btn" style={{ color: '#dc2626', padding: '4px 10px' }}
                    onClick={() => {
                      const updated = (formData.energySettlements || []).filter((_, j) => j !== i)
                      setFormData({...formData, energySettlements: updated})
                    }}>✕</button>
                </div>
              ))}
              <button type="button" className="btn" style={{ fontSize: 12, marginTop: 4 }}
                onClick={() => {
                  const usedYears = (formData.energySettlements || []).map(s => s.year)
                  const nextYear = Array.from({length: 14}, (_, k) => 2022 + k).find(y => !usedYears.includes(y)) || 2022
                  setFormData({...formData, energySettlements: [...(formData.energySettlements || []), { year: nextYear, amount: 0 }]})
                }}>+ Přidat rok</button>
            </div>
          )}

          {/* Skupina smluv – parking, ads, commercial */}
          {(a?.type === 'parking' || a?.type === 'ads' || a?.type === 'commercial') && (
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Skupina smluv</label>
              <input type="text" className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left' }}
                placeholder={a?.type === 'commercial' ? 'např. Loxone – kanceláře 2024' : a?.type === 'ads' ? 'např. Billboard – Hyundai 2024' : 'např. Loxone – parkování 2024'}
                value={formData.groupLabel || ''}
                onChange={e => setFormData({...formData, groupLabel: e.target.value})} />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Stejný název = souhrnná platba v sekci Platby</div>
            </div>
          )}

          {/* Poznámky ke smlouvě – všechny typy */}
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Poznámky ke smlouvě</label>
            <textarea className="btn" style={{ width: '100%', cursor: 'text', textAlign: 'left', height: 80, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, fontSize: 13 }}
              placeholder="Interní poznámky, specifické podmínky…"
              value={formData.contractNotes || ''} onChange={e => setFormData({...formData, contractNotes: e.target.value})} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => setIsEditing(false)}>Zrušit</button>
            <button type="submit" className="btn btn-primary">Uložit změny</button>
          </div>
        </form>
      )
    }

    return (
      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          {!isReadOnly && <button className="btn btn-sm" onClick={handleEditClick}>Upravit</button>}
        </div>

        {/* Hlavička */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>Smlouva</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>{a ? a.unit : 'Neznámý předmět'}</div>
            {a?.subject && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{a.subject}</div>}
          </div>
          <span className={`badge ${c.status === 'active' ? 'badge-green' : 'badge-gray'}`} style={{ marginTop: 4, flexShrink: 0 }}>
            {c.status === 'active' ? 'Aktivní' : 'Ukončeno'}
          </span>
        </div>

        {/* Nájemce + Předmět – 2 karty */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div onClick={() => onOpen('tenant', t?.id)} style={{ cursor: 'pointer', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', transition: 'border-color 0.15s' }}
            onMouseOver={e => e.currentTarget.style.borderColor='var(--accent)'}
            onMouseOut={e => e.currentTarget.style.borderColor='var(--border)'}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Nájemce</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', lineHeight: 1.3, marginBottom: 4 }}>{t ? t.name : '—'}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Otevřít detail ›</div>
          </div>
          <div onClick={() => onOpen('asset', a?.id)} style={{ cursor: 'pointer', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', transition: 'border-color 0.15s' }}
            onMouseOver={e => e.currentTarget.style.borderColor='var(--accent)'}
            onMouseOut={e => e.currentTarget.style.borderColor='var(--border)'}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Předmět nájmu</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', lineHeight: 1.3, marginBottom: 4 }}>{a ? a.unit : '—'}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Otevřít detail ›</div>
          </div>
        </div>

        {/* Pronajímatel – jen když je přepsán (ne pro vlastní neplatčcovy ads/parking assety) */}
        {c.billingSubject && !((a?.type === 'ads' || a?.type === 'parking') && !(adsBillingOptions[0]?.label ? a?.subject?.startsWith(adsBillingOptions[0].label.split(' – ')[0]) : false)) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10 }}>
            <span style={{ fontSize: 13 }}>🏢</span>
            <div>
              <div style={{ fontSize: 10, color: '#92400E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Pronajímatel</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>
                {c.billingSubject}
                <span style={{ fontWeight: 400, fontSize: 11 }}>
                  {' · '}{(billingGroups.find(g => c.billingSubject.startsWith(g.val))?.isVatPayer ? 'Plátce DPH (21 %)' : 'Neplátce DPH')}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Skupina smluv – badge */}
        {c.groupLabel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10 }}>
            <span style={{ fontSize: 15 }}>🔗</span>
            <div>
              <div style={{ fontSize: 10, color: '#6D28D9', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Skupina smluv</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#6D28D9' }}>{c.groupLabel}</div>
            </div>
          </div>
        )}

        {/* Zahrnuto parkovací stání – badge */}
        {c.includedParkingSpots > 0 && a?.type === 'residential' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10 }}>
            <span style={{ fontSize: 15 }}>🅿️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: '#1E40AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Nájemné zahrnuje parkovací stání</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E40AF' }}>
                {c.includedParkingSpots} {c.includedParkingSpots === 1 ? 'místo' : c.includedParkingSpots < 5 ? 'místa' : 'míst'}
                {c.parking > 0 && <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 8 }}>· {c.parking.toLocaleString('cs-CZ')} Kč/měs</span>}
              </div>
            </div>
          </div>
        )}

        {/* Platnost + splatnost – pill karty nebo hláška */}
        {c.paymentFrequency === 'Zahrnuto v nájemném' ? (
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#166534' }}>
            🅿️ Platnost se řídí příslušnou nájemní smlouvou — parkovací stání je zahrnuto v nájemném.
          </div>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: c.dueDay ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8 }}>
          {[
            { label: 'Platnost od', value: c.start || '—', icon: '▶' },
            { label: 'Platnost do', value: c.end || 'Neurčito', icon: '⏹' },
            ...(c.dueDay && c.paymentFrequency !== 'Zahrnuto v nájemném' ? [{ label: 'Splatnost', value: c.dueDay, icon: '📅' }] : []),
          ].map(({ label, value, icon }) => (
            <div key={label} style={{ background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)', border: '1px solid #BBF7D0', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: '#15803d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F4C2A' }}>{value}</div>
            </div>
          ))}
        </div>
        )}

        {/* Finanční sekce */}
        {(() => {
          const _eff = effectiveToday(c)
          const effRent = _eff.rent
          const effParking = _eff.parking
          const effDeposit = _eff.deposit
          const effDepWater = _eff.depositWater
          const effFlatFee = _eff.flatFee
          return (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ background: 'linear-gradient(135deg, #12654A 0%, #1A8A62 100%)', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '10px 16px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.92)', letterSpacing: '0.8px' }}>💰 Finanční přehled</span>
          </div>
          <div style={{ padding: '4px 0' }}>
            {/* Frekvence plateb */}
            {c.paymentFrequency && c.paymentFrequency !== 'Měsíčně' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>Frekvence plateb</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{c.paymentFrequency}</span>
              </div>
            )}

            {/* Nájemné */}
            {c.paymentFrequency === 'Zahrnuto v nájemném' ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>🅿️ Nájemné</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Zahrnuto v nájemném</span>
              </div>
            ) : (a?.type === 'commercial' || a?.type === 'ads' || a?.type === 'parking' || a?.type === 'ostatni') && isDphSubject ? (
              <div style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>Nájemné bez DPH</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--price-netto)' }}>{effRent.toLocaleString('cs-CZ')} Kč</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>s DPH 21 %</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--price-brutto)' }}>{(effRent * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>Nájemné</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--price-netto)' }}>
                  {(a?.type === 'residential' && effParking > 0
                    ? effRent + effParking
                    : effRent
                  ).toLocaleString('cs-CZ')} Kč
                </span>
              </div>
            )}

            {/* Rozpad nájem + parking – hned pod Nájemné */}
            {a?.type === 'residential' && c.includedParkingSpots > 0 && (
              <div style={{ padding: '6px 16px 9px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>z toho holé nájemné</span>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{effRent.toLocaleString('cs-CZ')} Kč</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                    z toho parkování{c.includedParkingSpots > 0 ? ` (${c.includedParkingSpots} ${c.includedParkingSpots === 1 ? 'místo' : c.includedParkingSpots < 5 ? 'místa' : 'míst'})` : ''}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                    {effParking > 0 ? `${effParking.toLocaleString('cs-CZ')} Kč` : 'zahrnuto v nájemném'}
                  </span>
                </div>
              </div>
            )}

            {/* Zálohy – residential: jeden řádek */}
            {a?.type === 'residential' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>Zálohy energií a služeb</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--price-netto)' }}>{effDeposit.toLocaleString('cs-CZ')} Kč</span>
              </div>
            )}

            {/* Zálohy – commercial s DPH */}
            {a?.type === 'commercial' && isDphSubject && (effDeposit > 0) && (
              <div style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>Zálohy energií a služeb bez DPH</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--price-netto)' }}>{effDeposit.toLocaleString('cs-CZ')} Kč</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>s DPH 21 %</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--price-brutto)' }}>{(effDeposit * 1.21).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                </div>
              </div>
            )}
            {a?.type === 'commercial' && !isDphSubject && effDeposit > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>Zálohy energií a služeb</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--price-netto)' }}>{effDeposit.toLocaleString('cs-CZ')} Kč</span>
              </div>
            )}
            {a?.type === 'commercial' && isDphSubject && (effDepWater > 0) && (
              <div style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>Zálohy — voda a srážkovné bez DPH</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--price-netto)' }}>{effDepWater.toLocaleString('cs-CZ')} Kč</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>s DPH 12 %</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--price-brutto)' }}>{(effDepWater * 1.12).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</span>
                </div>
              </div>
            )}

            {/* Složená kauce */}
            {(a?.type === 'residential' || a?.type === 'commercial') && c.cauce > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>Složená kauce</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.cauce.toLocaleString('cs-CZ')} Kč</span>
              </div>
            )}

            {/* Parkovné – non-residential */}
            {effParking > 0 && a?.type !== 'residential' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>Parkovné</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{effParking.toLocaleString('cs-CZ')} Kč</span>
              </div>
            )}
            {/* Parkovací stání v nájemném – non-residential */}
            {c.includedParkingSpots > 0 && a?.type !== 'residential' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>🅿️ Parkovací stání v nájemném</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{c.includedParkingSpots} {c.includedParkingSpots === 1 ? 'místo' : c.includedParkingSpots < 5 ? 'místa' : 'míst'}</span>
              </div>
            )}
          </div>
        </div>
          )
        })()}

        {/* Podmínky smlouvy */}
        {(a?.type === 'residential'
          ? (c.renewalMethod)
          : (c.terminationMonths || c.renewalMethod || c.invoiceDue || (a?.type === 'commercial' && c.valorizationEnabled))
        ) && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, #12654A 0%, #1A8A62 100%)', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '10px 16px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.92)', letterSpacing: '0.8px' }}>📋 Podmínky smlouvy</span>
            </div>
            <div style={{ padding: '4px 0' }}>
              {/* Bytové: text výpovědní doby */}
              {a?.type === 'residential' && (
                <div style={{ padding: '10px 16px', borderBottom: c.renewalMethod ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: 12, color: '#166534', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 12px' }}>
                    Výpovědní doba činí <strong>3 měsíce</strong> počítající se od 1. dne měsíce následujícího po obdržení výpovědi
                  </div>
                </div>
              )}
              {/* Komerční: výpovědní lhůta + termín */}
              {a?.type !== 'residential' && c.terminationMonths && (() => {
                const termDate = computeTerminationDate(c.end, c.terminationMonths)
                return (<>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>Výpovědní lhůta</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.terminationMonths} {c.terminationMonths === 1 ? 'měsíc' : c.terminationMonths < 5 ? 'měsíce' : 'měsíců'} před koncem</span>
                  </div>
                  {termDate && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 13, color: 'var(--text2)' }}>Nejzazší termín výpovědi</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#92400E', background: '#FFF7ED', padding: '2px 10px', borderRadius: 6 }}>{termDate}</span>
                    </div>
                  )}
                </>)
              })()}
              {c.renewalMethod && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>Způsob prodloužení</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.renewalMethod}</span>
                </div>
              )}
              {c.autoRenewalType && (() => {
                const labels = { repeat_2y: 'Opakované o 2 roky', repeat_5y: 'Opakované o 5 let', once_2y: 'Jednorázové o 2 roky' }
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)', background: '#FFFBEB' }}>
                    <span style={{ fontSize: 13, color: '#92400E' }}>🔄 Automatické prodloužení</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', padding: '2px 10px', borderRadius: 20 }}>
                      {labels[c.autoRenewalType] || c.autoRenewalType}
                    </span>
                  </div>
                )
              })()}
              {a?.type === 'commercial' && c.invoiceDue && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>Splatnost faktury</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.invoiceDue}</span>
                </div>
              )}
              {a?.type === 'commercial' && (
                <div style={{ padding: '9px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>Valorizace nájemného</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: c.valorizationEnabled ? '#166534' : 'var(--text3)', background: c.valorizationEnabled ? '#F0FDF4' : 'var(--bg2)', border: `1px solid ${c.valorizationEnabled ? '#BBF7D0' : 'var(--border)'}`, padding: '2px 10px', borderRadius: 20 }}>
                      {c.valorizationEnabled ? '✓ Lze uplatňovat' : '✗ Není sjednána'}
                    </span>
                  </div>
                  {c.valorizationEnabled && c.valorizationDate && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text3)' }}>Poslední valorizace</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{c.valorizationDate}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Verze smlouvy + obsazenost */}
        {(c.contractVersion || c.occupants != null || c.coResidents) && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, #12654A 0%, #1A8A62 100%)', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '10px 16px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.92)', letterSpacing: '0.8px' }}>👥 Obsazenost a verze smlouvy</span>
            </div>
            <div style={{ padding: '4px 0' }}>
              {c.contractVersion && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>Verze smlouvy</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.contractVersion}</span>
                </div>
              )}
              {c.occupants != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>Počet osob v bytě</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.occupants}</span>
                </div>
              )}
              {c.permanentResidents != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: c.coResidents ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>Z toho s trvalým bydlištěm</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.permanentResidents}</span>
                </div>
              )}
              {c.coResidents && (
                <div style={{ padding: '9px 16px' }}>
                  <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>Osoby sdílející byt dle NS</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{c.coResidents}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Datum předání – jen residential + commercial */}
        {(a?.type === 'residential' || a?.type === 'commercial') && c.handoverDate && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, #12654A 0%, #1A8A62 100%)', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '10px 16px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.92)', letterSpacing: '0.8px' }}>🔑 Předání předmětu nájmu</span>
            </div>
            <div style={{ padding: '4px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px' }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>Datum předání předmětu nájmu Nájemci</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{c.handoverDate}</span>
              </div>
            </div>
          </div>
        )}

        {/* Poznámky ke smlouvě – všechny typy */}
        {c.contractNotes && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, #12654A 0%, #1A8A62 100%)', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '10px 16px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.92)', letterSpacing: '0.8px' }}>📝 Poznámky ke smlouvě</span>
            </div>
            <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{c.contractNotes}</div>
          </div>
        )}

        {/* Vyúčtování energií – jen residential + commercial */}
        {(a?.type === 'residential' || a?.type === 'commercial') && c.energySettlements && c.energySettlements.length > 0 && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, #12654A 0%, #1A8A62 100%)', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '10px 16px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.92)', letterSpacing: '0.8px' }}>⚡ Vyúčtování energií a služeb za předchozí roky</span>
            </div>
            <div style={{ padding: '4px 0' }}>
              {[...c.energySettlements].sort((a, b) => b.year - a.year).map((s, i, arr) => {
                const isDoplatek = Number(s.amount) > 0
                return (
                  <div key={s.year} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>Rok {s.year}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isDoplatek ? '#dc2626' : '#16a34a', background: isDoplatek ? '#fee2e2' : '#dcfce7', padding: '2px 10px', borderRadius: 20 }}>
                      {isDoplatek ? '▲' : '▼'} {Math.abs(Number(s.amount)).toLocaleString('cs-CZ')} Kč {isDoplatek ? 'doplatek' : 'přeplatek'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── HISTORIE ZMĚN NÁJEMNÉHO / ZÁLOH ── */}
        {(a?.type === 'residential' || a?.type === 'commercial') && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 0 }}>
            <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.92)', letterSpacing: '0.8px' }}>📈 Valorizace / změny nájemného a záloh</span>
              {!isReadOnly && (
                <button onClick={() => { setAmendForm(v => !v); setAmendData({ effectiveFrom: '', rent: '', deposit: '', depositWater: '', flatFee: '', parking: '', note: '' }) }}
                  style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 7, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                  {amendForm ? '✕ Zrušit' : '+ Přidat změnu'}
                </button>
              )}
            </div>

            {/* Formulář pro nový amendment */}
            {amendForm && !isReadOnly && (() => {
              const isRes = a?.type === 'residential'
              const isComm = a?.type === 'commercial'
              const hasFlatFee = isComm && !!(c.flatFee && c.flatFee > 0)
              const isoToCz = (iso) => {
                if (!iso) return ''
                const [yr, mo, day] = iso.split('-')
                return `${parseInt(day)}. ${parseInt(mo)}. ${yr}`
              }
              const handleSaveAmend = async () => {
                if (!amendData.effectiveFrom) return
                const payload = {
                  contractId: c.id,
                  effectiveFrom: isoToCz(amendData.effectiveFrom),
                  rent: amendData.rent !== '' ? Number(amendData.rent) : null,
                  deposit: amendData.deposit !== '' ? Number(amendData.deposit) : null,
                  depositWater: amendData.depositWater !== '' ? Number(amendData.depositWater) : null,
                  flatFee: amendData.flatFee !== '' ? Number(amendData.flatFee) : null,
                  parking: amendData.parking !== '' ? Number(amendData.parking) : null,
                  note: amendData.note || null,
                }
                // Alespoň jedna částka musí být vyplněna
                const hasValue = [payload.rent, payload.deposit, payload.depositWater, payload.flatFee, payload.parking].some(v => v !== null)
                if (!hasValue) return
                await addAmendment(payload)
                setAmendForm(false)
              }
              const inp = (label, field, placeholder) => (
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>{label}</label>
                  <input type="number" className="btn" placeholder={placeholder}
                    style={{ width: '100%', cursor: 'text', textAlign: 'left', background: 'var(--bg2)', boxSizing: 'border-box' }}
                    value={amendData[field]} onChange={e => setAmendData(p => ({ ...p, [field]: e.target.value }))} />
                </div>
              )
              return (
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
                    Nové hodnoty platné od zadaného data. Ponechejte prázdné pole = beze změny.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Účinnost od *</label>
                      <input type="date" className="btn" style={{ width: '100%', cursor: 'pointer', textAlign: 'left', background: 'var(--bg2)', boxSizing: 'border-box', borderColor: amendData.effectiveFrom ? 'var(--border)' : '#F59E0B' }}
                        value={amendData.effectiveFrom} onChange={e => setAmendData(p => ({ ...p, effectiveFrom: e.target.value }))} />
                    </div>
                    {inp('Nájemné (Kč)', 'rent', `Aktuálně: ${Number(c.rent).toLocaleString('cs-CZ')}`)}
                    {isRes && inp('Zálohy energie (Kč)', 'deposit', `Aktuálně: ${Number(c.deposit).toLocaleString('cs-CZ')}`)}
                    {isRes && Number(c.depositWater) > 0 && inp('Zálohy voda (Kč)', 'depositWater', `Aktuálně: ${Number(c.depositWater).toLocaleString('cs-CZ')}`)}
                    {isComm && inp('Zálohy (Kč)', 'deposit', `Aktuálně: ${Number(c.deposit).toLocaleString('cs-CZ')}`)}
                    {hasFlatFee && inp('Paušál (Kč)', 'flatFee', `Aktuálně: ${Number(c.flatFee).toLocaleString('cs-CZ')}`)}
                    {Number(c.parking) > 0 && inp('Parkování (Kč)', 'parking', `Aktuálně: ${Number(c.parking).toLocaleString('cs-CZ')}`)}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Poznámka (nepovinné)</label>
                    <input type="text" className="btn" placeholder="Např. valorizace dle CPI 2026, dohoda smluvních stran…"
                      style={{ width: '100%', cursor: 'text', textAlign: 'left', background: 'var(--bg2)', boxSizing: 'border-box' }}
                      value={amendData.note} onChange={e => setAmendData(p => ({ ...p, note: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-sm" onClick={() => setAmendForm(false)} style={{ flex: 1 }}>Zrušit</button>
                    <button className="btn btn-sm" onClick={handleSaveAmend}
                      style={{ flex: 2, background: amendData.effectiveFrom ? '#16A34A' : '#9CA3AF', color: '#fff', border: 'none', fontWeight: 700 }}>
                      ✓ Uložit změnu
                    </button>
                  </div>
                </div>
              )
            })()}

            {/* Seznam existujících amendments */}
            {(c.amendments || []).length === 0 && !amendForm ? (
              <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>
                Žádné zaznamenané změny. Použijte "+ Přidat změnu" pro zaznamenání valorizace nebo jiné úpravy.
              </div>
            ) : (
              <div style={{ padding: '4px 0' }}>
                {[...(c.amendments || [])].reverse().map((am, i, arr) => (
                  <div key={am.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>Od {am.effectiveFrom}</span>
                        {am.note && <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>{am.note}</span>}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {am.rent !== null && am.rent !== undefined && (
                          <span style={{ fontSize: 11, background: '#DBEAFE', color: '#1e40af', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                            Nájem: {Number(am.rent).toLocaleString('cs-CZ')} Kč
                          </span>
                        )}
                        {am.deposit !== null && am.deposit !== undefined && (
                          <span style={{ fontSize: 11, background: '#D1FAE5', color: '#065f46', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                            Zálohy: {Number(am.deposit).toLocaleString('cs-CZ')} Kč
                          </span>
                        )}
                        {am.depositWater !== null && am.depositWater !== undefined && (
                          <span style={{ fontSize: 11, background: '#E0F2FE', color: '#0369a1', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                            Voda: {Number(am.depositWater).toLocaleString('cs-CZ')} Kč
                          </span>
                        )}
                        {am.flatFee !== null && am.flatFee !== undefined && (
                          <span style={{ fontSize: 11, background: '#FEF9C3', color: '#713f12', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                            Paušál: {Number(am.flatFee).toLocaleString('cs-CZ')} Kč
                          </span>
                        )}
                        {am.parking !== null && am.parking !== undefined && (
                          <span style={{ fontSize: 11, background: '#F3E8FF', color: '#6b21a8', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                            Parkování: {Number(am.parking).toLocaleString('cs-CZ')} Kč
                          </span>
                        )}
                      </div>
                    </div>
                    {!isReadOnly && (
                      <button onClick={() => setConfirmDialog({
                        message: `Smazat změnu od ${am.effectiveFrom}? Platby evidované za minulé měsíce zůstanou zachovány.`,
                        onConfirm: () => { deleteAmendment(am.id, c.id); setConfirmDialog(null) }
                      })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16, padding: '2px 4px', flexShrink: 0 }} title="Smazat">✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VYKRESLENÍ ZCELA NOVÉ HISTORIE PLATEB PRO SMLOUVU */}
        {renderPaymentsSection(c)}

        {/* Vykreslení dokumentů pod tím */}
        {renderDocsSection(a?.subject)}

        {!isReadOnly && <div style={{ display: 'flex', gap: 8, marginTop: 24, padding: '16px 0 4px', borderTop: '1px solid var(--border)' }}>
          <button
            className="btn btn-sm"
            style={{ flex: 1, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}
            onClick={() => { archiveContract(id); onClose() }}
          >
            📦 Ukončit smlouvu
          </button>
          <button
            className="btn btn-sm"
            style={{ flex: 1, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' }}
            onClick={() => setConfirmDialog({
              title: 'Smazat smlouvu?',
              text: 'Smlouva bude přesunuta do koše. Odtud ji lze obnovit.',
              danger: true, okLabel: 'Přesunout do koše',
              onOk: () => { deleteContract(id); onClose() }
            })}
          >
            🗑 Přesunout do koše
          </button>
        </div>}

      </div>
    )
  }

  // Determine header meta based on type + asset type
  const getHeaderMeta = () => {
    if (type === 'tenant') return TYPE_META.tenant
    if (type === 'contract') {
      const c = contracts.find(x => x.id === id)
      const a = c ? assets.find(x => x.id === c.assetId) : null
      return TYPE_META[a?.type] || TYPE_META.contract
    }
    if (type === 'asset') {
      const a = assets.find(x => x.id === id)
      return TYPE_META[a?.type] || TYPE_META.residential
    }
    return TYPE_META.contract
  }

  const getTitle = () => {
    if (type === 'tenant') { const t = tenants.find(x => x.id === id); return t?.name || 'Nájemce' }
    if (type === 'asset')  { const a = assets.find(x => x.id === id);  return a?.unit || 'Předmět nájmu' }
    if (type === 'contract') {
      const c = contracts.find(x => x.id === id)
      const a = c ? assets.find(x => x.id === c.assetId) : null
      return a?.unit || 'Smlouva'
    }
    return ''
  }

  const getSubtitle = () => {
    if (type === 'tenant') {
      const t = tenants.find(x => x.id === id)
      const ac = contracts.filter(c => c.tenantId === id && c.status === 'active')
      return ac.length > 0 ? `${ac.length} aktivní smlouva` : 'Žádná aktivní smlouva'
    }
    if (type === 'asset') {
      const a = assets.find(x => x.id === id); return a?.subject || ''
    }
    if (type === 'contract') {
      const c = contracts.find(x => x.id === id)
      const a = c ? assets.find(x => x.id === c.assetId) : null
      return a?.subject || ''
    }
    return ''
  }

  const meta = getHeaderMeta()

  return (
    <>
      {/* Backdrop */}
      <div
        className="modal-backdrop"
        onClick={handleClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, backdropFilter: 'blur(4px)' }}
      />

      {/* Positioning wrapper – flex centering, no transform conflicts */}
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 201, pointerEvents: 'none' }}>
        {/* Animated modal card */}
        <div
          className={closing ? 'modal-card-out' : 'modal-card'}
          style={{
            pointerEvents: 'all',
            width: 'min(900px, 94vw)', maxHeight: '90vh',
            background: 'var(--bg)', borderRadius: 22,
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 32px 80px rgba(0,0,0,0.3)',
            overflow: 'hidden',
          }}
        >
        {/* Gradient header */}
        <div className={meta.headerClass} style={{ padding: '28px 32px 22px', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
          {/* Decorative circles */}
          <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
          <div style={{ position: 'absolute', bottom: -20, right: 60, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
          <div style={{ position: 'absolute', top: 10, right: 120, width: 50, height: 50, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ width: 60, height: 60, borderRadius: 18, background: 'rgba(255,255,255,0.18)', border: '2px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, backdropFilter: 'blur(8px)', flexShrink: 0 }}>
                {meta.icon}
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 4 }}>{meta.label}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1.2, textShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{getTitle()}</div>
                {getSubtitle() && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', marginTop: 4 }}>{getSubtitle()}</div>}
              </div>
            </div>
            <button
              onClick={handleClose}
              style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', width: 38, height: 38, borderRadius: 10, cursor: 'pointer', color: '#fff', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, backdropFilter: 'blur(4px)' }}
            >✕</button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
          {type === 'tenant'   && renderTenant()}
          {type === 'asset'    && renderAsset()}
          {type === 'contract' && renderContract()}
        </div>
      </div>{/* /animated card */}
      </div>{/* /positioning wrapper */}

      {confirmDialog && (
        <ConfirmDialog {...confirmDialog} onClose={() => setConfirmDialog(null)} />
      )}
    </>
  )
}