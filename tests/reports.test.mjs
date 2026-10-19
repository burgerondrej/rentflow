// Test PDF reportu Po splatnosti (src/reports.js) – samostatně, payments.test.mjs přebírá i RentFlow Android (sync-core)
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 16, 12, 0, 0) })
const u = await import('../src/utils.js')
const { buildOverdueReportHtml } = await import('../src/reports.js')

const base = { status: 'active', paymentFrequency: 'Měsíčně', rent: 0, parking: 0, flatFee: 0, deposit: 0, depositWater: 0, amendments: [] }
const flat = { ...base, id: 'c-flat', assetId: 'a-flat', tenantId: 't1', start: '1. 1. 2026', end: '', rent: 10000, deposit: 3000, dueDay: u.DUE_PREPAID }
const office = { ...base, id: 'c-off', assetId: 'a-off', tenantId: 't2', start: '1. 1. 2026', end: '', rent: 20000, dueDay: '15. den v měsíci' }
const assets = [
  { id: 'a-flat', type: 'residential', unit: 'Byt 1', subject: 'FIRMA A – Byty' },
  { id: 'a-off', type: 'commercial', unit: 'Kancelář', subject: 'FIRMA A – Komerční prostory' },
]

test('report po splatnosti: nájemce, měsíce, telefon, součet a název souboru', () => {
  const items = u.overdueItems({ payments: [], contracts: [flat, office], assets }, s => u.firmOf(s) === 'FIRMA A').filter(i => i.y === 2026 && i.m >= 9)
  const tenants = { t1: { name: 'Novák', phone: '777 111 222' }, t2: { name: 'Firma s.r.o.' } }
  const { html, fileName } = buildOverdueReportHtml({ items, label: 'FIRMA A', tenantOf: c => tenants[c.tenantId], unitOf: c => assets.find(a => a.id === c.assetId)?.unit })
  assert.match(html, /Novák/)
  assert.match(html, /Listopad 2026/)
  assert.match(html, /tel\. 777 111 222/)
  const total = items.reduce((s, i) => s + i.owe, 0)
  assert.ok(html.includes(`${Math.round(total).toLocaleString('cs-CZ')} Kč`))
  assert.equal(fileName, 'RentFlow-Po-splatnosti-FIRMA-A-2026-10-16.pdf')
})
