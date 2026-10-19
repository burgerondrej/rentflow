// ─────────────────────────────────────────
// PDF REPORTY (HTML pro Edge headless --print-to-pdf) – v PDF jen hex barvy, CSS proměnné nefungují
// ─────────────────────────────────────────

const MONTHS = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec']

export const REPORT_CSS = `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, 'Helvetica Neue', sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; }
        .page { max-width: 860px; margin: 0 auto; padding: 32px 40px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #12654A; }
        .header-title { font-size: 22px; font-weight: 800; color: #12654A; }
        .header-sub { font-size: 12px; color: #666; margin-top: 4px; }
        .header-right { text-align: right; }
        .header-date { font-size: 13px; font-weight: 700; color: #374151; }
        .header-gen { font-size: 11px; color: #9CA3AF; margin-top: 3px; }
        .section { margin-bottom: 24px; break-inside: avoid; }
        .section-title { font-size: 13px; font-weight: 800; color: #12654A; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px; padding: 6px 12px; background: #F0FDF4; border-left: 3px solid #12654A; border-radius: 0 6px 6px 0; display: flex; justify-content: space-between; align-items: center; }
        .ok-badge { font-size: 11px; font-weight: 700; color: #166534; background: #DCFCE7; padding: 2px 10px; border-radius: 20px; letter-spacing: 0; text-transform: none; }
        .ok-msg { font-size: 13px; color: #166534; font-style: italic; padding: 10px 14px; background: #F0FDF4; border-radius: 8px; border: 1px solid #BBF7D0; }
        .tenant-block { margin-bottom: 14px; border: 1px solid #E5E7EB; border-radius: 10px; overflow: hidden; }
        .tenant-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #F9FAFB; border-bottom: 1px solid #E5E7EB; }
        .tenant-name { font-size: 13px; font-weight: 700; color: #111827; }
        .tenant-unit { font-size: 11px; color: #6B7280; margin-top: 2px; }
        .debt-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; border-bottom: 1px solid #F3F4F6; }
        .debt-row:last-child { border-bottom: none; }
        .debt-month { font-size: 12px; font-weight: 600; color: #374151; }
        .debt-current { background: #FFF7ED; }
        .debt-current .debt-month { color: #92400E; }
        .debt-amounts { display: flex; gap: 18px; align-items: center; font-size: 12px; }
        .debt-label { color: #9CA3AF; font-size: 10px; margin-bottom: 1px; }
        .debt-val { font-weight: 700; }
        .debt-exp { color: #374151; }
        .debt-paid { color: #16A34A; }
        .debt-rem { color: #DC2626; }
        .badge-unpaid { background: #FEF2F2; color: #991B1B; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
        .badge-partial { background: #FFFBEB; color: #92400E; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
        .footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #E5E5E5; font-size: 10px; color: #9CA3AF; display: flex; justify-content: space-between; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }

        .tenant-sum { font-size: 13px; font-weight: 800; color: #DC2626; }
        .debt-due { font-size: 11px; color: #6B7280; margin-top: 2px; }
        .grand { margin-top: 18px; padding: 12px 14px; border-radius: 10px; background: #FEF2F2; border: 1px solid #FECACA; display: flex; justify-content: space-between; font-size: 14px; font-weight: 800; color: #991B1B; }
`

/**
 * Report PO SPLATNOSTI (záložka Po splatnosti v Platbách): položky z overdueItems seskupené po nájemcích, se součtem.
 * items = overdueItems(...), label = firma / sekce, tenantOf(contract) → nájemce, unitOf(contract) → označení předmětu.
 * Vrací { html, fileName }.
 */
