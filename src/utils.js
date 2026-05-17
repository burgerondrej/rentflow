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
