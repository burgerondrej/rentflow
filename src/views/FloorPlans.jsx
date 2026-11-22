import React, { useEffect, useMemo, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useApp } from '../AppContext.jsx'
import DialogShell from '../DialogShell.jsx'
import { Segmented, EmptyState } from '../UI.jsx'
import { isTyping, useNewShortcut, peekFloorPlanFocus, clearFloorPlanFocus } from '../shortcuts.js'
import { currentAssetContracts, isEndingWithoutSuccessor, assetFreeSince, parseDate, ASSET_TYPES, tenancySince, rentIncreaseLock, lastRentIncrease,
  contractMonthStatus, groupMonthStatus, overdueDays, dueDateFor, hasSuccessor, getMonthRent, PERIOD_LEN, contractSubject, firmOf } from '../utils.js'

/**
 * Půdorysy (Portfolio → Půdorysy): interaktivní mapa pater budovy.
 * Patro = floor_plans (Rust), plochy = JSON [{ kind: 'unit'|'extra'|'common', assetId, label, points: [[x,y]…], labelAt? }].
 * Nájemce a stav se počítají živě ze smluv (currentAssetContracts) – v DB je jen kresba a vazba na předmět.
 */

const SEL_KEY = 'rf_floorplan_sel'
const ENDING_DAYS = 90
const KINDS = [
  { id: 'unit', label: 'Byt / prostor' },
  { id: 'extra', label: 'Terasa / balkon' },
  { id: 'common', label: 'Společné prostory' },
]
const TOOLS = [
  { id: 'select', label: '✋ Výběr' },
  { id: 'rect', label: '▭ Obdélník' },
  { id: 'poly', label: '⬠ Tvar' },
]

// ─── geometrie ───
const parseShapes = (p) => { try { const s = JSON.parse(p?.shapes || '[]'); return Array.isArray(s) ? s : [] } catch { return [] } }
const ptsStr = (pts) => pts.map(p => `${p[0]},${p[1]}`).join(' ')
const bboxOf = (pts) => {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 }
}
function inPoly(x, y, pts) {
  let ins = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins
  }
  return ins
}
// Obdélník (střed cx, cy, poloviny hw, hh) leží celý v ploše?
function rectFits(cx, cy, hw, hh, pts) {
  const xs = [cx - hw, cx, cx + hw], ys = [cy - hh, cy, cy + hh]
  for (const x of xs) for (const y of ys) if (!(x === cx && y === cy) && !inPoly(x, y, pts)) return false
  for (const [px, py] of pts) if (px > cx - hw && px < cx + hw && py > cy - hh && py < cy + hh) return false
  return true
}
/** Místo pro popisek: největší obdélník (poměr ~1,35 : 1) uvnitř plochy – u tvaru L nevyjede přes roh. */
function labelBox(pts, at) {
  const b = bboxOf(pts)
  const grow = (cx, cy) => {
    let lo = 0, hi = Math.min(b.w, b.h)
    for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (rectFits(cx, cy, m * 1.35, m, pts)) lo = m; else hi = m }
    return lo
  }
  if (at) { const k = grow(at[0], at[1]); return { cx: at[0], cy: at[1], w: k * 2.7, h: k * 2 } }
  const N = 18, cands = []
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const cx = b.x0 + b.w * (i + 0.5) / N, cy = b.y0 + b.h * (j + 0.5) / N
    if (inPoly(cx, cy, pts)) cands.push({ cx, cy, k: grow(cx, cy) })
  }
  if (!cands.length) return { cx: b.x0 + b.w / 2, cy: b.y0 + b.h / 2, w: 0, h: 0 }
  // z téměř největších míst to nejblíž středu plochy (těžiště vhodných kandidátů) – popisek uprostřed, ne u kraje
  const maxK = Math.max(...cands.map(c => c.k))
  const good = cands.filter(c => c.k >= maxK * 0.9)
  const mx = good.reduce((s, c) => s + c.cx, 0) / good.length, my = good.reduce((s, c) => s + c.cy, 0) / good.length
  const best = good.reduce((a, c) => Math.hypot(c.cx - mx, c.cy - my) < Math.hypot(a.cx - mx, a.cy - my) ? c : a)
  return { cx: best.cx, cy: best.cy, w: best.k * 2.7, h: best.k * 2 }
}

/** Největší obdélník uvnitř plochy (různé poměry stran) – prostor pro popisek bytu s rohy. Výsledek se pamatuje podle tvaru. */
const rectCache = new Map()
function bigRect(pts) {
  const key = ptsStr(pts)
  if (rectCache.has(key)) return rectCache.get(key)
  const b = bboxOf(pts)
  const cands = [[b.x0 + b.w / 2, b.y0 + b.h / 2]]
  const N = 12
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) cands.push([b.x0 + b.w * (i + 0.5) / N, b.y0 + b.h * (j + 0.5) / N])
  let best = null
  for (const asp of [0.6, 0.85, 1.15, 1.5, 2, 2.8]) {
    for (const [cx, cy] of cands) {
      if (!inPoly(cx, cy, pts)) continue
      let lo = 0, hi = Math.max(b.w, b.h)
      for (let k = 0; k < 13; k++) { const m = (lo + hi) / 2; if (rectFits(cx, cy, m * asp, m, pts)) lo = m; else hi = m }
      const area = lo * lo * asp
      if (!best || area > best.area * 1.01) best = { cx, cy, hw: lo * asp, hh: lo, area }
    }
  }
  let r = best ? { x0: best.cx - best.hw, x1: best.cx + best.hw, y0: best.cy - best.hh, y1: best.cy + best.hh } : { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 }
  // dotáhnout ke stěnám bytu (rohy popisku nahoru, štítek dolů) – každou stranu zvlášť, dokud se obdélník vejde
  const fits = (q) => rectFits((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, (q.x1 - q.x0) / 2, (q.y1 - q.y0) / 2, pts)
  if (best) for (const [side, limit] of [['y0', b.y0], ['y1', b.y1], ['x0', b.x0], ['x1', b.x1]]) {
    let lo = 0, hi = Math.abs(r[side] - limit)
    const dir = side.endsWith('0') ? -1 : 1
    for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; if (fits({ ...r, [side]: r[side] + dir * m })) lo = m; else hi = m }
    r = { ...r, [side]: r[side] + dir * lo }
  }
  if (rectCache.size > 800) rectCache.clear()
  rectCache.set(key, r)
  return r
}
const czDate = (d) => d ? `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}` : ''
const VALOR_TYPES = ['residential', 'commercial']
const MODE_KEY = 'rf_floorplan_mode'
const MONTHS_CZ = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']
const fmtKcFp = (v) => `${Math.round(v).toLocaleString('cs-CZ')} Kč`

// ─── texty ───
const sqm = (size) => { const m = String(size || '').match(/(\d+(?:[.,]\d+)?)\s*m²/); return m ? `${m[1]} m²` : '' }
const dispo = (size) => { const m = String(size || '').match(/(\d\s*\+\s*(?:kk|\d))/i); return m ? m[1].replace(/\s/g, '') : '' }
const normUnit = (s) => String(s || '').toLowerCase().replace(/\s+/g, '')
const charW = 0.57 // průměrná šířka znaku DM Sans vůči velikosti písma

/** Rozloží text popisku do boxu: [{ text, size, weight, role }] + výška. */
function layoutLabel(lines, box, maxF) {
  // lines: [{ text, rel, weight, role, wrap }]
  let f = Math.min(maxF, box.h / lines.reduce((s, l) => s + l.rel * 1.22 * (l.wrap ? 2 : 1), 0))
  const out = []
  for (const l of lines) {
    let size = f * l.rel
    const fits = (t, s) => t.length * charW * s <= box.w
    if (l.wrap && !fits(l.text, size) && l.text.includes(' ')) {
      // dvě řádky – zlom u mezery nejblíž prostředku
      const sp = [...l.text].map((c, i) => c === ' ' ? i : -1).filter(i => i > 0)
      const mid = l.text.length / 2
      const at = sp.reduce((a, i) => Math.abs(i - mid) < Math.abs(a - mid) ? i : a, sp[0])
      const parts = [l.text.slice(0, at), l.text.slice(at + 1)]
      const longest = Math.max(...parts.map(p => p.length))
      size = Math.min(size, box.w / (longest * charW))
      parts.forEach(p => out.push({ text: p, size, weight: l.weight, role: l.role }))
    } else {
      if (!fits(l.text, size)) size = box.w / (Math.max(1, l.text.length) * charW)
      out.push({ text: l.text, size, weight: l.weight, role: l.role })
    }
  }
  const height = out.reduce((s, l) => s + l.size * 1.22, 0)
  return { out, height }
}

const TONE = {
  rented: { fill: 'var(--tone-green-soft)', stroke: 'var(--tone-green-border)', text: 'var(--tone-green-text)', dot: '#16A34A', pat: 'green' },
  ending: { fill: 'var(--tone-amber-soft)', stroke: 'var(--tone-amber-border)', text: 'var(--tone-amber-text)', dot: '#D97706', pat: 'amber' },
  free:   { fill: 'var(--bg)', stroke: 'var(--tone-gray-border)', text: 'var(--text2)', dot: null, pat: 'gray', dash: '7 5' },
  none:   { fill: 'var(--tone-gray-bg)', stroke: 'var(--tone-gray-border)', text: 'var(--text3)', dot: null, pat: 'gray', dash: '3 4' },
  // režimy Platby / Konce smluv
  green:  { fill: 'var(--tone-green-soft)', stroke: 'var(--tone-green-border)', text: 'var(--tone-green-text)', dot: '#16A34A', pat: 'green' },
  amber:  { fill: 'var(--tone-amber-soft)', stroke: 'var(--tone-amber-border)', text: 'var(--tone-amber-text)', dot: '#D97706', pat: 'amber' },
  red:    { fill: 'var(--tone-red-soft)', stroke: 'var(--tone-red-border)', text: 'var(--tone-red-text)', dot: '#DC2626', pat: 'red' },
  gray:   { fill: 'var(--tone-gray-soft)', stroke: 'var(--tone-gray-border)', text: 'var(--text2)', dot: '#9CA3AF', pat: 'gray' },
}

