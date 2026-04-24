import React, { useState } from 'react'
import { useApp } from '../AppContext.jsx'
import ConfirmDialog from '../ConfirmDialog.jsx'

export default function Trash() {
  const { trash = [], restoreFromTrash, permanentDelete, emptyTrash } = useApp() || {}
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  const typeLabels = {
    tenant: 'Nájemník',
    asset: 'Předmět nájmu',
    contract: 'Smlouva',
    task: 'Úkol Kanban',
    revision: 'Revize'
  }

  return (
    <div style={{ paddingBottom: 60, maxWidth: 1000 }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <div>
          <div className="page-title">Koš</div>
          <div className="page-sub">Obnova smazaných položek a trvalé odstranění</div>
        </div>
        {trash.length > 0 && (
          <button className="btn" style={{ color: '#DC2626', borderColor: '#FECACA', background: '#FEF2F2' }} onClick={() => setConfirmEmpty(true)}>
            Vysypat koš
          </button>
        )}
      </div>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Původní název / Identifikace</th>
              <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Typ záznamu</th>
              <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Smazáno dne</th>
              <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Akce</th>
            </tr>
          </thead>
          <tbody>
            {trash.length > 0 ? trash.map(t => (
              <tr key={t.trashId} style={{ borderBottom: '1px solid var(--border2)' }}>
                <td style={{ padding: '18px 24px', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                  {t.title || 'Neznámá položka'}
                </td>
                <td style={{ padding: '18px 24px' }}>
                  <span style={{ background: 'var(--bg3)', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>
                    {typeLabels[t.type] || t.type}
                  </span>
                </td>
                <td style={{ padding: '18px 24px', fontSize: 13, color: 'var(--text3)', fontWeight: 600 }}>
                  {t.deletedAt}
                </td>
                <td style={{ padding: '18px 24px', textAlign: 'right' }}>
                  <button className="btn btn-sm" style={{ background: '#F0FDF4', color: '#166534', borderColor: '#BBF7D0', marginRight: 10 }} onClick={() => restoreFromTrash(t.trashId)}>
                    Obnovit
                  </button>
                  <button className="btn btn-sm" style={{ background: '#FEF2F2', color: '#991B1B', borderColor: '#FECACA' }} onClick={() => permanentDelete(t.trashId)}>
                    Smazat trvale
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="4" style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
                  <div style={{ fontSize: 32, marginBottom: 16 }}>🗑️</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Koš je momentálně prázdný.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirmEmpty && (
        <ConfirmDialog
          title="Vysypat koš?"
          text={`Trvale odstraníte ${trash.length} ${trash.length === 1 ? 'položku' : trash.length < 5 ? 'položky' : 'položek'}. Tato akce je nevratná.`}
          danger={true}
          okLabel="Vysypat koš"
          onOk={() => { emptyTrash(); setConfirmEmpty(false) }}
          onClose={() => setConfirmEmpty(false)}
        />
      )}
    </div>
  )
}