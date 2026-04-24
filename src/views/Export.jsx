import React, { useState } from 'react'
import { useApp } from '../AppContext.jsx'
import { invoke } from '@tauri-apps/api/tauri'
import { save } from '@tauri-apps/api/dialog'

const SUBJECT_ORDER = [
  'METROPOLE CB – Komerční prostory',
  'METROPOLE CB – Novohradská 53/55',
  'METROPOLE CB – Novohradská 57a',
  'METROPOLE CB – Parkování',
  'METROPOLE CB – Reklamní plochy',
  'METROPOLE CB – Ubytovací jednotky',
  'Bürger Pavel – Parkování',
  'Bürger Pavel – Reklamní plochy',
  'JIHOTANK',
  'JIHOTANK CB',
  'Ostatní',
]

// ── CSS pro tisk (inline do HTML exportu) ──
const PRINT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', Arial, sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; }
  .page { max-width: 900px; margin: 0 auto; padding: 32px 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 3px solid #12654A; }
  .header-title { font-size: 22px; font-weight: 800; color: #12654A; }
  .header-sub { font-size: 12px; color: #666; margin-top: 4px; }
  .header-date { font-size: 11px; color: #999; text-align: right; }
  .section { margin-bottom: 28px; }
  .section-title { font-size: 14px; font-weight: 800; color: #12654A; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px; padding: 6px 10px; background: #F0FDF4; border-left: 3px solid #12654A; border-radius: 0 6px 6px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { background: #F8F8F8; font-size: 10px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 0.5px; padding: 7px 10px; border-bottom: 1px solid #E5E5E5; text-align: left; }
  td { padding: 8px 10px; border-bottom: 1px solid #F0F0F0; font-size: 12px; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #FAFFF8; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
  .badge-green { background: #F0FDF4; color: #166534; }
  .badge-gray { background: #F3F4F6; color: #6B7280; }
  .badge-red { background: #FFF7ED; color: #92400E; }
  .amount { font-weight: 700; text-align: right; white-space: nowrap; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E5E5E5; font-size: 10px; color: #999; display: flex; justify-content: space-between; }
  .summary-box { display: inline-block; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 10px 16px; margin-top: 8px; margin-right: 12px; }
  .summary-label { font-size: 10px; color: #166534; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; }
  .summary-value { font-size: 18px; font-weight: 800; color: #12654A; margin-top: 2px; }
  .alert-box { background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 8px; padding: 10px 14px; margin: 8px 0; }
  .alert-title { font-size: 11px; font-weight: 700; color: #92400E; }
  .card { background: #FAFFF8; border: 1px solid #E2F5EA; border-radius: 10px; padding: 14px 18px; margin-bottom: 14px; }
  .card-header { font-size: 13px; font-weight: 700; color: #12654A; margin-bottom: 8px; }
  .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; border-bottom: 1px solid #F0F0F0; }
  .row:last-child { border-bottom: none; }
  .label { color: #666; }
  .value { font-weight: 600; }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .page { padding: 20px; }
    .no-print { display: none; }
  }
`

function fmtCzk(v) {
  return Number(v || 0).toLocaleString('cs-CZ') + ' Kč'
}

function today() {
  return new Date().toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })
}

function daysLeft(dateStr) {
  if (!dateStr) return null
  const parts = dateStr.split('.').map(p => p.trim())
  if (parts.length !== 3) return null
  const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
  const diff = Math.round((d - new Date()) / 86400000)
  return diff
}

function urgencyClass(days) {
  if (days === null) return ''
  if (days <= 30) return 'badge badge-red'
  if (days <= 90) return 'badge badge-red" style="background:#FFF7ED;color:#92400E'
  return 'badge badge-green'
}

// ── GENERÁTORY HTML ──────────────────────────────────────────────────────────

function genPortfolioBySubject(contracts, assets, tenants, subjectFilter) {
  const activeContracts = contracts.filter(c => c.status === 'active')
  const subjects = subjectFilter === 'all'
    ? SUBJECT_ORDER
    : [subjectFilter]

  let sectionsHtml = ''
  let grandTotal = 0

  subjects.forEach(subject => {
    const subjectAssets = assets.filter(a => a.subject === subject)
    const subjectContracts = activeContracts.filter(c => subjectAssets.some(a => a.id === c.assetId))
    if (subjectContracts.length === 0) return

    const subTotal = subjectContracts.reduce((s, c) => s + (c.rent || 0) + (c.parking || 0), 0)
    grandTotal += subTotal

    const rows = subjectContracts.map(c => {
      const a = assets.find(x => x.id === c.assetId)
      const t = tenants.find(x => x.id === c.tenantId)
      const days = daysLeft(c.end)
      const daysText = days === null ? '∞' : days <= 0 ? 'Vypršela' : `${days} dní`
      const daysBadge = days !== null && days <= 90 ? 'badge badge-red' : 'badge badge-green'
      return `<tr>
        <td>${a?.unit || '—'}</td>
        <td>${t?.name || '—'}</td>
        <td>${c.start || '—'}</td>
        <td>${c.end || 'Neurčito'}</td>
        <td><span class="${daysBadge}">${daysText}</span></td>
        <td class="amount">${fmtCzk(c.rent)}</td>
        <td class="amount">${c.parking > 0 ? fmtCzk(c.parking) : '—'}</td>
        <td class="amount" style="color:#12654A;font-weight:800">${fmtCzk((c.rent||0)+(c.parking||0))}</td>
      </tr>`
    }).join('')

    sectionsHtml += `
      <div class="section">
        <div class="section-title">${subject}</div>
        <table>
          <thead><tr>
            <th>Předmět nájmu</th><th>Nájemce</th><th>Platnost od</th><th>Platnost do</th>
            <th>Zbývá</th><th>Nájemné</th><th>Parkovné</th><th>Celkem / měsíc</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="text-align:right;font-size:12px;color:#666;padding:4px 10px">
          Dílčí součet: <strong style="color:#12654A">${fmtCzk(subTotal)}</strong> / měsíc
          (${subjectContracts.length} ${subjectContracts.length===1?'smlouva':subjectContracts.length<5?'smlouvy':'smluv'})
        </div>
      </div>`
  })

  const title = subjectFilter === 'all' ? 'Přehled portfolia — všechny subjekty' : `Přehled portfolia — ${subjectFilter}`

  return `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8">
    <title>${title}</title>
    <style>${PRINT_CSS}</style></head><body><div class="page">
    <div class="header">
      <div>
        <div class="header-title">RentFlow</div>
        <div style="font-size:18px;font-weight:700;color:#1a1a1a;margin-top:4px">${title}</div>
        <div class="header-sub">Aktivní smlouvy · Vygenerováno ${today()}</div>
      </div>
      <div class="header-date">
        <div class="summary-box">
          <div class="summary-label">Celkové nájemné / měsíc</div>
          <div class="summary-value">${fmtCzk(grandTotal)}</div>
        </div>
      </div>
    </div>
    ${sectionsHtml}
    <div class="footer">
      <span>RentFlow — Export portfolia</span>
      <span>Vygenerováno: ${today()}</span>
    </div>
  </div></body></html>`
}

function genTenantCard(tenant, contracts, assets) {
  const tenantContracts = contracts.filter(c => c.tenantId === tenant.id)
  const activeContracts = tenantContracts.filter(c => c.status === 'active')
  const archivedContracts = tenantContracts.filter(c => c.status !== 'active')

  const totalMonthly = activeContracts.reduce((s, c) => s + (c.rent||0) + (c.parking||0), 0)

  const contractCard = (c, isActive) => {
    const a = assets.find(x => x.id === c.assetId)
    const days = daysLeft(c.end)
    return `
      <div class="card" style="${isActive ? '' : 'opacity:0.65'}">
        <div class="card-header">${a?.unit || '—'} <span style="font-size:11px;font-weight:500;color:#666">${a?.subject || ''}</span>
          ${isActive ? '<span class="badge badge-green" style="float:right">Aktivní</span>' : '<span class="badge badge-gray" style="float:right">Ukončena</span>'}
        </div>
        <div class="row"><span class="label">Platnost</span><span class="value">${c.start || '—'} → ${c.end || 'Neurčito'}</span></div>
        <div class="row"><span class="label">Nájemné</span><span class="value">${fmtCzk(c.rent)}</span></div>
        ${c.deposit > 0 ? `<div class="row"><span class="label">Zálohy energií a služeb</span><span class="value">${fmtCzk(c.deposit)}</span></div>` : ''}
        ${c.cauce > 0 ? `<div class="row"><span class="label">Složená kauce</span><span class="value">${fmtCzk(c.cauce)}</span></div>` : ''}
        ${c.parking > 0 ? `<div class="row"><span class="label">Parkovné</span><span class="value">${fmtCzk(c.parking)}</span></div>` : ''}
        ${c.dueDay ? `<div class="row"><span class="label">Splatnost nájemného</span><span class="value">${c.dueDay}</span></div>` : ''}
        ${isActive && days !== null && days <= 90 ? `<div class="alert-box"><div class="alert-title">⚠️ Smlouva končí za ${days} dní (${c.end})</div></div>` : ''}
      </div>`
  }

  const isCompany = tenant.tenantType === 'company'

  return `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8">
    <title>Karta nájemce — ${tenant.name}</title>
    <style>${PRINT_CSS}</style></head><body><div class="page">
    <div class="header">
      <div>
        <div class="header-title">RentFlow</div>
        <div style="font-size:18px;font-weight:700;color:#1a1a1a;margin-top:4px">Karta nájemce</div>
        <div class="header-sub">Vygenerováno ${today()}</div>
      </div>
      <div style="text-align:right">
        ${activeContracts.length > 0 ? `<div class="summary-box">
          <div class="summary-label">Aktivní nájemné / měsíc</div>
          <div class="summary-value">${fmtCzk(totalMonthly)}</div>
        </div>` : ''}
      </div>
    </div>

    <div class="section">
      <div class="section-title">${isCompany ? 'Firma' : 'Soukromá osoba'} — kontaktní údaje</div>
      <div class="card">
        <div class="card-header" style="font-size:18px">${tenant.name}</div>
        ${tenant.ico ? `<div class="row"><span class="label">IČO</span><span class="value">${tenant.ico}</span></div>` : ''}
        ${tenant.dic ? `<div class="row"><span class="label">DIČ</span><span class="value">${tenant.dic}</span></div>` : ''}
        ${tenant.phone ? `<div class="row"><span class="label">Telefon</span><span class="value">${tenant.phone}</span></div>` : ''}
        ${tenant.email ? `<div class="row"><span class="label">E-mail</span><span class="value">${tenant.email}</span></div>` : ''}
        ${tenant.address ? `<div class="row"><span class="label">Adresa</span><span class="value">${tenant.address}</span></div>` : ''}
        ${tenant.bankAccount ? `<div class="row"><span class="label">Bankovní účet</span><span class="value">${tenant.bankAccount}</span></div>` : ''}
        ${tenant.contactPerson ? `<div class="row"><span class="label">Kontaktní osoba</span><span class="value">${tenant.contactPerson}</span></div>` : ''}
      </div>
    </div>

    ${activeContracts.length > 0 ? `
    <div class="section">
      <div class="section-title">Aktivní smlouvy (${activeContracts.length})</div>
      ${activeContracts.map(c => contractCard(c, true)).join('')}
    </div>` : ''}

    ${archivedContracts.length > 0 ? `
    <div class="section">
      <div class="section-title">Ukončené smlouvy (${archivedContracts.length})</div>
      ${archivedContracts.map(c => contractCard(c, false)).join('')}
    </div>` : ''}

    <div class="footer">
      <span>RentFlow — Karta nájemce</span>
      <span>Vygenerováno: ${today()}</span>
    </div>
  </div></body></html>`
}

function genExpirationReport(contracts, assets, tenants) {
  const active = contracts.filter(c => c.status === 'active')
  const enriched = active.map(c => ({
    ...c,
    days: daysLeft(c.end),
    asset: assets.find(a => a.id === c.assetId),
    tenant: tenants.find(t => t.id === c.tenantId),
  })).filter(c => c.days !== null).sort((a, b) => a.days - b.days)

  const groups = [
    { label: 'Končí do 30 dnů', color: '#EF4444', bg: '#FEF2F2', items: enriched.filter(c => c.days <= 30) },
    { label: 'Končí do 60 dnů', color: '#F97316', bg: '#FFF7ED', items: enriched.filter(c => c.days > 30 && c.days <= 60) },
    { label: 'Končí do 90 dnů', color: '#EAB308', bg: '#FEFCE8', items: enriched.filter(c => c.days > 60 && c.days <= 90) },
    { label: 'Končí do 180 dnů', color: '#22C55E', bg: '#F0FDF4', items: enriched.filter(c => c.days > 90 && c.days <= 180) },
  ]

  const sectionsHtml = groups.map(g => {
    if (g.items.length === 0) return ''
    const rows = g.items.map(c => `<tr>
      <td>${c.asset?.unit || '—'}</td>
      <td>${c.asset?.subject || '—'}</td>
      <td>${c.tenant?.name || '—'}</td>
      <td>${c.tenant?.phone || '—'}</td>
      <td>${c.end}</td>
      <td><span style="background:${g.bg};color:${g.color};padding:2px 10px;border-radius:20px;font-weight:700;font-size:11px">${c.days} dní</span></td>
      <td class="amount">${fmtCzk((c.rent||0)+(c.parking||0))}</td>
    </tr>`).join('')
    return `<div class="section">
      <div class="section-title" style="border-left-color:${g.color};background:${g.bg}">${g.label} (${g.items.length})</div>
      <table><thead><tr>
        <th>Předmět</th><th>Subjekt</th><th>Nájemce</th><th>Telefon</th><th>Konec smlouvy</th><th>Zbývá</th><th>Nájemné/měsíc</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>`
  }).join('')

  return `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8">
    <title>Expirační report</title>
    <style>${PRINT_CSS}</style></head><body><div class="page">
    <div class="header">
      <div>
        <div class="header-title">RentFlow</div>
        <div style="font-size:18px;font-weight:700;color:#1a1a1a;margin-top:4px">Expirační report smluv</div>
        <div class="header-sub">Smlouvy končící do 180 dnů · ${today()}</div>
      </div>
      <div>
        ${groups.map(g => g.items.length > 0 ? `<div class="summary-box" style="border-color:${g.color}20">
          <div class="summary-label" style="color:${g.color}">${g.label.replace('Končí', '').trim()}</div>
          <div class="summary-value" style="color:${g.color}">${g.items.length}</div>
        </div>` : '').join('')}
      </div>
    </div>
    ${sectionsHtml || '<div style="padding:24px;text-align:center;color:#999">Žádné smlouvy nekončí v horizontu 180 dnů.</div>'}
    <div class="footer">
      <span>RentFlow — Expirační report</span><span>Vygenerováno: ${today()}</span>
    </div>
  </div></body></html>`
}

function genMonthlyReport(contracts, assets, tenants, subjectFilter) {
  const active = contracts.filter(c => c.status === 'active')
  const filtered = subjectFilter === 'all' ? active : active.filter(c => {
    const a = assets.find(x => x.id === c.assetId)
    return a?.subject === subjectFilter
  })

  const sorted = [...filtered].sort((a, b) => {
    const sa = assets.find(x => x.id === a.assetId)?.subject || ''
    const sb = assets.find(x => x.id === b.assetId)?.subject || ''
    return SUBJECT_ORDER.indexOf(sa) - SUBJECT_ORDER.indexOf(sb)
  })

  const totalRent = sorted.reduce((s, c) => s + (c.rent||0) + (c.parking||0), 0)
  const totalParking = 0  // zahrnut v totalRent
  const totalDeposit = sorted.reduce((s, c) => s + (c.deposit||0), 0)
  const totalAll = totalRent + totalParking

  const month = new Date().toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })

  const rows = sorted.map(c => {
    const a = assets.find(x => x.id === c.assetId)
    const t = tenants.find(x => x.id === c.tenantId)
    return `<tr>
      <td>${a?.subject || '—'}</td>
      <td>${a?.unit || '—'}</td>
      <td>${t?.name || '—'}</td>
      <td class="amount">${fmtCzk(c.rent)}</td>
      <td class="amount">${c.parking > 0 ? fmtCzk(c.parking) : '—'}</td>
      <td class="amount">${c.deposit > 0 ? fmtCzk(c.deposit) : '—'}</td>
      <td class="amount" style="color:#12654A;font-weight:800">${fmtCzk((c.rent||0)+(c.parking||0))}</td>
    </tr>`
  }).join('')

  const title = subjectFilter === 'all' ? 'Měsíční předpis nájemného — celé portfolio' : `Měsíční předpis — ${subjectFilter}`

  return `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8">
    <title>${title}</title>
    <style>${PRINT_CSS}</style></head><body><div class="page">
    <div class="header">
      <div>
        <div class="header-title">RentFlow</div>
        <div style="font-size:18px;font-weight:700;color:#1a1a1a;margin-top:4px">${title}</div>
        <div class="header-sub">${month.charAt(0).toUpperCase()+month.slice(1)} · Vygenerováno ${today()}</div>
      </div>
      <div>
        <div class="summary-box">
          <div class="summary-label">Nájemné celkem</div>
          <div class="summary-value">${fmtCzk(totalAll)}</div>
        </div>
        ${totalDeposit > 0 ? `<div class="summary-box">
          <div class="summary-label">Zálohy energií</div>
          <div class="summary-value">${fmtCzk(totalDeposit)}</div>
        </div>` : ''}
      </div>
    </div>
    <div class="section">
      <table>
        <thead><tr>
          <th>Subjekt</th><th>Předmět nájmu</th><th>Nájemce</th>
          <th style="text-align:right">Nájemné</th><th style="text-align:right">Parkovné</th>
          <th style="text-align:right">Zálohy</th><th style="text-align:right">Celkem</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="background:#F0FDF4;font-weight:700">
          <td colspan="3" style="padding:10px">SOUČET</td>
          <td class="amount">${fmtCzk(totalRent)}</td>
          <td class="amount">${fmtCzk(totalParking)}</td>
          <td class="amount">${fmtCzk(totalDeposit)}</td>
          <td class="amount" style="color:#12654A;font-size:14px">${fmtCzk(totalAll)}</td>
        </tr></tfoot>
      </table>
    </div>
    <div class="footer">
      <span>RentFlow — Měsíční předpis</span><span>Vygenerováno: ${today()}</span>
    </div>
  </div></body></html>`
}

// ── KOMPONENTA ────────────────────────────────────────────────────────────────

const EXPORT_TYPES = [
  { id: 'portfolio', icon: '🏢', label: 'Přehled portfolia', sub: 'Aktivní smlouvy dle subjektů', color: '#12654A', bg: '#F0FDF4', border: '#BBF7D0' },
  { id: 'tenant',   icon: '👤', label: 'Karta nájemce',     sub: 'Kontakty + smlouvy jednoho nájemce', color: '#4f46e5', bg: '#EEF2FF', border: '#C7D2FE' },
  { id: 'expiry',   icon: '⏰', label: 'Expirační report',  sub: 'Smlouvy končící do 180 dnů', color: '#c2410c', bg: '#FFF7ED', border: '#FED7AA' },
  { id: 'monthly',  icon: '💰', label: 'Měsíční předpis',   sub: 'Předpis nájemného pro aktuální měsíc', color: '#0369a1', bg: '#F0F9FF', border: '#BAE6FD' },
]

export default function Export() {
  const { contracts = [], assets = [], tenants = [] } = useApp() || {}
  const [activeType, setActiveType] = useState('portfolio')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [tenantFilter, setTenantFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastExport, setLastExport] = useState(null)
  const [error, setError] = useState(null)

  const activeTenants = [...tenants]
    .filter(t => t.status !== 'archived')
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'cs'))

  const activeSubjects = [...new Set(
    assets.filter(a => a.status !== 'archived').map(a => a.subject)
  )].sort((a, b) => SUBJECT_ORDER.indexOf(a) - SUBJECT_ORDER.indexOf(b))

  const doExport = async () => {
    setError(null)
    setLoading(true)
    try {
      let html = ''
      let filename = ''
      const stamp = new Date().toISOString().slice(0,10)

      switch (activeType) {
        case 'portfolio':
          html = genPortfolioBySubject(contracts, assets, tenants, subjectFilter)
          filename = `RentFlow-Portfolio-${subjectFilter === 'all' ? 'Vsechny' : subjectFilter.replace(/[^a-zA-Z0-9]/g, '-')}-${stamp}.html`
          break
        case 'tenant': {
          const t = tenants.find(x => x.id === tenantFilter)
          if (!t) { setError('Vyberte nájemce.'); setLoading(false); return }
          html = genTenantCard(t, contracts, assets)
          filename = `RentFlow-Karta-${t.name.replace(/[^a-zA-Z0-9]/g, '-')}-${stamp}.html`
          break
        }
        case 'expiry':
          html = genExpirationReport(contracts, assets, tenants)
          filename = `RentFlow-Expirace-${stamp}.html`
          break
        case 'monthly':
          html = genMonthlyReport(contracts, assets, tenants, subjectFilter)
          filename = `RentFlow-Predpis-${stamp}.html`
          break
      }

      // Zobrazit save dialog pro PDF
      const outPath = await save({
        defaultPath: filename.replace('.html', '.pdf'),
        filters: [{ name: 'PDF soubor', extensions: ['pdf'] }],
      })
      if (!outPath) { setLoading(false); return }

      await invoke('export_to_pdf', { html, outPath })
      setLastExport({ filename: outPath.split('\\').pop() || outPath, path: outPath })
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const conf = EXPORT_TYPES.find(t => t.id === activeType)

  return (
    <div style={{ paddingBottom: 60 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Export a tisk</div>
          <div className="page-sub">Přímé generování PDF — výběr umístění, uložení bez otevírání prohlížeče</div>
        </div>
      </div>

      {/* Výběr typu exportu */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {EXPORT_TYPES.map(et => (
          <button
            key={et.id}
            type="button"
            onClick={() => { setActiveType(et.id); setLastExport(null); setError(null) }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              gap: 8, padding: '18px 18px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
              border: activeType === et.id ? `2px solid ${et.color}` : '2px solid var(--border)',
              background: activeType === et.id ? et.bg : 'var(--bg2)',
              boxShadow: activeType === et.id ? `0 0 0 3px ${et.color}20` : 'none',
              transition: 'all 0.18s ease',
            }}
          >
            <span style={{ fontSize: 28 }}>{et.icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: activeType === et.id ? et.color : 'var(--text)' }}>{et.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{et.sub}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Konfigurace exportu */}
      <div style={{ background: 'var(--bg2)', border: `1px solid ${conf.border}`, borderRadius: 16, padding: 28, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22, paddingBottom: 18, borderBottom: '1px solid var(--border)' }}>
          <div style={{ width: 44, height: 44, background: conf.bg, border: `1px solid ${conf.border}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{conf.icon}</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: conf.color }}>{conf.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{conf.sub}</div>
          </div>
        </div>

        {/* Filtry dle typu */}
        {(activeType === 'portfolio' || activeType === 'monthly') && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Subjekt / firma</label>
            <select className="btn" style={{ width: '100%', maxWidth: 460, textAlign: 'left', cursor: 'pointer' }}
              value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}>
              <option value="all">Celé portfolio (všechny subjekty)</option>
              {activeSubjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        {activeType === 'tenant' && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Nájemce</label>
            <select className="btn" style={{ width: '100%', maxWidth: 460, textAlign: 'left', cursor: 'pointer' }}
              value={tenantFilter} onChange={e => setTenantFilter(e.target.value)}>
              <option value="">— Vyberte nájemce —</option>
              {activeTenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}

        {activeType === 'expiry' && (
          <div style={{ padding: '14px 18px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, marginBottom: 20, fontSize: 13, color: '#92400E' }}>
            📋 Export zahrne všechny aktivní smlouvy končící do 180 dnů, seřazené od nejblíže expirujících.
          </div>
        )}

        {/* Náhled obsahu */}
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Co bude v exportu</div>
          {activeType === 'portfolio' && (
            <ul style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 2, paddingLeft: 18 }}>
              <li>Seznam aktivních smluv dle {subjectFilter === 'all' ? 'všech subjektů' : subjectFilter}</li>
              <li>Nájemce, předmět nájmu, platnost smlouvy, zbývající dny</li>
              <li>Nájemné, parkovné, celková měsíční částka</li>
              <li>Součty dle subjektu + celkové portfolio</li>
            </ul>
          )}
          {activeType === 'tenant' && (
            <ul style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 2, paddingLeft: 18 }}>
              <li>Kontaktní údaje nájemce (telefon, e-mail, adresa, IČO…)</li>
              <li>Přehled aktivních smluv s finančními podmínkami</li>
              <li>Historie ukončených smluv</li>
              <li>Upozornění na smlouvy blížící se expiraci</li>
            </ul>
          )}
          {activeType === 'expiry' && (
            <ul style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 2, paddingLeft: 18 }}>
              <li>Smlouvy končící do 30 / 60 / 90 / 180 dnů</li>
              <li>Nájemce + telefon pro přímý kontakt</li>
              <li>Přehled nájemného u každé expirující smlouvy</li>
            </ul>
          )}
          {activeType === 'monthly' && (
            <ul style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 2, paddingLeft: 18 }}>
              <li>Předpis nájemného pro aktuální měsíc</li>
              <li>Nájemné + parkovné + zálohy energií zvlášť</li>
              <li>Součty dle subjektu + celkové portfolio</li>
              <li>Podklady pro účetní nebo daňové přiznání</li>
            </ul>
          )}
        </div>

        {/* Akce */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ minWidth: 200, padding: '12px 24px', fontSize: 14, fontWeight: 700, opacity: loading ? 0.7 : 1 }}
            onClick={doExport}
            disabled={loading}
          >
            {loading ? '⏳ Generuji…' : `📄 Generovat ${conf.label}`}
          </button>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            Vyberte umístění pro uložení PDF — soubor se vygeneruje přímo bez otevírání prohlížeče.
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#991B1B', fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}

        {lastExport && (
          <div style={{ marginTop: 14, padding: '12px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, color: '#166534', fontSize: 13 }}>
            ✅ PDF uloženo: <strong>{lastExport.filename}</strong>
            <div style={{ fontSize: 11, color: '#4B7C64', marginTop: 3 }}>{lastExport.path}</div>
          </div>
        )}
      </div>
    </div>
  )
}
