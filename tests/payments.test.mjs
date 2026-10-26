// Automatické testy výpočtů plateb (src/utils.js) – spustit: npm test
// Scénáře nad vymyšlenými daty (žádná DB). „Dnešek“ je pevně 16. 10. 2026 (mock Date), aby výsledky nezávisely na dni spuštění.
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 16, 12, 0, 0) })
const u = await import('../src/utils.js')

const fmt = (d) => d ? `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}` : null
const base = { status: 'active', paymentFrequency: 'Měsíčně', rent: 0, parking: 0, flatFee: 0, deposit: 0, depositWater: 0, amendments: [] }
const flat = { ...base, id: 'c-flat', assetId: 'a-flat', tenantId: 't1', start: '1. 1. 2026', end: '', rent: 10000, deposit: 3000, dueDay: u.DUE_PREPAID }
const office = { ...base, id: 'c-off', assetId: 'a-off', tenantId: 't2', start: '1. 1. 2026', end: '', rent: 20000, dueDay: '15. den v měsíci' }
const assets = [
  { id: 'a-flat', type: 'residential', unit: 'Byt 1', subject: 'FIRMA A – Byty' },
  { id: 'a-off', type: 'commercial', unit: 'Kancelář', subject: 'FIRMA A – Komerční prostory' },
  { id: 'a-p1', type: 'parking', unit: 'Stání 1', subject: 'FIRMA B – Parkování' },
  { id: 'a-p2', type: 'parking', unit: 'Stání 2', subject: 'FIRMA B – Parkování' },
  { id: 'a-ad', type: 'ads', unit: 'Billboard', subject: 'FIRMA B – Reklama' },
]
const pay = (contractId, y, m, amount, extra = {}) => ({ id: `p-${contractId}-${y}-${m}-${extra.paymentType || 'rent'}`, contractId, month: `${y}-${m}`, amount, paymentType: 'rent', date: '1. 1. 2026', agreed: false, ...extra })

// ── Splatnost ──
test('splatnost: 15. den v měsíci = týž měsíc', () => {
  assert.equal(fmt(u.dueDateFor(office, 2026, 9)), '15. 10. 2026')
})
test('splatnost: platba předem = 15. předchozího měsíce (i přes rok)', () => {
  assert.equal(fmt(u.dueDateFor(flat, 2026, 9)), '15. 9. 2026')
  assert.equal(fmt(u.dueDateFor(flat, 2026, 0)), '15. 12. 2025')
  assert.equal(fmt(u.dueDateFor({ ...flat, dueDay: '31. den předchozího měsíce' }, 2026, 2)), '28. 2. 2026')
})
test('splatnost: roční „31. 3.“ v platebním okně', () => {
  const y = { ...office, paymentFrequency: 'Ročně', dueDay: '31. 3.' }
  assert.equal(fmt(u.dueDateFor(y, 2026, 9)), '31. 3. 2026')
})
test('splatnost: „Dle vystavené faktury“ se neurčuje', () => {
  assert.equal(u.dueDateFor({ ...office, dueDay: 'Dle vystavené faktury' }, 2026, 9), null)
})
test('dny po splatnosti (dnes 16. 10. 2026)', () => {
  assert.equal(u.overdueDays(flat, 2026, 9), 31)
  assert.equal(u.overdueDays(flat, 2026, 10), 1)
  assert.equal(u.overdueDays(office, 2026, 9), 1)
  assert.equal(u.overdueDays(office, 2026, 10), 0)
})

// ── Předpis ──
test('předpis: začátek uprostřed měsíce = poměrně podle dní', () => {
  const c = { ...office, start: '16. 10. 2026', rent: 3100 }
  assert.equal(u.getMonthRent(c, 2026, 9), 1600)
  assert.equal(u.getMonthRent(c, 2026, 10), 3100)
  assert.equal(u.getMonthRent(c, 2026, 8), 0)
})
test('předpis: paušál se nekrátí', () => {
  const c = { ...office, start: '16. 10. 2026', rent: 3100, flatFee: 500 }
  assert.equal(u.getMonthRent(c, 2026, 9), 2100)
})
test('zálohy: prodloužení TÉHOŽ nájemce uprostřed měsíce = jen jednou', () => {
  const old = { ...flat, id: 'old', end: '15. 10. 2026', status: 'archived' }
  const nw = { ...flat, id: 'new', start: '16. 10. 2026' }
  assert.equal(u.getMonthDeposits(old, 2026, 9, [old, nw]).deposit, 3000)
  assert.equal(u.getMonthDeposits(nw, 2026, 9, [old, nw]).deposit, 0)
  assert.equal(u.getMonthDeposits(nw, 2026, 10, [old, nw]).deposit, 3000)
})
test('zálohy: předávka JINÉMU nájemci uprostřed měsíce = platí oba', () => {
  const old = { ...flat, id: 'old', end: '15. 10. 2026', status: 'archived' }
  const nw = { ...flat, id: 'new', tenantId: 't9', start: '16. 10. 2026' }
  assert.equal(u.getMonthDeposits(nw, 2026, 9, [old, nw]).deposit, 3000)
})

