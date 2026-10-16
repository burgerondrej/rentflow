// ─────────────────────────────────────────
// SDÍLENÉ UTILITY FUNKCE
// Centralizované výpočty plateb – importovat do Payments, Dashboard, DetailPanel, AppContext
// ─────────────────────────────────────────

export const PERIOD_LEN = { 'Čtvrtletně': 3, 'Pololetně': 6, 'Ročně': 12 }

// ─────────────────────────────────────────
// FIRMY (pronajímatelé) A SEKCE
// Subjekt = "FIRMA – Sekce" (nebo jen "FIRMA"). Firma se určuje VŽDY přesným
// porovnáním části před oddělovačem – nikdy startsWith ("JIHOTANK CB" ≠ "JIHOTANK").
// ─────────────────────────────────────────
export const SUBJECT_SEP = ' – '

// ─────────────────────────────────────────
// TYPY PŘEDMĚTŮ NÁJMU – jedna sada barev a ikon pro celou aplikaci
// Barvy jsou CSS proměnné ze styles.css (--asset-<typ>-bg/header/accent/border), takže fungují i v tmavém režimu.
// ─────────────────────────────────────────
export const ASSET_TYPES = {
  residential: { icon: '🏠', label: 'Bytová jednotka' },
  commercial:  { icon: '🏢', label: 'Komerční prostor' },
  ads:         { icon: '📢', label: 'Reklamní plocha' },
  parking:     { icon: '🅿️', label: 'Parkovací stání' },
  ostatni:     { icon: '📄', label: 'Ostatní' },
}

/** Barvy typu předmětu jako CSS proměnné: { bg, header, accent, border, icon, label } */
export function assetTypeStyle(type) {
  const t = ASSET_TYPES[type] ? type : 'ostatni'
  return {
    bg: `var(--asset-${t}-bg)`, header: `var(--asset-${t}-header)`,
    accent: `var(--asset-${t}-accent)`, border: `var(--asset-${t}-border)`, strong: `var(--asset-${t}-strong)`,
    icon: ASSET_TYPES[t].icon, label: ASSET_TYPES[t].label,
  }
}

export function firmOf(subject) {
  const s = subject || ''
  const i = s.indexOf(SUBJECT_SEP)
  return (i >= 0 ? s.slice(0, i) : s).trim()
}

export function sectionOf(subject) {
  const s = subject || ''
  const i = s.indexOf(SUBJECT_SEP)
  return i >= 0 ? s.slice(i + SUBJECT_SEP.length).trim() : s
}

// Výběr "Vše" za celou firmu – hodnota se nemůže shodovat s názvem subjektu
const FIRM_SEL = '✱firm:'
export const firmSelection = (firm) => FIRM_SEL + firm
export const isFirmSelection = (sel) => typeof sel === 'string' && sel.startsWith(FIRM_SEL)
export const selectionFirm = (sel) => isFirmSelection(sel) ? sel.slice(FIRM_SEL.length) : firmOf(sel)

/** Patří subjekt do výběru? sel = 'all' | subjekt | firmSelection(firma) */
export function selectionMatches(sel, subject) {
  if (!sel || sel === 'all') return true
  if (isFirmSelection(sel)) return firmOf(subject) === sel.slice(FIRM_SEL.length)
  return subject === sel
}

export function selectionLabel(sel) {
  if (!sel || sel === 'all') return 'Všechny firmy'
  if (isFirmSelection(sel)) return `${sel.slice(FIRM_SEL.length)} – vše`
  return sel
}

// Barvy firem: klíč z DB (subjects.color) → odstíny pro světlý / tmavý režim (sytá paleta v1.2.4)
// bg = podklad, mid = výrazná barva (zkratka, proužek), txt = text na podkladu, sub = vedlejší text
const FIRM_PALETTE = {
  wine:    { light: { bg: '#F8E6EA', mid: '#7A1029', txt: '#4A0A19', sub: '#8E1D38' }, dark: { bg: '#3B0814', mid: '#E0577A', txt: '#F8E6EA', sub: '#F0A3B6' } },
  royal:   { light: { bg: '#E5EDFF', mid: '#2563EB', txt: '#13307A', sub: '#1D4ED8' }, dark: { bg: '#0E2257', mid: '#6B9BFF', txt: '#E5EDFF', sub: '#A9C4FF' } },
  violet:  { light: { bg: '#F3E8FF', mid: '#9333EA', txt: '#4C1580', sub: '#7E22CE' }, dark: { bg: '#2E0F52', mid: '#C08CFF', txt: '#F3E8FF', sub: '#DDBEFF' } },
  teal:    { light: { bg: '#DDF6F3', mid: '#0D9488', txt: '#064E48', sub: '#0F766E' }, dark: { bg: '#063B37', mid: '#3CCFBF', txt: '#DDF6F3', sub: '#9BE7DE' } },
  orange:  { light: { bg: '#FFEDE0', mid: '#EA580C', txt: '#7C2D07', sub: '#C2410C' }, dark: { bg: '#43180A', mid: '#FF8A47', txt: '#FFEDE0', sub: '#FFC09A' } },
  slate:   { light: { bg: '#EBEEF2', mid: '#475569', txt: '#1F2937', sub: '#475569' }, dark: { bg: '#1E242C', mid: '#94A3B8', txt: '#EBEEF2', sub: '#CBD5E1' } },
  // Dřívější návrhové klíče (DB je migrace převede) – jen pojistka
  mint:    { light: { bg: '#E5EDFF', mid: '#2563EB', txt: '#13307A', sub: '#1D4ED8' }, dark: { bg: '#0E2257', mid: '#6B9BFF', txt: '#E5EDFF', sub: '#A9C4FF' } },
  blue:    { light: { bg: '#DDF6F3', mid: '#0D9488', txt: '#064E48', sub: '#0F766E' }, dark: { bg: '#063B37', mid: '#3CCFBF', txt: '#DDF6F3', sub: '#9BE7DE' } },
  emerald: { light: { bg: '#FFEDE0', mid: '#EA580C', txt: '#7C2D07', sub: '#C2410C' }, dark: { bg: '#43180A', mid: '#FF8A47', txt: '#FFEDE0', sub: '#FFC09A' } },
}

