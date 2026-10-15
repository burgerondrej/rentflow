import React, { useState } from 'react'
import { useApp } from '../AppContext.jsx'
import { invoke } from '@tauri-apps/api/tauri'
import { save } from '@tauri-apps/api/dialog'
import { getEffectiveValuesToday, getEffectiveValues, getMonthRentParking, getMonthDeposits, isContractBillable, isContractInMonth, isContractOccupying, parseDate, PERIOD_LEN, depositYearRows } from '../utils.js'
import { FirmPickerButton } from '../FirmUI.jsx'
import { contractSubject, selectionMatches, selectionLabel, firmColors } from '../utils.js'

// ── CSS pro tisk (inline do HTML exportu) ──
const PRINT_CSS = `
  /* Bez Google Fonts @import – PDF se generuje i offline (Edge headless); DM Sans jen pokud je nainstalované */
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; }
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
  .badge-red { background: #FEF2F2; color: #DC2626; }
  .badge-orange { background: #FFF7ED; color: #92400E; }
  .amount { font-weight: 700; text-align: right; white-space: nowrap; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E5E5E5; font-size: 10px; color: #999; display: flex; justify-content: space-between; }
  .firm-chip { display: inline-block; min-width: 30px; text-align: center; padding: 2px 6px; border-radius: 6px; color: #fff; font-size: 10px; font-weight: 800; letter-spacing: 0.3px; margin-right: 8px; vertical-align: middle; }
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

// Firma v exportu: fi(subject) → { name, short, mid, bg, txt } (barvy světlého režimu)
function firmChip(f) {
  return f ? `<span class="firm-chip" style="background:${f.mid}">${f.short}</span>` : ''
}

function fmtCzk(v) {
  return Math.round(Number(v || 0)).toLocaleString('cs-CZ') + ' Kč'
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

// Aktuální částky smlouvy přepočtené na měsíc (čtvrtletní/pololetní/roční smlouvy mají v DB částku za období)
function monthlyToday(c) {
  const ev = getEffectiveValuesToday(c)
  const n = PERIOD_LEN[c.paymentFrequency] || 1
  const rent = ev.rent / n, parking = ev.parking / n, flatFee = ev.flatFee / n
  return { ...ev, rent, parking, flatFee, total: rent + parking + flatFee }
}

function urgencyClass(days) {
  if (days === null) return ''
  if (days <= 30) return 'badge badge-red'
  if (days <= 90) return 'badge badge-orange'
  return 'badge badge-green'
}

// ── GENERÁTORY HTML ──────────────────────────────────────────────────────────

function genPortfolioBySubject(contracts, assets, tenants, subjectFilter, subjectOrder, fi) {
  // Platné smlouvy (aktivní + ukončené s budoucím koncem)
  const activeContracts = contracts.filter(c => isContractOccupying(c))
  // Výběr: vše / firma ("Vše") / sekce – vždy podle skutečného pronajímatele smlouvy
  const subjects = subjectOrder.filter(s => selectionMatches(subjectFilter, s))

  let sectionsHtml = ''
  const firmTotals = {} // součty STRIKTNĚ po firmách

  subjects.forEach(subject => {
    const subjectContracts = activeContracts.filter(c => contractSubject(c, assets) === subject)
    if (subjectContracts.length === 0) return

    const subTotal = subjectContracts.reduce((s, c) => s + monthlyToday(c).total, 0)
    const f = fi(subject)
    const fk = f ? f.name : subject
    firmTotals[fk] = { f, total: (firmTotals[fk]?.total || 0) + subTotal }

    const rows = subjectContracts.map(c => {
      const a = assets.find(x => x.id === c.assetId)
      const t = tenants.find(x => x.id === c.tenantId)
      const ev = monthlyToday(c)
      const days = daysLeft(c.end)
      const daysText = days === null ? '∞' : days <= 0 ? 'Vypršela' : `${days} dní`
      const daysBadge = days !== null && days <= 90 ? 'badge badge-red' : 'badge badge-green'
      const total = ev.total
      return `<tr>
        <td>${a?.unit || '—'}</td>
        <td>${t?.name || '—'}</td>
        <td>${c.start || '—'}</td>
        <td>${c.end || 'Neurčito'}</td>
        <td><span class="${daysBadge}">${daysText}</span></td>
        <td class="amount">${fmtCzk(ev.rent)}</td>
        <td class="amount">${ev.parking > 0 ? fmtCzk(ev.parking) : '—'}</td>
        <td class="amount" style="color:#12654A;font-weight:800">${fmtCzk(total)}</td>
      </tr>`
    }).join('')

    sectionsHtml += `
      <div class="section">
        <div class="section-title" style="${f ? `color:${f.txt};background:${f.bg};border-left:5px solid ${f.mid}` : ''}">${firmChip(f)}${subject}</div>
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

  const title = subjectFilter === 'all' ? 'Přehled portfolia — všechny firmy' : `Přehled portfolia — ${selectionLabel(subjectFilter)}`
  const firmBoxes = Object.values(firmTotals).map(({ f, total }) => `
        <div class="summary-box" style="${f ? `background:${f.bg};border-color:${f.mid}` : ''}">
          <div class="summary-label" style="${f ? `color:${f.txt}` : ''}">${firmChip(f)}${f ? f.name : ''} · nájemné / měsíc</div>
          <div class="summary-value" style="${f ? `color:${f.mid}` : ''}">${fmtCzk(total)}</div>
        </div>`).join('')

  return `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8">
    <title>${title}</title>
    <style>${PRINT_CSS}</style></head><body><div class="page">
    <div class="header">
      <div>
        <div class="header-title">RentFlow</div>
        <div style="font-size:18px;font-weight:700;color:#1a1a1a;margin-top:4px">${title}</div>
        <div class="header-sub">Platné smlouvy · částky přepočtené na měsíc · Vygenerováno ${today()}</div>
      </div>
      <div class="header-date" style="text-align:right">${firmBoxes}</div>
    </div>
    ${sectionsHtml}
    <div class="footer">
      <span>RentFlow — Export portfolia</span>
      <span>Vygenerováno: ${today()}</span>
    </div>
  </div></body></html>`
}

