import React, { useState, useEffect, useCallback, useRef } from 'react'
import { AppProvider, useApp } from './AppContext.jsx'
import Sidebar from './Sidebar.jsx'
import DetailPanel from './DetailPanel.jsx'
import Tenants from './views/Tenants.jsx' 
import Assets from './views/Assets.jsx' 
import Contracts from './views/Contracts.jsx'
import Dashboard from './views/Dashboard.jsx'
import Payments from './views/Payments.jsx'
import Maintenance from './views/Maintenance.jsx'
import Export from './views/Export.jsx'
import Kanban from './views/Kanban.jsx'
import Calendar from './views/Calendar.jsx'
import Trash from './views/Trash.jsx' 
import { Docs, Alerts } from './views/DocsAlerts.jsx'
import History from './views/History.jsx'
import OperationalCosts from './views/OperationalCosts.jsx'
import SettingsPanel from './SettingsPanel.jsx'
import UpdateDialog from './UpdateDialog.jsx'
import ActivationScreen from './ActivationScreen.jsx'
import { FirmPickerButton, FirmBadge } from './FirmUI.jsx'
import DialogShell from './DialogShell.jsx'
import { isOverlayOpen } from './shortcuts.js'
import { contractSubject, selectionMatches, parseDate, isContractOccupying, hasSuccessor } from './utils.js'
import { invoke } from '@tauri-apps/api/tauri'

function AppWithActivation() {
  const [activated, setActivated] = useState(null) // null = loading

  useEffect(() => {
    invoke('check_activation').then(ok => setActivated(ok)).catch(() => setActivated(false))
  }, [])

  if (activated === null) return null // loading — prázdná obrazovka na zlomek sekundy
  if (!activated) return <ActivationScreen onActivated={() => setActivated(true)} />
  return <AppProvider><AppInner /></AppProvider>
}