/** Subjekt (pronajímatel) smlouvy: u typu Ostatní subjekt předmětu, jinak billing_subject nebo subjekt předmětu. */
export function contractSubject(c, assets) {
  const asset = (assets || []).find(a => a.id === c?.assetId)
  if (asset?.type === 'ostatni') return asset.subject || ''
  return c?.billingSubject || asset?.subject || ''
}

/**
 * Měsíční nájem nájemce rozdělený STRIKTNĚ po firmách (pronajímatelích).
 * Vrací [{ name, short, color, isVatPayer, dph, noDph }] v pořadí firem; dph = částka bez DPH u plátce.
 */
export function tenantRentsByFirm(activeContracts, assets, firms) {
  const out = []
  // Navazující smlouva od budoucího data + stará do konce → počítat jen tu, která platí dnes
  for (const c of currentPerAsset(activeContracts)) {
    if (c.paymentFrequency === 'Zahrnuto v nájemném') continue
    const asset = (assets || []).find(a => a.id === c.assetId)
    const fname = firmOf(contractSubject(c, assets))
    const firm = (firms || []).find(f => f.name === fname)
    let row = out.find(r => r.name === fname)
    if (!row) {
      row = { name: fname, short: firm?.short || fname.slice(0, 3).toUpperCase(), color: firm?.color || 'slate', isVatPayer: firm?.isVatPayer ?? true, dph: 0, noDph: 0 }
      out.push(row)
    }
    const ev = getEffectiveValuesToday(c)
    const isRes = asset?.type === 'residential'
    // Stejné složky jako předpis v Platbách (getMonthRent): nájem + parkování + paušál, měsíční ekvivalent
    const rent = (ev.rent + ev.parking + ev.flatFee) / (PERIOD_LEN[c.paymentFrequency] || 1)
    const withDph = !isRes && (c.vatExempt === 2 ? true : c.vatExempt === 1 ? false : row.isVatPayer)
    if (withDph) row.dph += rent
    else row.noDph += rent
  }
  const idx = (n) => { const i = (firms || []).findIndex(f => f.name === n); return i < 0 ? 999 : i }
  return out.filter(r => r.dph + r.noDph > 0).sort((a, b) => idx(a.name) - idx(b.name))
}

/** Barvy, které lze firmě přiřadit v Nastavení (klíče FIRM_PALETTE bez starých pojistek). */
export const FIRM_COLOR_KEYS = ['wine', 'royal', 'violet', 'teal', 'orange', 'slate']

export function firmColors(colorKey, theme) {
  const p = FIRM_PALETTE[colorKey] || FIRM_PALETTE.slate
  return theme === 'dark' ? p.dark : p.light
}

/**
 * Date → CZ datum "D. M. RRRR".
 */
