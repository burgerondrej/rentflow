import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { parseDate } from './utils.js'

const AppContext = createContext()

// ─────────────────────────────────────────
// TAURI BRIDGE
// Abstrakce – funguje v Tauri i při "npm run dev" bez Tauri
// ─────────────────────────────────────────
const isTauri = typeof window !== 'undefined' && window.__TAURI__ !== undefined

async function invoke(command, args = {}) {
  if (isTauri) {
    return window.__TAURI__.tauri.invoke(command, args)
  }
  // Dev fallback – vrátí prázdná data, aby aplikace nespadla
  console.warn(`[DEV] Tauri not available – command: ${command}`, args)
  return null
}

// ─────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────
export function AppProvider({ children }) {
  const [tenants, setTenants] = useState([])
  const [assets, setAssets] = useState([])
  const [contracts, setContracts] = useState([])
  const [payments, setPayments] = useState([])
  const [tasks, setTasks] = useState([])
  const [revisions, setRevisions] = useState([])
  const [documents, setDocuments] = useState([])
  const [trash, setTrash] = useState([])
  const [logs, setLogs] = useState([])
  const [operationalCosts, setOperationalCosts] = useState([])
  const [subjectData, setSubjectData] = useState([])
  const [mainObjects, setMainObjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [splashStatus, setSplashStatus] = useState('Spouštím RentFlow…')
  const [currentUser, setCurrentUserState] = useState(() => localStorage.getItem('rentflow_user') || 'Ondra')
  const isReadOnly = currentUser === 'Pavel'
  const setCurrentUser = (user) => {
    localStorage.setItem('rentflow_user', user)
    setCurrentUserState(user)
  }
  const [theme, setThemeState] = useState(() => localStorage.getItem('rentflow_theme') || 'light')
  const setTheme = (valOrFn) => {
    const next = typeof valOrFn === 'function' ? valOrFn(theme) : valOrFn
    localStorage.setItem('rentflow_theme', next)
    setThemeState(next)
  }

  // ─── TOAST NOTIFIKACE ───
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  const showToast = useCallback((message, type = 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 4500)
  }, [])

  // Guard pro read-only – Pavel nesmí zapisovat
  const guardWrite = () => {
    if (isReadOnly) {
      showToast('Přihlášen v režimu pouze ke čtení (Pavel). Žádné změny nelze uložit.', 'warning')
      return true
    }
    return false
  }

  // ─── POČÁTEČNÍ NAČTENÍ DAT Z DATABÁZE ───
  useEffect(() => {
    const load = async () => {
      try {
        setSplashStatus('Připojuji databázi…')
        await new Promise(r => setTimeout(r, 300))
        setSplashStatus('Načítám nájemníky…')
        const t = await invoke('get_tenants')
        if (t) setTenants(t)

        setSplashStatus('Načítám předměty nájmu…')
        const a = await invoke('get_assets')
        if (a) setAssets(a)

        setSplashStatus('Načítám smlouvy…')
        const c = await invoke('get_contracts')
        if (c) setContracts(c)

        setSplashStatus('Načítám platby a úkoly…')
        const [p, k, r, d, tr, l, oc] = await Promise.all([
          invoke('get_payments'),
          invoke('get_tasks'),
          invoke('get_revisions'),
          invoke('get_documents'),
          invoke('get_trash'),
          invoke('get_logs'),
          invoke('get_operational_costs'),
        ])
        if (p) setPayments(p)
        if (k) setTasks(k)
        if (r) setRevisions(r)
        if (d) setDocuments(d)
        if (tr) setTrash(tr)
        if (l) setLogs(l)
        if (oc) setOperationalCosts(oc)

        setSplashStatus('Načítám konfiguraci…')
        const [subj, objs] = await Promise.all([
          invoke('get_subjects'),
          invoke('get_objects'),
        ])
        if (subj) setSubjectData(subj)
        if (objs) setMainObjects(objs)

        setSplashStatus('Vše připraveno ✓')
        await new Promise(r => setTimeout(r, 400))
      } catch (err) {
        console.error('Chyba při načítání dat:', err)
        setSplashStatus('Chyba při načítání — pokračuji…')
        await new Promise(r => setTimeout(r, 600))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ─── VÝPOČET UPOZORNĚNÍ (reaguje na živá data) ───
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let realAlertsCount = 0
  contracts.filter(c => c.status === 'active').forEach(c => {
    const d = parseDate(c.end)
    if (d && (d - today) / (1000 * 60 * 60 * 24) <= 60) realAlertsCount++
  })
  revisions.forEach(r => {
    const d = parseDate(r.lastDate)
    if (d) {
      d.setMonth(d.getMonth() + parseInt(r.interval || 12))
      if ((d - today) / (1000 * 60 * 60 * 24) <= 30) realAlertsCount++
    }
  })
  tasks.filter(t => t.status !== 'done').forEach(t => {
    if (t.deadline) {
      const d = new Date(t.deadline)
      if ((d - today) / (1000 * 60 * 60 * 24) <= 3) realAlertsCount++
    } else if (t.priority === 'Vysoká') {
      realAlertsCount++
    }
  })

  const unreadCount = realAlertsCount
  const urgentContracts = contracts.filter(c => {
    const d = parseDate(c.end)
    return c.status === 'active' && d && (d - today) / (1000 * 60 * 60 * 24) <= 30
  }).length

  // ─── POMOCNÝ LOG ───
  const addLog = useCallback(async (action, module, detail) => {
    try {
      const newLog = await invoke('add_log', {
        user: currentUser, action, module, detail
      })
      if (newLog) setLogs(prev => [newLog, ...prev])
    } catch (err) {
      console.error('Log error:', err)
    }
  }, [currentUser])

  // Pokud Tauri není dostupné (dev bez Tauri), použijeme lokální stav
  const addLogLocal = useCallback((action, module, detail) => {
    const newLog = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleString('cs-CZ'),
      user: currentUser,
      action, module, detail
    }
    setLogs(prev => [newLog, ...prev])
  }, [currentUser])

  const logAction = isTauri ? addLog : addLogLocal

  // ─────────────────────────────────────────
  // NÁJEMNÍCI
  // ─────────────────────────────────────────
  const addTenant = async (t) => {
    if (guardWrite()) return
    try {
      const result = await invoke('add_tenant', { tenant: t, user: currentUser })
      if (result) {
        setTenants(prev => [...prev, result])
        const freshLogs = await invoke('get_logs')
        if (freshLogs) setLogs(freshLogs)
        return result.id
      }
    } catch (err) {
      console.error('addTenant error:', err)
      showToast('Nepodařilo se uložit nájemce. Zkontroluj připojení k databázi.')
    }
  }

  const updateTenant = async (id, updates) => {
    if (guardWrite()) return
    try {
      const existing = tenants.find(x => x.id === id) || {}
      const updated = { ...existing, ...updates }
      await invoke('update_tenant', { id, tenant: updated, user: currentUser })
      setTenants(prev => prev.map(x => x.id === id ? updated : x))
    } catch (err) {
      console.error('updateTenant error:', err)
    }
  }

  const deleteTenant = async (id) => {
    if (guardWrite()) return
    const item = tenants.find(t => t.id === id)
    try {
      await invoke('delete_tenant', { id, name: item?.name || id, user: currentUser })
      setTenants(prev => prev.filter(t => t.id !== id))
      const [freshTrash, freshLogs] = await Promise.all([invoke('get_trash'), invoke('get_logs')])
      if (freshTrash) setTrash(freshTrash)
      if (freshLogs) setLogs(freshLogs)
    } catch (err) {
      console.error('deleteTenant error:', err)
    }
  }

  const archiveTenant = async (id) => {
    if (guardWrite()) return
    const item = tenants.find(t => t.id === id)
    if (!item) return
    await updateTenant(id, { ...item, status: 'archived' })
    logAction('Archivace', 'Nájemníci', `Archivován klient: ${item.name}`)
  }

  // ─────────────────────────────────────────
  // PŘEDMĚTY NÁJMU (Assets)
  // ─────────────────────────────────────────
  const addAsset = async (a) => {
    if (guardWrite()) return
    try {
      const result = await invoke('add_asset', { asset: a, user: currentUser })
      if (result) {
        setAssets(prev => [...prev, result])
        const freshLogs = await invoke('get_logs')
        if (freshLogs) setLogs(freshLogs)
        return result.id
      }
    } catch (err) {
      console.error('addAsset error:', err)
      showToast('Nepodařilo se uložit předmět nájmu. Zkontroluj připojení k databázi.')
    }
  }

  const updateAsset = async (id, updates) => {
    if (guardWrite()) return
    try {
      const existing = assets.find(x => x.id === id) || {}
      const updated = { ...existing, ...updates }
      await invoke('update_asset', { id, asset: updated, user: currentUser })
      setAssets(prev => prev.map(x => x.id === id ? updated : x))
    } catch (err) {
      console.error('updateAsset error:', err)
    }
  }

  const deleteAsset = async (id) => {
    if (guardWrite()) return
    try {
      await invoke('delete_asset', { id, user: currentUser })
      setAssets(prev => prev.filter(a => a.id !== id))
      const [freshTrash, freshLogs] = await Promise.all([invoke('get_trash'), invoke('get_logs')])
      if (freshTrash) setTrash(freshTrash)
      if (freshLogs) setLogs(freshLogs)
    } catch (err) {
      console.error('deleteAsset error:', err)
    }
  }

  const archiveAsset = async (id) => {
    if (guardWrite()) return
    const item = assets.find(a => a.id === id)
    if (!item) return
    await updateAsset(id, { ...item, status: 'archived' })
    logAction('Archivace', 'Předměty', `Archivován předmět: ${item.unit}`)
  }

  // ─────────────────────────────────────────
  // SMLOUVY
  // ─────────────────────────────────────────
  const addContract = async (c) => {
    if (guardWrite()) return
    try {
      const result = await invoke('add_contract', { contract: c, user: currentUser })
      if (result) {
        setContracts(prev => [...prev, result])
        setAssets(prev => prev.map(a => a.id === c.assetId ? { ...a, status: 'occupied' } : a))
        const freshLogs = await invoke('get_logs')
        if (freshLogs) setLogs(freshLogs)
        return result.id
      }
    } catch (err) {
      console.error('addContract error:', err)
      showToast('Nepodařilo se uložit smlouvu. Zkontroluj připojení k databázi.')
    }
  }

  const updateContract = async (id, updates) => {
    if (guardWrite()) return
    try {
      const existing = contracts.find(x => x.id === id) || {}
      const updated = { ...existing, ...updates }
      await invoke('update_contract', { id, contract: updated, user: currentUser })
      setContracts(prev => prev.map(x => x.id === id ? updated : x))
    } catch (err) {
      console.error('updateContract error:', err)
    }
  }

  const deleteContract = async (id) => {
    if (guardWrite()) return
    try {
      await invoke('delete_contract', { id, user: currentUser })
      setContracts(prev => prev.filter(c => c.id !== id))
      const [freshTrash, freshLogs] = await Promise.all([invoke('get_trash'), invoke('get_logs')])
      if (freshTrash) setTrash(freshTrash)
      if (freshLogs) setLogs(freshLogs)
    } catch (err) {
      console.error('deleteContract error:', err)
    }
  }

  const archiveContract = async (id) => {
    if (guardWrite()) return
    const item = contracts.find(c => c.id === id)
    if (!item) return
    await updateContract(id, { ...item, status: 'archived' })
    // Asset se uvolní jen pokud na něm neexistuje jiná aktivní smlouva
    if (item.assetId) {
      const otherActive = contracts.some(c => c.id !== id && c.assetId === item.assetId && c.status === 'active')
      if (!otherActive) await updateAsset(item.assetId, { status: 'free' })
    }
    logAction('Archivace', 'Smlouvy', `Archivována smlouva: ${id}`)
  }

  // ─────────────────────────────────────────
  // PLATBY
  // ─────────────────────────────────────────
  const addPayment = async (p) => {
    if (guardWrite()) return
    try {
      const result = await invoke('add_payment', { payment: p, user: currentUser })
      if (result) {
        setPayments(prev => [...prev, result])
        return result.id
      }
    } catch (err) {
      console.error('addPayment error:', err)
    }
  }

  const updatePayment = (id, updates) => setPayments(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))

  const updatePaymentAmount = async (id, amount, agreed, date) => {
    if (guardWrite()) return
    // Optimistic update ihned
    setPayments(prev => prev.map(p => p.id === id ? { ...p, amount, agreed: !!agreed, ...(date != null ? { date } : {}) } : p))
    try {
      await invoke('update_payment_amount', { id, amount, agreed: !!agreed, date: date || null, user: currentUser })
    } catch (err) {
      console.error('updatePaymentAmount error:', err)
      // Rollback při chybě
      try {
        const fresh = await invoke('get_payments')
        if (fresh) setPayments(fresh)
      } catch { /* ignore */ }
    }
  }

  const deletePayment = async (id) => {
    if (guardWrite()) return
    try {
      await invoke('delete_payment', { id })
      setPayments(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      console.error('deletePayment error:', err)
      // State se NEaktualizuje pokud DB operace selhala — platba zůstane viditelná
    }
  }

  // ─────────────────────────────────────────
  // KANBAN ÚKOLY
  // ─────────────────────────────────────────
  const addTask = async (t) => {
    if (guardWrite()) return
    try {
      const result = await invoke('add_task', { task: t, user: currentUser })
      if (result) {
        setTasks(prev => [...prev, result])
        return result.id
      }
    } catch (err) {
      console.error('addTask error:', err)
    }
  }

  const updateTask = async (id, updates) => {
    if (guardWrite()) return
    try {
      const existing = tasks.find(x => x.id === id) || {}
      const updated = { ...existing, ...updates }
      await invoke('update_task', { id, task: updated, user: currentUser })
      setTasks(prev => prev.map(x => x.id === id ? updated : x))
    } catch (err) {
      setTasks(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x))
    }
  }

  const deleteTask = async (id) => {
    if (guardWrite()) return
    try {
      await invoke('delete_task', { id, user: currentUser })
      setTasks(prev => prev.filter(t => t.id !== id))
      const [freshTrash, freshLogs] = await Promise.all([invoke('get_trash'), invoke('get_logs')])
      if (freshTrash) setTrash(freshTrash)
      if (freshLogs) setLogs(freshLogs)
    } catch (err) {
      console.error('deleteTask error:', err)
    }
  }

  // ─────────────────────────────────────────
  // REVIZE
  // ─────────────────────────────────────────
  const addRevision = async (r) => {
    if (guardWrite()) return
    try {
      const result = await invoke('add_revision', { revision: r, user: currentUser })
      if (result) {
        setRevisions(prev => [...prev, result])
        return result.id
      }
    } catch (err) {
      console.error('addRevision error:', err)
    }
  }

  const updateRevision = async (id, updates) => {
    if (guardWrite()) return
    try {
      const existing = revisions.find(x => x.id === id) || {}
      const updated = { ...existing, ...updates }
      await invoke('update_revision', { id, revision: updated })
      setRevisions(prev => prev.map(x => x.id === id ? updated : x))
    } catch (err) {
      setRevisions(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x))
    }
  }

  const deleteRevision = async (id) => {
    if (guardWrite()) return
    try {
      await invoke('delete_revision', { id, user: currentUser })
      setRevisions(prev => prev.filter(r => r.id !== id))
      const [freshTrash, freshLogs] = await Promise.all([invoke('get_trash'), invoke('get_logs')])
      if (freshTrash) setTrash(freshTrash)
      if (freshLogs) setLogs(freshLogs)
    } catch (err) {
      console.error('deleteRevision error:', err)
    }
  }

  // ─────────────────────────────────────────
  // DOKUMENTY
  // ─────────────────────────────────────────
  const addDocument = async (d) => {
    if (guardWrite()) return
    try {
      const result = await invoke('add_document', { document: d, user: currentUser })
      if (result) {
        setDocuments(prev => [...prev, result])
        return result.id
      }
    } catch (err) {
      console.error('addDocument error:', err)
    }
  }

  const deleteDocument = async (id) => {
    if (guardWrite()) return
    try {
      await invoke('delete_document', { id, user: currentUser })
      setDocuments(prev => prev.filter(d => d.id !== id))
      const [freshTrash, freshLogs] = await Promise.all([invoke('get_trash'), invoke('get_logs')])
      if (freshTrash) setTrash(freshTrash)
      if (freshLogs) setLogs(freshLogs)
    } catch (err) {
      console.error('deleteDocument error:', err)
    }
  }

  // ─────────────────────────────────────────
  // KOŠ
  // ─────────────────────────────────────────
  const restoreFromTrash = async (trashId) => {
    if (guardWrite()) return
    const trashedItem = trash.find(t => t.trashId === trashId || t.trash_id === trashId)
    try {
      await invoke('restore_from_trash', { trashId, user: currentUser })
      setTrash(prev => prev.filter(t => (t.trashId || t.trash_id) !== trashId))
      // Reload příslušné kolekce
      if (trashedItem) {
        const type = trashedItem.type || trashedItem.item_type
        switch(type) {
          case 'tenant': invoke('get_tenants').then(r => r && setTenants(r)); break
          case 'asset':  invoke('get_assets').then(r => r && setAssets(r)); break
          case 'contract': invoke('get_contracts').then(r => r && setContracts(r)); break
          case 'task':   invoke('get_tasks').then(r => r && setTasks(r)); break
          case 'revision': invoke('get_revisions').then(r => r && setRevisions(r)); break
          case 'document': invoke('get_documents').then(r => r && setDocuments(r)); break
        }
      }
    } catch (err) {
      // Fallback
      if (trashedItem) {
        const type = trashedItem.type
        switch(type) {
          case 'tenant': setTenants(prev => [...prev, trashedItem.item]); break
          case 'asset': setAssets(prev => [...prev, trashedItem.item]); break
          case 'contract': setContracts(prev => [...prev, trashedItem.item]); break
          case 'task': setTasks(prev => [...prev, trashedItem.item]); break
          case 'revision': setRevisions(prev => [...prev, trashedItem.item]); break
          case 'document': setDocuments(prev => [...prev, trashedItem.item]); break
        }
        setTrash(prev => prev.filter(t => t.trashId !== trashId))
      }
    }
  }

  const permanentDelete = async (trashId) => {
    if (guardWrite()) return
    try {
      await invoke('permanent_delete', { trashId })
    } catch (err) { /* ignore */ }
    setTrash(prev => prev.filter(t => (t.trashId || t.trash_id) !== trashId))
  }

  const emptyTrash = async () => {
    if (guardWrite()) return
    try {
      await invoke('empty_trash')
    } catch (err) { /* ignore */ }
    setTrash([])
  }

  // ─────────────────────────────────────────
  // PROVOZNÍ NÁKLADY
  // ─────────────────────────────────────────
  const addOperationalCost = async (oc) => {
    if (guardWrite()) return
    const result = await invoke('add_operational_cost', { cost: oc, user: currentUser })
    if (!result) throw new Error('add_operational_cost vrátilo null')
    setOperationalCosts(prev => [result, ...prev])
    const freshLogs = await invoke('get_logs')
    if (freshLogs) setLogs(freshLogs)
    return result
  }

  const updateOperationalCost = async (id, oc) => {
    if (guardWrite()) return
    await invoke('update_operational_cost', { id, cost: oc, user: currentUser })
    setOperationalCosts(prev => prev.map(c => c.id === id ? { ...c, ...oc, id } : c))
  }

  const deleteOperationalCost = async (id) => {
    if (guardWrite()) return
    await invoke('delete_operational_cost', { id, user: currentUser })
    setOperationalCosts(prev => prev.filter(c => c.id !== id))
  }

  // ─────────────────────────────────────────
  // CONTRACT AMENDMENTS
  // ─────────────────────────────────────────
  const addAmendment = async (amendment) => {
    if (guardWrite()) return
    const result = await invoke('add_amendment', { amendment, user: currentUser })
    // Přidej amendment k příslušné smlouvě v state
    setContracts(prev => prev.map(c =>
      c.id === amendment.contractId
        ? { ...c, amendments: [...(c.amendments || []), result].sort((a, b) => compareEffectiveFrom(a.effectiveFrom, b.effectiveFrom)) }
        : c
    ))
    return result
  }

  const deleteAmendment = async (amendmentId, contractId) => {
    if (guardWrite()) return
    await invoke('delete_amendment', { id: amendmentId, user: currentUser })
    setContracts(prev => prev.map(c =>
      c.id === contractId
        ? { ...c, amendments: (c.amendments || []).filter(a => a.id !== amendmentId) }
        : c
    ))
  }

  // Helper: porovná dvě CZ data "D. M. RRRR" → number pro sort
  const compareEffectiveFrom = (a, b) => {
    const parse = (s) => {
      if (!s) return 0
      const parts = s.split('.').map(p => p.trim())
      if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime()
      return 0
    }
    return parse(a) - parse(b)
  }

  // ─────────────────────────────────────────
  // ─────────────────────────────────────────
  // SUBJECTS — odvozené hodnoty
  // ─────────────────────────────────────────
  const SEP = ' \u2013 ' // EN DASH oddělovač skupiny a sekce
  const subjects = subjectData.map(s => s.name)
  const residentialSubjects = subjectData.filter(s => s.assetType === 'residential').map(s => s.name)
  const subjectGroups = [...new Set(
    subjectData
      .filter(s => s.name !== 'Ostatn\u00ed')
      .map(s => s.name.includes(SEP) ? s.name.split(SEP)[0] : s.name)
  )]
  // Skupiny pronajímatelů pro selector billing_subject
  const billingGroups = subjectGroups.map(g => {
    const rep = subjectData.find(s => (s.name.includes(SEP) ? s.name.split(SEP)[0] : s.name) === g)
    return { val: g, label: g, sub: rep?.isVatPayer ? 'Plátce DPH (21\u00a0%)' : 'Neplátce DPH', isVatPayer: rep?.isVatPayer ?? true }
  })
  // Parkovací billing options (pro selector u parking assetů)
  const _parkSubs = subjectData.filter(s => s.assetType === 'parking')
  const parkingBillingOptions = [
    { val: '', label: _parkSubs.find(s => s.isVatPayer)?.name || '', sub: 'Plátce DPH' },
    { val: _parkSubs.find(s => !s.isVatPayer)?.name || '', label: _parkSubs.find(s => !s.isVatPayer)?.name || '', sub: 'Neplátce DPH' },
  ]
  // Reklamní billing options (pro selector u ads assetů)
  const _adsSubs = subjectData.filter(s => s.assetType === 'ads')
  const adsBillingOptions = [
    { val: '', label: _adsSubs.find(s => s.isVatPayer)?.name || '', sub: 'Plátce DPH' },
    { val: _adsSubs.find(s => !s.isVatPayer)?.name || '', label: _adsSubs.find(s => !s.isVatPayer)?.name || '', sub: 'Neplátce DPH' },
  ]

  // CONTEXT VALUE
  // ─────────────────────────────────────────
  const value = {
    // Data
    isReadOnly, theme, setTheme,
    tenants, setTenants,
    assets, setAssets,
    contracts, setContracts,
    payments, setPayments,
    tasks, setTasks,
    revisions, setRevisions,
    documents, setDocuments,
    trash,
    logs,
    operationalCosts,
    // Subjects (načtené z DB — bez hardcoded názvů v JS)
    subjects,
    residentialSubjects,
    subjectGroups,
    subjectData,
    billingGroups,
    parkingBillingOptions,
    adsBillingOptions,
    mainObjects,
    // State
    loading,
    currentUser, setCurrentUser,
    // Toast notifikace
    showToast,
    // Computed
    unreadCount, urgentContracts,
    // CRUD – Nájemníci
    addTenant, updateTenant, deleteTenant, archiveTenant,
    // CRUD – Předměty
    addAsset, updateAsset, deleteAsset, archiveAsset,
    // CRUD – Smlouvy
    addContract, updateContract, deleteContract, archiveContract,
    // CRUD – Platby
    addPayment, updatePayment, updatePaymentAmount, deletePayment,
    // CRUD – Kanban
    addTask, updateTask, deleteTask,
    // CRUD – Revize
    addRevision, updateRevision, deleteRevision,
    // CRUD – Dokumenty
    addDocument, deleteDocument,
    // CRUD – Provozní náklady
    addOperationalCost, updateOperationalCost, deleteOperationalCost,
    // CRUD – Dodatky smluv (změny nájemného/záloh)
    addAmendment, deleteAmendment,
    // Koš
    restoreFromTrash, permanentDelete, emptyTrash,
    // Zálohy + Nastavení
    createBackup: async () => {
      try { return await invoke('create_backup') } catch (e) { console.error(e) }
    },
    getBackupInfo: async () => {
      try { return await invoke('get_backup_info') } catch (e) { return { lastBackup: '—', backupCount: 0, gdrivePath: '' } }
    },
    saveSettings: async (settings) => {
      try { await invoke('save_settings', { settings }) } catch (e) { console.error(e) }
    },
    getSettings: async () => {
      try { return await invoke('get_settings') } catch (e) { return {} }
    },
  }

  // Toast barvy dle typu
  const TOAST_STYLES = {
    error:   { bg: '#FEF2F2', border: '#FECACA', color: '#991B1B', icon: '⚠️' },
    warning: { bg: '#FFFBEB', border: '#FDE68A', color: '#92400E', icon: '⚠️' },
    success: { bg: '#F0FDF4', border: '#BBF7D0', color: '#166534', icon: '✓' },
    info:    { bg: '#EFF6FF', border: '#BFDBFE', color: '#1E40AF', icon: 'ℹ️' },
  }

  return (
    <AppContext.Provider value={value}>
      <>
        {loading && isTauri ? (
          <div style={{
            position: 'fixed', inset: 0,
            background: 'linear-gradient(155deg,#0A3D2B 0%,#12654A 40%,#1A8A62 72%,#0E5540 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, overflow: 'hidden'
          }}>
            {/* Pearl overlay – stejný jako sidebar */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'radial-gradient(ellipse 140% 60% at 35% 15%, rgba(160,255,210,0.11) 0%, rgba(120,220,180,0.06) 40%, transparent 70%)'
            }} />
            {/* Logo */}
            <div style={{ position: 'relative', textAlign: 'center', marginBottom: 40 }}>
              <div style={{
                width: 72, height: 72, borderRadius: 20,
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(158,255,212,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32, margin: '0 auto 20px', backdropFilter: 'blur(8px)'
              }}>🏢</div>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1 }}>
                Rent<span style={{ color: '#9EFFD4' }}>Flow</span>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(180,255,220,0.6)', marginTop: 6, fontWeight: 500 }}>
                Správa nemovitostí
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ width: 220, height: 3, background: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{
                height: '100%', background: 'linear-gradient(90deg, #4ade80, #9EFFD4)', borderRadius: 2,
                animation: 'loadbar 1.4s ease-in-out infinite',
              }} />
            </div>
            {/* Stavový text */}
            <div style={{ fontSize: 12, color: 'rgba(180,255,220,0.65)', fontWeight: 500, letterSpacing: '0.02em' }}>
              {splashStatus}
            </div>
            <style>{`
              @keyframes loadbar {
                0% { width: 0%; margin-left: 0; }
                50% { width: 65%; margin-left: 10%; }
                100% { width: 0%; margin-left: 100%; }
              }
            `}</style>
          </div>
        ) : children}

        {/* TOAST NOTIFIKACE — viditelný vždy */}
        {toast && (() => {
          const s = TOAST_STYLES[toast.type] || TOAST_STYLES.error
          return (
            <div
              role="alert"
              onClick={() => setToast(null)}
              style={{
                position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
                background: s.bg, border: `1px solid ${s.border}`, color: s.color,
                borderRadius: 12, padding: '12px 16px 12px 14px',
                fontSize: 13, fontWeight: 600, maxWidth: 380, minWidth: 220,
                boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
                animation: 'slideIn 0.2s ease',
                cursor: 'pointer', userSelect: 'none',
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}
            >
              <span style={{ flexShrink: 0, fontSize: 15 }}>{s.icon}</span>
              <span style={{ flex: 1, lineHeight: 1.45 }}>{toast.message}</span>
              <span style={{ flexShrink: 0, fontSize: 16, opacity: 0.5, marginLeft: 4 }}>×</span>
            </div>
          )
        })()}
      </>
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp musí být použit uvnitř AppProvider')
  return context
}
