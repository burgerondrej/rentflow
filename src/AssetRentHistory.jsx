import React from 'react'
import { useApp } from './AppContext.jsx'
import { SectionHeader } from './UI.jsx'
import { StatusPill } from './StatusUI.jsx'
import { parseDate, toCzDate, getEffectiveValuesAt, PERIOD_LEN } from './utils.js'

// ─────────────────────────────────────────
// VÝVOJ NÁJMU PŘEDMĚTU (detail předmětu → Smlouvy)
// Chronologicky smlouvy a dodatky na předmětu: od kdy, nájemce, nájem / měs. (nájem + parkování + paušál)
// a změna proti předchozímu stavu. Hodnoty k datu přes getEffectiveValuesAt. Jen zobrazení.
// ─────────────────────────────────────────

const kc = (v) => `${Math.round(Number(v) || 0).toLocaleString('cs-CZ')} Kč`
const EVENT_TONE = { 'Nová smlouva': 'blue', 'Nový nájemce': 'blue', 'Navazující smlouva': 'violet', 'Dodatek': 'amber' }

/** Řádky vývoje nájmu předmětu (nejstarší první): [{ date, until, kind, contract, note, rent, period, deposits, included, diff, pct, isNow }] */
export function assetRentHistory(contracts, assetId) {
  const ts = (s) => parseDate(s)?.getTime() ?? 0
  const list = contracts.filter(c => c.assetId === assetId && parseDate(c.start)).sort((a, b) => ts(a.start) - ts(b.start))
  const rows = []
  list.forEach((c, i) => {
    const prev = list[i - 1]
    const start = parseDate(c.start), end = parseDate(c.end)
    const events = [{ date: start, kind: !prev ? 'Nová smlouva' : prev.tenantId === c.tenantId ? 'Navazující smlouva' : 'Nový nájemce' }]
    // Dodatky účinné k začátku smlouvy už jsou v hodnotách prvního řádku; dodatky po konci se neprojeví (hlídá Kontrola dat)
    ;(c.amendments || []).forEach(a => {
      const d = parseDate(a.effectiveFrom)
      if (d && d > start && (!end || d <= end)) events.push({ date: d, kind: 'Dodatek', note: a.note || '' })
    })
    events.sort((x, y) => x.date - y.date)
    const n = PERIOD_LEN[c.paymentFrequency] || 1
    events.forEach((ev, k) => {
      const v = getEffectiveValuesAt(c, ev.date)
      const period = v.rent + v.parking + v.flatFee
      const next = events[k + 1]
      rows.push({ ...ev, contract: c, period, rent: period / n, deposits: v.deposit + v.depositWater,
        included: c.paymentFrequency === 'Zahrnuto v nájemném',
        until: next ? new Date(next.date.getFullYear(), next.date.getMonth(), next.date.getDate() - 1) : end })
    })
  })
  const today = new Date(); today.setHours(0, 0, 0, 0)
  rows.forEach((r, k) => {
    const p = rows[k - 1]
    if (p && !p.included && !r.included) {
      r.diff = r.rent - p.rent
      r.pct = p.rent > 0 ? (r.diff / p.rent) * 100 : null
    }
    r.isNow = r.date <= today && (!r.until || r.until >= today)
  })
  return rows
}

export default function AssetRentHistory({ assetId, onOpen }) {
  const { contracts = [], tenants = [] } = useApp()
  const rows = assetRentHistory(contracts, assetId)
  if (!rows.length) return null
  const showDeposits = rows.some(r => r.deposits > 0)

  // Souhrn: první → aktuální (nebo poslední) nájem
  const first = rows.find(r => !r.included)
  const cur = [...rows].reverse().find(r => r.isNow && !r.included) || [...rows].reverse().find(r => !r.included)
  let meta = ''
  if (first && cur && first !== cur && Math.abs(cur.rent - first.rent) >= 0.5) {
    const pct = first.rent > 0 ? ((cur.rent - first.rent) / first.rent) * 100 : null
    meta = `${kc(first.rent)} → ${kc(cur.rent)} / měs.${pct != null ? ` (${pct >= 0 ? '+' : '−'}${Math.abs(pct).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} %)` : ''}`
  }

  const cols = `minmax(150px, 0.9fr) minmax(0, 1.4fr) minmax(110px, auto) minmax(120px, auto)${showDeposits ? ' minmax(90px, auto)' : ''}`
  const head = { fontSize: 10.5, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px' }
  const fmtPct = (p) => `${p >= 0 ? '+' : '−'}${Math.abs(p).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} %`

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
      <SectionHeader icon="📈" tone="green" title="Vývoj nájmu" meta={meta} />
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '8px 14px', borderBottom: '1px solid var(--border2)', background: 'var(--bg2)' }}>
        <span style={head}>Platnost</span><span style={head}>Nájemce · událost</span>
        <span style={{ ...head, textAlign: 'right' }}>Nájem / měs.</span><span style={{ ...head, textAlign: 'right' }}>Změna</span>
        {showDeposits && <span style={{ ...head, textAlign: 'right' }}>Zálohy</span>}
      </div>
      {rows.map((r, k) => {
        const c = r.contract
        const tone = EVENT_TONE[r.kind] || 'gray'
        const n = PERIOD_LEN[c.paymentFrequency] || 1
        const tenant = tenants.find(t => t.id === c.tenantId)?.name || '—'
        return (
          <div key={`${c.id}|${k}`} onClick={() => onOpen && onOpen('contract', c.id, r.kind === 'Dodatek' ? { tab: 'amendments' } : undefined)}
            title={r.kind === 'Dodatek' ? 'Otevřít dodatky smlouvy' : 'Otevřít smlouvu'}
            style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center', padding: '9px 14px', borderTop: k ? '1px solid var(--border2)' : 'none',
              cursor: 'pointer', background: r.isNow ? 'var(--tone-green-soft)' : 'transparent' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>od {toCzDate(r.date)}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{r.until ? `do ${toCzDate(r.until)}` : 'dosud'}</div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tenant}</span>
                {r.isNow && <StatusPill kind="active" text="Platí nyní" size="sm" />}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, minWidth: 0 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, padding: '1px 7px', borderRadius: 6, whiteSpace: 'nowrap',
                  background: `var(--tone-${tone}-soft)`, color: `var(--tone-${tone}-text)`, border: `1px solid var(--tone-${tone}-border)` }}>{r.kind}</span>
                {r.note && <span style={{ fontSize: 11.5, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.note}>{r.note}</span>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>{r.included ? 'zahrnuto' : kc(r.rent)}</div>
              {!r.included && n > 1 && <div style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{(c.paymentFrequency || '').toLowerCase()} {kc(r.period)}</div>}
            </div>
            <div style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap',
              color: r.diff > 0.5 ? 'var(--tone-green-text)' : r.diff < -0.5 ? 'var(--tone-red-text)' : 'var(--text3)' }}>
              {r.diff == null ? '—' : Math.abs(r.diff) < 0.5 ? 'beze změny' : `${r.diff > 0 ? '+' : '−'}${kc(Math.abs(r.diff))}${r.pct != null ? ` (${fmtPct(r.pct)})` : ''}`}
            </div>
            {showDeposits && <div style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{r.deposits > 0 ? kc(r.deposits) : '—'}</div>}
          </div>
        )
      })}
    </div>
  )
}