export function toCzDate(d) {
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`
}

/**
 * Parsuje CZ datum "D. M. RRRR" → Date nebo null.
 */
export function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null
  try {
    const parts = dateStr.split('.').map(p => p.trim())
    if (parts.length === 3) {
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
    }
  } catch { return null }
  return null
}

/**
 * Vrátí platné finanční hodnoty smlouvy k referenčnímu timestampu.
 * Amendments se řadí chronologicky zde – DB je vrací řazené jako text ("15. 10." < "5. 9.").
 * @private
 */
function _getEffVals(c, refTs) {
  const base = {
    rent:         Number(c.rent)         || 0,
    deposit:      Number(c.deposit)      || 0,
    depositWater: Number(c.depositWater) || 0,
    flatFee:      Number(c.flatFee)      || 0,
    parking:      Number(c.parking)      || 0,
  }
  if (!c.amendments || c.amendments.length === 0) return base
  const vals = { ...base }
  const dated = c.amendments
    .map(a => ({ a, d: parseDate(a.effectiveFrom) }))
    .filter(x => x.d)
    .sort((x, y) => x.d - y.d)
  for (const { a, d } of dated) {
    const aTs = d.getTime()
    if (aTs > refTs) break // seřazeno ASC – zbytek je v budoucnosti
    if (a.rent         != null) vals.rent         = Number(a.rent)
    if (a.deposit      != null) vals.deposit      = Number(a.deposit)
    if (a.depositWater != null) vals.depositWater = Number(a.depositWater)
    if (a.flatFee      != null) vals.flatFee      = Number(a.flatFee)
    if (a.parking      != null) vals.parking      = Number(a.parking)
  }
  return vals
}

/**
 * Vrátí platné finanční hodnoty smlouvy k 1. dni daného měsíce.
 * Používat pro výpočty v Payments a Dashboard.
 */
export function getEffectiveValues(c, year, month) {
  return _getEffVals(c, new Date(year, month, 1).getTime())
}

/**
 * Vrátí platné finanční hodnoty smlouvy k dnešnímu datu.
 * Používat pro zobrazení aktuálního nájemného (DetailPanel, Contracts).
 */
export function getEffectiveValuesToday(c) {
  const t = new Date()
  return _getEffVals(c, new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime())
}

/**
 * Nájem + parking za daný měsíc.
 * Měsíční smlouvy: poměrně podle dní – začátek/konec smlouvy uprostřed měsíce
 * a dodatek s účinností uprostřed měsíce (dny před ním stará sazba, od něj nová).
 * Zaokrouhleno na celé Kč (jen při krácení).
 * Čtvrtletní/pololetní/roční: bez krácení, hodnoty k 1. dni měsíce.
 */
export function getMonthRentParking(c, year, month) {
  const base = getEffectiveValues(c, year, month)
  if ((PERIOD_LEN[c.paymentFrequency] || 1) > 1) return base.rent + base.parking

  const dim = new Date(year, month + 1, 0).getDate()
  const startD = parseDate(c.start)
  const endD   = parseDate(c.end)
  if (startD && startD > new Date(year, month, dim)) return 0
  if (endD && endD < new Date(year, month, 1)) return 0
  const from = (startD && startD.getFullYear() === year && startD.getMonth() === month) ? startD.getDate() : 1
  const to   = (endD && endD.getFullYear() === year && endD.getMonth() === month) ? endD.getDate() : dim
  if (to < from) return 0

  // Hranice úseků: začátek + dny účinnosti dodatků uvnitř (from, to]
  const cuts = [from]
  for (const a of c.amendments || []) {
    const ad = parseDate(a.effectiveFrom)
    if (ad && ad.getFullYear() === year && ad.getMonth() === month && ad.getDate() > from && ad.getDate() <= to) {
      if (!cuts.includes(ad.getDate())) cuts.push(ad.getDate())
    }
  }
  cuts.sort((x, y) => x - y)

  // Celý měsíc bez změny sazby → přesná hodnota bez zaokrouhlení
  if (from === 1 && to === dim && cuts.length === 1) {
    const v = _getEffVals(c, new Date(year, month, 1).getTime())
    return v.rent + v.parking
  }

  let sum = 0
  for (let i = 0; i < cuts.length; i++) {
    const segFrom = cuts[i]
    const segTo   = i + 1 < cuts.length ? cuts[i + 1] - 1 : to
    const v = _getEffVals(c, new Date(year, month, segFrom).getTime())
    sum += (v.rent + v.parking) * (segTo - segFrom + 1)
  }
  return Math.round(sum / dim)
}

/**
 * Předpis nájmu za měsíc (nájem + parking + paušál) = splátka dle frekvence.
 * Paušál se nekrátí (k 1. dni měsíce), nájem + parking viz getMonthRentParking.
 */
export function getMonthRent(c, year, month) {
  if (!isContractInMonth(c, year, month)) return 0
  return getMonthRentParking(c, year, month) + getEffectiveValues(c, year, month).flatFee
}

/**
 * Zálohy (energie, voda) za měsíc – nekrátí se, hodnota k 1. dni měsíce.
 * - Předávka JINÉMU nájemci uprostřed měsíce: plné zálohy platí odcházející i nový nájemce.
 * - Navazující smlouva TÉHOŽ nájemce uprostřed měsíce (prodloužení): zálohy za ten měsíc jen jednou –
 *   platí je předchozí smlouva, nová až od dalšího měsíce. Proto VŽDY předávat allContracts.
 */
export function getMonthDeposits(c, year, month, allContracts = []) {
  const v = getEffectiveValues(c, year, month)
  const first = new Date(year, month, 1)
  const startD = parseDate(c.start)
  if (startD && startD > first && startD.getFullYear() === year && startD.getMonth() === month) {
    const sameTenantOnFirst = allContracts.some(o => {
      if (o.id === c.id || o.assetId !== c.assetId || o.tenantId !== c.tenantId || !isContractBillable(o)) return false
      const os = parseDate(o.start), oe = parseDate(o.end)
      return (!os || os <= first) && (!oe || oe >= first)
    })
    if (sameTenantOnFirst) return { deposit: 0, depositWater: 0 }
  }
  return { deposit: v.deposit, depositWater: v.depositWater }
}

// ─────────────────────────────────────────
// STAV PLATBY ZA MĚSÍC – JEDINÁ implementace pro Platby, Dashboard, detaily, saldo i report.
// ctx = { payments, contracts, assets }
// ─────────────────────────────────────────

/** Skupinová platba? (v DB contract_id NULL, načtená jako contractId "group:<název>") */
export const isGroupPayment = (p) => !p.contractId || String(p.contractId).startsWith('group:')

/** Nejpozdější z CZ dat ("D. M. RRRR"), nebo null. */
export function latestCzDate(dates) {
  let best = null, bestTs = -Infinity
  for (const d of dates) {
    const t = parseDate(d)?.getTime()
    if (t != null && !isNaN(t) && t > bestTs) { bestTs = t; best = d }
  }
  return best
}

/**
 * Stav smlouvy (MIMO skupinu) za měsíc.
 * - Nájem měsíčně: předpis getMonthRent (krácení podle dní); agreed = uhrazeno; méně než předpis = částečně.
 * - Nájem čtvrtletně/pololetně/ročně: měsíční díl = předpis / délka okna; okno je uhrazené jakoukoli platbou v okně.
 * - Zálohy jen u bytů (jako v Platbách): předpis getMonthDeposits (s pravidlem navazující smlouvy), méně = částečně.
 * Vrací { rent, deposit|null, status: 'paid'|'partial'|'unpaid', complete, completeDate }.
 */
export function contractMonthStatus(c, y, m, ctx) {
  const { payments = [], contracts = [], assets = [] } = ctx || {}
  const key = `${y}-${m}`
  const n = PERIOD_LEN[c.paymentFrequency] || 1
  let rent
  if (n > 1) {
    const keys = getPeriodMonthKeys(c, y, m)
    const win = payments.filter(p => p.contractId === c.id && p.paymentType !== 'deposit' && keys.includes(p.month))
    const p = win.find(x => x.month === key) || null
    const expected = getMonthRent(c, y, m) / n
    const paid = p ? (p.agreed ? expected : (Number(p.amount) || 0)) : 0
    rent = { expected, paid, status: win.length ? 'paid' : 'unpaid', payment: p || win[0] || null, date: (p || win[0])?.date || null }
  } else {
    const expected = getMonthRent(c, y, m)
    const p = payments.find(x => x.contractId === c.id && x.month === key && x.paymentType !== 'deposit') || null
    const paid = p ? (p.agreed ? expected : (Number(p.amount) || 0)) : 0
    const status = !p ? 'unpaid' : (p.agreed || paid >= expected - 0.01) ? 'paid' : 'partial'
    rent = { expected, paid, status, payment: p, date: p?.date || null }
  }
  let deposit = null
  const a = assets.find(x => x.id === c.assetId)
  if (a?.type === 'residential') {
    const expected = getMonthDeposits(c, y, m, contracts).deposit
    if (expected > 0) {
      const p = payments.find(x => x.contractId === c.id && x.month === key && x.paymentType === 'deposit') || null
      const paid = p ? (p.agreed ? expected : (Number(p.amount) || 0)) : 0
      const status = !p ? 'unpaid' : (p.agreed || paid >= expected - 0.01) ? 'paid' : 'partial'
      deposit = { expected, paid, status, payment: p, date: p?.date || null }
    }
  }
  const complete = rent.status === 'paid' && (!deposit || deposit.status === 'paid')
  const some = rent.status !== 'unpaid' || (deposit && deposit.status !== 'unpaid')
  return { rent, deposit, complete, status: complete ? 'paid' : some ? 'partial' : 'unpaid',
    completeDate: complete ? latestCzDate([rent.date, deposit?.date]) : null }
}

/** Členové skupiny účtovaní v měsíci (všechny smlouvy se stejným group_label, i ukončené v tom měsíci). */
export function groupMembersInMonth(label, y, m, contracts = []) {
  return contracts.filter(x => x.groupLabel === label && isContractBillable(x) && x.paymentFrequency !== 'Zahrnuto v nájemném' && isContractInMonth(x, y, m))
}

/** Stav skupinové platby za měsíc: { expected, paid, status, payment, members, completeDate }. */
export function groupMonthStatus(label, y, m, ctx) {
  const { payments = [], contracts = [] } = ctx || {}
  const key = `${y}-${m}`
  const members = groupMembersInMonth(label, y, m, contracts)
  const expected = members.reduce((s, x) => s + getMonthRent(x, y, m), 0)
  const p = payments.find(x => x.groupLabel === label && isGroupPayment(x) && x.month === key && x.paymentType !== 'deposit') || null
  const paid = p ? (p.agreed ? expected : (Number(p.amount) || 0)) : 0
  const status = !p ? 'unpaid' : (p.agreed || paid >= expected - 0.01) ? 'paid' : 'partial'
  return { expected, paid, status, payment: p, members, completeDate: status === 'paid' ? (p?.date || null) : null }
}

// ─────────────────────────────────────────
// NAVAZUJÍCÍ SMLOUVY – aby se nic nepočítalo dvakrát
// ─────────────────────────────────────────

/** Má smlouva na stejném předmětu pozdější (navazující) smlouvu? sameTenant = jen prodloužení téhož nájemce. */
export function hasSuccessor(c, contracts = [], sameTenant = false) {
  const sd = parseDate(c.start)
  if (!sd) return false // bez data začátku nelze určit pořadí smluv
  const s = sd.getTime()
  return contracts.some(o => o.id !== c.id && o.assetId === c.assetId && (o.status === 'active' || isContractBillable(o)) &&
    (!sameTenant || o.tenantId === c.tenantId) && (parseDate(o.start)?.getTime() ?? -Infinity) > s)
}

/** Smlouva „končí“ ve smyslu upozornění: platná, s datem konce a BEZ navazující smlouvy na předmětu. */
export function isEndingWithoutSuccessor(c, contracts = []) {
  return isContractOccupying(c) && !!parseDate(c.end) && !hasSuccessor(c, contracts)
}

/**
 * Z platných smluv vybere na každém předmětu tu, která platí DNES (začala); když dnes neplatí žádná,
 * vezme nejbližší budoucí. Pro součty nájmu – stará smlouva do konce + navazující od zítřka se nesečtou.
 */
export function currentPerAsset(list = []) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const byAsset = new Map()
  for (const c of list) {
    const k = c.assetId || c.id
    if (!byAsset.has(k)) byAsset.set(k, [])
    byAsset.get(k).push(c)
  }
  const out = []
  for (const cs of byAsset.values()) {
    const started = cs.filter(c => { const s = parseDate(c.start); return !s || s <= today })
    if (started.length) {
      // více současně platných smluv na předmětu (např. Ostatní / skupinové) → všechny, které dnes platí
      out.push(...started)
    } else {
      const sorted = [...cs].sort((a, b) => (parseDate(a.start)?.getTime() || 0) - (parseDate(b.start)?.getTime() || 0))
      out.push(sorted[0])
    }
  }
  return out
}

/**
 * Smlouva se účtuje / zobrazuje v historii plateb.
 * Aktivní vždy; ukončená (archived) jen s datem konce – platí do něj.
 */
export function isContractBillable(c) {
  if (!c) return false
  if (c.status === 'active') return true
  return c.status === 'archived' && !!parseDate(c.end)
}

/**
 * Smlouva zasahuje alespoň jedním dnem do daného měsíce (dle start/end).
 */
export function isContractInMonth(c, year, month) {
  const startD = parseDate(c.start)
  const endD   = parseDate(c.end)
  if (startD && startD > new Date(year, month + 1, 0)) return false
  if (endD && endD < new Date(year, month, 1)) return false
  return true
}

/**
 * Smlouva drží předmět nájmu k danému dni (default dnes).
 * Aktivní = obsazeno (i propadlá čekající na prodloužení); ukončená jen do data konce.
 */
export function isContractOccupying(c, date) {
  if (!c) return false
  if (c.status === 'active') return true
  if (c.status !== 'archived') return false
  const endD = parseDate(c.end)
  if (!endD) return false
  const d = date ? new Date(date) : new Date()
  d.setHours(0, 0, 0, 0)
  return endD >= d
}

/**
 * Smlouva, která aktuálně drží předmět nájmu (nebo null).
 * Při předávce (stará ukončená do 14. 10., nová od 15. 10.) vrací tu, která už začala.
 */
export function getCurrentAssetContract(contracts, assetId) {
  const holding = (contracts || []).filter(c => c.assetId === assetId && isContractOccupying(c))
  if (holding.length <= 1) return holding[0] || null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return holding.find(c => { const s = parseDate(c.start); return !s || s <= today }) || holding[0]
}

/**
 * Seřadí smlouvy dle uloženého ručního pořadí (rf_contract_order).
 * Smlouva bez vlastní pozice (např. navazující) převezme pozici předchozí smlouvy
 * na stejném předmětu nájmu; ostatní bez pozice zůstanou na konci v původním pořadí.
 */
export function applyContractOrder(items, order, allContracts = []) {
  if (!order) return items
  const pos = new Map(order.map((id, i) => [id, i]))
  const assetPos = new Map()
  for (const c of allContracts) {
    if (pos.has(c.id) && !assetPos.has(c.assetId)) assetPos.set(c.assetId, pos.get(c.id))
  }
  const key = (c) => pos.has(c.id) ? pos.get(c.id) : assetPos.has(c.assetId) ? assetPos.get(c.assetId) + 0.5 : Infinity
  return items
    .map((c, idx) => ({ c, idx, k: key(c) }))
    .sort((a, b) => (a.k === b.k ? a.idx - b.idx : a.k - b.k))
    .map(x => x.c)
}

/**
 * Ukončená smlouva, jejíž poslední den nájmu teprve přijde.
 */
export function isEndingArchived(c) {
  return c?.status === 'archived' && isContractOccupying(c)
}

/**
 * Datum splatnosti za měsíc (y, m) podle pole dueDay; null = nelze určit (např. "Dle vystavené faktury").
 * - "15. den v měsíci" (měsíční smlouvy) → 15. den daného měsíce
 * - "15. den předchozího měsíce …" (platba předem, byty) → 15. den předchozího měsíce (říjen do 15. 9.)
 * - "30. 4." (roční smlouvy) → toto datum v platebním okně, do kterého měsíc patří
 */
export const DUE_PREPAID = '15. den předchozího měsíce na měsíc následující'
export function dueDateFor(c, y, m) {
  const s = (c?.dueDay || '').trim()
  const freq = c?.paymentFrequency || 'Měsíčně'
  let mm = s.match(/^(\d{1,2})\.\s*den\s+předchozího/i)
  if (mm && (PERIOD_LEN[freq] || 1) === 1) {
    const dim = new Date(y, m, 0).getDate()
    return new Date(y, m - 1, Math.min(parseInt(mm[1]), dim))
  }
  mm = s.match(/^(\d{1,2})\.\s*den/)
  if (mm && (PERIOD_LEN[freq] || 1) === 1) {
    const dim = new Date(y, m + 1, 0).getDate()
    return new Date(y, m, Math.min(parseInt(mm[1]), dim))
  }
  mm = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.?$/)
  if (mm && freq === 'Ročně') {
    const [wy, wm] = getPeriodMonthKeys(c, y, m)[0].split('-').map(Number)
    let dt = new Date(wy, parseInt(mm[2]) - 1, parseInt(mm[1]))
    if (dt < new Date(wy, wm, 1)) dt = new Date(wy + 1, parseInt(mm[2]) - 1, parseInt(mm[1]))
    return dt
  }
  return null
}

/** Počet dní po splatnosti za měsíc (y, m); 0 = není po splatnosti / nelze určit. */
export function overdueDays(c, y, m) {
  const due = dueDateFor(c, y, m)
  if (!due) return 0
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return t > due ? Math.floor((t - due) / 86400000) : 0
}

/**
 * Platební okno (klíče "RRRR-M") víceměsíční smlouvy, do kterého patří refYear/refMonth.
 * Měsíčně → jen daný měsíc.
 */
export function getPeriodMonthKeys(contract, refYear, refMonth) {
  const freq = contract.paymentFrequency || 'Měsíčně'
  if (freq === 'Měsíčně' || freq === 'Zahrnuto v nájemném') {
    return [`${refYear}-${refMonth}`]
  }

  let startMonth = 0, startYear = refYear
  if (contract.start) {
    const parts = contract.start.split('.').map(p => p.trim())
    if (parts.length === 3) { startMonth = parseInt(parts[1]) - 1; startYear = parseInt(parts[2]) }
  }

  const periodLen = freq === 'Čtvrtletně' ? 3 : freq === 'Pololetně' ? 6 : 12

  if (freq === 'Čtvrtletně' || freq === 'Pololetně') {
    const refDate = new Date(refYear, refMonth, 1)
    let windowStart = new Date(startYear, startMonth, 1)
    let maxIter = 1000
    while (maxIter-- > 0) {
      const windowEnd = new Date(windowStart.getFullYear(), windowStart.getMonth() + periodLen - 1, 1)
      if (refDate >= windowStart && refDate <= windowEnd) break
      if (refDate < windowStart) { windowStart = new Date(windowStart.getFullYear(), windowStart.getMonth() - periodLen, 1); break }
      windowStart = new Date(windowStart.getFullYear(), windowStart.getMonth() + periodLen, 1)
    }
    return Array.from({ length: periodLen }, (_, i) => {
      const d = new Date(windowStart.getFullYear(), windowStart.getMonth() + i, 1)
      return `${d.getFullYear()}-${d.getMonth()}`
    })
  }

  if (freq === 'Ročně') {
    // "Platby dle kalendářního roku" → okno Jan–Dec refYear
    if (contract.calendarYearBilling) {
      return Array.from({ length: 12 }, (_, i) => `${refYear}-${i}`)
    }
    const refDate = new Date(refYear, refMonth, 1)
    let windowStart = new Date(startYear, startMonth, 1)
    while (new Date(windowStart.getFullYear() + 1, windowStart.getMonth(), 1) <= refDate) {
      windowStart = new Date(windowStart.getFullYear() + 1, windowStart.getMonth(), 1)
    }
    return Array.from({ length: 12 }, (_, i) => { const d = new Date(windowStart.getFullYear(), windowStart.getMonth() + i, 1); return `${d.getFullYear()}-${d.getMonth()}` })
  }

  return [`${refYear}-${refMonth}`]
}

// ─────────────────────────────────────────
// HISTORIE ZMĚN – starší záznamy obsahují ID (smlouvy, platby…) místo názvu
// ─────────────────────────────────────────
const LOG_ID_RE = /(\s*)([([]?)(?:ID:?\s*|id:\s*)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})([)\]]?)/gi

/**
 * Text záznamu historie pro ZOBRAZENÍ: ID existující smlouvy / platby / předmětu / nájemce nahradí názvem
 * („Byt 3 – Novák“, „Byt 3 – Novák, nájem 10/2026“). Když už název v textu je, ID jen vypustí.
 * Neznámé ID (smazaná položka) vypustí / nahradí „(položka již neexistuje)“. V DB se nic nemění.
 */
export function prettyLogDetail(detail, { contracts = [], payments = [], assets = [], tenants = [] } = {}) {
  if (!detail || !LOG_ID_RE.test(detail)) return detail
  LOG_ID_RE.lastIndex = 0
  const contractLabel = (c) => {
    const unit = assets.find(a => a.id === c.assetId)?.unit
    const tenant = tenants.find(t => t.id === c.tenantId)?.name
    return unit && tenant ? `${unit} – ${tenant}` : null
  }
  const resolve = (id) => {
    const c = contracts.find(x => x.id === id)
    if (c) return contractLabel(c)
    const p = payments.find(x => x.id === id)
    if (p) {
      const [y, m] = String(p.month || '').split('-').map(Number)
      const what = `${p.paymentType === 'deposit' ? 'zálohy' : 'nájem'}${isNaN(m) ? '' : ` ${m + 1}/${y}`}`
      if (isGroupPayment(p)) return p.groupLabel ? `skupina "${p.groupLabel}", ${what}` : null
      const pc = contracts.find(x => x.id === p.contractId)
      const cl = pc && contractLabel(pc)
      return cl ? `${cl}, ${what}` : null
    }
    return assets.find(a => a.id === id)?.unit || tenants.find(t => t.id === id)?.name || null
  }
  return detail.replace(LOG_ID_RE, (all, ws, open, id, close) => {
    const label = resolve(id.toLowerCase())
    // neznámé ID (smazaná položka): v závorce jen navíc k názvu → vypustit, jinak poznámka místo kódu
    if (!label) return open && close ? '' : `${ws}(položka již neexistuje)`
    if (detail.includes(label)) return ''
    return `${ws}${open}${label}${close}`
  })
}

// ─────────────────────────────────────────
// SALDO NÁJEMCE – předpis vs. zaplaceno od spuštění RentFlow (1. 1. 2026)
// ─────────────────────────────────────────
export const SALDO_FROM = { y: 2026, m: 0 }

/**
 * Saldo nájemce za měsíce PO SPLATNOSTI (od SALDO_FROM do dneška), STRIKTNĚ po firmách.
 * - Měsíc se počítá, jen když už uplynula splatnost (dueDateFor); bez určitelné splatnosti jen celé minulé měsíce.
 * - Nájem: předpis getMonthRent (víceměsíční smlouvy měsíční díl = předpis / délka okna, platba je uložená rozdělená).
 * - Skupina (group_label): předpis = součet členů, platba skupiny; nájemci připadá podíl jeho členů.
 * - Stav měsíce přes contractMonthStatus / groupMonthStatus (stejně jako Platby); zálohy jen u bytů.
 * - agreed = odsouhlaseno → měsíc vyrovnán.
 * Vrací { firms: [{ firm, rent, deposit }], items: [{ key, y, m, firm, label, kind, expected, paid, diff }] }; diff < 0 = dluh.
 */
export function tenantSaldo(tenantId, contracts = [], payments = [], assets = []) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const curY = today.getFullYear(), curM = today.getMonth()
  const ctx = { payments, contracts, assets }
  const mine = contracts.filter(c => c.tenantId === tenantId && isContractBillable(c) && c.paymentFrequency !== 'Zahrnuto v nájemném')
  const items = []
  const isDue = (c, y, m) => {
    const due = dueDateFor(c, y, m)
    if (due) return due < today
    return y < curY || (y === curY && m < curM)
  }
  // až do příštího měsíce – při platbě předem (DUE_PREPAID) je po 15. už po splatnosti i příští měsíc
  const endY = curM === 11 ? curY + 1 : curY, endM = (curM + 1) % 12
  for (let y = SALDO_FROM.y, m = SALDO_FROM.m; y < endY || (y === endY && m <= endM); m === 11 ? (y++, m = 0) : m++) {
    const key = `${y}-${m}`
    const seenGroups = new Set()
    for (const c of mine) {
      if (!isContractInMonth(c, y, m) || !isDue(c, y, m)) continue
      const firm = firmOf(contractSubject(c, assets))
      const unit = assets.find(a => a.id === c.assetId)?.unit || '—'
      if (c.groupLabel) {
        if (seenGroups.has(c.groupLabel)) continue
        seenGroups.add(c.groupLabel)
        const g = groupMonthStatus(c.groupLabel, y, m, ctx)
        // nájemci připadá podíl jeho členů skupiny
        const mineExp = g.members.filter(x => x.tenantId === tenantId).reduce((s, x) => s + getMonthRent(x, y, m), 0)
        const share = g.expected > 0 ? mineExp / g.expected : 0
        const paid = g.paid * share
        items.push({ key, y, m, firm, label: `🔗 ${c.groupLabel}`, kind: 'rent', expected: mineExp, paid, diff: paid - mineExp, groupLabel: c.groupLabel, groupExpected: g.expected, hasPayment: !!g.payment })
        continue
      }
      const st = contractMonthStatus(c, y, m, ctx)
      const n = PERIOD_LEN[c.paymentFrequency] || 1
      // víceměsíční: okno uhrazené kteroukoli platbou → měsíc vyrovnán (platba je rozdělená po měsících)
      const rentPaid = n > 1 && st.rent.status === 'paid' ? Math.max(st.rent.paid, st.rent.expected) : st.rent.paid
      items.push({ key, y, m, firm, label: unit, kind: 'rent', expected: st.rent.expected, paid: rentPaid, diff: rentPaid - st.rent.expected, contractId: c.id, multi: n > 1, hasPayment: !!st.rent.payment })
      if (st.deposit) {
        items.push({ key, y, m, firm, label: unit, kind: 'deposit', expected: st.deposit.expected, paid: st.deposit.paid, diff: st.deposit.paid - st.deposit.expected, contractId: c.id, hasPayment: !!st.deposit.payment })
      }
    }
  }
  const firms = []
  for (const it of items) {
    let f = firms.find(x => x.firm === it.firm)
    if (!f) { f = { firm: it.firm, rent: 0, deposit: 0 }; firms.push(f) }
    f[it.kind] += it.diff
  }
  firms.forEach(f => { f.rent = Math.round(f.rent); f.deposit = Math.round(f.deposit) })
  return { firms, items: items.map(it => ({ ...it, diff: Math.round(it.diff) })) }
}

// ─────────────────────────────────────────
// ZÁLOHY ZA ROK – podklad pro vyúčtování služeb
// Platby záloh (payment_type 'deposit') evidují zálohy na energie a služby; voda (komerční) je jen předpis.
// V měsíci předávky platí plné zálohy odcházející i nový nájemce.
// ─────────────────────────────────────────

/** Zálohy smlouvy po měsících roku: { tracked, months: [{ m, key, exp, water, paid }] } */
export function depositMonths(c, payments = [], assets = [], year, contracts = []) {
  const a = assets.find(x => x.id === c.assetId)
  const tracked = a?.type === 'residential' || payments.some(p => p.contractId === c.id && p.paymentType === 'deposit')
  const months = []
  if (!isContractBillable(c)) return { tracked, months }
  for (let m = 0; m < 12; m++) {
    if (!isContractInMonth(c, year, m)) continue
    const d = getMonthDeposits(c, year, m, contracts)
    if (d.deposit <= 0 && d.depositWater <= 0) continue
    const key = `${year}-${m}`
    const p = payments.find(x => x.contractId === c.id && x.month === key && x.paymentType === 'deposit')
    const paid = !p ? 0 : p.agreed ? d.deposit : (Number(p.amount) || 0)
    months.push({ m, key, exp: d.deposit, water: d.depositWater, paid })
  }
  return { tracked, months }
}

/** Řádky přehledu záloh za rok (jedna smlouva = jeden řádek), seřazené dle předmětu a začátku smlouvy. */
export function depositYearRows(contracts = [], payments = [], assets = [], year) {
  const rows = []
  for (const c of contracts) {
    const { tracked, months } = depositMonths(c, payments, assets, year, contracts)
    if (!months.length) continue
    const exp = months.reduce((s, x) => s + x.exp, 0)
    const water = months.reduce((s, x) => s + x.water, 0)
    const paid = months.reduce((s, x) => s + x.paid, 0)
    rows.push({ c, asset: assets.find(x => x.id === c.assetId), from: months[0].m, to: months[months.length - 1].m, months, exp, water, paid, tracked, diff: tracked ? paid - exp : null })
  }
  const startTs = (c) => parseDate(c.start)?.getTime() || 0
  return rows.sort((x, y) => (x.asset?.unit || '').localeCompare(y.asset?.unit || '', 'cs', { numeric: true }) || startTs(x.c) - startTs(y.c))
}

// ─────────────────────────────────────────
// DATUM ÚHRADY – zapamatování naposledy použitého data (zápis plateb podle bankovního výpisu)
// ─────────────────────────────────────────
const LAST_PAY_KEY = 'rf_last_pay_date'
/** Dnešní datum jako "RRRR-MM-DD" v místním čase. */
export function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** Naposledy použité datum úhrady ("RRRR-MM-DD"), jinak dnešek. */
export function getLastPayDate() {
  try {
    const v = localStorage.getItem(LAST_PAY_KEY)
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && v <= todayIso()) return v
  } catch { /* ignore */ }
  return todayIso()
}
/** Uloží datum úhrady ("RRRR-MM-DD") pro další zápis. */
export function setLastPayDate(iso) {
  try { if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) localStorage.setItem(LAST_PAY_KEY, iso) } catch { /* ignore */ }
}

/**
 * Poslední den pro výpověď / jednání o prodloužení: konec smlouvy − 1 den − výpovědní lhůta (měsíce).
 * Stejný výpočet jako ve formuláři smlouvy. null = bez konce nebo bez lhůty.
 */
export function noticeDeadline(c) {
  const end = parseDate(c?.end)
  const months = parseInt(c?.terminationMonths)
  if (!end || !months || months <= 0) return null
  const dayBefore = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1)
  const target = new Date(dayBefore.getFullYear(), dayBefore.getMonth() - months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return new Date(target.getFullYear(), target.getMonth(), Math.min(dayBefore.getDate(), lastDay))
}
