// ─────────────────────────────────────────
// SDÍLENÉ UTILITY FUNKCE
// Centralizované výpočty plateb – importovat do Payments, Dashboard, DetailPanel, AppContext
// ─────────────────────────────────────────

export const PERIOD_LEN = { 'Čtvrtletně': 3, 'Pololetně': 6, 'Ročně': 12 }

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
 * Amendments musí být seřazeny ASC dle effectiveFrom (zajišťuje AppContext/DB).
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
  for (const a of c.amendments) {
    const parts = (a.effectiveFrom || '').split('.').map(p => p.trim())
    if (parts.length !== 3) continue
    const aTs = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime()
    if (aTs > refTs) break // amendments jsou ASC – zbytek je v budoucnosti
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
 * Ukončená smlouva, jejíž poslední den nájmu teprve přijde.
 */
export function isEndingArchived(c) {
  return c?.status === 'archived' && isContractOccupying(c)
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
