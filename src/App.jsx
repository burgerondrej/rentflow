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
import { contractSubject, selectionMatches, parseDate, isContractOccupying, hasSuccessor, getMonthRent, getMonthDeposits, groupMembersInMonth, isContractBillable, isContractInMonth, PERIOD_LEN } from './utils.js'
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
  // Zásobník detailů: detail otevřený z detailu se přidá navrch; Esc / ✕ = o krok zpět (i na původní záložku),
  // klik mimo okno = zavřít vše. onReturn prvního detailu = znovu otevřít okno, odkud přišel (Kontrola dat, Nastavení).
  const [detailStack, setDetailStack] = useState([])
  const detailStackRef = useRef([])
  const detailDataRef = useRef({})
  detailDataRef.current = { contracts, tenants, assets }
  const setStack = (next) => { detailStackRef.current = next; setDetailStack(next) }
  const detail = detailStack[detailStack.length - 1] || null
  const [showSettings, setShowSettings] = useState(false)
  const [settingsCheck, setSettingsCheck] = useState(false) // Nastavení otevřít rovnou s Kontrolou dat (návrat z detailu)
  const [backupStatus, setBackupStatus] = useState({ lastBackup: '…', syncing: false })
  const [unsavedSinceBackup, setUnsavedSinceBackup] = useState(false)
  // Stav kopie DB na Google Disku (z ní čte Pavel i RentFlow Android): { configured, folderOk, copyEpoch, pending }
  const [syncStatus, setSyncStatus] = useState(null)
  const refreshSync = useCallback(() => { invoke('get_sync_status').then(setSyncStatus).catch(() => {}) }, [])
  useEffect(() => {
    refreshSync()
    const t = setInterval(refreshSync, 60000)
    window.addEventListener('focus', refreshSync)
    return () => { clearInterval(t); window.removeEventListener('focus', refreshSync) }
  }, [refreshSync])
  // Záloha + kopie na Disk (Ctrl+S i klik na štítek Disku)
  const runBackupRef = useRef(null)

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
  const [searchIdx, setSearchIdx] = useState(0) // zvýrazněný výsledek (šipky ↑↓, Enter)
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
        runBackupRef.current && runBackupRef.current()
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

  runBackupRef.current = () => {
    if (!createBackup) return
    createBackup().then(() => {
      setUnsavedSinceBackup(false)
      refreshSync()
      getBackupInfo && getBackupInfo().then(info => {
        if (info) setBackupStatus(prev => ({ ...prev, lastBackup: info.lastBackup }))
      }).catch(() => {})
    }).catch(err => console.error('Backup failed:', err))
  }

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

  const openDetail = useCallback((type, id, opts) => {
    const s = detailStackRef.current
    const top = s[s.length - 1]
    if (top && top.type === type && top.id === id) return
    setStack([...s, { type, id, tab: null, onReturn: s.length === 0 ? opts?.onReturn : undefined }])
  }, [])
  const detailExists = (e) => {
    const d = detailDataRef.current
    const list = e.type === 'contract' ? d.contracts : e.type === 'tenant' ? d.tenants : e.type === 'asset' ? d.assets : null
    return !list || list.some(x => x.id === e.id)
  }
  const closeDetail = useCallback(() => {
    const s = detailStackRef.current
    if (!s.length) return
    const next = s.slice(0, -1).filter(detailExists) // přeskočit smazané položky
    setStack(next)
    if (!next.length && s[0].onReturn) s[0].onReturn()
  }, [])
  const closeAllDetails = useCallback(() => {
    const s = detailStackRef.current
    setStack([])
    if (s[0]?.onReturn) s[0].onReturn()
  }, [])
  // Popisek předchozího detailu pro tlačítko „← Zpět“ (jen když je detail otevřený z jiného detailu)
  const detailBackLabel = () => {
    const prev = detailStack[detailStack.length - 2]
    if (!prev) return null
    if (prev.type === 'contract') {
      const c = contracts.find(x => x.id === prev.id)
      const unit = c && assets.find(a => a.id === c.assetId)?.unit
      return `Smlouva ${unit || ''}`.trim()
    }
    if (prev.type === 'tenant') return tenants.find(t => t.id === prev.id)?.name || 'Nájemce'
    if (prev.type === 'asset') return assets.find(a => a.id === prev.id)?.unit || 'Předmět'
    return 'Zpět'
  }
  const setDetailTab = useCallback((tab) => {
    const s = detailStackRef.current
    if (s.length) s[s.length - 1] = { ...s[s.length - 1], tab }
  }, [])

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
      if (has(t.name) || has(t.email) || (t.ico && t.ico.includes(q)) || has(t.contactPerson) || digitsMatch(t.phone) || digitsMatch(t.whatsapp) || digitsMatch(t.bankAccount)) {
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

    // Částka z výpisu (např. „18000“, „18 000 Kč“): smlouvy, jejichž předpis za tento nebo příští měsíc (platba předem) je
    // přesně tato částka ±1 Kč – nájem, u bytu nájem + zálohy, celá skupina plateb, víceměsíční = předpis celého období.
    const amountStr = q.replace(/kč/g, '').replace(/[\s\u00a0]/g, '').replace(',', '.')
    const amount = /^\d+(\.\d+)?$/.test(amountStr) ? Number(amountStr) : NaN
    if (amount >= 100) {
      const now = new Date()
      const months = [[now.getFullYear(), now.getMonth()], now.getMonth() === 11 ? [now.getFullYear() + 1, 0] : [now.getFullYear(), now.getMonth() + 1]]
      const kc = (v) => `${Math.round(v).toLocaleString('cs-CZ')} Kč`
      const hits = [], seenC = new Set(), seenG = new Set()
      const near = (v) => v > 0 && Math.abs(v - amount) <= 1
      for (const [y, m] of months) {
        for (const c of contracts) {
          if (!isContractBillable(c) || c.paymentFrequency === 'Zahrnuto v nájemném' || !isContractInMonth(c, y, m)) continue
          const tenant = tenants.find(t => t.id === c.tenantId), asset = assets.find(a => a.id === c.assetId)
          const cSubject = contractSubject(c, assets)
          const firmsOf = [getFirm && getFirm(cSubject)].filter(Boolean)
          if (c.groupLabel) {
            if (seenG.has(c.groupLabel)) continue
            const total = groupMembersInMonth(c.groupLabel, y, m, contracts).reduce((sum, x) => sum + getMonthRent(x, y, m), 0)
            if (near(total)) { seenG.add(c.groupLabel); hits.push({ id: c.id, type: 'contract', label: 'Částka', text: `🔗 ${c.groupLabel} · ${tenant?.name || ''} · předpis skupiny ${kc(total)}`, firms: firmsOf }) }
            continue
          }
          if (seenC.has(c.id)) continue
          const rent = getMonthRent(c, y, m)
          const multi = (PERIOD_LEN[c.paymentFrequency] || 1) > 1
          const withDep = asset?.type === 'residential' ? rent + (getMonthDeposits(c, y, m, contracts).deposit || 0) : null
          const kind = near(rent) ? (multi ? `${c.paymentFrequency.toLowerCase()} předpis` : 'nájem') : near(withDep) ? 'nájem + zálohy' : null
          if (kind) { seenC.add(c.id); hits.push({ id: c.id, type: 'contract', label: 'Částka', text: `${asset?.unit || '—'} · ${tenant?.name || ''} · ${kind} ${kc(amount)}`, firms: firmsOf }) }
        }
      }
      results.unshift(...hits)
    }

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
    dashboard: () => <Dashboard onNav={handleNav} onOpen={(id) => openDetail('contract', id)} onOpenDetail={(type, id, opts) => openDetail(type, id, opts)} />, 
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
    history: () => <History />,
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
            
            {/* FULLTEXTOVÉ VYHLEDÁVÁNÍ – paleta: štítek typu a firmy, ovládání ↑↓ Enter Esc */}
            <div style={{ position: 'relative', flex: 1 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }}>
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6"/><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Hledat nájemce, předmět, smlouvu, telefon… (Ctrl+F)"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSearchIdx(0) }}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)} // Zpoždění, aby šlo kliknout na výsledek
                onKeyDown={e => {
                  if (!searchResults.length) return
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSearchIdx(i => Math.min(i + 1, searchResults.length - 1)) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setSearchIdx(i => Math.max(i - 1, 0)) }
                  else if (e.key === 'Enter') { e.preventDefault(); handleResultClick(searchResults[Math.min(searchIdx, searchResults.length - 1)]); setSearchQuery(''); searchInputRef.current?.blur() }
                }}
                style={{
                  width: '100%', padding: '8px 14px 8px 34px', background: 'var(--bg2)',
                  border: '1.5px solid var(--border)', borderRadius: 10,
                  fontSize: 13, color: 'var(--text)', fontWeight: 600, outline: 'none'
                }}
              />

              {/* Našeptávač výsledků */}
              {isSearchFocused && searchQuery.trim() !== '' && (() => {
                const TYPE_TONE = { tenant: 'violet', contract: 'blue', asset: 'green', task: 'amber', doc: 'gray' }
                return (
                  <div className="dlg" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 1000, borderRadius: 14 }}>
                    {searchResults.length > 0 ? searchResults.map((res, i) => {
                      const tone = TYPE_TONE[res.type] || 'gray'
                      const on = i === Math.min(searchIdx, searchResults.length - 1)
                      return (
                        <div key={i}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => handleResultClick(res)}
                          onMouseEnter={() => setSearchIdx(i)}
                          style={{ padding: '9px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                            background: on ? 'var(--tone-green-soft)' : 'var(--bg)' }}>
                          <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, minWidth: 64, textAlign: 'center', flexShrink: 0,
                            background: `var(--tone-${tone}-soft)`, border: `1px solid var(--tone-${tone}-border)`, color: `var(--tone-${tone}-text)` }}>{res.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{res.text}</span>
                          {(res.firms || []).map(f => <FirmBadge key={f.name} firm={f} size={22} />)}
                        </div>
                      )
                    }) : (
                      <div style={{ padding: 16, fontSize: 13, color: 'var(--text3)', textAlign: 'center', fontWeight: 500 }}>
                        Nic nenalezeno pro „{searchQuery.trim()}“.
                      </div>
                    )}
                    <div style={{ padding: '7px 14px', fontSize: 11, color: 'var(--text3)', background: 'var(--bg2)' }}>↑↓ výběr · Enter otevřít · Esc zavřít</div>
                  </div>
                )
              })()}
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
            {/* Stav kopie na Google Disku (z ní čte Pavel i mobil) — skryto pro Pavla; klik = záloha + kopie (Ctrl+S) */}
            {currentUser !== 'Pavel' && (() => {
              const st = syncStatus
              let tone = 'green', text = '💾 Poslední záloha: …', title = 'Poslední záloha a kopie databáze na Google Disku – z ní čte Pavel i mobil. Klik = záloha (Ctrl+S).'
              if (st) {
                if (!st.configured) { tone = 'gray'; text = '💾 Záloha na Google Disk není nastavená' }
                else if (!st.folderOk) { tone = 'red'; text = '💾 Složka zálohy na Google Disku nenalezena' }
                else if (!st.copyEpoch) { tone = 'red'; text = '💾 Zatím žádná záloha – Ctrl+S' }
                else {
                  const d = new Date(st.copyEpoch * 1000), now = new Date()
                  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
                  const dayDiff = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000)
                  const when = dayDiff <= 0 ? `dnes ${hm}` : dayDiff === 1 ? `včera ${hm}` : `před ${dayDiff} dny`
                  text = `💾 Poslední záloha: ${when}`
                  if (st.pending) { tone = 'amber'; text += ' · neuložené změny – Ctrl+S' }
                }
              }
              return (
                <>
                  <button type="button" className={`btn btn-sm btn-tone-${tone === 'gray' ? 'gray' : tone}`} title={title}
                    onClick={() => !readOnlyRef.current && runBackupRef.current && runBackupRef.current()}
                    style={{ fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', borderRadius: 9 }}>{text}</button>
                  <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
                </>
              )
            })()}
            <span style={{ color: 'var(--text3)', fontWeight: 500 }}>Přihlášen jako:</span>
            <select value={currentUser} onChange={e => handleUserChange(e.target.value)} style={{ padding: '8px 14px', border: '1px solid var(--tone-green-border)', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'var(--tone-green-soft)', color: '#115E59', cursor: 'pointer', outline: 'none' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--tone-amber-soft)', border: '1px solid var(--tone-amber-border)', borderRadius: 10, padding: '10px 18px', marginBottom: 20, color: 'var(--tone-amber-text)', fontSize: 13, fontWeight: 600 }}>
              <span style={{ fontSize: 16 }}>👁️</span>
              <span>Přihlášen jako <strong>Pavel</strong> — režim pouze ke čtení. Žádné změny nelze uložit.</span>
              {(() => {
                // Stáří dat: poslední změna, kterou Ondra uložil (log je součástí synchronizované DB)
                const last = (logs || []).find(l => l.user && l.user !== 'Pavel' && l.user !== 'Systém')
                return last ? <span style={{ marginLeft: 'auto', fontWeight: 700, whiteSpace: 'nowrap' }}>🕒 Data k poslední změně: {last.timestamp}{last.user ? ` (${last.user})` : ''}</span> : null
              })()}
            </div>
          )}
          {ActiveView()}
        </div>
      </div>
      {detail && <DetailPanel key={`${detailStack.length}|${detail.type}|${detail.id}`} type={detail.type} id={detail.id} initialTab={detail.tab}
        backLabel={detailBackLabel()} onTabChange={setDetailTab} onClose={closeDetail} onCloseAll={closeAllDetails} onOpen={openDetail} />}
      {showSettings && <SettingsPanel initialCheck={settingsCheck} onClose={() => { setShowSettings(false); setSettingsCheck(false) }} onOpen={(type, id) => { setShowSettings(false); openDetail(type, id, { onReturn: () => { setSettingsCheck(true); setShowSettings(true) } }) }} onBackupDone={() => {
        setUnsavedSinceBackup(false)
        getBackupInfo && getBackupInfo().then(info => {
          if (info) setBackupStatus(prev => ({ ...prev, lastBackup: info.lastBackup }))
        }).catch(() => {})
      }} />}
    </div>
  )
}

export default function App() { return <AppWithActivation /> }