function AppInner() {
  const { logs = [], unreadCount, urgentContracts, currentUser, setCurrentUser, isReadOnly, theme, setTheme, tenants = [], assets = [], tasks = [], documents = [], contracts = [], getBackupInfo, createBackup, subjects = [], getFirm } = useApp()

  // Sledujeme zda od poslední zálohy došlo ke změnám
  const prevCountRef = useRef(tenants.length + assets.length + contracts.length + tasks.length)
  useEffect(() => {
    const current = tenants.length + assets.length + contracts.length + tasks.length
    if (current !== prevCountRef.current) {
      setUnsavedSinceBackup(true)
      prevCountRef.current = current
    }
  }, [tenants.length, assets.length, contracts.length, tasks.length])
  const [view, setView] = useState('dashboard') 
  const contentRef = useRef(null)

  const handleNav = (newView) => {
    setView(newView)
    setTimeout(() => {
      if (contentRef.current) contentRef.current.scrollTop = 0
    }, 0)
  }
  const [sbWidth, setSbWidth] = useState(252)

  // Velikost písma = zvětšení celé aplikace (100 / 115 / 130 %), pamatuje se zvlášť pro každého uživatele.
  // Výšky a šířky ve vh/vw jsou v CSS kompenzované přes --ui-zoom, aby se rozložení nerozbilo.
  const ZOOM_LEVELS = [1, 1.15, 1.3]
  const zoomKey = `rentflow_zoom_${currentUser || 'default'}`
  const readZoom = (key) => { try { const z = Number(localStorage.getItem(key)); return ZOOM_LEVELS.includes(z) ? z : 1 } catch { return 1 } }
  const [uiZoom, setUiZoom] = useState(() => readZoom(zoomKey))
  useEffect(() => { setUiZoom(readZoom(zoomKey)) }, [zoomKey])
  useEffect(() => {
    document.documentElement.style.zoom = String(uiZoom)
    document.documentElement.style.setProperty('--ui-zoom', String(uiZoom))
    try { localStorage.setItem(zoomKey, String(uiZoom)) } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiZoom])
  const [subject, setSubject] = useState('all')
  const [detail, setDetail] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [backupStatus, setBackupStatus] = useState({ lastBackup: '…', syncing: false })
  const [unsavedSinceBackup, setUnsavedSinceBackup] = useState(false)

  // Auto-update
  const [updateInfo, setUpdateInfo] = useState(null)
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/tauri')
        const info = await invoke('check_for_update')
        if (info.available) setUpdateInfo(info)
      } catch (e) { }
    }, 3000)
    return () => clearTimeout(t)
  }, [])

  // PIN ochrana přepnutí na Ondra
  const ADMIN_PIN = '0750'
  const [showPinModal, setShowPinModal] = useState(false)
  const [pinValue, setPinValue] = useState('')
  const [pinError, setPinError] = useState(false)
  const handleUserChange = (newUser) => {
    if (newUser === 'Ondra' && currentUser !== 'Ondra') {
      setShowPinModal(true)
      setPinValue('')
      setPinError(false)
    } else {
      setCurrentUser(newUser)
    }
  }
  const handlePinSubmit = () => {
    if (pinValue === ADMIN_PIN) {
      setCurrentUser('Ondra')
      setShowPinModal(false)
      setPinValue('')
      setPinError(false)
    } else {
      setPinError(true)
      setPinValue('')
    }
  }

  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const searchInputRef = useRef(null)

  const readOnlyRef = useRef(isReadOnly)
  readOnlyRef.current = isReadOnly
  // Ctrl+F → fokus na vyhledávání, Ctrl+S → záloha
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
      // Ctrl+N → „Nový …“ na aktuální obrazovce (Smlouvy, Nájemníci, Předměty, Úkoly, Revize, Náklady)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        if (!readOnlyRef.current && !isOverlayOpen()) window.dispatchEvent(new Event('rf-new'))
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (createBackup) {
          createBackup().then(() => {
            setUnsavedSinceBackup(false)
            getBackupInfo && getBackupInfo().then(info => {
              if (info) setBackupStatus(prev => ({ ...prev, lastBackup: info.lastBackup }))
            }).catch(() => {})
          }).catch(err => console.error('Backup failed:', err))
        }
      }
      if (e.key === 'Escape') {
        setSearchQuery('')
        setIsSearchFocused(false)
        searchInputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '') }, [theme])

  // Načíst backup info při startu
  useEffect(() => {
    getBackupInfo && getBackupInfo().then(info => {
      if (info) setBackupStatus(prev => ({ ...prev, lastBackup: info.lastBackup }))
    }).catch(() => {})
  }, [])

  const handleResizeStart = useCallback((e) => {
    const startX = e.clientX, startW = sbWidth
    // Souřadnice myši jsou ve zvětšených pixelech → přepočet na CSS pixely
    const onMove = (ev) => setSbWidth(Math.max(180, Math.min(380, startW + (ev.clientX - startX) / uiZoom)))
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }, [sbWidth, uiZoom])

  const openDetail = (type, id) => setDetail({ type, id })

  // Logika fulltextového vyhledávání
  const getSearchResults = () => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    const results = []
    // Telefon / účet: porovnání bez mezer (+420 777 123 456 = 777123456)
    const qDigits = q.replace(/[\s+\-/]/g, '')
    const digitsMatch = (v) => qDigits.length >= 4 && /^\d+$/.test(qDigits) && (v || '').replace(/\D/g, '').includes(qDigits)
    const has = (v) => !!v && String(v).toLowerCase().includes(q)

    // Hledání v nájemnících (jméno, email, ico, telefon, kontaktní osoba)
    tenants.forEach(t => {
      if (has(t.name) || has(t.email) || (t.ico && t.ico.includes(q)) || has(t.contactPerson) || digitsMatch(t.phone) || digitsMatch(t.whatsapp)) {
        const tFirms = [...new Set(contracts.filter(c => c.tenantId === t.id && isContractOccupying(c)).map(c => getFirm && getFirm(contractSubject(c, assets))).filter(Boolean))]
        results.push({ id: t.id, type: 'tenant', label: 'Nájemce', text: t.name, firms: tFirms })
      }
    })

    // Hledání v předmětech (jednotka, firma)
    assets.forEach(a => {
      if ((a.unit && a.unit.toLowerCase().includes(q)) || (a.subject && a.subject.toLowerCase().includes(q))) {
        results.push({ id: a.id, type: 'asset', label: 'Objekt', text: `${a.unit} (${a.subject})`, firms: [getFirm && getFirm(a.subject)].filter(Boolean) })
      }
    })

    // Hledání v úkolech (název, tag)
    tasks.forEach(t => {
      if ((t.title && t.title.toLowerCase().includes(q)) || (t.tag && t.tag.toLowerCase().includes(q))) {
        results.push({ id: t.id, type: 'task', label: 'Úkol', text: t.title })
      }
    })

    // Hledání v smlouvách (nájemce + předmět, skupina plateb, poznámky, spolubydlící)
    contracts.forEach(c => {
      const tenant = tenants.find(t => t.id === c.tenantId)
      const asset = assets.find(a => a.id === c.assetId)
      const cSubject = contractSubject(c, assets)
      const text = [tenant?.name, asset?.unit, cSubject].filter(Boolean).join(' · ')
      const hint = has(c.groupLabel) ? ` · 🔗 ${c.groupLabel}` : has(c.contractNotes) ? ' · 📝 v poznámce' : has(c.coResidents) ? ' · 👥 spolubydlící' : ''
      if (text.toLowerCase().includes(q) || hint) {
        results.push({ id: c.id, type: 'contract', label: 'Smlouva', text: text + hint, firms: [getFirm && getFirm(cSubject)].filter(Boolean) })
      }
    })

    // Hledání v dokumentech (název souboru)
    documents.forEach(d => {
      if (d.name && d.name.toLowerCase().includes(q)) {
        results.push({ id: d.id, type: 'doc', label: 'Soubor', text: d.name, firms: [getFirm && d.subject && getFirm(d.subject)].filter(Boolean) })
      }
    })

    return results.slice(0, 12)
  }

  const handleResultClick = (res) => {
    if (res.type === 'task') {
      handleNav('kanban')
    } else if (res.type === 'doc') {
      handleNav('docs')
    } else if (res.type === 'contract') {
      openDetail('contract', res.id)
    } else {
      openDetail(res.type, res.id)
    }
    setSearchQuery('')
    setIsSearchFocused(false)
  }

  const VIEWS = { 
    dashboard: () => <Dashboard onNav={handleNav} onOpen={(id) => openDetail('contract', id)} />, 
    tenants: () => <Tenants onOpen={(id) => openDetail('tenant', id)} />, 
    residential: () => <Assets type="residential" activeSubject={subject} onOpen={(id) => openDetail('asset', id)} />,
    commercial: () => <Assets type="commercial" activeSubject={subject} onOpen={(id) => openDetail('asset', id)} />,
    ads: () => <Assets type="ads" activeSubject={subject} onOpen={(id) => openDetail('asset', id)} />,
    parking: () => <Assets type="parking" activeSubject={subject} onOpen={(id) => openDetail('asset', id)} />,
    ostatni: () => <Assets type="ostatni" activeSubject={subject} onOpen={(id) => openDetail('asset', id)} />,
    contracts: () => <Contracts activeSubject={subject} onOpen={(id) => openDetail('contract', id)} />, 
    payments: () => <Payments />, 
    'operational-costs': () => <OperationalCosts />,
    maintenance: () => <Maintenance />, 
    export: () => <Export />, 
    kanban: () => <Kanban />, 
    calendar: () => <Calendar onNav={handleNav} onOpen={(type, id) => openDetail(type, id)} />,
    docs: () => <Docs />, 
    alerts: () => <Alerts />, 
    trash: () => <Trash />, 
    history: History
  }
  
  const ActiveView = VIEWS[view] || (() => <div style={{ padding: 60, textAlign: 'center' }}>Sekce se připravuje.</div>)
  const searchResults = getSearchResults()

  return (
    <div className="layout">
      {/* PIN modal */}
      {showPinModal && (
        <DialogShell icon="🔐" title="Přepnutí na Ondra" subtitle="Zadej PIN pro přepnutí do admin režimu." width={360} zIndex={9000}
          onClose={() => { setShowPinModal(false); setPinValue('') }}
          footer={<>
            <button className="btn" onClick={() => { setShowPinModal(false); setPinValue('') }}>Zrušit</button>
            <button className="btn btn-primary" style={{ fontWeight: 800 }} onClick={handlePinSubmit}>Potvrdit</button>
          </>}>
            <input
              type="password"
              autoFocus
              maxLength={8}
              placeholder="PIN"
              value={pinValue}
              onChange={e => { setPinValue(e.target.value); setPinError(false) }}
              onKeyDown={e => { if (e.key === 'Enter') handlePinSubmit() }}
              style={{
                width: '100%', padding: '12px 16px', fontSize: 22, textAlign: 'center', letterSpacing: 8,
                borderRadius: 10, border: `2px solid ${pinError ? '#EF4444' : 'var(--border)'}`,
                background: pinError ? 'var(--tone-red-soft)' : 'var(--bg2)', color: 'var(--text)',
                outline: 'none', boxSizing: 'border-box', marginBottom: 8,
              }}
            />
            {pinError && <div style={{ fontSize: 12, color: '#EF4444', textAlign: 'center', fontWeight: 700 }}>Nesprávný PIN — zkus to znovu.</div>}
        </DialogShell>
      )}
      {updateInfo && (
        <UpdateDialog
          version={updateInfo.version}
          body={updateInfo.body}
          onClose={() => setUpdateInfo(null)}
        />
      )}
      <Sidebar active={view} onNav={handleNav} width={sbWidth} onResizeStart={handleResizeStart} urgentContracts={urgentContracts} unreadCount={unreadCount} />
      <div className="main">
        <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid var(--border)', position: 'relative', zIndex: 50 }}>
          <div style={{ display: 'flex', gap: 12, flex: 1, maxWidth: 600 }}>
            
            {/* FULLTEXTOVÉ VYHLEDÁVÁNÍ */}
            <div style={{ position: 'relative', flex: 1 }}>
              <input 
                ref={searchInputRef}
                type="text" 
                placeholder="Hledat… (Ctrl+F)" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)} // Zpoždění, aby šlo kliknout na výsledek
                style={{ 
                  width: '100%', padding: '8px 14px', background: '#F0FDF4', 
                  border: '1px solid #BBF7D0', borderRadius: 'var(--r)', 
                  fontSize: 13, color: '#166534', fontWeight: 600, outline: 'none' 
                }}
              />
              
              {/* Našeptávač výsledků */}
              {isSearchFocused && searchQuery.trim() !== '' && (
                <div style={{ 
                  position: 'absolute', top: '100%', left: 0, right: 0, 
                  background: 'var(--bg)', border: '1px solid var(--border)', 
                  borderRadius: 12, marginTop: 6, boxShadow: '0 10px 30px rgba(0,0,0,0.1)', 
                  zIndex: 1000, overflow: 'hidden' 
                }}>
                  {searchResults.length > 0 ? searchResults.map((res, i) => (
                    <div 
                      key={i} 
                      onClick={() => handleResultClick(res)}
                      style={{ 
                        padding: '10px 16px', borderBottom: '1px solid var(--border2)', 
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                        background: 'var(--bg)'
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'var(--bg2)'}
                      onMouseOut={e => e.currentTarget.style.background = 'var(--bg)'}
                    >
                      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', background: 'var(--bg3)', padding: '4px 8px', borderRadius: 6, color: 'var(--text2)', width: 70, textAlign: 'center' }}>
                        {res.label}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0 }}>{res.text}</span>
                      {(res.firms || []).map(f => <FirmBadge key={f.name} firm={f} size={22} />)}
                    </div>
                  )) : (
                    <div style={{ padding: '16px', fontSize: 13, color: 'var(--text3)', textAlign: 'center', fontWeight: 500 }}>
                      Hledaný výraz se v systému nenachází.
                    </div>
                  )}
                </div>
              )}
            </div>

            <FirmPickerButton
              value={subject}
              onChange={setSubject}
              sections={subjects.filter(s => assets.some(a => a.subject === s) || contracts.some(c => contractSubject(c, assets) === s))}
              getStat={(sel) => {
                // Platné smlouvy ve výběru + kolik z nich končí do 60 dní
                const today = new Date(); today.setHours(0, 0, 0, 0)
                const act = contracts.filter(c => isContractOccupying(c) && selectionMatches(sel, contractSubject(c, assets)))
                const ending = act.filter(c => { const e = parseDate(c.end); return e && e >= today && (e - today) / 86400000 <= 60 && !hasSuccessor(c, contracts) }).length
                return { count: `${act.length} sml.`, text: ending > 0 ? `${ending} brzy končí` : `${act.length} platných smluv`, tone: ending > 0 ? 'warn' : 'muted' }
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            {/* Velikost písma */}
            <div title="Velikost písma" style={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid var(--border)', borderRadius: 9, padding: 2, background: 'var(--bg)' }}>
              {[[1, 12, '100 %'], [1.15, 14.5, '115 %'], [1.3, 17, '130 %']].map(([z, fs, lbl]) => (
                <button key={z} onClick={() => setUiZoom(z)} title={`Písmo ${lbl}`} style={{
                  width: 30, height: 28, borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: fs, fontWeight: 800, lineHeight: 1,
                  background: uiZoom === z ? 'var(--accent)' : 'transparent', color: uiZoom === z ? '#fff' : 'var(--text)',
                }}>A</button>
              ))}
            </div>
            {/* Dark mode toggle */}
            <button
              className="btn btn-sm"
              style={{ padding: '7px 10px', fontSize: 15 }}
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Přepnout na světlý režim' : 'Přepnout na tmavý režim'}
            >{theme === 'dark' ? '☀️' : '🌙'}</button>
            <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
            {/* Backup status — skryto pro Pavla */}
            {currentUser !== 'Pavel' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text3)' }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: backupStatus.syncing ? '#FBBF24'
                      : unsavedSinceBackup ? '#F59E0B'
                      : backupStatus.lastBackup === 'Nikdy' ? '#EF4444'
                      : '#22C55E',
                    boxShadow: unsavedSinceBackup ? '0 0 0 2px rgba(245,158,11,0.3)' : 'none',
                  }} />
                  <span style={{ fontWeight: 500 }}>
                    {unsavedSinceBackup
                      ? `Nezálohováno${backupStatus.lastBackup && backupStatus.lastBackup !== 'Nikdy' ? ` • ${backupStatus.lastBackup}` : ''}`
                      : backupStatus.lastBackup === 'Nikdy'
                        ? 'Nikdy nezálohováno'
                        : `Záloha: ${backupStatus.lastBackup}`}
                  </span>
                </div>
                <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
              </>
            )}
            <span style={{ color: 'var(--text3)', fontWeight: 500 }}>Přihlášen jako:</span>
            <select value={currentUser} onChange={e => handleUserChange(e.target.value)} style={{ padding: '8px 14px', border: '1px solid #BBF7D0', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: '#F0FDF4', color: '#115E59', cursor: 'pointer', outline: 'none' }}>
              <option value="Ondra">Ondra</option>
              <option value="Pavel">Pavel</option>
            </select>
            {/* Settings tlačítko */}
            <button
              className="btn btn-sm"
              style={{ padding: '7px 10px', fontSize: 15 }}
              onClick={() => setShowSettings(true)}
              title="Nastavení"
            >⚙️</button>
          </div>
        </div>
        <div className="content" ref={contentRef}>
          {isReadOnly && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '10px 18px', marginBottom: 20, color: '#92400E', fontSize: 13, fontWeight: 600 }}>
              <span style={{ fontSize: 16 }}>👁️</span>
              <span>Přihlášen jako <strong>Pavel</strong> — režim pouze ke čtení. Žádné změny nelze uložit.</span>
              {(() => {
                // Stáří dat: poslední změna, kterou Ondra uložil (log je součástí synchronizované DB)
                const last = (logs || []).find(l => l.user && l.user !== 'Pavel')
                return last ? <span style={{ marginLeft: 'auto', fontWeight: 700, whiteSpace: 'nowrap' }}>🕒 Data k poslední změně: {last.timestamp}{last.user ? ` (${last.user})` : ''}</span> : null
              })()}
            </div>
          )}
          {ActiveView()}
        </div>
      </div>
      {detail && <DetailPanel type={detail.type} id={detail.id} onClose={() => setDetail(null)} onOpen={openDetail} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} onOpen={(type, id) => { setShowSettings(false); openDetail(type, id) }} onBackupDone={() => {
        setUnsavedSinceBackup(false)
        getBackupInfo && getBackupInfo().then(info => {
          if (info) setBackupStatus(prev => ({ ...prev, lastBackup: info.lastBackup }))
        }).catch(() => {})
      }} />}
    </div>
  )
}

export default function App() { return <AppWithActivation /> }