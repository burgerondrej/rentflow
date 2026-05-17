import React, { useState } from 'react'
import { useApp } from '../AppContext.jsx'
import { open as dialogOpen } from '@tauri-apps/api/dialog'
import { readBinaryFile, writeBinaryFile, createDir } from '@tauri-apps/api/fs'
import { appDataDir, join } from '@tauri-apps/api/path'
import { open as shellOpen } from '@tauri-apps/api/shell'

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
                <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>
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


// ------------------------------------------------------------------
// 1. MODUL DOKUMENTŮ
// ------------------------------------------------------------------
export function Docs() {
  const { documents = [], contracts = [], tenants = [], assets = [], addDocument, deleteDocument, getSettings, subjects = [], showToast } = useApp() || {}
  const [activeSub, setActiveSub] = useState(subjects[0] || '')
  const [showForm, setShowForm]   = useState(false)
  const [newName, setNewName]     = useState('')
  const [newType, setNewType]     = useState('Smlouva')
  const [newSubject, setNewSubject] = useState(subjects[0] || '')
  const [newNotes, setNewNotes]   = useState('')
  const [pickedFile, setPickedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview]     = useState(null)
  // collapsed state: Set of keys (tenantId or 'noTenant') that are collapsed
  const [collapsedTenants, setCollapsedTenants] = useState(new Set())
  const [collapsedContracts, setCollapsedContracts] = useState(new Set())

  const PREVIEWABLE = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'txt', 'csv', 'docx', 'doc']

  const toggleTenant = (key) => setCollapsedTenants(prev => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next
  })
  const toggleContract = (key) => setCollapsedContracts(prev => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next
  })

  // ── Sestavení stromové struktury ─────────────────────────────────
  const buildTree = () => {
    // Dokumenty patřící do aktivního subjektu
    const subjectDocs = documents.filter(d => d.subject === activeSub)

    // Smlouvy patřící do aktivního subjektu (přes billing_subject nebo asset subject)
    const subjectContracts = contracts.filter(c => {
      if (c.status === 'deleted') return false
      const asset = assets.find(a => a.id === c.assetId)
      const effectiveSubject = c.billingSubject || (asset ? asset.subject : null)
      return effectiveSubject === activeSub
    })

    // Mapa contractId → nájemce
    const tenantMap = {}
    subjectContracts.forEach(c => {
      const tenant = tenants.find(t => t.id === c.tenantId)
      tenantMap[c.id] = tenant || null
    })

    // Mapa contractId → dokumenty (přes contractLinkId)
    const docsByContract = {}
    subjectContracts.forEach(c => { docsByContract[c.id] = [] })
    subjectDocs.forEach(d => {
      if (d.contractLinkId && docsByContract[d.contractLinkId] !== undefined) {
        docsByContract[d.contractLinkId].push(d)
      }
    })

    // Dokumenty bez smlouvy (volně přidané do subjektu)
    const linkedDocIds = new Set(subjectDocs.filter(d => d.contractLinkId).map(d => d.id))
    const freeDocs = subjectDocs.filter(d => !linkedDocIds.has(d.id) || !d.contractLinkId)

    // Seskup smlouvy podle nájemce
    const tenantGroups = {}
    subjectContracts.forEach(c => {
      const tenant = tenantMap[c.id]
      const key = tenant ? tenant.id : '__no_tenant__'
      if (!tenantGroups[key]) tenantGroups[key] = { tenant, contracts: [] }
      tenantGroups[key].contracts.push(c)
    })

    // Odfiltruj skupiny bez dokumentů
    const groups = Object.entries(tenantGroups)
      .map(([key, g]) => ({
        key,
        tenant: g.tenant,
        contracts: g.contracts.map(c => ({
          contract: c,
          docs: docsByContract[c.id] || []
        })).filter(x => x.docs.length > 0)
      }))
      .filter(g => g.contracts.length > 0)

    return { groups, freeDocs }
  }

  // ── Helpers ───────────────────────────────────────────────────────
  const processFilePath = async (filePath) => {
    if (!filePath || typeof filePath !== 'string') return
    const parts = filePath.replace(/\\/g, '/').split('/')
    const filename = parts[parts.length - 1]
    const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : 'pdf'
    setPickedFile({ srcPath: filePath, filename, ext })
    if (!newName) setNewName(filename.replace(/\.[^.]+$/, ''))
  }

  const handlePickFile = async () => {
    try {
      const selected = await dialogOpen({
        multiple: false,
        filters: [{ name: 'Dokumenty', extensions: ['pdf','docx','doc','xlsx','xls','jpg','jpeg','png','txt','csv'] }]
      })
      if (selected && typeof selected === 'string') await processFilePath(selected)
    } catch (err) { console.error('Chyba při výběru souboru:', err) }
  }

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation() }
  const handleDrop = async (e) => {
    e.preventDefault(); e.stopPropagation()
    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      const file = files[0]
      const filePath = file.path || null
      if (filePath) {
        await processFilePath(filePath)
      } else {
        const reader = new FileReader()
        reader.onload = async (ev) => {
          const filename = file.name
          const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : 'pdf'
          setPickedFile({ srcPath: null, filename, ext, arrayBuffer: ev.target.result })
          if (!newName) setNewName(filename.replace(/\.[^.]+$/, ''))
        }
        reader.readAsArrayBuffer(file)
      }
    }
  }

  const handleAdd = async () => {
    if (!newName) { showToast?.('Zadejte název dokumentu.', 'warning'); return }
    if (!pickedFile) { showToast?.('Vyberte soubor kliknutím nebo přetažením.', 'warning'); return }
    setUploading(true)
    try {
      const appData  = await appDataDir()
      const docsDir  = await join(appData, 'rentflow', 'documents')
      await createDir(docsDir, { recursive: true })
      const safeName = `${Date.now()}_${pickedFile.filename}`
      const destPath = await join(docsDir, safeName)

      let content
      if (pickedFile.srcPath) {
        content = await readBinaryFile(pickedFile.srcPath)
      } else if (pickedFile.arrayBuffer) {
        content = new Uint8Array(pickedFile.arrayBuffer)
      } else {
        throw new Error('Nepodařilo se získat obsah souboru.')
      }

      await writeBinaryFile(destPath, content)

      try {
        const settings = (await getSettings?.()) || {}
        const gdrivePath = settings.gdrivePath || ''
        if (gdrivePath) {
          const gdriveDocsDir = await join(gdrivePath, 'documents')
          await createDir(gdriveDocsDir, { recursive: true }).catch(() => {})
          const gdriveFilePath = await join(gdriveDocsDir, safeName)
          await writeBinaryFile(gdriveFilePath, content)
        }
      } catch (gErr) {
        console.warn('GDrive zápis selhal:', gErr)
      }

      addDocument({
        name: newName, type: newType, subject: newSubject,
        ext: pickedFile.ext, notes: newNotes,
        relatedId: safeName,
        relatedType: 'file',
      })
      setShowForm(false)
      setNewName(''); setNewNotes(''); setPickedFile(null)
    } catch (err) {
      console.error('Chyba při nahrávání:', err)
      showToast?.('Nepodařilo se soubor uložit: ' + err)
    } finally {
      setUploading(false)
    }
  }

  const resolveFilePath = async (relatedId) => {
    if (!relatedId) return null
    // Pokud je to absolutní cesta (legacy), vrátit přímo
    if (relatedId.includes('\\') || relatedId.includes('/')) return relatedId
    // Jinak sestavit z appDataDir
    const appData = await appDataDir()
    return await join(appData, 'rentflow', 'documents', relatedId)
  }

  const handleOpen = async (d) => {
    if (!d.relatedId) { showToast?.('Soubor není fyzicky uložen.', 'warning'); return }
    const filePath = await resolveFilePath(d.relatedId)
    if (!filePath) return
    const ext = (d.ext || '').toLowerCase()
    if (!PREVIEWABLE.includes(ext)) {
      try { await shellOpen(filePath) } catch (err) { showToast?.('Nelze otevřít soubor: ' + err) }
      return
    }
    try {
      const bytes = await readBinaryFile(filePath)
      if (ext === 'docx' || ext === 'doc') {
        try {
          const mammoth = await import('mammoth')
          const result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer })
          setPreview({ ext, name: d.name, htmlContent: result.value, filePath })
        } catch (mErr) {
          try { await shellOpen(filePath) } catch (e) { showToast?.('Nelze otevřít: ' + e) }
        }
        return
      }
      const mimeMap = {
        pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        png: 'image/png', gif: 'image/gif', webp: 'image/webp',
        svg: 'image/svg+xml', txt: 'text/plain', csv: 'text/csv',
      }
      const blob    = new Blob([bytes], { type: mimeMap[ext] || 'application/octet-stream' })
      const blobUrl = URL.createObjectURL(blob)
      const textContent = (ext === 'txt' || ext === 'csv') ? new TextDecoder('utf-8').decode(bytes) : null
      setPreview({ blobUrl, ext, name: d.name, textContent, filePath })
    } catch (err) { showToast?.('Nepodařilo se načíst náhled: ' + err) }
  }

  const closePreview = () => {
    if (preview?.blobUrl) URL.revokeObjectURL(preview.blobUrl)
    setPreview(null)
  }

  const getTypeStyle = (type) => {
    switch(type) {
      case 'Smlouva':      return { bg: '#DBEAFE', color: '#1E3A8A' }
      case 'Dodatek k NS': return { bg: '#E0E7FF', color: '#3730A3' }
      case 'Protokol':     return { bg: '#FEF3C7', color: '#92400E' }
      case 'Faktura':      return { bg: '#DCFCE7', color: '#166534' }
      case 'Revize':       return { bg: '#EDE9FE', color: '#5B21B6' }
      default:             return { bg: '#F1F5F9', color: '#475569' }
    }
  }

  const getExtLabel = (ext) => (ext || 'DOC').toUpperCase().slice(0, 4)
  const getExtColor = (ext) => {
    const e = (ext || '').toLowerCase()
    if (e === 'pdf') return '#EF4444'
    if (['docx','doc'].includes(e)) return '#2563EB'
    if (['xlsx','xls'].includes(e)) return '#16A34A'
    if (['jpg','jpeg','png'].includes(e)) return '#D97706'
    return '#6B7280'
  }

  const formatContractLabel = (c) => {
    const asset = assets.find(a => a.id === c.assetId)
    const unit = asset ? asset.unit : 'Neznámý předmět'
    const period = (c.start && c.end) ? `${c.start} – ${c.end}` : c.start || ''
    return `${unit}${period ? ' · ' + period : ''}`
  }

  const DocRow = ({ d }) => {
    const typeStyle = getTypeStyle(d.type)
    const hasFile = !!d.relatedId && d.relatedType === 'file'
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        borderBottom: '1px solid var(--border2)',
        background: 'var(--bg)',
      }}>
        <div style={{ width: 32, height: 32, borderRadius: 7, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: getExtColor(d.ext), fontWeight: 800, fontSize: 10, flexShrink: 0 }}>
          {getExtLabel(d.ext)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: typeStyle.bg, color: typeStyle.color }}>{d.type}</span>
            {d.uploadedAt && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{d.uploadedAt}</span>}
            {d.notes && <span style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{d.notes}</span>}
            {!hasFile && <span style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' }}>bez přílohy</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {hasFile && (
            <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => handleOpen(d)}>Otevřít</button>
          )}
          <button className="btn btn-sm" style={{ color: '#DC2626', background: '#FEF2F2', borderColor: '#FECACA', fontSize: 11 }} onClick={() => deleteDocument(d.id)}>Smazat</button>
        </div>
      </div>
    )
  }

  const { groups, freeDocs } = buildTree()
  const totalDocs = documents.filter(d => d.subject === activeSub).length

  return (
    <div style={{ paddingBottom: 60 }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <div className="page-title">Dokumenty a Soubory</div>
          <div className="page-sub">Centrální archív dokumentů všech společností</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Nahrát dokument</button>
      </div>

      <SubjectSelector subjects={subjects} active={activeSub} onSelect={setActiveSub} />

      {/* ── STROM ─────────────────────────────────────────────────── */}
      {totalDocs === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--bg2)', borderRadius: 16, border: '1px solid var(--border)', color: 'var(--text3)', fontStyle: 'italic' }}>
          Ve vybraném subjektu nejsou žádné dokumenty.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── Skupiny dle nájemce ── */}
          {groups.map(g => {
            const tenantName = g.tenant ? (g.tenant.name || 'Neznámý nájemce') : 'Bez nájemce'
            const tenantCollapsed = collapsedTenants.has(g.key)
            const totalTenantDocs = g.contracts.reduce((sum, x) => sum + x.docs.length, 0)

            return (
              <div key={g.key} style={{ border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                {/* Hlavička nájemce */}
                <button
                  onClick={() => toggleTenant(g.key)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px', background: 'linear-gradient(135deg, #0A3D2B 0%, #1A8A62 100%)',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1 }}>{tenantCollapsed ? '▶' : '▼'}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', flex: 1 }}>👤 {tenantName}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', background: 'rgba(0,0,0,0.2)', padding: '2px 8px', borderRadius: 20 }}>
                    {totalTenantDocs} {totalTenantDocs === 1 ? 'dokument' : totalTenantDocs < 5 ? 'dokumenty' : 'dokumentů'}
                  </span>
                </button>

                {/* Smlouvy nájemce */}
                {!tenantCollapsed && g.contracts.map(({ contract: c, docs }) => {
                  const contractKey = c.id
                  const contractCollapsed = collapsedContracts.has(contractKey)
                  const label = formatContractLabel(c)
                  const statusColor = c.status === 'active' ? '#16A34A' : c.status === 'expired' ? '#DC2626' : '#D97706'
                  const statusLabel = c.status === 'active' ? 'aktivní' : c.status === 'expired' ? 'vypršela' : c.status

                  return (
                    <div key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                      {/* Hlavička smlouvy */}
                      <button
                        onClick={() => toggleContract(contractKey)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 16px 9px 36px',
                          background: 'var(--bg2)', border: 'none', cursor: 'pointer', textAlign: 'left',
                          borderBottom: contractCollapsed ? 'none' : '1px solid var(--border2)',
                        }}
                      >
                        <span style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1 }}>{contractCollapsed ? '▶' : '▼'}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>📄 {label}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, background: statusColor + '18', padding: '2px 7px', borderRadius: 10 }}>{statusLabel}</span>
                        <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 8 }}>{docs.length} {docs.length === 1 ? 'soubor' : docs.length < 5 ? 'soubory' : 'souborů'}</span>
                      </button>

                      {/* Dokumenty smlouvy */}
                      {!contractCollapsed && docs.map(d => <DocRow key={d.id} d={d} />)}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* ── Volné dokumenty (bez smlouvy) ── */}
          {freeDocs.length > 0 && (
            <div style={{ border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{
                padding: '12px 16px', background: 'var(--bg2)',
                borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 10
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1 }}>📁 Ostatní dokumenty subjektu</span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{freeDocs.length} {freeDocs.length === 1 ? 'soubor' : freeDocs.length < 5 ? 'soubory' : 'souborů'}</span>
              </div>
              {freeDocs.map(d => <DocRow key={d.id} d={d} />)}
            </div>
          )}
        </div>
      )}

      {/* ── FORMULÁŘ NAHRÁNÍ ─────────────────────────────────────── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg)', width: 440, borderRadius: 16, padding: 32, boxShadow: '0 20px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 24, color: 'var(--text)' }}>Nahrát dokument</div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Soubor *</label>
              {pickedFile ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: getExtColor(pickedFile.ext), fontWeight: 800, fontSize: 10, flexShrink: 0 }}>
                    {getExtLabel(pickedFile.ext)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pickedFile.filename}</div>
                    <div style={{ fontSize: 10, color: '#4ADE80' }}>Soubor vybrán</div>
                  </div>
                  <button type="button" className="btn btn-sm" style={{ flexShrink: 0 }} onClick={handlePickFile}>Změnit</button>
                </div>
              ) : (
                <div
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={handlePickFile}
                  style={{ width: '100%', boxSizing: 'border-box', border: '2px dashed var(--border)', background: 'var(--bg2)', borderRadius: 10, padding: '20px 16px', cursor: 'pointer', textAlign: 'center', transition: 'border-color 0.15s, background 0.15s' }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = '#F0FDF4' }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg2)' }}
                >
                  <div style={{ fontSize: 24, marginBottom: 6 }}>📂</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>Vybrat / vložit soubor</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Klikněte nebo přetáhněte soubor sem</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>PDF, DOCX, XLSX, JPG, PNG…</div>
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Název dokumentu *</label>
              <input type="text" className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text' }} value={newName} onChange={e => setNewName(e.target.value)} placeholder="např. Smlouva Novák 2025" />
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Firma / Subjekt</label>
              <select className="btn" style={{ width: '100%', textAlign: 'left' }} value={newSubject} onChange={e => setNewSubject(e.target.value)}>
                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Kategorie</label>
              <select className="btn" style={{ width: '100%', textAlign: 'left' }} value={newType} onChange={e => setNewType(e.target.value)}>
                <option value="Smlouva">Smlouva</option>
                <option value="Dodatek k NS">Dodatek k NS</option>
                <option value="Protokol">Protokol</option>
                <option value="Faktura">Faktura</option>
                <option value="Revize">Revize</option>
                <option value="Ostatní">Ostatní</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Poznámka</label>
              <textarea className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text', minHeight: 72, resize: 'vertical', lineHeight: 1.5 }}
                placeholder="Volitelná poznámka k dokumentu..."
                value={newNotes} onChange={e => setNewNotes(e.target.value)} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn" onClick={() => { setShowForm(false); setPickedFile(null); setNewName(''); setNewNotes('') }}>Zrušit</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={uploading}>
                {uploading ? 'Nahrávám…' : 'Uložit do archívu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PREVIEW MODAL ─────────────────────────────────────────── */}
      {preview && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
          onClick={closePreview}
        >
          <div
            style={{ background: 'var(--bg)', borderRadius: 20, boxShadow: '0 32px 80px rgba(0,0,0,0.4)', overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '82vw', height: '88vh', maxWidth: 1100 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg2)', flexShrink: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: getExtColor(preview.ext), fontWeight: 800, fontSize: 11, border: '1px solid var(--border)', flexShrink: 0 }}>
                {getExtLabel(preview.ext)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{preview.ext.toUpperCase()} dokument</div>
              </div>
              <button onClick={async () => { try { await shellOpen(preview.filePath) } catch(e) {} }} className="btn btn-sm" style={{ flexShrink: 0 }}>Otevřít externě</button>
              <button onClick={closePreview} style={{ background: 'var(--bg3)', border: 'none', width: 34, height: 34, borderRadius: 9, cursor: 'pointer', fontWeight: 800, color: 'var(--text2)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
            </div>

            <div style={{ flex: 1, overflow: 'hidden', background: preview.ext === 'docx' || preview.ext === 'doc' ? '#f8f8f8' : '#1a1a1a', position: 'relative' }}>
              {preview.ext === 'pdf' && (
                <iframe src={preview.blobUrl} style={{ width: '100%', height: '100%', border: 'none' }} title={preview.name} />
              )}
              {(preview.ext === 'docx' || preview.ext === 'doc') && (
                <div style={{ width: '100%', height: '100%', overflow: 'auto', background: '#f8f8f8', display: 'flex', justifyContent: 'center', padding: '24px 16px', boxSizing: 'border-box' }}>
                  <div
                    style={{ background: '#fff', width: '100%', maxWidth: 800, minHeight: '100%', boxShadow: '0 2px 20px rgba(0,0,0,0.12)', borderRadius: 4, padding: '48px 64px', boxSizing: 'border-box', fontSize: 14, lineHeight: 1.7, color: '#1a1a1a', fontFamily: 'Georgia, "Times New Roman", serif' }}
                    dangerouslySetInnerHTML={{ __html: preview.htmlContent || '<p style="color:#888;font-style:italic">Dokument je prázdný.</p>' }}
                  />
                </div>
              )}
              {['jpg','jpeg','png','gif','webp','svg'].includes(preview.ext) && (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: 16, boxSizing: 'border-box' }}>
                  <img src={preview.blobUrl} alt={preview.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }} />
                </div>
              )}
              {(preview.ext === 'txt' || preview.ext === 'csv') && (
                <pre style={{ margin: 0, padding: 24, color: '#e2e8f0', fontFamily: 'Consolas, monospace', fontSize: 13, lineHeight: 1.6, overflow: 'auto', height: '100%', boxSizing: 'border-box', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {preview.textContent}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// 2. MODUL UPOZORNĚNÍ (Zcela nový notifikační feed)
// ------------------------------------------------------------------
export function Alerts() {
  const { contracts = [], revisions = [], tasks = [], assets = [] } = useApp() || {}

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const parseDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return null
    try {
      const parts = dateStr.split('.').map(p => p.trim())
      if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0])
    } catch (e) { return null }
    return null
  }

  // Sběr všech upozornění do jednoho pole
  const alertsList = []

  // A) KONČÍCÍ SMLOUVY (méně než 60 dnů)
  contracts.filter(c => c.status === 'active').forEach(c => {
    const d = parseDate(c.end)
    if (d) {
      const diff = Math.round((d - today) / (1000 * 60 * 60 * 24))
      const asset = assets.find(a => a.id === c.assetId)
      const unitName = asset ? asset.unit : 'Neznámý předmět'

      if (diff < 0) {
        alertsList.push({ id: `c-${c.id}`, category: 'Smlouvy', urgency: 'critical', title: 'Propadlá smlouva', desc: `${unitName} (Vypršela před ${Math.abs(diff)} dny)` })
      } else if (diff <= 60) {
        alertsList.push({ id: `c-${c.id}`, category: 'Smlouvy', urgency: diff <= 30 ? 'high' : 'medium', title: 'Končící smlouva', desc: `${unitName} (Končí za ${diff} dnů)` })
      }
    }
  })

  // B) REVIZE (propadlé nebo do 30 dnů)
  revisions.forEach(r => {
    const d = parseDate(r.lastDate)
    if (d) {
      d.setMonth(d.getMonth() + parseInt(r.interval))
      const diff = Math.round((d - today) / (1000 * 60 * 60 * 24))
      
      if (diff < 0) {
        alertsList.push({ id: `r-${r.id}`, category: 'Údržba', urgency: 'critical', title: 'Propadlá revize!', desc: `${r.title} (Zpoždění ${Math.abs(diff)} dnů)` })
      } else if (diff <= 30) {
        alertsList.push({ id: `r-${r.id}`, category: 'Údržba', urgency: 'high', title: 'Blížící se revize', desc: `${r.title} (Termín za ${diff} dnů)` })
      }
    }
  })

  // C) ÚKOLY KANBAN (Vysoká priorita nebo propadlý deadline)
  tasks.filter(t => t.status !== 'done').forEach(t => {
    if (t.deadline) {
      const d = new Date(t.deadline)
      const diff = Math.round((d - today) / (1000 * 60 * 60 * 24))
      
      if (diff < 0) {
        alertsList.push({ id: `t-${t.id}`, category: 'Kanban', urgency: 'critical', title: 'Zpožděný úkol', desc: `${t.title} (Mělo být hotovo před ${Math.abs(diff)} dny)` })
      } else if (diff <= 3 || t.priority === 'Vysoká') {
        alertsList.push({ id: `t-${t.id}`, category: 'Kanban', urgency: 'high', title: 'Důležitý úkol', desc: `${t.title} (Termín za ${diff} dnů)` })
      }
    } else if (t.priority === 'Vysoká') {
      alertsList.push({ id: `t-${t.id}`, category: 'Kanban', urgency: 'medium', title: 'Prioritní úkol', desc: t.title })
    }
  })

  // Určení stylů podle urgence
  const getAlertStyle = (urgency) => {
    switch (urgency) {
      case 'critical': return { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', icon: '🚨' }
      case 'high': return { bg: '#FFF7ED', border: '#FED7AA', text: '#9A3412', icon: '⚠️' }
      case 'medium': return { bg: '#FEFCE8', border: '#FEF08A', text: '#854D0E', icon: 'ℹ️' }
      default: return { bg: '#F1F5F9', border: '#E2E8F0', text: '#475569', icon: '📌' }
    }
  }

  // Řazení: Critical první, pak High, pak Medium
  const urgencyWeight = { critical: 3, high: 2, medium: 1 }
  alertsList.sort((a, b) => urgencyWeight[b.urgency] - urgencyWeight[a.urgency])

  return (
    <div style={{ paddingBottom: 60, maxWidth: 1000 }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <div>
          <div className="page-title">Centrum upozornění</div>
          <div className="page-sub">Agregovaný přehled všeho, co aktuálně hoří.</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {alertsList.length > 0 ? alertsList.map(alert => {
          const style = getAlertStyle(alert.urgency)
          return (
            <div key={alert.id} style={{ display: 'flex', alignItems: 'center', background: style.bg, border: `1px solid ${style.border}`, borderRadius: 16, padding: '20px 24px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: 24, marginRight: 20 }}>{style.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', background: '#fff', color: style.text, padding: '2px 8px', borderRadius: 8, border: `1px solid ${style.border}` }}>
                    {alert.category}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: style.text }}>{alert.title}</span>
                </div>
                <div style={{ fontSize: 14, color: style.text, fontWeight: 500 }}>{alert.desc}</div>
              </div>
            </div>
          )
        }) : (
          <div style={{ padding: 60, textAlign: 'center', background: 'var(--bg2)', borderRadius: 16, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Všechno je v naprostém pořádku.</div>
            <div style={{ fontSize: 14, color: 'var(--text3)' }}>Aktuálně tu neevidujeme žádné propadlé termíny, úkoly ani revize.</div>
          </div>
        )}
      </div>
    </div>
  )
}