// ── Stav měsíce ──
test('stav: byt – nájem zaplacen, zálohy ne = částečně', () => {
  const ctx = { payments: [pay('c-flat', 2026, 9, 10000)], contracts: [flat], assets }
  const s = u.contractMonthStatus(flat, 2026, 9, ctx)
  assert.equal(s.rent.status, 'paid')
  assert.equal(s.deposit.status, 'unpaid')
  assert.equal(s.status, 'partial')
  assert.equal(s.complete, false)
})
test('stav: odsouhlaseno (agreed) = uhrazeno bez ohledu na výši', () => {
  const ctx = { payments: [pay('c-off', 2026, 9, 1, { agreed: true })], contracts: [office], assets }
  assert.equal(u.contractMonthStatus(office, 2026, 9, ctx).status, 'paid')
})
test('stav: méně než předpis = částečně', () => {
  const ctx = { payments: [pay('c-off', 2026, 9, 15000)], contracts: [office], assets }
  assert.equal(u.contractMonthStatus(office, 2026, 9, ctx).status, 'partial')
})
test('stav: skupina – platba proti předpisu VŠECH členů', () => {
  const g1 = { ...office, id: 'g1', assetId: 'a-p1', rent: 1500, groupLabel: 'Skupina X' }
  const g2 = { ...office, id: 'g2', assetId: 'a-p2', rent: 1500, groupLabel: 'Skupina X' }
  const gp = (amount) => ({ id: 'gp', contractId: 'group:Skupina X', groupLabel: 'Skupina X', month: '2026-9', amount, paymentType: 'rent', date: '1. 10. 2026' })
  assert.equal(u.groupMonthStatus('Skupina X', 2026, 9, { payments: [gp(3000)], contracts: [g1, g2], assets }).status, 'paid')
  assert.equal(u.groupMonthStatus('Skupina X', 2026, 9, { payments: [gp(1500)], contracts: [g1, g2], assets }).status, 'partial')
  assert.equal(u.isGroupPayment(gp(1)), true)
})
test('stav: roční smlouva – okno uhrazené kteroukoli platbou v okně', () => {
  const y = { ...office, id: 'y', assetId: 'a-ad', paymentFrequency: 'Ročně', dueDay: '31. 3.', rent: 12000 }
  const ctx = { payments: [pay('y', 2026, 0, 1000)], contracts: [y], assets }
  const s = u.contractMonthStatus(y, 2026, 9, ctx)
  assert.equal(s.rent.status, 'paid')
  assert.equal(s.rent.expected, 1000)
})

// ── Po splatnosti (karta firmy + záložka v Platbách) ──
test('po splatnosti: byt předem = říjen i listopad, kancelář jen říjen', () => {
  const ctx = { payments: [], contracts: [flat, office], assets }
  const items = u.overdueItems(ctx).filter(i => i.y === 2026 && i.m >= 9)
  const keys = items.map(i => `${i.contract.id}|${i.m + 1}`).sort()
  assert.deepEqual(keys, ['c-flat|10', 'c-flat|11', 'c-off|10'])
  const nov = items.find(i => i.contract.id === 'c-flat' && i.m === 10)
  assert.equal(nov.owe, 13000) // nájem + zálohy
  assert.equal(nov.od, 1)
})
test('po splatnosti: zaplacené měsíce se nevypisují, filtr firmy funguje', () => {
  const payments = []
  for (let m = 0; m <= 10; m++) { payments.push(pay('c-flat', 2026, m, 10000)); payments.push(pay('c-flat', 2026, m, 3000, { paymentType: 'deposit' })) }
  const ctx = { payments, contracts: [flat, office], assets }
  assert.equal(u.overdueItems(ctx, s => u.firmOf(s) === 'FIRMA A').filter(i => i.contract.id === 'c-flat').length, 0)
  assert.equal(u.overdueItems(ctx, s => u.firmOf(s) === 'FIRMA B').length, 0)
})
test('po splatnosti: neuhrazená roční smlouva = jedna položka za celé okno', () => {
  const y = { ...office, id: 'y', assetId: 'a-ad', paymentFrequency: 'Ročně', dueDay: '31. 3.', rent: 12000 }
  const items = u.overdueItems({ payments: [], contracts: [y], assets })
  assert.equal(items.length, 1)
  assert.equal(items[0].periodKeys.length, 12)
  assert.equal(items[0].owe, 12000)
})
test('po splatnosti: částečná platba = zbývající částka, hasPayment', () => {
  const ctx = { payments: [pay('c-off', 2026, 9, 15000)], contracts: [office], assets }
  const it = u.overdueItems(ctx).find(i => i.m === 9 && i.y === 2026)
  assert.equal(it.owe, 5000)
  assert.equal(it.rent.hasPayment, true)
})

