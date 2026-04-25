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
import Trash from './views/Trash.jsx' 
import { Docs, Alerts } from './views/DocsAlerts.jsx'
import History from './views/History.jsx'
import OperationalCosts from './views/OperationalCosts.jsx'
import SettingsPanel from './SettingsPanel.jsx'
import UpdateDialog from './UpdateDialog.jsx'

const ALL_SUBJECTS = [
  'METROPOLE CB – Komerční prostory',
  'METROPOLE CB – Novohradská 53/55',
  'METROPOLE CB – Novohradská 57a',
  'METROPOLE CB – Parkování',
  'METROPOLE CB – Reklamní plochy',
  'METROPOLE CB – Ubytovací jednotky',
  'Bürger Pavel – Parkování',
  'Bürger Pavel – Reklamní plochy',
  'JIHOTANK',
  'JIHOTANK CB',
  'Ostatní',
]

function AppInner() {
  const { unreadCount, urgentContracts, currentUser, setCurrentUser, isReadOnly, theme, setTheme, tenants = [], assets = [], tasks = [], documents = [], contracts = [], getBackupInfo, createBackup } = useApp()

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

  // Ctrl+F → fokus na vyhledávání, Ctrl+S → záloha
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (createBackup) {
          createBackup().then(() => {
            setUnsavedSinceBackup(false)
            getBackupInfo && getBackupInfo().then(info => {
              if (info) setBackupStatus(prev => ({ ...prev, lastBackup: info.lastBackup }))
            })
          })
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
    })
  }, [])

  const handleResizeStart = useCallback((e) => {
    const startX = e.clientX, startW = sbWidth
    const onMove = (ev) => setSbWidth(Math.max(180, Math.min(380, startW + ev.clientX - startX)))
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }, [sbWidth])

  const openDetail = (type, id) => setDetail({ type, id })

  // Logika fulltextového vyhledávání
  const getSearchResults = () => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    const results = []

    // Hledání v nájemnících (jméno, email, ico)
    tenants.forEach(t => {
      if ((t.name && t.name.toLowerCase().includes(q)) || (t.email && t.email.toLowerCase().includes(q)) || (t.ico && t.ico.includes(q))) {
        results.push({ id: t.id, type: 'tenant', label: 'Nájemce', text: t.name })
      }
    })

    // Hledání v předmětech (jednotka, firma)
    assets.forEach(a => {
      if ((a.unit && a.unit.toLowerCase().includes(q)) || (a.subject && a.subject.toLowerCase().includes(q))) {
        results.push({ id: a.id, type: 'asset', label: 'Objekt', text: `${a.unit} (${a.subject})` })
      }
    })

    // Hledání v úkolech (název, tag)
    tasks.forEach(t => {
      if ((t.title && t.title.toLowerCase().includes(q)) || (t.tag && t.tag.toLowerCase().includes(q))) {
        results.push({ id: t.id, type: 'task', label: 'Úkol', text: t.title })
      }
    })

    // Hledání v smlouvách (nájemce + předmět)
    contracts.forEach(c => {
      const tenant = tenants.find(t => t.id === c.tenantId)
      const asset = assets.find(a => a.id === c.assetId)
      const text = [tenant?.name, asset?.unit, asset?.subject].filter(Boolean).join(' · ')
      if (text.toLowerCase().includes(q)) {
        results.push({ id: c.id, type: 'contract', label: 'Smlouva', text })
      }
    })

    // Hledání v dokumentech (název souboru)
    documents.forEach(d => {
      if (d.name && d.name.toLowerCase().includes(q)) {
        results.push({ id: d.id, type: 'doc', label: 'Soubor', text: d.name })
      }
    })

    return results.slice(0, 10)
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowPinModal(false); setPinValue('') } }}>
          <div style={{ background: 'var(--bg)', borderRadius: 18, padding: '32px 36px', width: 320, boxShadow: '0 24px 60px rgba(0,0,0,0.3)', animation: 'modalIn 0.18s ease' }}>
            <div style={{ fontSize: 28, textAlign: 'center', marginBottom: 8 }}>🔐</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', textAlign: 'center', marginBottom: 4 }}>Přepnutí na Ondra</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', marginBottom: 24 }}>Zadej PIN pro přepnutí do admin režimu.</div>
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
                background: pinError ? '#FEF2F2' : 'var(--bg2)', color: 'var(--text)',
                outline: 'none', boxSizing: 'border-box', marginBottom: 8,
              }}
            />
            {pinError && <div style={{ fontSize: 12, color: '#EF4444', textAlign: 'center', marginBottom: 8, fontWeight: 700 }}>Nesprávný PIN — zkus to znovu.</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => { setShowPinModal(false); setPinValue('') }}>Zrušit</button>
              <button className="btn" style={{ flex: 2, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 800 }} onClick={handlePinSubmit}>Potvrdit</button>
            </div>
          </div>
        </div>
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
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{res.text}</span>
                    </div>
                  )) : (
                    <div style={{ padding: '16px', fontSize: 13, color: 'var(--text3)', textAlign: 'center', fontWeight: 500 }}>
                      Hledaný výraz se v systému nenachází.
                    </div>
                  )}
                </div>
              )}
            </div>

            <select value={subject} onChange={e => setSubject(e.target.value)} style={{ appearance: 'none', padding: '8px 14px', border: '1px solid #BBF7D0', borderRadius: 'var(--r)', fontSize: 13, background: '#F0FDF4', color: '#15803D', fontWeight: 600, minWidth: 220, cursor: 'pointer', outline: 'none' }}>
              <option value="all">Všechny pronajímající subjekty</option>
              {ALL_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            {/* Dark mode toggle */}
            <button
              className="btn btn-sm"
              style={{ padding: '7px 10px', fontSize: 15 }}
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Přepnout na světlý režim' : 'Přepnout na tmavý režim'}
            >{theme === 'dark' ? '☀️' : '🌙'}</button>
            <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
            {/* Backup status */}
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
            </div>
          )}
          {ActiveView()}
        </div>
      </div>
      {detail && <DetailPanel type={detail.type} id={detail.id} onClose={() => setDetail(null)} onOpen={openDetail} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} onBackupDone={() => {
        setUnsavedSinceBackup(false)
        getBackupInfo && getBackupInfo().then(info => {
          if (info) setBackupStatus(prev => ({ ...prev, lastBackup: info.lastBackup }))
        })
      }} />}
    </div>
  )
}

export default function App() { return (<AppProvider><AppInner /></AppProvider>) }