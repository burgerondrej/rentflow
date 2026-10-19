import React, { useState, useEffect } from 'react'
import { useApp } from './AppContext.jsx'
import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/tauri'
import FirmsSettings from './FirmsSettings.jsx'
import { SectionHeader } from './UI.jsx'
import DataCheck from './DataCheck.jsx'

export default function SettingsPanel({ onClose, onBackupDone, onOpen, initialCheck = false }) {
  const { createBackup, getBackupInfo, saveSettings, getSettings, isReadOnly, confirmAction } = useApp()

  const [backupInfo, setBackupInfo] = useState({ lastBackup: '…', backupCount: 0, gdrivePath: '' })
  const [gdrivePath, setGdrivePath] = useState('')
  const [dbPath, setDbPath]         = useState('')
  const [backing, setBacking] = useState(false)
  const [backupDone, setBackupDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [appVersion, setAppVersion] = useState('…')
  const [cleanupState, setCleanupState] = useState(null) // null | 'running' | number
  const [showFirms, setShowFirms] = useState(false)
  const [showCheck, setShowCheck] = useState(initialCheck) // initialCheck = návrat z detailu otevřeného z Kontroly dat

  useEffect(() => {
    getBackupInfo().then(info => {
      if (info) {
        setBackupInfo(info)
        setGdrivePath(info.gdrivePath || '')
      }
    }).catch(() => {})
    getVersion().then(v => setAppVersion(v)).catch(() => setAppVersion('?'))
    getSettings().then(s => {
      if (s) setDbPath(s.dbPath || '')
    }).catch(() => {})
  }, [])

  const handleManualBackup = async () => {
    setBacking(true)
    setBackupDone(false)
    try {
      await createBackup()
      setBackupDone(true)
      onBackupDone?.()
      const info = await getBackupInfo()
      if (info) setBackupInfo(info)
      setTimeout(() => setBackupDone(false), 3000)
    } finally {
      setBacking(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    await saveSettings({ gdrivePath, dbPath })
    setSaving(false)
    setSavedOk(true)
    setTimeout(() => setSavedOk(false), 2500)
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(10, 20, 15, 0.55)', zIndex: 200, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      />
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 440,
        background: 'var(--bg)', zIndex: 201, borderLeft: '1px solid var(--border)',
        boxShadow: '-12px 0 40px rgba(0,0,0,0.22)', animation: 'modalIn 0.18s ease',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto'
      }}>
        {/* Header */}
        <div className="dlg-head" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)' }}>
          <div className="dlg-icon" style={{ background: 'var(--tone-green-soft)', borderColor: 'var(--tone-green-border)' }}>⚙️</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dlg-title">Nastavení</div>
            <div className="dlg-sub">RentFlow v{appVersion}</div>
          </div>
          <button type="button" className="dlg-close" onClick={onClose} title="Zavřít">✕</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--bg2)', flex: 1 }}>

          {/* ── FIRMY A SEKCE (jen admin) ── */}
          {!isReadOnly && (
            <div className="sec-card">
              <SectionHeader icon="🏢" tone="green" title="Firmy a sekce" />
              <div className="sec-card-body">
              <button className="btn" style={{ width: '100%', justifyContent: 'center', fontWeight: 700 }} onClick={() => setShowFirms(true)}>
                🏢 Spravovat firmy, sekce a budovy
              </button>
              <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 6 }}>Názvy, zkratky, barvy, DPH, pořadí. Přejmenování se propíše všude a předem se zazálohuje.</div>
              </div>
            </div>
          )}
          {showFirms && <FirmsSettings onClose={() => setShowFirms(false)} />}

          {/* ── KONTROLA DAT ── */}
          <div className="sec-card">
            <SectionHeader icon="🩺" tone="amber" title="Kontrola dat" />
            <div className="sec-card-body">
            <button className="btn" style={{ width: '100%', justifyContent: 'center', fontWeight: 700 }} onClick={() => setShowCheck(true)}>
              🩺 Zkontrolovat data
            </button>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 6 }}>Propadlé smlouvy, překryvy, chybějící data konce, platby bez smlouvy, duplicity… Jen čte, nic nemění.</div>
            </div>
          </div>
          {showCheck && <DataCheck onClose={() => setShowCheck(false)} onOpen={onOpen ? (type, id) => { setShowCheck(false); onOpen(type, id) } : undefined} />}

          {/* ── SEKCE ZÁLOHY ── */}
          <section className="sec-card">
            <SectionHeader icon="💾" tone="blue" title="Zálohy databáze" />
            <div className="sec-card-body">

            {/* Stav zálohy */}
            <div style={{
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '14px 16px', marginBottom: 14,
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12
            }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Poslední záloha</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{backupInfo.lastBackup}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Počet záloh</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{backupInfo.backupCount} / 30</div>
              </div>
            </div>

            <div style={{
              background: 'var(--tone-green-soft)', border: '1px solid var(--tone-green-border)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--tone-green-text)'
            }}>
              💡 Zálohy se ukládají do <code style={{ background: 'var(--bg3)', padding: '1px 4px', borderRadius: 3 }}>%APPDATA%\rentflow\backups\</code>
              <br />Automatická záloha proběhne každý den v 19:00.
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', gap: 8, opacity: backing ? 0.7 : 1 }}
              onClick={handleManualBackup}
              disabled={backing}
            >
              {backing ? '⏳ Zálohuji…' : backupDone ? '✅ Záloha uložena!' : '💾 Vytvořit zálohu teď'}
            </button>

            {!isReadOnly && (
              <button
                className="btn"
                style={{ width: '100%', justifyContent: 'center', marginTop: 8, color: cleanupState === 0 ? '#16a34a' : 'var(--text2)', opacity: cleanupState === 'running' ? 0.7 : 1 }}
                disabled={cleanupState === 'running'}
                onClick={() => confirmAction({
                  title: 'Vyčistit duplicitní platby?',
                  text: 'Smažou se platby zapsané dvakrát (stejná smlouva / skupina, měsíc a typ) – vždy zůstane jedna. Před čištěním doporučuji zálohu (Ctrl+S).',
                  okLabel: 'Vyčistit', danger: true,
                  onOk: async () => {
                    setCleanupState('running')
                    try {
                      const deleted = await invoke('cleanup_duplicate_payments')
                      setCleanupState(deleted)
                    } catch { setCleanupState(0) }
                  },
                })}
              >
                {cleanupState === 'running' ? '⏳ Čistím…'
                  : typeof cleanupState === 'number' ? `✅ Smazáno ${cleanupState} duplikátů`
                  : '🧹 Vyčistit duplicitní platby'}
              </button>
            )}
            </div>
          </section>

          {/* ── SEKCE GOOGLE DRIVE ── */}
          <section className="sec-card">
            <SectionHeader icon="☁️" tone="blue" title="Google Drive sync" />
            <div className="sec-card-body">

            <div style={{
              background: 'var(--tone-blue-soft)', border: '1px solid var(--tone-blue-border)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--tone-blue-text)',
              lineHeight: 1.6
            }}>
              📂 Zadej cestu ke složce synchronizované přes <strong>Google Drive for Desktop</strong>.<br /><br />
              <strong>🖥️ U Ondřeje (tento PC):</strong><br />
              Nastav cestu ke sdílené GDrive složce (např. <code style={{ background: 'var(--bg3)', padding: '1px 4px', borderRadius: 3 }}>C:\\Users\\ondra\\Google Drive\\RentFlow</code>).
              Při každé záloze se sem automaticky zkopírují databáze i nově nahrané přílohy smluv.<br /><br />
              <strong>🖥️ U Pavla (druhý PC):</strong><br />
              1. Nainstalovat <strong>Google Drive for Desktop</strong> a přihlásit se ke stejnému Google účtu.<br />
              2. V nastavení RentFlow zadat do pole <em>Cesta ke Google Drive složce</em> cestu k té samé sdílené složce na Pavlově PC.<br />
              3. Do pole <em>Cesta k databázi</em> zadat plnou cestu k souboru <code style={{ background: 'var(--bg3)', padding: '1px 4px', borderRadius: 3 }}>rentflow.db</code> uvnitř té složky.<br />
              4. Restartovat aplikaci.<br /><br />
              <strong>⚠️ Přílohy smluv</strong> se synchronizují automaticky při každé záloze (Ondra → GDrive → Pavel). Než Pavel otevře přílohu, musí Google Drive na jeho PC dokončit synchronizaci.
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>
                Cesta ke Google Drive složce
              </label>
              <input
                type="text"
                className="btn"
                style={{ width: '100%', cursor: 'text', textAlign: 'left', fontFamily: 'monospace', fontSize: 12 }}
                placeholder="C:\Users\ondra\Google Drive\RentFlow"
                value={gdrivePath}
                onChange={e => setGdrivePath(e.target.value)}
              />
            </div>

            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 16 }}>
              Tip: Otevři Google Drive for Desktop → klikni pravým na složku → „Kopírovat cestu"
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', opacity: saving ? 0.7 : 1 }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '⏳ Ukládám…' : savedOk ? '✅ Nastavení uloženo!' : '💾 Uložit nastavení'}
            </button>

            {backupInfo.gdrivePath && (
              <div style={{
                marginTop: 12, padding: '8px 12px',
                background: 'var(--tone-green-soft)', border: '1px solid var(--tone-green-border)',
                borderRadius: 8, fontSize: 12, color: 'var(--tone-green-text)'
              }}>
                ✅ Drive sync aktivní: <code style={{ wordBreak: 'break-all' }}>{backupInfo.gdrivePath}</code>
              </div>
            )}
            </div>
          </section>

          {/* ── SEKCE DATABÁZE ── */}
          <section className="sec-card">
            <SectionHeader icon="🗄️" tone="gray" title="Cesta k databázi" />
            <div className="sec-card-body">
            <div style={{ background: 'var(--tone-amber-soft)', border: '1px solid var(--tone-amber-border)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--tone-amber-text)', lineHeight: 1.6 }}>
              <strong>🖥️ U Ondřeje:</strong> Nech prázdné — databáze se načítá z výchozího umístění <code style={{ background: 'var(--bg3)', padding: '1px 4px', borderRadius: 3 }}>%APPDATA%\\rentflow\\rentflow.db</code>.<br /><br />
              <strong>🖥️ U Pavla:</strong> Zadej plnou cestu k souboru <code style={{ background: 'var(--bg3)', padding: '1px 4px', borderRadius: 3 }}>rentflow.db</code> uvnitř sdílené GDrive složky,{''}
              např. <code style={{ background: 'var(--bg3)', padding: '1px 4px', borderRadius: 3 }}>C:\\Users\\pavel\\Google Drive\\RentFlow\\rentflow.db</code>.<br />
              Změna se projeví po restartu aplikace.
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>
                Cesta k rentflow.db (prázdné = výchozí AppData)
              </label>
              <input
                type="text"
                className="btn"
                style={{ width: '100%', cursor: 'text', textAlign: 'left', fontFamily: 'monospace', fontSize: 12 }}
                placeholder="C:\Users\pavel\Google Drive\RentFlow backup\rentflow.db"
                value={dbPath}
                onChange={e => setDbPath(e.target.value)}
              />
            </div>
            {dbPath && (
              <div style={{ fontSize: 11, color: '#16A34A', marginBottom: 8 }}>
                ✅ Vlastní DB cesta nastavena — platí po restartu
              </div>
            )}
            </div>
          </section>

          {/* ── SEKCE INFO ── */}
          <section className="sec-card">
            <SectionHeader icon="ℹ️" tone="gray" title="O aplikaci" />
            <div className="sec-card-body">
            <div style={{ display: 'grid', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Verze</span><span style={{ fontWeight: 600, color: 'var(--text)' }}>v{appVersion}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Databáze</span><span style={{ fontWeight: 600, color: 'var(--text)' }}>SQLite (rentflow.db)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Umístění dat</span><span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 11 }}>%APPDATA%\rentflow\</span>
              </div>
            </div>
            </div>
          </section>

        </div>
      </div>
    </>
  )
}
