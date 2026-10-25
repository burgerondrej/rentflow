import React, { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from './AppContext.jsx'
import { SectionHeader, Segmented } from './UI.jsx'
import { FirmBadge, firmStripe } from './FirmUI.jsx'
import { parseDate, firmOf, contractSubject, assetTypeStyle, isContractBillable, isContractInMonth, contractMonthStatus, groupMonthStatus,
  getPeriodMonthKeys, getMonthRent, dueDateFor, latestCzDate, toCzDate, DUE_PREPAID, PERIOD_LEN, SALDO_FROM } from './utils.js'

// ─────────────────────────────────────────
// ČASOVÁ OSA NÁJEMCE (detail nájemce → Přehled)
// Řádek = předmět (smlouva + navazující smlouvy téhož nájemce) nebo skupina plateb; po firmách.
// Pruh = platnost v barvě typu předmětu, čtverečky = stav platby za měsíc (contractMonthStatus / groupMonthStatus),
// víceměsíční smlouva = jeden čtverec za platební okno. Jen zobrazení.
// ─────────────────────────────────────────

const MON = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro']
const STATE = {
  paid: { label: 'Uhrazeno', bg: '#16A34A' },
  late: { label: 'Uhrazeno po splatnosti', bg: '#16A34A' },
  partial: { label: 'Částečně uhrazeno', bg: '#D97706' },
  unpaid: { label: 'Po splatnosti', bg: '#DC2626' },
  wait: { label: 'Čeká na splatnost', bg: null },
  old: { label: 'Před evidencí plateb (od 1. 1. 2026)', bg: 'var(--border)' },
}
const RANGES = [{ id: '12', label: '12 měsíců' }, { id: '24', label: '24 měsíců' }, { id: 'all', label: 'Vše' }]
const kc = (v) => `${Math.round(Number(v) || 0).toLocaleString('cs-CZ')} Kč`
const mIdx = (d) => d.getFullYear() * 12 + d.getMonth()
const keyIdx = (k) => { const [y, m] = k.split('-').map(Number); return y * 12 + m }
const LABEL_W = 200

/** Vizuální stav buňky z úhrady a splatnosti. */
function cellState({ complete, some, due, paidDate, idx, nowIdx, today }) {
  if (complete) {
    const late = due && paidDate ? Math.round((paidDate - due) / 86400000) : 0
    return late > 0 ? { st: 'late', late } : { st: 'paid' }
  }
  // Platby se evidují od spuštění RentFlow (jako saldo) – starší neuhrazené měsíce nejsou dluh
  if (idx < SALDO_FROM.y * 12 + SALDO_FROM.m) return { st: some ? 'partial' : 'old' }
  const overdue = due ? due < today : idx < nowIdx
  if (some) return { st: 'partial', overdue }
  return { st: overdue ? 'unpaid' : 'wait' }
}

export default function TenantTimeline({ tenantId, onOpen }) {
  const { contracts = [], payments = [], assets = [], firms = [], theme } = useApp()
  const [range, setRange] = useState('12')
  const [tip, setTip] = useState(null)

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const nowIdx = mIdx(today)

  // Řádky: skupina plateb = jeden řádek, jinak předmět (navazující smlouvy téhož nájemce v jednom řádku)
  const lanes = useMemo(() => {
    const mine = contracts.filter(c => c.tenantId === tenantId && isContractBillable(c) && c.paymentFrequency !== 'Zahrnuto v nájemném')
    const map = new Map()
    mine.forEach(c => {
      const k = c.groupLabel ? 'g:' + c.groupLabel : 'a:' + c.assetId
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(c)
    })
    const ts = (s) => parseDate(s)?.getTime() ?? -Infinity
    return [...map.entries()].map(([key, list]) => {
      list.sort((a, b) => ts(a.start) - ts(b.start))
      const last = list[list.length - 1]
      const asset = assets.find(a => a.id === last.assetId)
      const starts = list.map(c => parseDate(c.start)).filter(Boolean)
      const ends = list.map(c => parseDate(c.end))
      const isGroup = key.startsWith('g:')
      const ended = last.status === 'archived' && parseDate(last.end) && parseDate(last.end) < today
      const freq = last.paymentFrequency || 'Měsíčně'
      return {
        key, list, isGroup, group: last.groupLabel, asset,
        type: asset?.type || 'ostatni',
        firm: firmOf(contractSubject(last, assets)),
        from: starts.length ? Math.min(...starts.map(mIdx)) : null,
        to: ends.some(e => !e) ? null : Math.max(...ends.map(mIdx)),
        ended,
        unit: isGroup ? `skupina „${last.groupLabel}“` : (asset?.unit || '?'),
        sub: [isGroup ? `${new Set(list.map(c => c.assetId)).size} míst` : assetTypeStyle(asset?.type).label,
          freq.toLowerCase(), last.dueDay === DUE_PREPAID ? 'platba předem' : null, ended ? `ukončeno ${last.end}` : null].filter(Boolean).join(' · '),
      }
    }).sort((a, b) => (a.ended - b.ended) || ((a.from ?? 0) - (b.from ?? 0)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, assets, tenantId])

  if (!lanes.length) return null

  const end = nowIdx + 1 // i příští měsíc (platby předem)
  // „Vše“ = celá doba evidence plateb (od SALDO_FROM, nejdřív od začátku první smlouvy), aspoň 12 měsíců
  const earliest = Math.max(Math.min(...lanes.map(l => l.from ?? end)), SALDO_FROM.y * 12 + SALDO_FROM.m)
  const start = range === 'all' ? Math.min(earliest, end - 11) : end - (range === '24' ? 24 : 12) + 1
  const n = end - start + 1
  const ctx = { payments, contracts, assets }
  const pct = (v) => `${(v / n) * 100}%`
  const dayFrac = (d) => (d.getDate() - 1) / new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()

  // Buňky řádku: [{ col, span, state, tip, contractId }]
  const laneCells = (l) => {
    const cells = []
    const done = new Set()
    for (let i = start; i <= end; i++) {
      const y = Math.floor(i / 12), m = i % 12
      if (done.has(`${y}-${m}`)) continue
      const members = l.list.filter(c => isContractInMonth(c, y, m))
      if (!members.length) continue
      let expected = 0, paid = 0, date = null, complete, some, due, keys = [`${y}-${m}`]
      const c0 = members[members.length - 1]
      if (l.isGroup) {
        const s = groupMonthStatus(l.group, y, m, ctx)
        expected = s.expected; paid = s.paid; date = s.payment?.date || null
        complete = s.status === 'paid'; some = s.status !== 'unpaid'
        due = dueDateFor(s.members[0] || c0, y, m)
      } else if ((PERIOD_LEN[c0.paymentFrequency] || 1) > 1) {
        keys = getPeriodMonthKeys(c0, y, m)
        const [wy, wm] = keys[0].split('-').map(Number)
        const s = contractMonthStatus(c0, y, m, ctx)
        expected = getMonthRent(c0, wy, wm)
        const win = payments.filter(p => p.contractId === c0.id && p.paymentType !== 'deposit' && keys.includes(p.month))
        paid = win.reduce((sum, p) => sum + (p.agreed ? expected / keys.length : Number(p.amount) || 0), 0)
        date = latestCzDate(win.map(p => p.date))
        complete = s.complete; some = s.status !== 'unpaid'
        due = dueDateFor(c0, wy, wm)
      } else {
        const ss = members.map(c => contractMonthStatus(c, y, m, ctx))
        ss.forEach(s => {
          expected += s.rent.expected + (s.deposit?.expected || 0)
          paid += s.rent.paid + (s.deposit?.paid || 0)
        })
        date = latestCzDate(ss.flatMap(s => [s.rent.date, s.deposit?.date]))
        complete = ss.every(s => s.complete); some = ss.some(s => s.status !== 'unpaid')
        const dues = members.map(c => dueDateFor(c, y, m)).filter(Boolean)
        due = dues.length ? new Date(Math.min(...dues.map(d => d.getTime()))) : null
      }
      keys.forEach(k => done.add(k))
      const visible = keys.map(keyIdx).filter(k => k >= i && k <= end)
      const span = Math.max(1, visible.length)
      const state = cellState({ complete, some, due, paidDate: parseDate(date), idx: i, nowIdx, today })
      const period = keys.length > 1
        ? `${MON[keyIdx(keys[0]) % 12]} ${Math.floor(keyIdx(keys[0]) / 12)} – ${MON[keyIdx(keys[keys.length - 1]) % 12]} ${Math.floor(keyIdx(keys[keys.length - 1]) / 12)}`
        : `${MON[m]} ${y}`
      cells.push({
        col: i - start + 1, span, state, contractId: c0.id,
        tip: {
          title: `${l.unit} · ${period}`,
          rows: [
            ['Stav', state.st === 'late' ? `${STATE.late.label} (o ${state.late} ${state.late === 1 ? 'den' : state.late < 5 ? 'dny' : 'dní'})` : STATE[state.st].label],
            ['Předpis', kc(expected)],
            ['Zaplaceno', kc(paid)],
            date ? ['Uhrazeno dne', date] : null,
            due ? ['Splatnost', toCzDate(due)] : null,
          ].filter(Boolean),
        },
      })
    }
    return cells
  }

  // Značky na pruhu: navazující smlouva, dodatek, konec
  const laneMarks = (l) => {
    if (l.isGroup) return []
    const out = []
    const at = (d, frac) => { const i = mIdx(d); return i >= start && i <= end ? (i - start + frac) : null }
    l.list.forEach((c, k) => {
      const s = parseDate(c.start)
      if (k > 0 && s) out.push({ pos: at(s, dayFrac(s)), t: '↻', title: `Navazující smlouva od ${c.start}` })
      ;(c.amendments || []).forEach(a => {
        const d = parseDate(a.effectiveFrom)
        if (d) out.push({ pos: at(d, dayFrac(d)), t: '◆', title: `Dodatek od ${a.effectiveFrom}${Number(a.rent) > 0 ? ` · nájem ${kc(a.rent)}` : ''}` })
      })
    })
    const last = l.list[l.list.length - 1], e = parseDate(last.end)
    if (last.status === 'archived' && e) out.push({ pos: at(e, dayFrac(e) + 1 / 31), t: '■', title: `Konec smlouvy ${last.end}` })
    return out.filter(x => x.pos != null)
  }

  // Firmy v pořadí z Nastavení
  const firmIdx = (name) => { const i = firms.findIndex(f => f.name === name); return i < 0 ? 999 : i }
  const firmNames = [...new Set(lanes.map(l => l.firm))].sort((a, b) => firmIdx(a) - firmIdx(b))

  let total = 0, okN = 0, overN = 0
  const rendered = firmNames.map(fname => {
    const firm = firms.find(f => f.name === fname)
    return {
      fname, firm,
      lanes: lanes.filter(l => l.firm === fname).map(l => {
        const cells = laneCells(l)
        cells.forEach(c => { if (c.state.st !== 'wait' && c.state.st !== 'old') { total++; if (c.state.st === 'paid' || c.state.st === 'late') okN++; if (c.state.st === 'unpaid' || (c.state.st === 'partial' && c.state.overdue)) overN++ } })
        return { l, cells, marks: laneMarks(l) }
      }),
    }
  })

  const zoom = () => Number(document.documentElement.style.zoom) || 1
  const showTip = (e, t) => { const z = zoom(); setTip({ x: e.clientX / z, y: e.clientY / z, t }) }
  const cols = `${LABEL_W}px repeat(${n}, minmax(0, 1fr))`
  const nowLeft = `calc(${pct(nowIdx - start + 0.5)} - 1px)`

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
      <SectionHeader icon="📅" tone="blue" title="Časová osa"
        meta={total ? `${okN} z ${total} uhrazeno${overN ? ` · ${overN} po splatnosti` : ''}` : ''}
        actions={<Segmented size="sm" items={RANGES} value={range} onChange={setRange} />} />

      {/* Hlavička měsíců */}
      <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: '1px solid var(--border2)' }}>
        <div />
        {Array.from({ length: n }, (_, k) => {
          const i = start + k, m = i % 12
          const showYear = m === 0 || (k === 0 && n <= 14)
          return (
            <div key={i} style={{ fontSize: 10.5, fontWeight: 800, textAlign: 'center', padding: '8px 0 6px', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap', overflow: 'hidden',
              color: i === nowIdx ? 'var(--accent)' : showYear ? 'var(--text)' : 'var(--text3)' }}>
              {n > 48 && !showYear ? '' : n > 14 && !showYear && m % 3 !== 0 ? '' : MON[m]}{showYear ? ` ${String(Math.floor(i / 12)).slice(2)}` : ''}
            </div>
          )
        })}
      </div>

      {rendered.map(({ fname, firm, lanes: fl }) => (
        <div key={fname}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px 3px', fontSize: 12, fontWeight: 800, color: 'var(--text)', borderTop: '1px solid var(--border2)' }}>
            <FirmBadge firm={firm} size={22} />{fname}
          </div>
          {fl.map(({ l, cells, marks }) => {
            const ts = assetTypeStyle(l.type)
            const a = Math.max(l.from ?? start, start), b = Math.min(l.to ?? end, end)
            return (
              <div key={l.key} style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px 6px 12px', minWidth: 0, ...firmStripe(firm, theme) }}>
                  <span style={{ fontSize: 16 }}>{ts.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={l.unit}>{l.unit}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={l.sub}>{l.sub}</div>
                  </div>
                </div>
                <div style={{ gridColumn: '2 / -1', position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, padding: '8px 0' }}>
                  {b >= a && <div style={{ position: 'absolute', top: '50%', height: 30, transform: 'translateY(-50%)', borderRadius: 9,
                    left: `calc(${pct(a - start)} + 1px)`, width: `calc(${pct(b - a + 1)} - 2px)`, background: ts.bg, border: `1.5px solid ${ts.accent}` }} />}
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: nowLeft, width: 2, background: 'var(--accent)', opacity: 0.5, zIndex: 3, pointerEvents: 'none' }} />
                  {cells.map(c => {
                    const s = STATE[c.state.st]
                    return (
                      <div key={c.col} className="tl-cell" onClick={() => onOpen && onOpen('contract', c.contractId, { tab: 'payments' })}
                        onMouseEnter={e => showTip(e, c.tip)} onMouseMove={e => showTip(e, c.tip)} onMouseLeave={() => setTip(null)}
                        style={{ gridColumn: `${c.col} / span ${c.span}`, gridRow: 1, position: 'relative', zIndex: 1, height: 22, margin: '0 3px', borderRadius: 6, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 900, color: '#fff',
                          background: s.bg || 'var(--bg)', border: s.bg ? 'none' : '1.5px dashed var(--text3)',
                          boxShadow: c.state.st === 'late' ? 'inset 0 0 0 2px var(--tone-amber-border)' : 'none' }}>
                        {c.state.st === 'unpaid' ? '!' : c.state.st === 'partial' ? '½' : ''}
                      </div>
                    )
                  })}
                  {marks.map((mk, k) => (
                    <span key={k} title={mk.title} style={{ position: 'absolute', zIndex: 2, top: -1, left: pct(mk.pos), transform: 'translateX(-50%)', fontSize: 10.5, lineHeight: 1,
                      padding: '1px 4px', borderRadius: 5, background: 'var(--bg)', border: '1px solid var(--border)', fontWeight: 800, color: 'var(--text2)', whiteSpace: 'nowrap', cursor: 'default' }}>{mk.t}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {/* Legenda */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', padding: '9px 14px', borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--text2)', background: 'var(--bg2)' }}>
        {[['paid'], ['late', 'Uhrazeno pozdě (žlutý rámeček)'], ['partial', 'Částečně'], ['unpaid'], ['wait'],
          ...(start < SALDO_FROM.y * 12 + SALDO_FROM.m ? [['old', 'Před 1. 1. 2026 (neevidováno)']] : [])].map(([k, lbl]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <i style={{ display: 'inline-block', width: 14, height: 12, borderRadius: 4, background: STATE[k].bg || 'var(--bg)', border: STATE[k].bg ? 'none' : '1.5px dashed var(--text3)',
              boxShadow: k === 'late' ? 'inset 0 0 0 2px var(--tone-amber-border)' : 'none' }} />{lbl || STATE[k].label}
          </span>
        ))}
        <span>↻ navazující smlouva · ◆ dodatek · ■ konec</span>
      </div>

      {/* Popisek přes portál – okno detailu má transformaci, position: fixed by se v něm posunul */}
      {tip && createPortal(
        <div style={{ position: 'fixed', zIndex: 5000, pointerEvents: 'none', left: tip.x + 294 > window.innerWidth / zoom() ? Math.max(4, tip.x - 274) : tip.x + 14, top: tip.y + 14,
          background: 'var(--text)', color: 'var(--bg)', borderRadius: 10, padding: '9px 12px', fontSize: 12, lineHeight: 1.5, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', maxWidth: 260 }}>
          <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 2 }}>{tip.t.title}</div>
          {tip.t.rows.map(([k, v]) => <div key={k}><span style={{ opacity: 0.8 }}>{k}:</span> {v}</div>)}
        </div>, document.body)}
    </div>
  )
}