function genTenantCard(tenant, contracts, assets, fi) {
  const tenantContracts = contracts.filter(c => c.tenantId === tenant.id)
  const activeContracts = tenantContracts.filter(c => isContractOccupying(c))
  const archivedContracts = tenantContracts.filter(c => !isContractOccupying(c))

  const contractCard = (c, isActive) => {
    const a = assets.find(x => x.id === c.assetId)
    const ev = getEffectiveValuesToday(c)
    const days = daysLeft(c.end)
    return `
      <div class="card" style="${isActive ? '' : 'opacity:0.65'}">
        <div class="card-header">${firmChip(fi(contractSubject(c, assets)))}${a?.unit || '—'} <span style="font-size:11px;font-weight:500;color:#666">${contractSubject(c, assets)}</span>
          ${isActive ? (c.status === 'archived' ? `<span class="badge badge-orange" style="float:right">Končí ${c.end}</span>` : '<span class="badge badge-green" style="float:right">Aktivní</span>') : '<span class="badge badge-gray" style="float:right">Ukončena</span>'}
        </div>
        <div class="row"><span class="label">Platnost</span><span class="value">${c.start || '—'} → ${c.end || 'Neurčito'}</span></div>
        <div class="row"><span class="label">Nájemné</span><span class="value">${fmtCzk(ev.rent)}</span></div>
        ${ev.deposit > 0 ? `<div class="row"><span class="label">Zálohy energií a služeb</span><span class="value">${fmtCzk(ev.deposit)}</span></div>` : ''}
        ${c.cauce > 0 ? `<div class="row"><span class="label">Složená kauce</span><span class="value">${fmtCzk(c.cauce)}</span></div>` : ''}
        ${ev.parking > 0 ? `<div class="row"><span class="label">Parkovné</span><span class="value">${fmtCzk(ev.parking)}</span></div>` : ''}
        ${ev.flatFee > 0 ? `<div class="row"><span class="label">Paušální poplatek</span><span class="value">${fmtCzk(ev.flatFee)}</span></div>` : ''}
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
        ${(() => {
          // Nájemné / měsíc STRIKTNĚ po firmách (pronajímatelích)
          const byFirm = {}
          activeContracts.forEach(c => {
            const f = fi(contractSubject(c, assets))
            const k = f ? f.name : '—'
            byFirm[k] = byFirm[k] || { f, total: 0 }
            byFirm[k].total += monthlyToday(c).total
          })
          return Object.values(byFirm).map(({ f, total }) => `<div class="summary-box" style="${f ? `background:${f.bg};border-color:${f.mid}` : ''}">
          <div class="summary-label" style="${f ? `color:${f.txt}` : ''}">${firmChip(f)}${f ? f.name : ''} · nájemné / měsíc</div>
          <div class="summary-value" style="${f ? `color:${f.mid}` : ''}">${fmtCzk(total)}</div>
        </div>`).join('')
        })()}
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

function genExpirationReport(contracts, assets, tenants, fi) {
  // Platné smlouvy vč. ukončených k budoucímu datu (jejich konec je právě ten termín)
  const active = contracts.filter(c => isContractOccupying(c))
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
    const rows = g.items.map(c => {
      const total = monthlyToday(c).total
      return `<tr>
      <td>${c.asset?.unit || '—'}</td>
      <td>${firmChip(fi(contractSubject(c, assets)))}${contractSubject(c, assets) || '—'}</td>
      <td>${c.tenant?.name || '—'}</td>
      <td>${c.tenant?.phone || '—'}</td>
      <td>${c.end}</td>
      <td><span style="background:${g.bg};color:${g.color};padding:2px 10px;border-radius:20px;font-weight:700;font-size:11px">${c.days} dní</span></td>
      <td class="amount">${fmtCzk(total)}</td>
    </tr>`}).join('')
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

function genMonthlyReport(contracts, assets, tenants, subjectFilter, subjectOrder, fi) {
  // Výběr smluv jako v Platbách: účtovatelné a platné aspoň jeden den v aktuálním měsíci
  const now = new Date(), yr = now.getFullYear(), mo = now.getMonth()
  const dim = new Date(yr, mo + 1, 0).getDate()
  const active = contracts.filter(c => isContractBillable(c) && c.paymentFrequency !== 'Zahrnuto v nájemném' && isContractInMonth(c, yr, mo))
  // Filtr a řazení podle skutečného pronajímatele smlouvy (ne podle subjektu předmětu)
  const filtered = active.filter(c => selectionMatches(subjectFilter, contractSubject(c, assets)))

  // Předpis za měsíc: nájem + parking poměrně podle dní (getMonthRentParking), paušál a zálohy celé;
  // víceměsíční smlouvy přepočtené na měsíc. Rozdělení nájem / parking jen pro zobrazení.
  const mv = (c) => {
    const n = PERIOD_LEN[c.paymentFrequency] || 1
    const ev = getEffectiveValues(c, yr, mo)
    const rp = getMonthRentParking(c, yr, mo)
    const base = ev.rent + ev.parking
    const parking = base > 0 ? Math.round(rp * ev.parking / base) : 0
    const d = getMonthDeposits(c, yr, mo)
    const rent = (rp - parking) / n, pk = parking / n, flatFee = ev.flatFee / n
    const s = parseDate(c.start), e = parseDate(c.end)
    const from = s && s.getFullYear() === yr && s.getMonth() === mo && s.getDate() > 1 ? s.getDate() : null
    const to = e && e.getFullYear() === yr && e.getMonth() === mo && e.getDate() < dim ? e.getDate() : null
    const note = n === 1 && (from || to) ? `poměrně ${from ? `od ${from}. ${mo + 1}.` : ''}${from && to ? ' ' : ''}${to ? `do ${to}. ${mo + 1}.` : ''}` : ''
    return { rent, parking: pk, flatFee, deposit: d.deposit + d.depositWater, total: rent + pk + flatFee, note }
  }

  const sorted = [...filtered].sort((a, b) => {
    const sa = contractSubject(a, assets)
    const sb = contractSubject(b, assets)
    return subjectOrder.indexOf(sa) - subjectOrder.indexOf(sb)
  })
  // Součty po firmách (striktně odděleno)
  const firmSums = {}
  sorted.forEach(c => {
    const f = fi(contractSubject(c, assets))
    const k = f ? f.name : '—'
    const ev = mv(c)
    firmSums[k] = firmSums[k] || { f, rent: 0, parking: 0, flat: 0, dep: 0, total: 0 }
    firmSums[k].rent += ev.rent
    firmSums[k].parking += ev.parking
    firmSums[k].flat += ev.flatFee
    firmSums[k].dep += ev.deposit
    firmSums[k].total += ev.total
  })

  const month = now.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })

  const rows = sorted.map(c => {
    const a = assets.find(x => x.id === c.assetId)
    const t = tenants.find(x => x.id === c.tenantId)
    const ev = mv(c)
    const total = ev.total
    return `<tr>
      <td>${firmChip(fi(contractSubject(c, assets)))}${contractSubject(c, assets) || '—'}</td>
      <td>${a?.unit || '—'}</td>
      <td>${t?.name || '—'}${ev.note ? `<div style="font-size:10px;color:#92400E">${ev.note}</div>` : ''}</td>
      <td class="amount">${fmtCzk(ev.rent)}</td>
      <td class="amount">${ev.parking > 0 ? fmtCzk(ev.parking) : '—'}</td>
      <td class="amount">${ev.flatFee > 0 ? fmtCzk(ev.flatFee) : '—'}</td>
      <td class="amount">${ev.deposit > 0 ? fmtCzk(ev.deposit) : '—'}</td>
      <td class="amount" style="color:#12654A;font-weight:800">${fmtCzk(total)}</td>
    </tr>`
  }).join('')

  const title = subjectFilter === 'all' ? 'Měsíční předpis nájemného — všechny firmy' : `Měsíční předpis — ${selectionLabel(subjectFilter)}`

  return `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8">
    <title>${title}</title>
    <style>${PRINT_CSS}</style></head><body><div class="page">
    <div class="header">
      <div>
        <div class="header-title">RentFlow</div>
        <div style="font-size:18px;font-weight:700;color:#1a1a1a;margin-top:4px">${title}</div>
        <div class="header-sub">${month.charAt(0).toUpperCase()+month.slice(1)} · Vygenerováno ${today()}</div>
      </div>
      <div style="text-align:right">
        ${Object.values(firmSums).map(s => `<div class="summary-box" style="${s.f ? `background:${s.f.bg};border-color:${s.f.mid}` : ''}">
          <div class="summary-label" style="${s.f ? `color:${s.f.txt}` : ''}">${firmChip(s.f)}${s.f ? s.f.name : ''} · předpis</div>
          <div class="summary-value" style="${s.f ? `color:${s.f.mid}` : ''}">${fmtCzk(Math.round(s.total))}</div>
          ${s.dep > 0 ? `<div style="font-size:10px;color:#666;margin-top:2px">+ zálohy ${fmtCzk(Math.round(s.dep))}</div>` : ''}
        </div>`).join('')}
      </div>
    </div>
    <div class="section">
      <table>
        <thead><tr>
          <th>Subjekt</th><th>Předmět nájmu</th><th>Nájemce</th>
          <th style="text-align:right">Nájemné</th><th style="text-align:right">Parkovné</th>
          <th style="text-align:right">Paušál</th><th style="text-align:right">Zálohy</th><th style="text-align:right">Celkem</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>${Object.values(firmSums).map(s => `<tr style="font-weight:700;background:${s.f ? s.f.bg : '#F8F8F8'}">
          <td colspan="3" style="padding:8px 10px;${s.f ? `color:${s.f.txt};box-shadow:inset 5px 0 0 ${s.f.mid}` : ''}">${firmChip(s.f)}Součet ${s.f ? s.f.name : ''}</td>
          <td class="amount">${fmtCzk(Math.round(s.rent))}</td><td class="amount">${fmtCzk(Math.round(s.parking))}</td>
          <td class="amount">${fmtCzk(Math.round(s.flat))}</td><td class="amount">${fmtCzk(Math.round(s.dep))}</td>
          <td class="amount" style="${s.f ? `color:${s.f.mid}` : ''}">${fmtCzk(Math.round(s.total))}</td>
        </tr>`).join('')}</tfoot>
      </table>
    </div>
    <div class="footer">
      <span>RentFlow — Měsíční předpis</span><span>Vygenerováno: ${today()}</span>
    </div>
  </div></body></html>`
}

function genDepositReport(contracts, payments, assets, tenants, subjectFilter, subjectOrder, fi, year) {
  // Podklad pro vyúčtování služeb: zálohy po smlouvách (při předávce dva nájemci na předmětu), součty po sekcích a firmách
  const all = depositYearRows(contracts, payments, assets, year)
    .filter(r => selectionMatches(subjectFilter, contractSubject(r.c, assets)))
  const hasWater = all.some(r => r.water > 0)
  const firmSums = {}
  let sectionsHtml = ''
  subjectOrder.filter(s => selectionMatches(subjectFilter, s)).forEach(subject => {
    const rows = all.filter(r => contractSubject(r.c, assets) === subject)
    if (!rows.length) return
    const f = fi(subject)
    const fk = f ? f.name : subject
    const tr = rows.filter(r => r.tracked)
    const sub = { exp: rows.reduce((s, r) => s + r.exp, 0), water: rows.reduce((s, r) => s + r.water, 0), paid: tr.reduce((s, r) => s + r.paid, 0), diff: tr.reduce((s, r) => s + r.diff, 0) }
    const fs = firmSums[fk] = firmSums[fk] || { f, exp: 0, water: 0, paid: 0, diff: 0 }
    fs.exp += sub.exp; fs.water += sub.water; fs.paid += sub.paid; fs.diff += sub.diff
    let prevAsset = null
    const body = rows.map(r => {
      const t = tenants.find(x => x.id === r.c.tenantId)
      const first = r.c.assetId !== prevAsset
      prevAsset = r.c.assetId
      const period = r.from === r.to ? `${r.from + 1}/${year}` : `${r.from + 1}–${r.to + 1}/${year}`
      const diff = r.tracked ? `<span style="color:${r.diff < 0 ? '#DC2626' : r.diff > 0 ? '#16A34A' : '#1a1a1a'}">${r.diff > 0 ? '+' : ''}${fmtCzk(r.diff)}</span>` : '<span style="color:#999">neevidováno</span>'
      const st = (r.c.energySettlements || []).find(x => Number(x.year) === year)
      const settle = st ? `<span style="color:${Number(st.amount) > 0 ? '#DC2626' : '#16A34A'}">${Number(st.amount) > 0 ? 'doplatek' : 'přeplatek'} ${fmtCzk(Math.abs(Number(st.amount)))}</span>` : '<span style="color:#999">—</span>'
      return `<tr${first ? '' : ' style="background:#FFFBEB"'}>
        <td>${first ? `<strong>${r.asset?.unit || '—'}</strong>` : '<span style="color:#999;padding-left:10px">↳</span>'}</td>
        <td>${t?.name || '—'}</td><td>${period}</td>
        <td class="amount">${fmtCzk(r.exp)}</td>${hasWater ? `<td class="amount">${r.water > 0 ? fmtCzk(r.water) : '—'}</td>` : ''}
        <td class="amount">${r.tracked ? fmtCzk(r.paid) : '—'}</td><td class="amount">${diff}</td><td class="amount">${settle}</td>
      </tr>`
    }).join('')
    sectionsHtml += `
      <div class="section">
        <div class="section-title" style="${f ? `color:${f.txt};background:${f.bg};border-left:5px solid ${f.mid}` : ''}">${firmChip(f)}${subject}</div>
        <table>
          <thead><tr><th>Předmět</th><th>Nájemce</th><th>Období</th><th style="text-align:right">Zálohy předpis</th>${hasWater ? '<th style="text-align:right">Voda předpis</th>' : ''}<th style="text-align:right">Zaplaceno</th><th style="text-align:right">Rozdíl</th><th style="text-align:right">Vyúčtování</th></tr></thead>
          <tbody>${body}</tbody>
          <tfoot><tr style="font-weight:700;background:#F8F8F8"><td colspan="3" style="padding:8px 10px">Součet sekce</td>
            <td class="amount">${fmtCzk(sub.exp)}</td>${hasWater ? `<td class="amount">${fmtCzk(sub.water)}</td>` : ''}<td class="amount">${fmtCzk(sub.paid)}</td>
            <td class="amount" style="color:${sub.diff < 0 ? '#DC2626' : '#16A34A'}">${sub.diff > 0 ? '+' : ''}${fmtCzk(sub.diff)}</td><td></td></tr></tfoot>
        </table>
      </div>`
  })
  const title = `Zálohy ${year} — ${subjectFilter === 'all' ? 'všechny firmy' : selectionLabel(subjectFilter)}`
  const boxes = Object.values(firmSums).map(s => `<div class="summary-box" style="${s.f ? `background:${s.f.bg};border-color:${s.f.mid}` : ''}">
      <div class="summary-label" style="${s.f ? `color:${s.f.txt}` : ''}">${firmChip(s.f)}${s.f ? s.f.name : ''} · zálohy ${year}</div>
      <div class="summary-value" style="${s.f ? `color:${s.f.mid}` : ''}">${fmtCzk(s.paid)} <span style="font-size:11px;font-weight:600;color:#666">/ ${fmtCzk(s.exp)}</span></div>
    </div>`).join('')
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8">
    <title>${title}</title>
    <style>${PRINT_CSS}</style></head><body><div class="page">
    <div class="header">
      <div>
        <div class="header-title">RentFlow</div>
        <div style="font-size:18px;font-weight:700;color:#1a1a1a;margin-top:4px">${title}</div>
        <div class="header-sub">Podklad pro vyúčtování služeb · v měsíci předávky platí plné zálohy oba nájemci · Vygenerováno ${today()}</div>
      </div>
      <div style="text-align:right">${boxes}</div>
    </div>
    ${sectionsHtml || '<div style="padding:24px;text-align:center;color:#999">Ve vybraném roce nejsou žádné zálohy.</div>'}
    ${hasWater ? '<div style="font-size:10px;color:#666;margin-top:8px">Voda: jen předpis (u komerčních prostor) – platby záloh evidují zálohy na energie a služby.</div>' : ''}
    <div class="footer"><span>RentFlow — Zálohy za rok</span><span>Vygenerováno: ${today()}</span></div>
  </div></body></html>`
}

// ── KOMPONENTA ────────────────────────────────────────────────────────────────

const EXPORT_TYPES = [
  { id: 'portfolio', icon: '🏢', label: 'Přehled portfolia', sub: 'Aktivní smlouvy dle subjektů', color: '#12654A', bg: '#F0FDF4', border: '#BBF7D0' },
  { id: 'tenant',   icon: '👤', label: 'Karta nájemce',     sub: 'Kontakty + smlouvy jednoho nájemce', color: '#4f46e5', bg: '#EEF2FF', border: '#C7D2FE' },
  { id: 'expiry',   icon: '⏰', label: 'Expirační report',  sub: 'Smlouvy končící do 180 dnů', color: '#c2410c', bg: '#FFF7ED', border: '#FED7AA' },
  { id: 'monthly',  icon: '💰', label: 'Měsíční předpis',   sub: 'Předpis nájemného pro aktuální měsíc', color: '#0369a1', bg: '#F0F9FF', border: '#BAE6FD' },
  { id: 'deposits', icon: '💧', label: 'Zálohy za rok',     sub: 'Podklad pro vyúčtování služeb', color: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
]

export default function Export() {
  const { contracts = [], assets = [], tenants = [], subjects = [], payments = [], getFirm } = useApp() || {}
  const [depYear, setDepYear] = useState(() => new Date().getFullYear())
  const depYears = []
  for (let y = 2026; y <= new Date().getFullYear(); y++) depYears.push(y)
  // Barvy firmy pro tisk (vždy světlý režim)
  const fi = (subject) => {
    const f = getFirm ? getFirm(subject) : null
    if (!f) return null
    const c = firmColors(f.color, 'light')
    return { name: f.name, short: f.short, mid: c.mid, bg: c.bg, txt: c.txt }
  }
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
  )].sort((a, b) => subjects.indexOf(a) - subjects.indexOf(b))

  const doExport = async () => {
    setError(null)
    setLoading(true)
    try {
      let html = ''
      let filename = ''
      const stamp = new Date().toISOString().slice(0,10)

      switch (activeType) {
        case 'portfolio':
          html = genPortfolioBySubject(contracts, assets, tenants, subjectFilter, subjects, fi)
          filename = `RentFlow-Portfolio-${subjectFilter === 'all' ? 'Vsechny' : selectionLabel(subjectFilter).replace(/[^a-zA-Z0-9]/g, '-')}-${stamp}.html`
          break
        case 'tenant': {
          const t = tenants.find(x => x.id === tenantFilter)
          if (!t) { setError('Vyberte nájemce.'); setLoading(false); return }
          html = genTenantCard(t, contracts, assets, fi)
          filename = `RentFlow-Karta-${t.name.replace(/[^a-zA-Z0-9]/g, '-')}-${stamp}.html`
          break
        }
        case 'expiry':
          html = genExpirationReport(contracts, assets, tenants, fi)
          filename = `RentFlow-Expirace-${stamp}.html`
          break
        case 'monthly':
          html = genMonthlyReport(contracts, assets, tenants, subjectFilter, subjects, fi)
          filename = `RentFlow-Predpis-${stamp}.html`
          break
        case 'deposits':
          html = genDepositReport(contracts, payments, assets, tenants, subjectFilter, subjects, fi, depYear)
          filename = `RentFlow-Zalohy-${depYear}-${subjectFilter === 'all' ? 'Vsechny' : selectionLabel(subjectFilter).replace(/[^a-zA-Z0-9]/g, '-')}.html`
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
      <div className="page-header" data-icon="🖨️">
        <div>
          <div className="page-title">Export a tisk</div>
          <div className="page-sub">Přímé generování PDF — výběr umístění, uložení bez otevírání prohlížeče</div>
        </div>
      </div>

      {/* Výběr typu exportu */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 28 }}>
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
        {activeType === 'deposits' && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Rok</label>
            <select className="btn" style={{ cursor: 'pointer' }} value={depYear} onChange={e => setDepYear(Number(e.target.value))}>
              {depYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
        {(activeType === 'portfolio' || activeType === 'monthly' || activeType === 'deposits') && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Subjekt / firma</label>
            <FirmPickerButton
              value={subjectFilter}
              onChange={setSubjectFilter}
              sections={subjects.filter(s => contracts.some(c => isContractOccupying(c) && contractSubject(c, assets) === s))}
              getStat={(sel) => { const n = contracts.filter(c => isContractOccupying(c) && selectionMatches(sel, contractSubject(c, assets))).length; return { count: `${n} sml.`, text: `${n} platných smluv`, tone: 'muted' } }}
            />
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
              <li>Seznam platných smluv dle {subjectFilter === 'all' ? 'všech firem' : selectionLabel(subjectFilter)}</li>
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
          {activeType === 'deposits' && (
            <ul style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 2, paddingLeft: 18 }}>
              <li>Zálohy za rok {depYear} po předmětech a nájemcích (při předávce oba nájemci)</li>
              <li>Předpis, zaplaceno a rozdíl za každou smlouvu</li>
              <li>Součty po sekcích a striktně po firmách</li>
            </ul>
          )}
          {activeType === 'monthly' && (
            <ul style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 2, paddingLeft: 18 }}>
              <li>Předpis nájemného pro aktuální měsíc (vč. smluv končících / začínajících v měsíci, poměrně podle dní)</li>
              <li>Nájemné + parkovné + paušál + zálohy zvlášť</li>
              <li>Součty striktně po firmách</li>
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
