import React, { useState, useEffect } from 'react'
import { useApp } from './AppContext.jsx'
import { getVersion } from '@tauri-apps/api/app'

export default function SettingsPanel({ onClose, onBackupDone }) {
  const { createBackup, getBackupInfo, saveSettings, getSettings } = useApp()

  const [backupInfo, setBackupInfo] = useState({ lastBackup: '…', backupCount: 0, gdrivePath: '' })
  const [gdrivePath, setGdrivePath] = useState('')
  const [dbPath, setDbPath]         = useState('')
  const [backing, setBacking] = useState(false)
  const [backupDone, setBackupDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [appVersion, setAppVersion] = useState('…')

  useEffect(() => {
    getBackupInfo().then(info => {
      if (info) {
        setBackupInfo(info)
        setGdrivePath(info.gdrivePath || '')
      }
    })
    getVersion().then(v => setAppVersion(v)).catch(() => setAppVersion('?'))
    getSettings().then(s => {
      if (s) setDbPath(s.dbPath || '')
    })
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
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, backdropFilter: 'blur(2px)' }}
      />
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 440,
        background: 'var(--bg)', zIndex: 201,
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--bg2)', position: 'sticky', top: 0, zIndex: 10
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>⚙️ Nastavení</span>
          <button onClick={onClose} className="btn btn-sm" style={{ padding: '4px 10px', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── SEKCE ZÁLOHY ── */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '0.06em', marginBottom: 14 }}>
              Zálohy databáze
            </div>

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
              background: '#F0FDF4', border: '1px solid #BBF7D0',
              borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#166534'
            }}>
              💡 Zálohy se ukládají do <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 3 }}>%APPDATA%\rentflow\backups\</code>
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
          </section>

          {/* ── SEKCE GOOGLE DRIVE ── */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '0.06em', marginBottom: 14 }}>
              Google Drive sync
            </div>

            <div style={{
              background: '#EFF6FF', border: '1px solid #BFDBFE',
              borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#1E40AF',
              lineHeight: 1.6
            }}>
              📂 Zadej cestu ke složce synchronizované přes <strong>Google Drive for Desktop</strong>.<br /><br />
              <strong>🖥️ U Ondřeje (tento PC):</strong><br />
              Nastav cestu ke sdílené GDrive složce (např. <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 3 }}>C:\\Users\\ondra\\Google Drive\\RentFlow</code>).
              Při každé záloze se sem automaticky zkopírují databáze i nově nahrané přílohy smluv.<br /><br />
              <strong>🖥️ U Pavla (druhý PC):</strong><br />
              1. Nainstalovat <strong>Google Drive for Desktop</strong> a přihlásit se ke stejnému Google účtu.<br />
              2. V nastavení RentFlow zadat do pole <em>Cesta ke Google Drive složce</em> cestu k té samé sdílené složce na Pavlově PC.<br />
              3. Do pole <em>Cesta k databázi</em> zadat plnou cestu k souboru <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 3 }}>rentflow.db</code> uvnitř té složky.<br />
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
                background: '#F0FDF4', border: '1px solid #BBF7D0',
                borderRadius: 8, fontSize: 12, color: '#166534'
              }}>
                ✅ Drive sync aktivní: <code style={{ wordBreak: 'break-all' }}>{backupInfo.gdrivePath}</code>
              </div>
            )}
          </section>

          {/* ── SEKCE DATABÁZE ── */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '0.06em', marginBottom: 14 }}>
              Cesta k databázi
            </div>
            <div style={{ background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>
              <strong>🖥️ U Ondřeje:</strong> Nech prázdné — databáze se načítá z výchozího umístění <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 4px', borderRadius: 3 }}>%APPDATA%\\rentflow\\rentflow.db</code>.<br /><br />
              <strong>🖥️ U Pavla:</strong> Zadej plnou cestu k souboru <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 4px', borderRadius: 3 }}>rentflow.db</code> uvnitř sdílené GDrive složky,{''}
              např. <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 4px', borderRadius: 3 }}>C:\\Users\\pavel\\Google Drive\\RentFlow\\rentflow.db</code>.<br />
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
          </section>

          {/* ── SEKCE INFO ── */}
          <section style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '0.06em', marginBottom: 14 }}>
              O aplikaci
            </div>
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
          </section>

        </div>
      </div>
    </>
  )
}