export function buildOverdueReportHtml({ items = [], label = '', tenantOf = () => null, unitOf = () => '', now = new Date() }) {
  const todayStr = now.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const kc = (n) => `${Math.round(n).toLocaleString('cs-CZ')} Kč`
  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const monthText = (it) => {
    if (it.periodKeys.length > 1) {
      const [fy, fm] = it.periodKeys[0].split('-').map(Number)
      const [ly, lm] = it.periodKeys[it.periodKeys.length - 1].split('-').map(Number)
      return `${MONTHS[fm]} ${fy} – ${MONTHS[lm]} ${ly}`
    }
    return `${MONTHS[it.m]} ${it.y}`
  }
  const byTenant = new Map()
  items.forEach(it => { const k = it.contract.tenantId || ''; if (!byTenant.has(k)) byTenant.set(k, []); byTenant.get(k).push(it) })
  const blocks = [...byTenant.values()]
    .map(list => ({ list, sum: list.reduce((s2, it) => s2 + it.owe, 0) }))
    .sort((a, b) => b.sum - a.sum)
    .map(({ list, sum }) => {
      const tenant = tenantOf(list[0].contract)
      const units = [...new Set(list.map(it => it.groupLabel ? `🔗 ${it.groupLabel}` : (unitOf(it.contract) || '—')))].join(', ')
      const rows = list.map(it => `
        <div class="debt-row">
          <div>
            <div class="debt-month">${esc(monthText(it))}${list.length > 1 && units.includes(',') ? ` · ${esc(it.groupLabel || unitOf(it.contract) || '')}` : ''}</div>
            <div class="debt-due">splatnost ${it.due ? `${it.due.getDate()}. ${it.due.getMonth() + 1}. ${it.due.getFullYear()}` : '—'} · ${it.od} ${it.od === 1 ? 'den' : it.od < 5 ? 'dny' : 'dní'} po splatnosti</div>
          </div>
          <div class="debt-amounts">
            <div style="text-align:right"><div class="debt-label">Nájem</div><div class="debt-val ${it.rent.rem > 0.5 ? 'debt-rem' : 'debt-paid'}">${it.rent.rem > 0.5 ? kc(it.rent.rem) : '✓'}</div></div>
            ${it.deposit ? `<div style="text-align:right"><div class="debt-label">Zálohy</div><div class="debt-val ${it.deposit.rem > 0.5 ? 'debt-rem' : 'debt-paid'}">${it.deposit.rem > 0.5 ? kc(it.deposit.rem) : '✓'}</div></div>` : ''}
            <div style="text-align:right"><div class="debt-label">Dluh</div><div class="debt-val debt-rem">${kc(it.owe)}</div></div>
            <span class="${it.status === 'partial' ? 'badge-partial' : 'badge-unpaid'}">${it.status === 'partial' ? 'Částečně' : 'Nezaplaceno'}</span>
          </div>
        </div>`).join('')
      return `
        <div class="tenant-block">
          <div class="tenant-header">
            <div>
              <div class="tenant-name">${esc(tenant?.name || '—')}</div>
              <div class="tenant-unit">${esc(units)}${tenant?.phone ? ` · tel. ${esc(tenant.phone)}` : ''}</div>
            </div>
            <div class="tenant-sum">${kc(sum)}</div>
          </div>
          ${rows}
        </div>`
    }).join('')
  const total = items.reduce((s2, it) => s2 + it.owe, 0)
  const html = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RentFlow — Po splatnosti — ${stamp}</title>
  <style>${REPORT_CSS}</style>
</head>
<body>
<div class="page">
  <div class="header">
<div>
  <div class="header-title">Platby po splatnosti</div>
  <div class="header-sub">RentFlow · ${esc(label)} · všechny měsíce od 1. 1. 2026</div>
</div>
<div class="header-right">
  <div class="header-date">Stav k ${todayStr}</div>
  <div class="header-gen">${items.length} ${items.length === 1 ? 'položka' : items.length < 5 ? 'položky' : 'položek'}</div>
</div>
  </div>
  ${items.length === 0 ? '<div class="ok-msg">Nic není po splatnosti.</div>' : blocks}
  ${items.length > 0 ? `<div class="grand"><span>Celkem po splatnosti</span><span>${kc(total)}</span></div>` : ''}
  <div class="footer">
<span>RentFlow</span>
<span>Stav k ${todayStr}</span>
  </div>
</div>
</body>
</html>`
  const safeLabel = String(label).replace(/[\\/:*?"<>|–]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-')
  return { html, fileName: `RentFlow-Po-splatnosti-${safeLabel}-${stamp}.pdf` }
}
