import React from 'react'
import { SectionHeader } from './UI.jsx'
import { parseDate, toCzDate, getEffectiveValuesAt, getEffectiveValuesToday, getMonthDeposits, rentIncreaseLock, noticeDeadline, hasSuccessor, contractShowsVat, PERIOD_LEN } from './utils.js'

/**
 * Detail smlouvy – časová osa (začátek → konec, dnes, dodatky, možnost navýšení, poslední den výpovědi)
 * a rozpad aktuálního předpisu (nájem / parkování / paušál / zálohy, DPH zvlášť). Jen zobrazení.
 */

const kc = (v) => `${Math.round(v).toLocaleString('cs-CZ')} Kč`
const VALOR_TYPES = ['residential', 'commercial']

/** „2 r. 10 měs.“ mezi dvěma daty (jen orientačně) */
export function spanText(from, to) {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  if (months < 1) { const d = Math.max(0, Math.round((to - from) / 864e5)); return `${d} ${d === 1 ? 'den' : d < 5 ? 'dny' : 'dní'}` }
  const y = Math.floor(months / 12), m = months % 12
  return [y ? `${y} r.` : '', m ? `${m} měs.` : ''].filter(Boolean).join(' ')
}

export function ContractTimeline({ c, contracts = [], assetType }) {
  const start = parseDate(c.start)
  if (!start || c.paymentFrequency === 'Zahrnuto v nájemném') return null
  const end = parseDate(c.end)
  const today = new Date(); today.setHours(0, 0, 0, 0)

  // události na ose
  const ev = []
  for (const am of c.amendments || []) {
    const d = parseDate(am.effectiveFrom)
    if (!d || d < start || (end && d > end)) continue
    const before = getEffectiveValuesAt(c, new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)), after = getEffectiveValuesAt(c, d)
    const delta = (after.rent + after.parking + after.flatFee) - (before.rent + before.parking + before.flatFee)
    ev.push({ d, label: Math.abs(delta) >= 0.5 ? `dodatek ${delta > 0 ? '+' : '−'}${kc(Math.abs(delta))}` : 'dodatek', tone: 'blue', future: d > today })
  }
  const vd = parseDate(c.valorizationDate)
  if (vd && vd >= start && (!end || vd <= end) && !ev.some(e => e.d.getTime() === vd.getTime())) {
    ev.push({ d: vd, label: assetType === 'residential' ? 'navýšení nájmu' : 'valorizace', tone: 'blue', future: vd > today })
  }
  if (VALOR_TYPES.includes(assetType)) {
    const lock = rentIncreaseLock(c)
    const u = lock && parseDate(lock.until)
    if (u && (!end || u <= end)) ev.push({ d: u, label: 'lze navýšit', tone: 'amber', future: true, dashed: true })
  }
  const nd = noticeDeadline(c)
  if (nd && nd >= start && !hasSuccessor(c, contracts)) ev.push({ d: nd, label: 'výpověď do', tone: nd < today ? 'gray' : 'amber', future: nd > today, dashed: true })

  // rozsah osy: u smlouvy na dobu neurčitou do dneška / poslední události + rezerva
  const last = Math.max(today.getTime(), ...ev.map(e => e.d.getTime()))
  const axisEnd = end ? end.getTime() : last + Math.max(180 * 864e5, (last - start.getTime()) * 0.25)
  const span = Math.max(1, axisEnd - start.getTime())
  const pos = (d) => Math.min(100, Math.max(0, (d.getTime() - start.getTime()) / span * 100))
  const todayPct = pos(today)
  const ending = end && !hasSuccessor(c, contracts) && (end - today) / 864e5 <= 92 && end >= today

  // popisky pod osou: blízké posunout do dalšího řádku
  const labels = [
    { p: 0, top: c.start, bottom: 'začátek', align: 'left' },
    ...ev.sort((a, b) => a.d - b.d).map(e => ({ p: pos(e.d), top: toCzDate(e.d), bottom: e.label, tone: e.tone, align: 'center' })),
    { p: 100, top: end ? c.end : '♾', bottom: end ? 'konec' : 'na dobu neurčitou', align: 'right', tone: ending ? 'amber' : undefined },
  ]
  const rowsEnd = []
  labels.forEach(l => {
    let r = 0
    while (rowsEnd[r] != null && l.p - rowsEnd[r] < 16) r++
    rowsEnd[r] = l.p; l.row = r
  })
  const rowCount = Math.min(3, rowsEnd.length)
  const meta = !end
    ? `trvá ${spanText(start, today)} · na dobu neurčitou`
    : today >= end ? `skončila ${c.end}`
    : today < start ? `začne za ${spanText(today, start)}`
    : `uplynulo ${Math.round(todayPct)} % · zbývá ${spanText(today, end)}`
  const toneVar = (t) => t ? `var(--tone-${t}-text)` : 'var(--text2)'

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <SectionHeader icon="🧭" tone="blue" title="Časová osa smlouvy" meta={meta} />
      <div style={{ padding: '30px 22px 10px' }}>
        <div style={{ position: 'relative', height: 10, background: 'var(--tone-gray-soft)', border: '1px solid var(--border)', borderRadius: 6 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${todayPct}%`, background: 'var(--tone-green-text)', borderRadius: 6, opacity: 0.85 }} />
          {ending && <div style={{ position: 'absolute', left: `${todayPct}%`, right: 0, top: 0, bottom: 0, background: 'var(--tone-amber-border)', borderRadius: '0 6px 6px 0' }} />}
          {today >= start && (!end || today <= end) && (
            <>
              <div style={{ position: 'absolute', left: `${todayPct}%`, top: -6, width: 2, height: 20, marginLeft: -1, background: 'var(--tone-green-text)' }} />
              <div style={{ position: 'absolute', left: `${todayPct}%`, top: -24, transform: 'translateX(-50%)', fontSize: 11, fontWeight: 800, color: 'var(--tone-green-text)', whiteSpace: 'nowrap' }}>dnes</div>
            </>
          )}
          {ev.map((e, i) => (
            <div key={i} title={`${toCzDate(e.d)} – ${e.label}`} style={{ position: 'absolute', left: `${pos(e.d)}%`, top: -5, width: 18, height: 18, marginLeft: -9, borderRadius: '50%', background: 'var(--bg)',
              border: `2.5px ${e.dashed ? 'dashed' : 'solid'} var(--tone-${e.tone}-border)`, boxSizing: 'border-box' }} />
          ))}
        </div>
        <div style={{ position: 'relative', height: rowCount * 34 + 6, marginTop: 8 }}>
          {labels.map((l, i) => (
            <div key={i} style={{ position: 'absolute', top: l.row * 34, left: l.align === 'right' ? 'auto' : `${l.p}%`, right: l.align === 'right' ? 0 : 'auto',
              transform: l.align === 'center' ? 'translateX(-50%)' : 'none', textAlign: l.align, fontSize: 11.5, lineHeight: 1.3, whiteSpace: 'nowrap' }}>
              <div style={{ fontWeight: 800, color: l.tone ? toneVar(l.tone) : 'var(--text)' }}>{l.top}</div>
              <div style={{ color: l.tone ? toneVar(l.tone) : 'var(--text3)', fontWeight: 600 }}>{l.bottom}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ContractRentBreakdown({ c, contracts = [], assets = [], billingGroups = [] }) {
  if (c.paymentFrequency === 'Zahrnuto v nájemném') return null
  const ev = getEffectiveValuesToday(c)
  const now = new Date()
  const monthly = (PERIOD_LEN[c.paymentFrequency] || 1) === 1
  const dep = monthly ? getMonthDeposits(c, now.getFullYear(), now.getMonth(), contracts) : { deposit: 0, depositWater: 0 }
  const parts = [
    ['Nájem', ev.rent, 'green'],
    ['Parkování', ev.parking, 'blue'],
    ['Paušál', ev.flatFee, 'violet'],
    ['Zálohy', (dep.deposit || 0) + (dep.depositWater || 0), 'amber'],
  ].filter(p => p[1] > 0)
  const total = parts.reduce((s, p) => s + p[1], 0)
  if (total <= 0) return null
  const vat = contractShowsVat(c, assets, billingGroups)
  const vatBase = total // DPH ze všech složek – stejně jako Finanční přehled (nájem i zálohy s DPH 21 %)
  const per = monthly ? 'měsíčně' : (c.paymentFrequency || '').toLowerCase()
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <SectionHeader icon="🧾" tone="green" title={`Předpis ${per}`} meta={kc(total) + (vat ? ' bez DPH' : '')} />
      <div style={{ padding: '12px 16px 14px' }}>
        <div style={{ display: 'flex', height: 26, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {parts.map(([l, v, t]) => (
            <div key={l} title={`${l}: ${kc(v)}`} style={{ flex: v, minWidth: 6, background: `var(--tone-${t}-text)`, color: 'var(--bg)', fontSize: 11.5, fontWeight: 800, display: 'flex', alignItems: 'center', padding: '0 8px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              {v / total > 0.16 ? `${l} ${kc(v)}` : ''}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8, fontSize: 12.5, color: 'var(--text2)', fontWeight: 600 }}>
          {parts.map(([l, v, t]) => (
            <span key={l}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: `var(--tone-${t}-text)`, marginRight: 6, verticalAlign: -1 }} />{l} <b style={{ color: 'var(--text)' }}>{kc(v)}</b></span>
          ))}
        </div>
        {vat && (
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text3)' }}>
            + DPH 21 %: <b style={{ color: 'var(--text2)' }}>{kc(vatBase * 0.21)}</b> · celkem s DPH <b style={{ color: 'var(--text2)' }}>{kc(total + vatBase * 0.21)}</b>
          </div>
        )}
        {!monthly && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text3)' }}>Zálohy u víceměsíčních plateb se zde nesčítají.</div>}
      </div>
    </div>
  )
}