export default function FloorPlans({ onOpen, onOpenContract }) {
  const { payments = [], floorPlans = [], saveFloorPlan, deleteFloorPlan, assets = [], contracts = [], tenants = [], mainObjects = [], isReadOnly, confirmAction, showToast } = useApp()

  // ─── výběr budovy a patra (pamatuje se) ───
  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem(SEL_KEY) || '{}') } catch { return {} } }, [])
  const buildings = useMemo(() => {
    const names = [...new Set(floorPlans.map(p => p.building))]
    const idx = (n) => { const i = mainObjects.indexOf(n); return i < 0 ? 999 : i }
    return names.sort((a, b) => idx(a) - idx(b) || a.localeCompare(b, 'cs'))
  }, [floorPlans, mainObjects])
  const [building, setBuilding] = useState(saved.building || '')
  const curBuilding = buildings.includes(building) ? building : buildings[0] || ''
  const floors = useMemo(() => floorPlans.filter(p => p.building === curBuilding).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)), [floorPlans, curBuilding])
  const [planId, setPlanId] = useState(saved.planId || '')
  const plan = floors.find(p => p.id === planId) || floors[0] || null
  useEffect(() => { try { localStorage.setItem(SEL_KEY, JSON.stringify({ building: curBuilding, planId: plan?.id || '' })) } catch { /* ignore */ } }, [curBuilding, plan?.id])

  // ─── režim mapy, hledání, zvýraznění prostoru (📍 z detailu předmětu) ───
  const [mode, setModeState] = useState(() => { try { return localStorage.getItem(MODE_KEY) || 'tenants' } catch { return 'tenants' } })
  const setMode = (m) => { setModeState(m); try { localStorage.setItem(MODE_KEY, m) } catch { /* ignore */ } }
  const [q, setQ] = useState('')
  const [focusId, setFocusId] = useState(null)
  const focusOn = (assetId) => {
    const hit = floorPlans.find(p => parseShapes(p).some(x => x.kind === 'unit' && x.assetId === assetId))
    clearFloorPlanFocus()
    if (!hit) return
    setBuilding(hit.building); setPlanId(hit.id); setFocusId(assetId); setQ('')
  }
  useEffect(() => {
    const pend = peekFloorPlanFocus()
    if (pend) focusOn(pend)
    const onReq = (e) => focusOn(e.detail)
    window.addEventListener('rf-floorplan-focus', onReq)
    return () => window.removeEventListener('rf-floorplan-focus', onReq)
  }, [floorPlans])
  useEffect(() => { if (!focusId) return; const t = setTimeout(() => setFocusId(null), 9000); return () => clearTimeout(t) }, [focusId])

  // ─── úpravy ───
  const [draft, setDraft] = useState(null)      // { ...plan, shapes: [] } během úprav
  const [undo, setUndo] = useState([])
  const [sel, setSel] = useState(-1)
  const [tool, setTool] = useState('select')
  const [newKind, setNewKind] = useState('unit')
  const [poly, setPoly] = useState([])          // rozkreslený tvar
  const [hoverPt, setHoverPt] = useState(null)
  const [drag, setDrag] = useState(null)
  const [bgOpacity, setBgOpacity] = useState(0.45)
  const [bgShow, setBgShow] = useState(true)
  const [assetFilter, setAssetFilter] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const editing = !!draft
  const view = editing ? draft : plan
  const shapes = useMemo(() => editing ? draft.shapes : parseShapes(plan), [editing, draft, plan])
  const W = view?.width || 1600, H = view?.height || 1000
  const dirty = editing && plan && (JSON.stringify(draft.shapes) !== JSON.stringify(parseShapes(plan)) || draft.name !== plan.name || (draft.background || '') !== (plan.background || '') || draft.width !== plan.width || draft.height !== plan.height)

  const startEdit = (p = plan) => {
    if (!p || isReadOnly) return
    setDraft({ ...p, shapes: parseShapes(p) }); setUndo([]); setSel(-1); setPoly([]); setTool('select')
  }
  const stopEdit = () => { setDraft(null); setSel(-1); setPoly([]); setDrag(null) }
  const cancelEdit = () => {
    if (!dirty) return stopEdit()
    confirmAction({ title: 'Zahodit změny půdorysu?', text: 'Neuložené úpravy patra se ztratí.', okLabel: 'Zahodit', danger: true, onOk: stopEdit })
  }
  const commit = (nextShapes) => { setUndo(u => [...u.slice(-49), draft.shapes]); setDraft(d => ({ ...d, shapes: nextShapes })) }
  const doUndo = () => { if (!undo.length) return; setDraft(d => ({ ...d, shapes: undo[undo.length - 1] })); setUndo(u => u.slice(0, -1)); setSel(-1) }
  const saveEdit = async () => {
    if (!draft.name.trim()) { showToast('Zadejte název patra.', 'warning'); return }
    setSaving(true)
    const { shapes: sh, ...rest } = draft
    const cur = floorPlans.find(p => p.id === draft.id) // pořadí se mohlo mezitím změnit (◀ ▶)
    const out = await saveFloorPlan({ ...rest, sortOrder: cur?.sortOrder ?? rest.sortOrder, name: draft.name.trim(), shapes: JSON.stringify(sh) })
    setSaving(false)
    if (out) { stopEdit(); showToast(`Půdorys „${out.name}“ uložen.`, 'success') }
  }
  const removePlan = () => {
    if (!plan) return
    confirmAction({
      title: `Smazat půdorys „${plan.name}“?`, text: `Patro budovy ${plan.building} se z mapy odstraní včetně všech nakreslených ploch. Předměty, smlouvy ani podklad v dokumentech se nemažou.`,
      okLabel: 'Smazat patro', danger: true,
      onOk: async () => { if (await deleteFloorPlan(plan.id)) { stopEdit(); setPlanId('') } },
    })
  }
  const movePlan = async (dir) => {
    const i = floors.findIndex(p => p.id === plan?.id), j = i + dir
    if (i < 0 || j < 0 || j >= floors.length) return
    const a = floors[i], b = floors[j]
    await saveFloorPlan({ ...b, sortOrder: a.sortOrder })
    await saveFloorPlan({ ...a, sortOrder: b.sortOrder })
  }
  useNewShortcut(() => { if (!isReadOnly && !editing) setNewOpen(true) })

  // ─── podklad (obrázek půdorysu v documents/) ───
  const [bgUrls, setBgUrls] = useState({})
  useEffect(() => {
    const name = view?.background
    if (!name || bgUrls[name]) return
    let alive = true
    ;(async () => {
      try {
        const { readBinaryFile } = await import('@tauri-apps/api/fs')
        const { appDataDir, join } = await import('@tauri-apps/api/path')
        const bytes = await readBinaryFile(await join(await appDataDir(), 'rentflow', 'documents', name))
        const ext = name.split('.').pop().toLowerCase()
        const url = URL.createObjectURL(new Blob([bytes], { type: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg' }))
        if (alive) setBgUrls(m => ({ ...m, [name]: url }))
      } catch (e) { console.warn('Podklad půdorysu nelze načíst:', e) }
    })()
    return () => { alive = false }
  }, [view?.background])
  const bgInput = useRef(null)
  const onBgFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const name = `pudorys_${Date.now()}.${ext}`
      const url = URL.createObjectURL(new Blob([bytes], { type: file.type || 'image/jpeg' }))
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
      try {
        const { writeBinaryFile, createDir } = await import('@tauri-apps/api/fs')
        const { appDataDir, join } = await import('@tauri-apps/api/path')
        const dir = await join(await appDataDir(), 'rentflow', 'documents')
        await createDir(dir, { recursive: true })
        await writeBinaryFile(await join(dir, name), bytes)
      } catch (err) { console.warn('Podklad se neuložil do dokumentů:', err) }
      setBgUrls(m => ({ ...m, [name]: url }))
      const scale = 2000 / Math.max(img.naturalWidth, img.naturalHeight)
      setDraft(d => d.shapes.length
        ? { ...d, background: name }
        : { ...d, background: name, width: Math.round(img.naturalWidth * scale), height: Math.round(img.naturalHeight * scale) })
      setBgShow(true)
    } catch (err) { showToast('Obrázek se nepodařilo načíst: ' + err) }
  }

  // ─── stav předmětu (živě ze smluv) ───
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const unitInfo = (assetId) => {
    const asset = assetId ? assets.find(a => a.id === assetId) : null
    if (!asset) return { status: 'none' }
    const list = currentAssetContracts(contracts, assetId)
    if (!list.length) return { asset, status: 'free', free: assetFreeSince(contracts, assetId) }
    const ending = list.every(c => isEndingWithoutSuccessor(c, contracts) && (parseDate(c.end) - today) <= ENDING_DAYS * 864e5)
    const people = list.map(c => ({ c, name: tenants.find(t => t.id === c.tenantId)?.name || '?' }))
    return { asset, status: ending ? 'ending' : 'rented', people }
  }

  // ─── souřadnice myši → plán (getScreenCTM počítá i se zoomem písma a okraji) ───
  const svgRef = useRef(null)
  const wrapRef = useRef(null)
  const toPlan = (e) => {
    const svg = svgRef.current
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM().inverse())
    return [p.x, p.y]
  }
  const pxToPlan = () => { const r = svgRef.current?.getBoundingClientRect(); return r && r.width ? Math.max(W / r.width, H / r.height) : 1 }
  const grid = Math.max(5, Math.round(W / 200))
  const snap = (p, skipShape = -1, skipVertex = null) => {
    const tol = 11 * pxToPlan()
    let best = null, bd = tol
    shapes.forEach((s, si) => s.points.forEach((v, vi) => {
      if (si === skipShape && (skipVertex == null || skipVertex === vi)) return
      const d = Math.hypot(v[0] - p[0], v[1] - p[1])
      if (d < bd) { bd = d; best = v }
    }))
    poly.forEach(v => { const d = Math.hypot(v[0] - p[0], v[1] - p[1]); if (d < bd) { bd = d; best = v } })
    if (best) return [best[0], best[1]]
    return [Math.round(p[0] / grid) * grid, Math.round(p[1] / grid) * grid]
  }
  // U tvaru vodorovné / svislé hrany samy (půdorysy jsou pravoúhlé), Shift = volně
  const ortho = (p, prev, free) => {
    if (!prev || free) return p
    const dx = p[0] - prev[0], dy = p[1] - prev[1]
    if (Math.abs(dy) < Math.abs(dx) * 0.18) return [p[0], prev[1]]
    if (Math.abs(dx) < Math.abs(dy) * 0.18) return [prev[0], p[1]]
    return p
  }

  const addShape = (points) => {
    const s = { kind: newKind, points, ...(newKind === 'common' ? { label: '' } : { assetId: '' }) }
    commit([...shapes, s]); setSel(shapes.length); setTool('select'); setAssetFilter('')
  }
  const finishPoly = () => { if (poly.length >= 3) addShape(poly); setPoly([]) }

  const onDown = (e) => {
    if (!editing || e.button !== 0) return
    const raw = toPlan(e)
    if (tool === 'rect') {
      const p = snap(raw); svgRef.current.setPointerCapture(e.pointerId)
      setDrag({ type: 'rect', a: p, b: p }); return
    }
    if (tool === 'poly') {
      let p = snap(ortho(raw, poly[poly.length - 1], e.shiftKey))
      if (poly.length >= 3 && Math.hypot(p[0] - poly[0][0], p[1] - poly[0][1]) < 12 * pxToPlan()) { finishPoly(); return }
      setPoly(ps => [...ps, p]); return
    }
    const vEl = e.target.closest?.('[data-vi]')
    if (vEl && sel >= 0) {
      svgRef.current.setPointerCapture(e.pointerId)
      setUndo(u => [...u.slice(-49), shapes])
      setDrag({ type: 'vertex', si: sel, vi: Number(vEl.dataset.vi) }); return
    }
    const sEl = e.target.closest?.('[data-si]')
    if (sEl) {
      const si = Number(sEl.dataset.si)
      setSel(si); svgRef.current.setPointerCapture(e.pointerId)
      setUndo(u => [...u.slice(-49), shapes])
      setDrag({ type: 'move', si, start: raw, orig: shapes[si].points, moved: false }); return
    }
    setSel(-1)
  }
  const onMove = (e) => {
    if (!editing) return
    const raw = toPlan(e)
    if (tool === 'poly') setHoverPt(snap(ortho(raw, poly[poly.length - 1], e.shiftKey)))
    if (!drag) return
    if (drag.type === 'rect') setDrag(d => ({ ...d, b: snap(raw) }))
    else if (drag.type === 'vertex') {
      const s = shapes[drag.si]
      const p = snap(raw, drag.si, drag.vi)
      setDraft(d => ({ ...d, shapes: d.shapes.map((x, i) => i !== drag.si ? x : { ...x, points: s.points.map((v, vi) => vi === drag.vi ? p : v) }) }))
    } else if (drag.type === 'move') {
      const dx = Math.round((raw[0] - drag.start[0]) / grid) * grid, dy = Math.round((raw[1] - drag.start[1]) / grid) * grid
      setDraft(d => ({ ...d, shapes: d.shapes.map((x, i) => i !== drag.si ? x : { ...x, points: drag.orig.map(v => [v[0] + dx, v[1] + dy]), labelAt: x.labelAt && drag.origLabel ? [drag.origLabel[0] + dx, drag.origLabel[1] + dy] : x.labelAt }) }))
      if (dx || dy) setDrag(d => ({ ...d, moved: true, origLabel: d.origLabel || shapes[d.si].labelAt }))
    }
  }
  const onUp = () => {
    if (!drag) return
    if (drag.type === 'rect') {
      const [x0, y0] = drag.a, [x1, y1] = drag.b
      if (Math.abs(x1 - x0) > grid && Math.abs(y1 - y0) > grid) {
        const l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1)
        addShape([[l, t], [r, t], [r, b], [l, b]])
      }
    } else if (drag.type === 'move' && !drag.moved) {
      setUndo(u => u.slice(0, -1)) // jen výběr, nic se nezměnilo
    }
    setDrag(null)
  }
  const onDoubleClick = (e) => {
    if (!editing) return
    if (tool === 'poly') { finishPoly(); return }
    // dvojklik na hranu vybrané plochy = nový bod
    if (tool === 'select' && sel >= 0 && !e.target.closest?.('[data-vi]')) {
      const p = toPlan(e), pts = shapes[sel].points
      let bi = -1, bd = 10 * pxToPlan()
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy
        const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0
        const d = Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1])
        if (d < bd) { bd = d; bi = i }
      })
      if (bi >= 0) commit(shapes.map((s, i) => i !== sel ? s : { ...s, points: [...pts.slice(0, bi + 1), snap(p), ...pts.slice(bi + 1)] }))
    }
  }
  const onVertexContext = (e, vi) => {
    e.preventDefault()
    const pts = shapes[sel].points
    if (pts.length <= 3) return
    commit(shapes.map((s, i) => i !== sel ? s : { ...s, points: pts.filter((_, k) => k !== vi) }))
  }
  const updSel = (patch) => commit(shapes.map((s, i) => i === sel ? { ...s, ...patch } : s))
  const delSel = () => { if (sel < 0) return; commit(shapes.filter((_, i) => i !== sel)); setSel(-1) }

  useEffect(() => {
    if (!editing) return
    const onKey = (e) => {
      if (isTyping()) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return }
      if (e.key === 'Escape') { if (poly.length) { setPoly([]); e.stopPropagation() } else if (sel >= 0) setSel(-1); return }
      if (e.key === 'Enter' && poly.length) { finishPoly(); return }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (poly.length) setPoly(ps => ps.slice(0, -1)); else delSel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // ─── najetí myší (popisek) ───
  const [hover, setHover] = useState(null)
  const onHover = (e, s) => {
    if (editing) return
    const wrap = wrapRef.current, r = wrap.getBoundingClientRect(), k = wrap.offsetWidth / (r.width || 1)
    setHover({ s, x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, w: wrap.offsetWidth })
  }

  // ─── statistiky patra / budovy ───
  const NOW = new Date(), NY = NOW.getFullYear(), NM = NOW.getMonth()
  const sqmNum = (size) => { const m = String(size || '').match(/(\d+(?:[.,]\d+)?)\s*m²/); return m ? Number(m[1].replace(',', '.')) : 0 }
  const countFor = (list) => {
    const ids = [...new Set(list.flatMap(p => parseShapes(p)).filter(s => s.kind === 'unit' && s.assetId).map(s => s.assetId))]
    const infos = ids.map(id => unitInfo(id)).filter(i => i.asset)
    const st = infos.map(i => i.status)
    const isRented = (i) => i.status === 'rented' || i.status === 'ending'
    const m2 = infos.reduce((sum, i) => sum + sqmNum(i.asset.size), 0)
    const m2r = infos.filter(isRented).reduce((sum, i) => sum + sqmNum(i.asset.size), 0)
    // nájem za měsíc (předpis, víceměsíční přepočtené na měsíc) – jen když jsou všechny smlouvy jedné firmy (firmy striktně odděleně)
    const cs = infos.filter(isRented).flatMap(i => i.people.map(p => p.c)).filter(c => c.paymentFrequency !== 'Zahrnuto v nájemném')
    const firmsSet = new Set(cs.map(c => firmOf(contractSubject(c, assets))))
    const rent = firmsSet.size <= 1 ? cs.reduce((sum, c) => sum + getMonthRent(c, NY, NM) / (PERIOD_LEN[c.paymentFrequency] || 1), 0) : null
    return { total: infos.length, rented: st.filter(x => x === 'rented' || x === 'ending').length, free: st.filter(x => x === 'free').length, ending: st.filter(x => x === 'ending').length,
      m2, m2r, pct: m2 > 0 ? Math.round(m2r / m2 * 100) : (infos.length ? Math.round(infos.filter(isRented).length / infos.length * 100) : 0), rent, firm: firmsSet.size === 1 ? [...firmsSet][0] : '' }
  }
  // Hledání: nájemce / název předmětu (od 2 znaků), počty shod po patrech a budovách
  const qn = q.trim().toLowerCase()
  const matchAsset = (assetId) => {
    if (qn.length < 2 || !assetId) return false
    const info = unitInfo(assetId)
    if (!info.asset) return false
    return String(info.asset.unit).toLowerCase().includes(qn) || (info.people || []).some(p => p.name.toLowerCase().includes(qn))
  }
  const matchCount = (p) => qn.length < 2 ? 0 : new Set(parseShapes(p).filter(x => x.kind === 'unit' && matchAsset(x.assetId)).map(x => x.assetId)).size

  // Režim mapy: Platby (stav za tento měsíc) / Konce smluv – barva plochy a štítek dole
  const modeView = (info) => {
    if (RC.mode === 'tenants' || !info || info.status === 'none') return null
    if (info.status === 'free') return { tone: 'free', chip: null }
    const ctx = { payments, contracts, assets }
    if (RC.mode === 'payments') {
      const rank = { red: 3, amber: 2, gray: 1, green: 0 }
      let best = null
      for (const { c } of info.people) {
        let v
        if (c.paymentFrequency === 'Zahrnuto v nájemném') v = { t: 'gray', b: 'zahrnuto v nájmu' }
        else {
          const st = c.groupLabel ? groupMonthStatus(c.groupLabel, NY, NM, ctx).status : contractMonthStatus(c, NY, NM, ctx).status
          const od = overdueDays(c, NY, NM), due = dueDateFor(c, NY, NM)
          v = st === 'paid' ? { t: 'green', b: 'uhrazeno' }
            : st === 'partial' ? { t: od > 0 ? 'red' : 'amber', b: od > 0 ? `částečně · ${od} dní po spl.` : 'uhrazeno částečně' }
            : od > 0 ? { t: 'red', b: `po splatnosti ${od} ${od === 1 ? 'den' : od < 5 ? 'dny' : 'dní'}` }
            : { t: 'gray', b: due ? `splatnost ${czDate(due)}` : 'zatím neuhrazeno' }
        }
        if (!best || rank[v.t] > rank[best.t]) best = v
      }
      return { tone: best.t, chip: { t: best.t, a: `${MONTHS_CZ[NM]} ${NY}`, b: best.b } }
    }
    // konce smluv: červená do 3 měsíců, oranžová do roka, zelená později / navazující smlouva, šedá na dobu neurčitou
    const today0 = new Date(); today0.setHours(0, 0, 0, 0)
    let best = null
    for (const { c } of info.people) {
      const e = parseDate(c.end)
      let v
      if (!e) v = { t: 'gray', b: 'na dobu neurčitou', d: Infinity }
      else if (hasSuccessor(c, contracts)) v = { t: 'green', b: `do ${c.end} · navazuje`, d: 1e9 }
      else {
        const days = Math.round((e - today0) / 864e5)
        v = { t: days <= 92 ? 'red' : days <= 365 ? 'amber' : 'green', b: `do ${c.end}`, d: days }
      }
      if (!best || v.d < best.d) best = v
    }
    return { tone: best.t, chip: { t: best.t, a: 'smlouva končí', b: best.b } }
  }
  const bStats = countFor(floors)
  const fStats = plan ? countFor([plan]) : null
  const usedElsewhere = useMemo(() => {
    const m = new Map()
    floorPlans.forEach(p => { if (p.id === draft?.id) return; parseShapes(p).forEach(s => { if (s.kind === 'unit' && s.assetId) m.set(s.assetId, `${p.building} – ${p.name}`) }) })
    return m
  }, [floorPlans, draft?.id])

  // ─── vykreslení ───
  // Kontext vykreslení: obrazovka, nebo dočasně jiné patro pro PDF (buildPdf přepne RC a vrátí zpět)
  let RC = { W, editing, sel, idp: '', mode: editing ? 'tenants' : mode, q: editing ? '' : qn, focus: editing ? null : focusId }
  // Údaje bytu pro popisek i tabulku v PDF: V nájmu od, Smlouva do, štítek navýšení nájmu
  const unitFacts = (info) => {
    const rented = info.status === 'rented' || info.status === 'ending'
    if (!rented) return { rented, from: '', to: '', chip: null }
    const from = info.people.map(p => tenancySince(p.c, contracts)).filter(Boolean).sort((x, y) => parseDate(x) - parseDate(y))[0] || ''
    const ends = info.people.map(p => p.c.end).filter(e => parseDate(e)).sort((x, y) => parseDate(x) - parseDate(y))
    const to = ends[0] || 'na dobu neurčitou'
    let chip = null
    const a = info.asset, c = info.people[0].c
    if (VALOR_TYPES.includes(a.type) && c.paymentFrequency !== 'Zahrnuto v nájemném') {
      const lock = rentIncreaseLock(c)
      const last = lastRentIncrease(c)
      chip = lock ? { t: 'amber', a: 'navýšení možné od', b: lock.until }
        : a.type === 'residential'
          ? { t: 'green', a: 'lze navýšit', b: last ? `naposledy ${czDate(last)}` : 'zatím nenavyšováno' }
          : { t: 'green', a: 'lze navýšit', b: last ? `valor. ${czDate(last)}` : 'bez valorizace' }
    }
    return { rented, from, to, chip }
  }
  const renderShape = (s, si) => {
    const info = s.kind === 'common' ? null : unitInfo(s.assetId)
    const mv = s.kind === 'common' ? null : modeView(info)
    const tone = s.kind === 'common' ? null : TONE[mv?.tone || info.status]
    const isSel = RC.editing && si === RC.sel
    const common = s.kind === 'common'
    const hit = !common && RC.q.length >= 2 && matchAsset(s.assetId)
    const dim = RC.q.length >= 2 && !hit
    const focus = !common && RC.focus && s.assetId === RC.focus
    const fill = common ? 'var(--tone-gray-bg)' : s.kind === 'extra' ? `url(#${RC.idp}fp-hatch-${tone.pat})` : tone.fill
    const stroke = isSel || hit || focus ? 'var(--accent)' : common ? 'var(--border)' : tone.stroke
    const open = () => {
      if (editing || common || !info.asset) return
      // Režim Platby → smlouva rovnou na záložce Platby (u více nájemců ta neuhrazená), Konce smluv → přehled s časovou osou
      if ((mode === 'payments' || mode === 'ends') && info.people?.length && onOpenContract) {
        const ctx = { payments, contracts, assets }
        const unpaid = mode === 'payments' && info.people.find(({ c }) => c.paymentFrequency !== 'Zahrnuto v nájemném'
          && (c.groupLabel ? groupMonthStatus(c.groupLabel, NY, NM, ctx).status : contractMonthStatus(c, NY, NM, ctx).status) !== 'paid')
        onOpenContract((unpaid || info.people[0]).c.id, mode === 'payments' ? 'payments' : undefined)
        return
      }
      onOpen?.(info.asset.id)
    }
    return (
      <g key={si} data-si={si} className={`fp-shape${!editing && !common && info?.asset ? ' fp-click' : ''}${isSel ? ' fp-sel' : ''}${focus && s.kind === 'unit' ? ' fp-focus' : ''}`}
        style={dim ? { opacity: 0.28 } : undefined}
        onClick={open} onMouseMove={(e) => (!common && s.kind === 'unit') && onHover(e, s)} onMouseLeave={() => setHover(null)}>
        <polygon points={ptsStr(s.points)} fill={fill} stroke={stroke} strokeWidth={isSel ? 3 : focus ? 4 : hit ? 3.2 : 1.6}
          strokeDasharray={!common && tone?.dash && !isSel && !hit && !focus ? tone.dash : undefined} strokeLinejoin="round" vectorEffect="non-scaling-stroke"
          className="fp-poly" />
      </g>
    )
  }
  const renderLabel = (s, si) => {
    if (s.kind === 'extra' || s.points.length < 3) return null
    const box = labelBox(s.points, s.labelAt)
    if (box.w <= 0) return null
    if (s.kind === 'common') {
      if (!s.label) return null
      const f = Math.min((RC.W / 42) * 0.75, box.w / (s.label.length * charW))
      return <text key={'l' + si} x={box.cx} y={box.cy + f * 0.35} textAnchor="middle" fontSize={f} fill="var(--text3)" fontWeight="600" style={{ pointerEvents: 'none' }}>{s.label}</text>
    }
    return renderUnitLabel(s, si)
  }

  // Popisek bytu (varianta B): rohy = V nájmu od / Smlouva do, uprostřed jmenovka + m² + nájemce, dole štítek valorizace
  const renderUnitLabel = (s, si) => {
    const info = unitInfo(s.assetId), mv = modeView(info), tone = TONE[mv?.tone || info.status]
    const a = info.asset
    const name = a?.unit || s.label || 'Nepřiřazeno'
    const area = a ? [dispo(a.size), sqm(a.size)].filter(Boolean).join(' · ') : ''
    const rented = info.status === 'rented' || info.status === 'ending'
    const who = info.status === 'none' ? (RC.editing ? 'vyberte předmět' : '') : info.status === 'free' ? 'Volné'
      : info.people.length > 1 ? `${info.people.length} nájemci` : info.people[0].name
    // rohy a štítek navýšení (unitFacts – stejné údaje jako tabulka v PDF)
    const fx = unitFacts(info)
    let corners = null
    if (rented) corners = { l: ['v nájmu od', fx.from || '—'], r: ['smlouva do', fx.to] }
    else if (info.status === 'free' && info.free) corners = { l: ['volné od', info.free.date], r: null }
    const chip = mv ? mv.chip : fx.chip

    const r = bigRect(s.points)
    const w = r.x1 - r.x0, h = r.y1 - r.y0
    const pad = Math.min(w, h) * 0.07 + RC.W / 300
    const iw = w - 2 * pad, ih = h - 2 * pad
    if (iw <= 0 || ih <= 0) return null
    const maxF = RC.W / 38
    // dlouhý název (komerční prostory) na dva řádky
    const split2 = (t) => {
      const sp = [...t].map((c, i) => c === ' ' ? i : -1).filter(i => i > 0), mid = t.length / 2
      if (!sp.length) return [t]
      const at = sp.reduce((x, i) => Math.abs(i - mid) < Math.abs(x - mid) ? i : x, sp[0])
      return [t.slice(0, at), t.slice(at + 1)]
    }
    const nameLines = name.length > 16 ? split2(name) : [name]
    const nameLen = Math.max(...nameLines.map(l => l.length))
    // rohy vedle sebe, nebo u úzkého prostoru pod sebe (vlevo „od“, pod tím vpravo „do“)
    const cLenL = corners ? corners.l[1].length : 0, cLenR = corners?.r ? corners.r[1].length : 0
    const stacked = !!corners?.r && (iw - 0.5 * maxF) / ((cLenL + cLenR) * charW * 1.02) < 0.5 * maxF
    // velikost písma: vejít se na výšku i šířku; když je místa málo, nejdřív pryč štítek, pak rohy
    const whoSplit = who && who.includes(' ') ? split2(who) : [who]
    const fitF = (withC, withChip, lines) => {
      const cornerU = withC ? (stacked ? 2 * (0.55 * 1.15 + 0.8 * 1.15) + 0.45 : 0.55 * 1.15 + 0.8 * 1.15 + 0.45) : 0
      const units = cornerU + 1.5 + 1.15 * (nameLines.length - 1) + 0.25 + (area ? 0.72 * 1.2 : 0) + 0.25 + (who ? 1.25 * 1.18 * lines : 0) + (withChip ? 0.5 + 1.9 : 0)
      const whoLen = !who ? 0 : lines === 1 ? who.length : Math.max(...whoSplit.map(l => l.length))
      return Math.min(maxF, ih / units, iw / (nameLen * charW * 0.95 + 2.4), whoLen ? iw / (whoLen * charW * 1.25) : Infinity)
    }
    const configs = [[!!corners, !!chip], [!!corners, false], [false, false]]
    let pick = null
    for (const [c1, c2] of configs) {
      // jméno nájemce na jeden, nebo dva řádky – podle toho, co dovolí větší písmo
      const f1 = fitF(c1, c2, 1), f2 = whoSplit.length > 1 ? fitF(c1, c2, 2) : 0
      pick = f2 > f1 * 1.08 ? { c1, c2, f: f2, lines: 2 } : { c1, c2, f: f1, lines: 1 }
      if (pick.f >= RC.W / 85) break
    }
    const { c1, c2, f, lines } = pick
    const els = []
    let top = r.y0 + pad, bottom = r.y1 - pad
    // rohy nahoře
    if (c1) {
      const lblLen = corners.l[0].length + (corners.r ? corners.r[0].length : 0)
      const fv = stacked
        ? Math.min(f * 0.85, iw / (Math.max(cLenL, cLenR) * charW * 1.02))
        : Math.min(f * 0.85, (iw - f) / (Math.max(1, cLenL + cLenR) * charW * 1.02))
      const fl = Math.min(Math.max(fv * 0.72, f * 0.5), stacked ? iw / (Math.max(corners.l[0].length, corners.r[0].length) * charW) : (iw - f * 0.6) / (lblLen * charW))
      const yl = top + fl, yv = yl + fv * 1.15
      els.push(<text key="ll" x={r.x0 + pad} y={yl} fontSize={fl} fontWeight="600" fill="var(--text2)">{corners.l[0]}</text>)
      els.push(<text key="lv" x={r.x0 + pad} y={yv} fontSize={fv} fontWeight="800" fill={tone.text}>{corners.l[1]}</text>)
      let yEnd = yv
      if (corners.r) {
        const yl2 = stacked ? yv + f * 0.25 + fl : yl, yv2 = yl2 + fv * 1.15
        els.push(<text key="rl" x={r.x1 - pad} y={yl2} textAnchor="end" fontSize={fl} fontWeight="600" fill="var(--text2)">{corners.r[0]}</text>)
        els.push(<text key="rv" x={r.x1 - pad} y={yv2} textAnchor="end" fontSize={fv} fontWeight="800" fill={tone.text}>{corners.r[1]}</text>)
        yEnd = yv2
      }
      top = yEnd + f * 0.45
    }
    // štítek dole
    if (c2) {
      const ch = f * 1.9, fa = f * 0.55, fb = f * 0.74
      let cw = Math.max(chip.a.length * charW * fa, chip.b.length * charW * fb) + f * 2.2
      const k = Math.min(1, iw / cw); cw *= k
      const cx = (r.x0 + r.x1) / 2, cy = bottom - ch * k
      const dotC = chip.t === 'green' ? '#16A34A' : '#D97706'
      els.push(
        <g key="chip">
          <rect x={cx - cw / 2} y={cy} width={cw} height={ch * k} rx={ch * k / 2} fill={`var(--tone-${chip.t}-bg)`} stroke={`var(--tone-${chip.t}-border)`} strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
          <circle cx={cx - cw / 2 + f * 0.95 * k} cy={cy + ch * k / 2} r={f * 0.25 * k} fill={dotC} />
          <text x={cx - cw / 2 + f * 1.6 * k} y={cy + ch * k * 0.43} fontSize={fa * k} fontWeight="600" fill={`var(--tone-${chip.t}-text)`}>{chip.a}</text>
          <text x={cx - cw / 2 + f * 1.6 * k} y={cy + ch * k * 0.8} fontSize={fb * k} fontWeight="800" fill={`var(--tone-${chip.t}-text)`}>{chip.b}</text>
        </g>
      )
      bottom = cy - f * 0.5
    }
    // střed: jmenovka, plocha, nájemce
    const fName = f * 0.95, pillH = f * 1.5 + fName * 1.15 * (nameLines.length - 1)
    const fArea = f * 0.72
    let fWho = f * 1.25
    let whoLines = [who]
    if (who && lines === 2 && who.includes(' ')) whoLines = split2(who)
    if (who) fWho = Math.min(fWho, iw / (Math.max(...whoLines.map(l => l.length)) * charW))
    const blockH = pillH + f * 0.25 + (area ? fArea * 1.2 : 0) + (who ? f * 0.25 + fWho * 1.18 * whoLines.length : 0)
    let y = Math.max(top, top + (bottom - top - blockH) / 2)
    const cx = (r.x0 + r.x1) / 2
    const pillW = nameLen * charW * fName + fName * (tone.dot ? 2.4 : 1.5)
    const multi = nameLines.length > 1
    els.push(
      <g key="pill">
        <rect x={cx - pillW / 2} y={y} width={pillW} height={pillH} rx={multi ? fName * 0.6 : pillH / 2} fill="var(--bg)" stroke={tone.stroke} strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
        {tone.dot && <circle cx={cx - pillW / 2 + fName * 0.9} cy={y + pillH / 2} r={fName * 0.27} fill={tone.dot} />}
        {nameLines.map((l, i) => (
          <text key={i} x={cx + (tone.dot ? fName * 0.45 : 0)} y={y + f * 1.5 * 0.68 + i * fName * 1.15} textAnchor="middle" fontSize={fName} fontWeight="800" fill={tone.text}>{l}</text>
        ))}
      </g>
    )
    y += pillH + f * 0.25
    if (area) { y += fArea; els.push(<text key="area" x={cx} y={y} textAnchor="middle" fontSize={fArea} fontWeight="600" fill="var(--text2)">{area}</text>); y += fArea * 0.2 }
    if (who) {
      y += f * 0.25
      whoLines.forEach((l, i) => { y += fWho * (i ? 1.18 : 1.0); els.push(<text key={'w' + i} x={cx} y={y} textAnchor="middle" fontSize={fWho} fontWeight="800" fill={info.status === 'free' ? 'var(--text2)' : tone.text}>{l}</text>) })
    }
    return <g key={'l' + si} style={{ pointerEvents: 'none', opacity: RC.q.length >= 2 && !matchAsset(s.assetId) ? 0.28 : 1 }}>{els}</g>
  }

  const hatch = (id, color) => (
    <pattern key={id} id={`${RC.idp}fp-hatch-${id}`} width={RC.W / 110} height={RC.W / 110} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width={RC.W / 110} height={RC.W / 110} fill={`var(--tone-${color}-soft)`} />
      <line x1="0" y1="0" x2="0" y2={RC.W / 110} stroke={`var(--tone-${color}-border)`} strokeWidth={RC.W / 450} />
    </pattern>
  )
  const order = (k) => ({ common: 0, extra: 1, unit: 2 }[k] ?? 2)
  const drawOrder = shapes.map((s, i) => [s, i]).sort((a, b) => order(a[0].kind) - order(b[0].kind) || a[1] - b[1])
  const selShape = editing && sel >= 0 ? shapes[sel] : null

  // ─── PDF půdorysu (Edge headless jako ostatní PDF) – vždy světlé barvy z :root (CSS proměnné v PDF nefungují) ───
  const [pdfOpen, setPdfOpen] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const lightVars = () => {
    const m = {}
    for (const sh of document.styleSheets) {
      let rules; try { rules = sh.cssRules } catch { continue }
      for (const r of rules || []) {
        if (r.selectorText !== ':root') continue
        for (let i = 0; i < r.style.length; i++) { const n = r.style[i]; if (n.startsWith('--')) m[n] = r.style.getPropertyValue(n).trim() }
      }
    }
    return m
  }
  const buildPdfHtml = (list) => {
    const vars = lightVars()
    const res = (str) => { let out = str; for (let k = 0; k < 4 && out.includes('var('); k++) out = out.replace(/var\((--[\w-]+)(?:\s*,[^()]*)?\)/g, (_, n) => vars[n] || '#888888'); return out }
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    const saved = RC
    const pages = []
    try {
      list.forEach((p, pi) => {
        const sh = parseShapes(p)
        RC = { W: p.width || 1600, editing: false, sel: -1, idp: `p${pi}-`, mode: 'tenants', q: '', focus: null }
        const ord = sh.map((x, i) => [x, i]).sort((a, b) => order(a[0].kind) - order(b[0].kind) || a[1] - b[1])
        const svg = renderToStaticMarkup(
          <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${p.width} ${p.height}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', display: 'block' }}>
            <defs>{hatch('green', 'green')}{hatch('amber', 'amber')}{hatch('gray', 'gray')}{hatch('red', 'red')}</defs>
            {ord.map(([x, i]) => renderShape(x, i))}
            {ord.map(([x, i]) => renderLabel(x, i))}
          </svg>
        )
        const ids = [...new Set(sh.filter(x => x.kind === 'unit' && x.assetId).map(x => x.assetId))]
        const rows = ids.map(id => { const info = unitInfo(id); return { info, fx: unitFacts(info) } }).filter(r => r.info.asset)
          .sort((x, y) => String(x.info.asset.unit).localeCompare(String(y.info.asset.unit), 'cs', { numeric: true }))
        pages.push({ p, svg: res(svg), rows })
      })
    } finally { RC = saved }
    const today = czDate(new Date())
    const tag = (t, txt) => `<span class="tag ${t}">${esc(txt)}</span>`
    const body = pages.map(({ p, svg, rows }) => {
      const rented = rows.filter(r => r.fx.rented).length
      const mapH = Math.max(70, Math.min(135, 192 - 30 - (9 + rows.length * 6.6)))
      const tr = rows.map(({ info, fx }) => {
        const a = info.asset
        const stav = info.status === 'free' ? tag('gray', `Volné${info.free ? ' od ' + info.free.date : ''}`) : info.status === 'ending' ? tag('warn', 'Končí') : tag('ok', 'Pronajato')
        const nav = fx.chip ? tag(fx.chip.t === 'amber' ? 'warn' : 'ok', fx.chip.t === 'amber' ? `možné od ${fx.chip.b}` : `${fx.chip.a} · ${fx.chip.b}`) : '—'
        return `<tr><td class="b">${esc(a.unit)}</td><td>${esc([dispo(a.size), sqm(a.size)].filter(Boolean).join(' · ') || a.size || '')}</td>
          <td class="b">${esc(info.status === 'free' ? '—' : info.people.map(x => x.name).join(', '))}</td>
          <td>${esc(fx.from || '—')}</td><td${info.status === 'ending' ? ' class="warnt"' : ''}>${esc(fx.rented ? fx.to : '—')}</td><td>${nav}</td><td>${stav}</td></tr>`
      }).join('')
      return `<section class="page">
        <div class="head"><div><div class="title">${esc(p.building)} – ${esc(p.name)}</div>
          <div class="sub">${rows.length} ${rows.length === 1 ? 'předmět' : rows.length > 1 && rows.length < 5 ? 'předměty' : 'předmětů'} · ${rented} pronajato · ${rows.length - rented} volných</div></div>
          <div class="date">Stav k ${today}<small>RentFlow · půdorys</small></div></div>
        <div class="map" style="height:${mapH}mm">${svg}</div>
        <div class="legend"><span><i class="sw ok"></i>Pronajato</span><span><i class="sw warn"></i>Smlouva končí do ${ENDING_DAYS} dní (bez navazující)</span><span><i class="sw free"></i>Volné</span><span><i class="sw hatch"></i>Terasa / balkon</span></div>
        ${rows.length ? `<table><thead><tr><th>Byt / prostor</th><th>Dispozice · plocha</th><th>Nájemce</th><th>V nájmu od</th><th>Smlouva do</th><th>Navýšení nájmu</th><th>Stav</th></tr></thead><tbody>${tr}</tbody></table>` : ''}
      </section>`
    }).join('')
    return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><title>Půdorys</title><style>
      @page { size: A4 landscape; margin: 9mm 10mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1c1b; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #12654A; padding-bottom: 5px; margin-bottom: 6px; }
      .title { font-size: 19px; font-weight: 800; color: #12654A; }
      .sub { font-size: 11px; color: #555; margin-top: 2px; }
      .date { text-align: right; font-size: 11.5px; color: #374151; font-weight: 700; }
      .date small { display: block; font-weight: 400; color: #9CA3AF; font-size: 10px; }
      .map { width: 100%; }
      .legend { display: flex; gap: 16px; font-size: 9.5px; color: #4B5563; font-weight: 600; margin: 4px 0 6px; }
      .sw { display: inline-block; width: 11px; height: 11px; border-radius: 3px; border: 1.3px solid; vertical-align: -2px; margin-right: 5px; }
      .sw.ok { background: #F0FDF4; border-color: #86EFAC; } .sw.warn { background: #FFFBEB; border-color: #FCD34D; }
      .sw.free { background: #fff; border-color: #9CA3AF; border-style: dashed; }
      .sw.hatch { border-color: #86EFAC; background: repeating-linear-gradient(45deg, #F0FDF4 0 2px, #86EFAC 2px 3px); }
      table { width: 100%; border-collapse: collapse; font-size: 10px; page-break-inside: auto; }
      th { text-align: left; background: #F3F4F6; color: #374151; font-weight: 700; padding: 4px 6px; border-bottom: 1.5px solid #D1D5DB; }
      td { padding: 3px 6px; border-bottom: 1px solid #E5E7EB; }
      tr { page-break-inside: avoid; }
      td.b { font-weight: 700; } td.warnt { color: #B45309; font-weight: 700; }
      .tag { display: inline-block; padding: 1px 7px; border-radius: 10px; border: 1px solid; font-weight: 700; font-size: 9.5px; white-space: nowrap; }
      .tag.ok { background: #F0FDF4; color: #166534; border-color: #86EFAC; } .tag.warn { background: #FFFBEB; color: #B45309; border-color: #FCD34D; }
      .tag.gray { background: #F3F4F6; color: #4B5563; border-color: #D1D5DB; }
    </style></head><body>${body}</body></html>`
  }
  const exportPdf = async (scope) => {
    const list = scope === 'all' ? floors : [plan]
    if (!list.length) return
    setPdfBusy(true)
    try {
      const html = buildPdfHtml(list)
      const { save } = await import('@tauri-apps/api/dialog')
      const fileName = `Pudorys ${curBuilding}${scope === 'all' ? '' : ' ' + plan.name} ${czDate(new Date()).replace(/\s/g, '')}.pdf`.replace(/[\\/:*?"<>|]/g, '-')
      const outPath = await save({ defaultPath: fileName, filters: [{ name: 'PDF soubor', extensions: ['pdf'] }] })
      if (!outPath) return
      const { invoke } = await import('@tauri-apps/api/tauri')
      await invoke('export_to_pdf', { html, outPath })
      setPdfOpen(false)
      try { const { open } = await import('@tauri-apps/api/shell'); await open(outPath) } catch { /* PDF je uložené, jen se neotevřelo */ }
      showToast('PDF půdorysu je uložené a otevřené – tisk přes Ctrl+P.', 'success')
    } catch (e) {
      console.error('PDF půdorysu:', e)
      showToast('PDF se nepodařilo vytvořit: ' + e)
    } finally { setPdfBusy(false) }
  }
  if (import.meta.env.DEV) window.__rfFloorPdf = (scope) => buildPdfHtml(scope === 'all' ? floors : plan ? [plan] : [])

  // výběr předmětu pro plochu: nejdřív byty, podle názvu
  const assetOptions = useMemo(() => {
    const q = assetFilter.trim().toLowerCase()
    return assets
      .filter(a => !q || `${a.unit} ${a.subject}`.toLowerCase().includes(q))
      .sort((a, b) => (a.type === 'residential' ? 0 : 1) - (b.type === 'residential' ? 0 : 1) || String(a.unit).localeCompare(String(b.unit), 'cs', { numeric: true }))
      .slice(0, 300)
  }, [assets, assetFilter])

  const pageSub = !plan ? 'Interaktivní mapa budov – kdo kde bydlí'
    : `${curBuilding} · ${bStats.total} ${bStats.total === 1 ? 'předmět' : bStats.total < 5 && bStats.total > 0 ? 'předměty' : 'předmětů'} · ${bStats.rented} pronajato · ${bStats.free} volných`
      + (bStats.m2 > 0 ? ` · ${Math.round(bStats.m2r).toLocaleString('cs-CZ')} / ${Math.round(bStats.m2).toLocaleString('cs-CZ')} m² (${bStats.pct} %)` : '')
      + (bStats.rent != null && bStats.rent > 0 ? ` · ${fmtKcFp(bStats.rent)} / měs.` : '')

  return (
    <div>
      <div className="page-header" data-icon="🗺️">
        <div>
          <div className="page-title">Půdorysy</div>
          <div className="page-sub">{pageSub}</div>
        </div>
        {!isReadOnly && !editing && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setImportOpen(true)}>📥 Importovat</button>
            <button className="btn btn-primary" onClick={() => setNewOpen(true)}>+ Nové patro</button>
          </div>
        )}
      </div>

      {!plan ? (
        <EmptyState icon="🗺️" title="Zatím žádný půdorys"
          text={isReadOnly ? 'Půdorysy budov zakládá správce.' : 'Založte patro budovy a obkreslete byty podle podkladu, nebo naimportujte připravený soubor půdorysů.'}
          action={!isReadOnly && <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn" onClick={() => setImportOpen(true)}>📥 Importovat ze souboru</button>
            <button className="btn btn-primary" onClick={() => setNewOpen(true)}>+ Nové patro</button>
          </div>} />
      ) : (
        <>
          {/* Výběr budovy a patra */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            {buildings.length > 1 && (
              <Segmented items={buildings.map(b => { const n = qn.length >= 2 ? floorPlans.filter(p => p.building === b).reduce((x, p) => x + matchCount(p), 0) : 0; return { id: b, label: `🏢 ${b}`, count: n || undefined } })} value={curBuilding}
                onChange={(b) => { if (editing) return; setBuilding(b); setPlanId('') }} />
            )}
            <Segmented items={floors.map(p => ({ id: p.id, label: p.name, count: matchCount(p) || undefined }))} value={plan.id}
              onChange={(id) => { if (editing) return; setPlanId(id) }} />
            {!editing && (
              <Segmented size="sm" items={[{ id: 'tenants', label: '👤 Nájemci' }, { id: 'payments', label: '💳 Platby' }, { id: 'ends', label: '⏳ Konce smluv' }]} value={mode} onChange={setMode} />
            )}
            {!editing && (
              <div style={{ position: 'relative' }}>
                <input className="btn" data-local-search="1" value={q} onChange={e => setQ(e.target.value)} placeholder="Hledat nájemce…"
                  onKeyDown={e => { if (e.key === 'Escape') { setQ(''); e.stopPropagation() } }}
                  style={{ width: 190, cursor: 'text', textAlign: 'left', paddingLeft: 30, boxSizing: 'border-box' }} />
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text3)', pointerEvents: 'none' }}>🔍</span>
              </div>
            )}
            <div style={{ flex: 1 }} />
            {!editing && <button className="btn" onClick={() => setPdfOpen(true)} title="Půdorys s aktuálními údaji do PDF k tisku">🖨 PDF</button>}
            {!isReadOnly && !editing && <button className="btn" onClick={() => startEdit()}>✏️ Upravit patro</button>}
          </div>
          {fStats && !editing && (
            <div className="fp-summary">
              <span><b>{fStats.rented}</b> pronajato{fStats.ending > 0 && <> · <b style={{ color: 'var(--tone-amber-text)' }}>{fStats.ending}</b> končí</>} · <b>{fStats.free}</b> volných</span>
              {fStats.m2 > 0 && <span>Plocha <b>{Math.round(fStats.m2r).toLocaleString('cs-CZ')} / {Math.round(fStats.m2).toLocaleString('cs-CZ')} m²</b> pronajato</span>}
              <span className="fp-occ"><span className="fp-occ-bar"><span style={{ width: `${fStats.pct}%` }} /></span><b>{fStats.pct} %</b> obsazenost</span>
              {fStats.rent != null && fStats.rent > 0 && <span>Nájem <b>{fmtKcFp(fStats.rent)}</b> / měs.</span>}
              {qn.length >= 2 && <span style={{ color: 'var(--accent)' }}>🔍 {matchCount(plan) ? `${matchCount(plan)} na tomto patře` : 'na tomto patře nic'}{floors.some(p => p.id !== plan.id && matchCount(p)) ? ' · další v přepínači pater' : ''}</span>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {/* Mapa */}
            <div ref={wrapRef} className="fp-stage" key={view.id + (editing ? '-e' : '')}
              style={{ position: 'relative', flex: 1, minWidth: 0, background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 16, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
              <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%"
                style={{ display: 'block', maxHeight: `calc(74vh / var(--ui-zoom, 1))`, cursor: editing && tool !== 'select' ? 'crosshair' : undefined, touchAction: 'none', userSelect: 'none' }}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={onDoubleClick}>
                <defs>{hatch('green', 'green')}{hatch('amber', 'amber')}{hatch('gray', 'gray')}{hatch('red', 'red')}</defs>
                {editing && (
                  <>
                    <defs>
                      <pattern id="fp-grid" width={grid * 10} height={grid * 10} patternUnits="userSpaceOnUse">
                        <path d={`M ${grid * 10} 0 L 0 0 0 ${grid * 10}`} fill="none" stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                      </pattern>
                    </defs>
                    <rect x="0" y="0" width={W} height={H} fill="url(#fp-grid)" />
                  </>
                )}
                {view.background && bgUrls[view.background] && (editing ? bgShow : false) && (
                  <image href={bgUrls[view.background]} x="0" y="0" width={W} height={H} opacity={bgOpacity} preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: 'none' }} />
                )}
                {drawOrder.map(([s, i]) => renderShape(s, i))}
                {drawOrder.map(([s, i]) => renderLabel(s, i))}
                {/* úpravy: body vybrané plochy, rozkreslený tvar, obdélník */}
                {selShape && tool === 'select' && selShape.points.map((v, vi) => (
                  <circle key={vi} data-vi={vi} cx={v[0]} cy={v[1]} r={7 * pxToPlan()} fill="var(--bg)" stroke="var(--accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke"
                    style={{ cursor: 'move' }} onContextMenu={(e) => onVertexContext(e, vi)} />
                ))}
                {poly.length > 0 && (
                  <>
                    <polyline points={ptsStr(hoverPt ? [...poly, hoverPt] : poly)} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                    {poly.map((v, i) => <circle key={i} cx={v[0]} cy={v[1]} r={(i === 0 ? 8 : 5) * pxToPlan()} fill={i === 0 ? 'var(--accent)' : 'var(--bg)'} stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
                  </>
                )}
                {editing && tool === 'poly' && !poly.length && hoverPt && <circle cx={hoverPt[0]} cy={hoverPt[1]} r={5 * pxToPlan()} fill="var(--accent)" />}
                {drag?.type === 'rect' && (
                  <rect x={Math.min(drag.a[0], drag.b[0])} y={Math.min(drag.a[1], drag.b[1])} width={Math.abs(drag.b[0] - drag.a[0])} height={Math.abs(drag.b[1] - drag.a[1])}
                    fill="var(--tone-green-soft)" fillOpacity="0.6" stroke="var(--accent)" strokeWidth="2.5" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                )}
              </svg>

              {/* Popisek po najetí */}
              {hover && (() => {
                const info = unitInfo(hover.s.assetId)
                if (info.status === 'none') return null
                const a = info.asset, d = dispo(a.size), m = sqm(a.size)
                const left = Math.min(hover.x + 16, hover.w - 270)
                return (
                  <div style={{ position: 'absolute', left, top: hover.y + 16, width: 250, zIndex: 5, pointerEvents: 'none', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 12, boxShadow: '0 10px 30px -8px rgba(0,0,0,0.3)', padding: '10px 12px', fontSize: 12.5 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>{ASSET_TYPES[a.type]?.icon} {a.unit}</div>
                    <div style={{ color: 'var(--text2)', marginBottom: 6 }}>{[d, m].filter(Boolean).join(' · ') || a.size || '—'}{a.balcony ? ` · balkon / terasa ${a.balcony}${/m²/.test(a.balcony) ? '' : ' m²'}` : ''}</div>
                    {info.status === 'free'
                      ? <div style={{ fontWeight: 700, color: 'var(--text2)' }}>Volné{info.free ? ` od ${info.free.date} (${info.free.days} dní)` : ''}</div>
                      : info.people.map(({ c, name }) => (
                        <div key={c.id} style={{ marginTop: 2 }}>
                          <div style={{ fontWeight: 700, color: 'var(--text)' }}>{name}</div>
                          <div style={{ color: info.status === 'ending' ? 'var(--tone-amber-text)' : 'var(--text3)' }}>{c.start || '?'} – {c.end || 'na dobu neurčitou'}</div>
                        </div>
                      ))}
                    <div style={{ color: 'var(--text3)', marginTop: 6, fontSize: 11.5 }}>{mode === 'payments' ? 'Klik = platby smlouvy' : mode === 'ends' ? 'Klik = detail smlouvy' : 'Klik = detail předmětu'}</div>
                  </div>
                )
              })()}
            </div>

            {/* Panel úprav */}
            {editing && (
              <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 0 }}>
                <div className="fp-panel">
                  <div className="fp-panel-title">Patro</div>
                  <input className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text', boxSizing: 'border-box' }} value={draft.name}
                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="např. 1. patro" />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button className="btn" style={{ flex: 1 }} title="Posunout patro v pořadí dřív" onClick={() => movePlan(-1)} disabled={dirty}>◀ Dřív</button>
                    <button className="btn" style={{ flex: 1 }} title="Posunout patro v pořadí později" onClick={() => movePlan(1)} disabled={dirty}>Později ▶</button>
                    <button className="btn btn-tone-red" onClick={removePlan} title="Smazat patro">🗑</button>
                  </div>
                </div>

                <div className="fp-panel">
                  <div className="fp-panel-title">Kreslení</div>
                  <Segmented size="sm" items={TOOLS} value={tool} onChange={(t) => { setTool(t); setPoly([]); setHoverPt(null) }} />
                  <div style={{ fontSize: 11.5, color: 'var(--text2)', margin: '10px 0 6px', fontWeight: 600 }}>Nová plocha je:</div>
                  <Segmented size="sm" items={KINDS.map(k => ({ id: k.id, label: k.id === 'unit' ? 'Byt' : k.id === 'extra' ? 'Terasa' : 'Společné' }))} value={newKind} onChange={setNewKind} />
                  <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
                    {tool === 'rect' && 'Táhněte myší přes plochu. Rohy se přichytí k mřížce a k rohům sousedních ploch.'}
                    {tool === 'poly' && 'Klikejte na rohy. Hrany se samy srovnají vodorovně / svisle (Shift = volně). Uzavřete klikem na první bod, dvojklikem nebo Enter; Backspace = krok zpět, Esc = zrušit.'}
                    {tool === 'select' && 'Klik = vybrat, tažení = posun. Body vybrané plochy jde táhnout, dvojklik na hranu přidá bod, pravé tlačítko na bodu ho smaže. Delete = smazat plochu, Ctrl+Z = zpět.'}
                  </div>
                </div>

                {selShape && (
                  <div className="fp-panel" style={{ borderColor: 'var(--accent)' }}>
                    <div className="fp-panel-title">Vybraná plocha</div>
                    <select className="btn" style={{ width: '100%', textAlign: 'left' }} value={selShape.kind}
                      onChange={e => updSel(e.target.value === 'common' ? { kind: 'common', assetId: undefined } : { kind: e.target.value })}>
                      {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                    </select>
                    {selShape.kind === 'common' ? (
                      <input className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text', marginTop: 8, boxSizing: 'border-box' }}
                        value={selShape.label || ''} placeholder="Popisek (chodba, schodiště…)" onChange={e => updSel({ label: e.target.value })} />
                    ) : (
                      <>
                        <div style={{ fontSize: 11.5, color: 'var(--text2)', margin: '10px 0 4px', fontWeight: 600 }}>
                          {selShape.kind === 'extra' ? 'Patří k předmětu (barva podle jeho stavu)' : 'Předmět nájmu'}
                        </div>
                        <input className="btn" style={{ width: '100%', textAlign: 'left', cursor: 'text', boxSizing: 'border-box' }} value={assetFilter}
                          placeholder="🔍 Hledat (B.1.5…)" onChange={e => setAssetFilter(e.target.value)} />
                        <select className="btn" size={7} style={{ width: '100%', textAlign: 'left', marginTop: 6, height: 'auto', padding: 4 }}
                          value={selShape.assetId || ''} onChange={e => updSel({ assetId: e.target.value })}>
                          <option value="">— nepřiřazeno —</option>
                          {assetOptions.map(a => <option key={a.id} value={a.id}>{ASSET_TYPES[a.type]?.icon || ''} {a.unit} · {a.subject}</option>)}
                        </select>
                        {selShape.kind === 'unit' && selShape.assetId && usedElsewhere.get(selShape.assetId) && (
                          <div style={{ fontSize: 11.5, color: 'var(--tone-amber-text)', marginTop: 6 }}>⚠ Předmět je už i na půdorysu {usedElsewhere.get(selShape.assetId)}.</div>
                        )}
                        {selShape.kind === 'unit' && selShape.assetId && shapes.some((s, i) => i !== sel && s.kind === 'unit' && s.assetId === selShape.assetId) && (
                          <div style={{ fontSize: 11.5, color: 'var(--tone-amber-text)', marginTop: 6 }}>⚠ Předmět je na tomto patře přiřazený víckrát.</div>
                        )}
                      </>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      {selShape.kind !== 'extra' && (
                        <button className="btn" style={{ flex: 1 }} title="Popisek se umístí automaticky; tímto se vrátí na automatické místo"
                          disabled={!selShape.labelAt} onClick={() => updSel({ labelAt: undefined })}>↺ Popisek</button>
                      )}
                      <button className="btn btn-tone-red" style={{ flex: 1 }} onClick={delSel}>🗑 Smazat plochu</button>
                    </div>
                  </div>
                )}

                <div className="fp-panel">
                  <div className="fp-panel-title">Podklad (obrázek půdorysu)</div>
                  <input ref={bgInput} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={onBgFile} />
                  <button className="btn" style={{ width: '100%' }} onClick={() => bgInput.current?.click()}>🖼 {draft.background ? 'Vyměnit podklad' : 'Nahrát podklad'}</button>
                  {draft.background && (
                    <>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 10, color: 'var(--text2)', fontWeight: 600 }}>
                        <input type="checkbox" checked={bgShow} onChange={e => setBgShow(e.target.checked)} /> Zobrazit při kreslení
                      </label>
                      <input type="range" min="0.1" max="1" step="0.05" value={bgOpacity} onChange={e => setBgOpacity(Number(e.target.value))} style={{ width: '100%', marginTop: 6 }} />
                      <button className="btn" style={{ width: '100%', marginTop: 6 }} onClick={() => setDraft(d => ({ ...d, background: null }))}>Odebrat podklad</button>
                    </>
                  )}
                  <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>Podklad slouží jen k obkreslení – na mapě se neukazuje. Uloží se k dokumentům (Ctrl+S ho zálohuje).</div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" style={{ flex: 1 }} onClick={cancelEdit}>Zrušit</button>
                  <button className="btn btn-primary" style={{ flex: 1.4 }} onClick={saveEdit} disabled={saving}>{saving ? 'Ukládám…' : '💾 Uložit patro'}</button>
                </div>
              </div>
            )}
          </div>

          {!editing && (
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--text2)', margin: '12px 4px 0', fontWeight: 600 }}>
              {(mode === 'payments' ? [['green', `Uhrazeno (${MONTHS_CZ[NM]})`], ['amber', 'Částečně'], ['red', 'Po splatnosti'], ['gray', 'Čeká na splatnost']]
                : mode === 'ends' ? [['red', 'Končí do 3 měsíců'], ['amber', 'Končí do roka'], ['green', 'Později / navazující smlouva'], ['gray', 'Na dobu neurčitou']]
                : [['green', 'Pronajato'], ['amber', `Smlouva končí do ${ENDING_DAYS} dní (bez navazující)`]]).map(([t, l]) => (
                <span key={t}><span className="fp-leg" style={{ background: `var(--tone-${t}-soft)`, borderColor: `var(--tone-${t}-border)` }} />{l}</span>
              ))}
              <span><span className="fp-leg" style={{ background: 'var(--bg)', borderColor: 'var(--tone-gray-border)', borderStyle: 'dashed' }} />Volné</span>
              <span><span className="fp-leg fp-leg-hatch" />Terasa / balkon</span>
            </div>
          )}
        </>
      )}

      {pdfOpen && plan && (
        <DialogShell icon="🖨" title="PDF půdorysu" subtitle="S aktuálními nájemci – k uložení a tisku" width={460} onClose={() => !pdfBusy && setPdfOpen(false)} busy={pdfBusy}
          footer={<button className="btn" onClick={() => setPdfOpen(false)} disabled={pdfBusy}>Zrušit</button>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn" style={{ padding: '14px 16px', textAlign: 'left' }} disabled={pdfBusy} onClick={() => exportPdf('floor')}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>📄 Toto patro</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{curBuilding} – {plan.name}</div>
            </button>
            {floors.length > 1 && (
              <button className="btn" style={{ padding: '14px 16px', textAlign: 'left' }} disabled={pdfBusy} onClick={() => exportPdf('all')}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>🏢 Celá budova</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{curBuilding} – {floors.length} {floors.length < 5 ? 'patra' : 'pater'}, každé na vlastní stránce</div>
              </button>
            )}
            <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>A4 na šířku: mapa, legenda a tabulka (byt, nájemce, v nájmu od, smlouva do, navýšení nájmu). Po uložení se PDF otevře k tisku.</div>
          </div>
        </DialogShell>
      )}
      {newOpen && <NewFloorDialog buildings={mainObjects} defaultBuilding={curBuilding} onClose={() => setNewOpen(false)}
        onCreate={async (b, name) => {
          const out = await saveFloorPlan({ id: '', building: b, name, width: 1600, height: 1000, shapes: '[]' })
          if (out) { setNewOpen(false); setBuilding(b); setPlanId(out.id); startEdit(out) }
        }} />}
      {importOpen && <ImportDialog buildings={mainObjects} assets={assets} floorPlans={floorPlans} onClose={() => setImportOpen(false)}
        onImport={async (b, floorsIn) => {
          let last = null
          for (const f of floorsIn) {
            // Patro se stejným názvem v budově se nahradí (zůstává pořadí i podklad), jinak vznikne nové
            const ex = floorPlans.find(x => x.building === b && normUnit(x.name) === normUnit(f.name))
            const out = await saveFloorPlan({ ...(ex || {}), id: ex?.id || '', building: b, name: f.name, width: f.width, height: f.height, shapes: JSON.stringify(f.shapes) })
            if (!out) return
            last = last || out
          }
          setImportOpen(false); setBuilding(b); if (last) setPlanId(last.id)
          showToast(`Naimportováno ${floorsIn.length} ${floorsIn.length === 1 ? 'patro' : floorsIn.length < 5 ? 'patra' : 'pater'} – ${b}.`, 'success')
        }} />}
    </div>
  )
}

// ─── Nové patro ───
function NewFloorDialog({ buildings, defaultBuilding, onClose, onCreate }) {
  const [b, setB] = useState(defaultBuilding && buildings.includes(defaultBuilding) ? defaultBuilding : buildings[0] || '')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => { e.preventDefault(); if (!b || !name.trim()) return; setBusy(true); await onCreate(b, name.trim()); setBusy(false) }
  return (
    <DialogShell icon="🗺️" title="Nové patro" subtitle="Půdorys patra budovy" width={460} onClose={onClose} busy={busy}
      footer={<><button className="btn" onClick={onClose}>Zrušit</button><button className="btn btn-primary" type="submit" form="fp-new" disabled={!b || !name.trim() || busy}>Založit a kreslit</button></>}>
      {!buildings.length ? (
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>Nejdřív založte budovu v Nastavení → Firmy a budovy.</div>
      ) : (
        <form id="fp-new" onSubmit={submit}>
          <label className="dlg-lbl">Budova</label>
          <select className="btn" style={{ width: '100%', textAlign: 'left' }} value={b} onChange={e => setB(e.target.value)}>
            {buildings.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <label className="dlg-lbl" style={{ marginTop: 12 }}>Název patra</label>
          <input className="btn" autoFocus style={{ width: '100%', textAlign: 'left', cursor: 'text', boxSizing: 'border-box' }} value={name} onChange={e => setName(e.target.value)} placeholder="např. 1. patro" />
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>Pak nahrajte obrázek půdorysu jako podklad a byty po něm obkreslete.</div>
        </form>
      )}
    </DialogShell>
  )
}

// ─── Import ze souboru (JSON: { building, floors: [{ name, width, height, shapes: [{ kind, unit, label, points, labelAt }] }] }) ───
function ImportDialog({ buildings, assets, floorPlans = [], onClose, onImport }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [b, setB] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    try {
      const j = JSON.parse(await f.text())
      if (!Array.isArray(j?.floors) || !j.floors.length) throw new Error('Soubor neobsahuje žádná patra.')
      setData(j); setErr('')
      const match = buildings.find(x => normUnit(x) === normUnit(j.building))
      setB(match || buildings[0] || '')
    } catch (ex) { setData(null); setErr('Soubor nejde načíst: ' + (ex.message || ex)) }
  }
  // Spárování ploch s předměty podle názvu (B.1.5 = předmět „B.1.5“), byty mají přednost
  const findAsset = (unit) => {
    if (!unit) return null
    const hits = assets.filter(a => normUnit(a.unit) === normUnit(unit))
    return hits.find(a => a.type === 'residential') || hits[0] || null
  }
  const prepared = useMemo(() => !data ? [] : data.floors.map(f => {
    const shapes = (f.shapes || []).map(s => {
      const a = s.kind === 'common' ? null : findAsset(s.unit)
      const out = { kind: s.kind || 'unit', points: s.points }
      if (out.kind === 'common') out.label = s.label || ''
      else { out.assetId = a?.id || ''; if (!a && s.unit) out.label = s.unit }
      if (s.labelAt) out.labelAt = s.labelAt
      return out
    })
    const units = (f.shapes || []).filter(s => (s.kind || 'unit') === 'unit')
    const missing = units.filter(s => !findAsset(s.unit)).map(s => s.unit)
    return { name: f.name, width: f.width, height: f.height, shapes, units: units.length, missing }
  }), [data, assets])
  const go = async () => { setBusy(true); await onImport(b, prepared); setBusy(false) }
  return (
    <DialogShell icon="📥" title="Import půdorysů" subtitle="Připravený soubor pater (.json)" width={520} onClose={onClose} busy={busy}
      footer={<><button className="btn" onClick={onClose}>Zrušit</button><button className="btn btn-primary" onClick={go} disabled={!data || !b || busy}>Importovat</button></>}>
      <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onFile} />
      <button className="btn" style={{ width: '100%' }} onClick={() => fileRef.current?.click()}>📄 {data ? 'Vybrat jiný soubor' : 'Vybrat soubor…'}</button>
      {err && <div style={{ color: 'var(--tone-red-text)', fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      {data && (
        <>
          <label className="dlg-lbl" style={{ marginTop: 14 }}>Budova</label>
          {buildings.length ? (
            <select className="btn" style={{ width: '100%', textAlign: 'left' }} value={b} onChange={e => setB(e.target.value)}>
              {buildings.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          ) : <div style={{ fontSize: 13, color: 'var(--tone-red-text)' }}>Nejdřív založte budovu v Nastavení → Firmy a budovy.</div>}
          {data.building && b && normUnit(data.building) !== normUnit(b) && (
            <div style={{ fontSize: 12, color: 'var(--tone-amber-text)', marginTop: 6 }}>Soubor je pro budovu „{data.building}“.</div>
          )}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {prepared.map((f, i) => (
              <div key={i} style={{ border: '1.5px solid var(--border)', borderRadius: 10, padding: '8px 12px', fontSize: 13 }}>
                <div style={{ fontWeight: 800 }}>{f.name}
                  {floorPlans.some(x => x.building === b && normUnit(x.name) === normUnit(f.name)) && <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--tone-amber-text)' }}> · nahradí stávající patro</span>}
                </div>
                <div style={{ color: f.missing.length ? 'var(--tone-amber-text)' : 'var(--tone-green-text)', fontWeight: 600 }}>
                  {f.units - f.missing.length} z {f.units} předmětů spárováno{f.missing.length ? ` – chybí: ${f.missing.join(', ')}` : ' ✓'}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>Nespárované plochy zůstanou bez předmětu – přiřadíte je v úpravě patra.</div>
        </>
      )}
    </DialogShell>
  )
}