// ── Saldo ──
test('saldo: u platby předem zahrnuje i příští měsíc po splatnosti', () => {
  const payments = []
  for (let m = 0; m <= 8; m++) { payments.push(pay('c-flat', 2026, m, 10000)); payments.push(pay('c-flat', 2026, m, 3000, { paymentType: 'deposit' })) }
  const s = u.tenantSaldo('t1', [flat], payments, assets)
  assert.deepEqual(s.firms, [{ firm: 'FIRMA A', rent: -20000, deposit: -6000 }])
})

// ── Navazující smlouvy ──
test('navazující smlouva: součty nezdvojují (currentPerAsset), hasSuccessor', () => {
  const old = { ...office, id: 'old', end: '31. 10. 2026', status: 'archived' }
  const nw = { ...office, id: 'new', start: '1. 11. 2026' }
  assert.equal(u.hasSuccessor(old, [old, nw]), true)
  assert.deepEqual(u.currentPerAsset([old, nw]).map(c => c.id), ['old'])
})

// ── Historie ──
test('historie: ID smlouvy se při zobrazení nahradí názvem, neznámé v závorce zmizí', () => {
  const id = 'aaaaaaaa-1111-2222-3333-444444444444'
  const ctx = { contracts: [{ id, assetId: 'a-flat', tenantId: 't1' }], assets, tenants: [{ id: 't1', name: 'Novák' }], payments: [] }
  assert.equal(u.prettyLogDetail(`Archivována smlouva: ${id}`, ctx), 'Archivována smlouva: Byt 1 – Novák')
  assert.equal(u.prettyLogDetail('Smazána smlouva: Byt 2 (bbbbbbbb-1111-2222-3333-444444444444)', ctx), 'Smazána smlouva: Byt 2')
  assert.equal(u.prettyLogDetail('Bez ID', ctx), 'Bez ID')
})

// ── Platební morálka ──
test('platební morálka: pozdní a včasné platby, roční okno jen jednou', () => {
  const pays = [
    pay('c-off', 2026, 7, 20000, { date: '10. 8. 2026' }),   // včas (splatnost 15. 8.)
    pay('c-off', 2026, 8, 20000, { date: '20. 9. 2026' }),   // 5 dní pozdě
    pay('c-off', 2026, 9, 20000, { date: '30. 10. 2026' }),  // 15 dní pozdě
    pay('c-flat', 2026, 9, 10000, { date: '1. 10. 2026' }),  // byt předem: splatnost 15. 9. → 16 dní pozdě (jiný nájemce)
  ]
  const d = u.tenantPaymentDiscipline('t2', { payments: pays, contracts: [office, flat] })
  assert.deepEqual(d, { count: 3, late: 2, onTime: 1, avgLate: 10, maxLate: 15 })
  const y = { ...office, id: 'y', tenantId: 't3', paymentFrequency: 'Ročně', dueDay: '31. 3.' }
  const yp = Array.from({ length: 12 }, (_, m) => pay('y', 2026, m, 1000, { date: '10. 4. 2026', id: 'yp' + m }))
  assert.equal(u.tenantPaymentDiscipline('t3', { payments: yp, contracts: [y] }).count, 1)
})

// ── Hodnoty k datu (vývoj nájmu předmětu) ──
test('hodnoty k datu: dodatek uprostřed měsíce platí od svého dne', () => {
  const c = { ...office, amendments: [{ effectiveFrom: '15. 5. 2026', rent: 22000 }, { effectiveFrom: '5. 9. 2026', rent: 23000, flatFee: 500 }] }
  assert.equal(u.getEffectiveValuesAt(c, new Date(2026, 4, 14)).rent, 20000)
  assert.equal(u.getEffectiveValuesAt(c, new Date(2026, 4, 15)).rent, 22000)
  const v = u.getEffectiveValuesAt(c, new Date(2026, 8, 5, 18, 30))
  assert.equal(v.rent, 23000)
  assert.equal(v.flatFee, 500)
})
