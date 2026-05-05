import React, { useState } from 'react'
import { useApp } from '../AppContext.jsx'
import ConfirmDialog from '../ConfirmDialog.jsx'


const COLUMNS = [
  { id: 'longterm',  title: 'Dlouhodobé úkoly',            cssKey: 'longterm'  },
  { id: 'todo',      title: 'Je třeba udělat',             cssKey: 'todo'      },
  { id: 'waiting',   title: 'Čeká na něco – viz poznámka', cssKey: 'waiting'   },
  { id: 'progress',  title: 'V řešení',                    cssKey: 'progress'  },
  { id: 'signature', title: 'Čeká na podpis',              cssKey: 'signature' },
]

const EMPTY_FORM = {
  id: '', title: '', description: '', priority: 'Nízká',
  deadline: '', tag: '',
  reminders: { d7: false, d3: false, d1: false, d0: false },
  recurring: false, status: 'todo'
}

const parseTags = (tag) => (tag || '').split(',').map(t => t.trim()).filter(Boolean)
const joinTags  = (arr)  => arr.join(', ')

export default function Kanban() {
  const { tasks = [], addTask, updateTask, deleteTask, isReadOnly, subjectGroups = [] } = useApp()

  const [showForm, setShowForm]           = useState(false)
  const [formMode, setFormMode]           = useState('add')
  const [formData, setFormData]           = useState(EMPTY_FORM)
  const [selectedTags, setSelectedTags]   = useState([])
  const [customInput, setCustomInput]     = useState('')
  const [dragOverCol, setDragOverCol]     = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const getPriorityColor = (p) => p === 'Vysoká' ? '#EF4444' : p === 'Střední' ? '#EAB308' : '#22C55E'

  const handleDragStart = (e, id) => e.dataTransfer.setData('taskId', id)
  const handleDragOver  = (e, id) => { e.preventDefault(); setDragOverCol(id) }
  const handleDragLeave = ()       => setDragOverCol(null)
  const handleDrop      = (e, colId) => {
    e.preventDefault(); setDragOverCol(null)
    const taskId = e.dataTransfer.getData('taskId')
    if (taskId) updateTask(taskId, { status: colId })
  }

  const openAdd = (status = 'todo') => {
    if (isReadOnly) return
    setFormMode('add')
    setFormData({ ...EMPTY_FORM, status })
    setSelectedTags([])
    setCustomInput('')
    setShowForm(true)
  }

  const openEdit = (task) => {
    setFormMode('edit')
    setFormData({
      id: task.id, title: task.title || '', description: task.description || '',
      priority: task.priority || 'Nízká', deadline: task.deadline || '',
      tag: task.tag || '',
      reminders: task.reminders || { d7: false, d3: false, d1: false, d0: false },
      recurring: task.recurring || false, status: task.status
    })
    setSelectedTags(parseTags(task.tag))
    setCustomInput('')
    setShowForm(true)
  }

  const togglePreset = (pt) =>
    setSelectedTags(prev => prev.includes(pt) ? prev.filter(t => t !== pt) : [...prev, pt])

  const addCustomTag = () => {
    const val = customInput.trim()
    if (!val || selectedTags.includes(val)) return
    setSelectedTags(prev => [...prev, val])
    setCustomInput('')
  }

  const removeTag = (val) => setSelectedTags(prev => prev.filter(t => t !== val))

  const handleSave = () => {
    if (!formData.title) return alert('Název úkolu je povinný.')
    const tag = joinTags(selectedTags)
    if (formMode === 'add') {
      addTask({ ...formData, tag })
    } else {
      updateTask(formData.id, { ...formData, tag })
    }
    setShowForm(false)
  }

  const handleDeleteConfirmed = () => {
    if (formData.id) { deleteTask(formData.id); setShowForm(false) }
    setConfirmDelete(false)
  }

  const toggleReminder = (key) =>
    setFormData(p => ({ ...p, reminders: { ...p.reminders, [key]: !p.reminders[key] } }))

  const ckForStatus = (s) => COLUMNS.find(c => c.id === s)?.cssKey || 'todo'

  return (
    <div style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', width: '100%' }}>
      <div className="page-header" style={{ marginBottom: 24, flexShrink: 0 }}>
        <div>
          <div className="page-title">Operativní Kanban</div>
          <div className="page-sub">Správa úkolů, které je třeba udělat</div>
        </div>
        {!isReadOnly && (
          <button className="btn btn-primary" onClick={() => openAdd('todo')}>+ Nový úkol</button>
        )}
      </div>

      <div style={{ flex: 1, overflowX: 'auto', paddingBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, height: '100%', minWidth: 1300 }}>
          {COLUMNS.map(col => {
            const ck       = col.cssKey
            const colTasks = tasks.filter(t => t.status === col.id)
            const isOver   = dragOverCol === col.id
            return (
              <div key={col.id}
                style={{ minHeight: 0, display: 'flex', flexDirection: 'column', background: isOver ? `var(--kanban-${ck}-border)` : `var(--kanban-${ck}-bg)`, borderRadius: 16, border: isOver ? `2px dashed var(--kanban-${ck}-color)` : `1px solid var(--kanban-${ck}-border)`, transition: 'all 0.15s ease' }}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.id)}
              >
                <div style={{ padding: '14px 14px 10px', borderBottom: `2px solid var(--kanban-${ck}-border)`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `var(--kanban-${ck}-header)` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 11, textTransform: 'uppercase', color: `var(--kanban-${ck}-color)`, letterSpacing: '0.6px' }}>{col.title}</span>
                    <span style={{ background: `var(--kanban-${ck}-border)`, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 800, color: `var(--kanban-${ck}-color)` }}>{colTasks.length}</span>
                  </div>
                  {!isReadOnly && (
                    <button onClick={() => openAdd(col.id)} title="Přidat úkol"
                      style={{ background: `var(--kanban-${ck}-border)`, border: 'none', borderRadius: 7, width: 26, height: 26, cursor: 'pointer', color: `var(--kanban-${ck}-color)`, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.15s, opacity 0.15s', opacity: 0.75, lineHeight: 1 }}
                      onMouseOver={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.15)' }}
                      onMouseOut={e => { e.currentTarget.style.opacity = '0.75'; e.currentTarget.style.transform = '' }}
                    >+</button>
                  )}
                </div>
                <div style={{ flex: 1, padding: '10px 10px 0', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {colTasks.map(task => {
                    const pColor = getPriorityColor(task.priority)
                    const tags   = parseTags(task.tag)
                    return (
                      <div key={task.id} draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onClick={() => openEdit(task)}
                        style={{ background: 'var(--kanban-card-bg)', borderRadius: 11, border: `1px solid var(--kanban-card-border)`, borderLeft: `4px solid ${pColor}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', cursor: 'grab', padding: '12px 13px', transition: 'transform 0.12s, box-shadow 0.12s' }}
                        onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.1)' }}
                        onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)' }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: task.status === 'done' ? 'var(--text3)' : 'var(--text)', marginBottom: 6, lineHeight: 1.3, textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>{task.title}</div>
                        {tags.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                            {tags.map(tg => (
                              <span key={tg} style={{ fontSize: 10, color: `var(--kanban-${ck}-color)`, background: `var(--kanban-${ck}-border)`, padding: '2px 7px', borderRadius: 5, fontWeight: 700 }}>#{tg}</span>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 8, borderTop: `1px dashed var(--kanban-${ck}-border)` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: pColor + '18', padding: '3px 7px', borderRadius: 5 }}>
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: pColor }} />
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: pColor }}>{task.priority || 'Nízká'}</span>
                          </div>
                          {task.deadline && (
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)' }}>📅 {new Date(task.deadline).toLocaleDateString('cs-CZ')}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {colTasks.length === 0 && (
                    <div style={{ textAlign: 'center', color: `var(--kanban-${ck}-color)`, opacity: 0.35, fontSize: 12, fontStyle: 'italic', marginTop: 16, pointerEvents: 'none' }}>Zatím prázdné</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showForm && (() => {
        const ck = ckForStatus(formData.status)
        return (
          <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div className="modal-card" style={{ background: 'var(--kanban-card-bg)', width: 560, borderRadius: 18, boxShadow: '0 28px 56px rgba(0,0,0,0.2)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
              <div style={{ padding: '18px 22px', borderBottom: `1px solid var(--kanban-card-border)`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `var(--kanban-${ck}-header)` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{formMode === 'add' ? '✏️ Nový úkol' : '✏️ Upravit úkol'}</span>
                  <span style={{ background: `var(--kanban-${ck}-border)`, color: `var(--kanban-${ck}-color)`, fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 20, textTransform: 'uppercase' }}>
                    {COLUMNS.find(c => c.id === formData.status)?.title}
                  </span>
                </div>
                <button onClick={() => setShowForm(false)} style={{ background: 'var(--bg3)', border: 'none', width: 30, height: 30, borderRadius: 7, cursor: 'pointer', fontWeight: 'bold', color: 'var(--text2)', fontSize: 14 }}>✕</button>
              </div>

              <div style={{ padding: '20px 22px', overflowY: 'auto' }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.5px' }}>Název úkolu *</label>
                  <input type="text" autoFocus style={{ width: '100%', background: 'var(--bg2)', border: `1px solid var(--kanban-card-border)`, borderRadius: 8, padding: '10px 14px', fontSize: 14, fontWeight: 600, color: 'var(--text)', outline: 'none' }}
                    value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.5px' }}>Poznámka</label>
                  <textarea style={{ width: '100%', background: 'var(--bg2)', border: `1px solid var(--kanban-card-border)`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text)', minHeight: 72, outline: 'none', resize: 'vertical' }}
                    placeholder="Popis, poznámky, detaily..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.5px' }}>Priorita</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {['Vysoká','Střední','Nízká'].map(p => {
                      const c = getPriorityColor(p); const isA = formData.priority === p
                      return (
                        <button key={p} type="button" onClick={() => setFormData({...formData, priority: p})}
                          style={{ display: 'flex', alignItems: 'center', gap: 7, background: isA ? c+'18' : 'var(--bg2)', border: isA ? `1.5px solid ${c}` : `1px solid var(--kanban-card-border)`, borderRadius: 20, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, color: isA ? c : 'var(--text2)', cursor: 'pointer', transition: '0.15s' }}>
                          <div style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />{p}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.5px' }}>Tagy / Firma</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    {subjectGroups.map(pt => {
                      const isA = selectedTags.includes(pt)
                      return (
                        <button key={pt} type="button" onClick={() => togglePreset(pt)}
                          style={{ padding: '5px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', background: isA ? 'var(--accent)' : 'var(--bg2)', color: isA ? '#fff' : 'var(--text2)', border: isA ? '1.5px solid var(--accent)' : `1px solid var(--kanban-card-border)`, transition: '0.15s' }}>
                          {pt}
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text"
                      style={{ flex: 1, background: 'var(--bg2)', border: `1px solid var(--kanban-card-border)`, borderRadius: 8, padding: '9px 13px', fontSize: 13, color: 'var(--text)', outline: 'none' }}
                      placeholder="Vlastní tag..."
                      value={customInput}
                      onChange={e => setCustomInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag() } }}
                    />
                    <button type="button" onClick={addCustomTag}
                      style={{ padding: '9px 14px', borderRadius: 8, background: 'var(--bg2)', border: `1px solid var(--kanban-card-border)`, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>
                      + Přidat
                    </button>
                  </div>
                  {selectedTags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {selectedTags.map(tg => (
                        <span key={tg} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'var(--accent)', color: '#fff' }}>
                          #{tg}
                          <button type="button" onClick={() => removeTag(tg)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1, padding: 0, fontWeight: 700 }}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.5px' }}>Deadline</label>
                  <input type="date" style={{ width: '100%', background: 'var(--bg2)', border: `1px solid var(--kanban-card-border)`, borderRadius: 8, padding: '9px 13px', fontSize: 13, color: 'var(--text)', outline: 'none' }}
                    value={formData.deadline} onChange={e => setFormData({...formData, deadline: e.target.value})} />
                </div>

                <div style={{ borderTop: `1px solid var(--kanban-card-border)`, paddingTop: 16, marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 10, letterSpacing: '0.5px' }}>🔔 Remindery</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[['d7','7 dní před deadlinem'],['d3','3 dny před deadlinem'],['d1','1 den před deadlinem'],['d0','V den deadlinu v 9:00']].map(([key, label]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                        <input type="checkbox" checked={!!formData.reminders[key]} onChange={() => toggleReminder(key)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🔁 Opakující se úkol</span>
                  <div onClick={() => setFormData({...formData, recurring: !formData.recurring})}
                    style={{ width: 42, height: 22, background: formData.recurring ? 'var(--accent)' : 'var(--bg3)', borderRadius: 11, position: 'relative', cursor: 'pointer', transition: '0.25s' }}>
                    <div style={{ width: 16, height: 16, background: '#fff', borderRadius: '50%', position: 'absolute', top: 3, left: formData.recurring ? 22 : 3, transition: '0.25s', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }} />
                  </div>
                </div>
              </div>

              <div style={{ padding: '16px 22px', borderTop: `1px solid var(--kanban-card-border)`, background: 'var(--bg2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {formMode === 'edit' ? (
                  <button onClick={() => setConfirmDelete(true)} style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', padding: '9px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Smazat</button>
                ) : <div />}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setShowForm(false)} style={{ background: 'var(--bg3)', color: 'var(--text2)', border: 'none', padding: '9px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Zrušit</button>
                  <button onClick={handleSave} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: 8, fontWeight: 800, cursor: 'pointer', fontSize: 13, boxShadow: '0 4px 12px rgba(18,101,74,0.3)' }}>
                    {formMode === 'add' ? 'Vytvořit' : 'Uložit'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {confirmDelete && (
        <ConfirmDialog
          title="Smazat úkol"
          text={`Opravdu chcete smazat úkol „${formData.title}"? Tato akce je nevratná.`}
          danger
          okLabel="Smazat"
          onOk={handleDeleteConfirmed}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}
