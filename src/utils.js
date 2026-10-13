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
  for (const c of activeContracts) {
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
    const rent = (ev.rent + (isRes ? ev.parking : 0) + ev.flatFee) / (PERIOD_LEN[c.paymentFrequency] || 1)
    const withDph = !isRes && (c.vatExempt === 2 ? true : c.vatExempt === 1 ? false : row.isVatPayer)
    if (withDph) row.dph += rent
    else row.noDph += rent
  }
  const idx = (n) => { const i = (firms || []).findIndex(f => f.name === n); return i < 0 ? 999 : i }
  return out.filter(r => r.dph + r.noDph > 0).sort((a, b) => idx(a.name) - idx(b.name))
}

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
 * Navazující smlouva začínající uprostřed měsíce na předmětu, který 1. den měsíce držela
 * jiná smlouva, účtuje zálohy až od dalšího měsíce (jinak by se v měsíci předávky
 * započítaly dvakrát). Nový nájemce na volném předmětu platí zálohy celé.
 */
export function getMonthDeposits(c, year, month, allContracts = []) {
  const v = getEffectiveValues(c, year, month)
  const first = new Date(year, month, 1)
  const startD = parseDate(c.start)
  if (startD && startD > first && startD.getFullYear() === year && startD.getMonth() === month) {
    const heldOnFirst = allContracts.some(o => {
      if (o.id === c.id || o.assetId !== c.assetId || !isContractBillable(o)) return false
      const os = parseDate(o.start), oe = parseDate(o.end)
      return (!os || os <= first) && (!oe || oe >= first)
    })
    if (heldOnFirst) return { deposit: 0, depositWater: 0 }
  }
  return { deposit: v.deposit, depositWater: v.depositWater }
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
 * - "30. 4." (roční smlouvy) → toto datum v platebním okně, do kterého měsíc patří
 */
export function dueDateFor(c, y, m) {
  const s = (c?.dueDay || '').trim()
  const freq = c?.paymentFrequency || 'Měsíčně'
  let mm = s.match(/^(\d{1,2})\.\s*den/)
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
