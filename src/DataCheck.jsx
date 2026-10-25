import React, { useMemo, useState } from 'react'
import { useApp } from './AppContext.jsx'
import DialogShell from './DialogShell.jsx'
import { parseDate, isContractBillable, isContractOccupying, getCurrentAssetContract, contractSubject, isContractInMonth, getMonthRent, groupMonthStatus, isGroupPayment, dueDateFor, hasSuccessor, PERIOD_LEN } from './utils.js'
import { cauceInfo, fmtKc } from './CauceUI.jsx'
import { sectionMeters } from './MeterUI.jsx'

// Odečty měřidel se hlídají jen u smluv ukončených po zavedení měřidel (v1.4.3) – starší konce by zahltily kontrolu
const METERS_FROM = new Date(2026, 9, 22)
const CAUCE_GRACE_DAYS = 30

/**
 * Kontrola dat (jen čtení): najde nesrovnalosti, které rozbíjejí přehledy a platby.
 * Nic neopravuje – u každé položky je odkaz do detailu.
 */
/** Výpočet všech kontrol (sdílí dialog i proužek na Dashboardu). Vrací [{ id, icon, title, hint, items, tone }]. */
export function computeDataChecks({ contracts = [], assets = [], tenants = [], payments = [], subjects = [], objectFirms = [], firms = [], cauceSettlements = [], meterReadings = [], subjectData = [] }) {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const tenantOf = (c) => tenants.find(t => t.id === c.tenantId)
    const assetOf = (c) => assets.find(a => a.id === c.assetId)
    const label = (c) => `${assetOf(c)?.unit || '?'} · ${tenantOf(c)?.name || '?'}`
    const range = (c) => `${c.start || '?'} – ${c.end || 'neurčito'}`
    const out = []
    const add = (id, icon, title, hint, items, tone = 'amber') => out.push({ id, icon, title, hint, items, tone })

    // 1) Aktivní smlouvy s prošlým koncem
    add('expired', '⏰', 'Aktivní smlouvy s prošlým koncem', 'Prodlužte (navazující smlouva) nebo ukončete.',
      contracts.filter(c => c.status === 'active' && parseDate(c.end) && parseDate(c.end) < today)
        .map(c => ({ key: c.id, text: label(c), sub: `konec ${c.end}`, open: ['contract', c.id] })), 'red')

    // 2) Překryv smluv na jednom předmětu (kromě typu Ostatní)
    const overlaps = []
    const billable = contracts.filter(c => isContractBillable(c) && assetOf(c)?.type !== 'ostatni')
    const ts = (s, def) => parseDate(s)?.getTime() ?? def
    for (let i = 0; i < billable.length; i++) {
      for (let j = i + 1; j < billable.length; j++) {
        const a = billable[i], b = billable[j]
        if (a.assetId !== b.assetId) continue
        const aS = ts(a.start, -Infinity), aE = ts(a.end, Infinity), bS = ts(b.start, -Infinity), bE = ts(b.end, Infinity)
        if (aS <= bE && bS <= aE) overlaps.push({ key: a.id + b.id, text: `${assetOf(a)?.unit || '?'}: ${tenantOf(a)?.name || '?'} × ${tenantOf(b)?.name || '?'}`, sub: `${range(a)} / ${range(b)}`, open: ['asset', a.assetId] })
      }
    }
    add('overlap', '⚠️', 'Překrývající se smlouvy na jednom předmětu', 'Dvě smlouvy platí současně – zkontrolujte data začátku a konce.', overlaps, 'red')

    // 3) Ukončené smlouvy bez data konce (nezobrazují se v Platbách)
    add('noend', '📭', 'Ukončené smlouvy bez data konce', 'Bez data konce zmizí z historie plateb – doplňte poslední den nájmu.',
      contracts.filter(c => c.status === 'archived' && !parseDate(c.end))
        .map(c => ({ key: c.id, text: label(c), sub: `začátek ${c.start || '?'}`, open: ['contract', c.id] })))

    // 4) Smlouvy s chybějícím nájemcem nebo předmětem
    add('broken', '🧩', 'Smlouvy bez nájemce nebo předmětu', 'Nájemce nebo předmět byl smazán – smlouvu opravte nebo přesuňte do koše.',
      contracts.filter(c => !tenantOf(c) || !assetOf(c))
        .map(c => ({ key: c.id, text: label(c), sub: !tenantOf(c) ? 'chybí nájemce' : 'chybí předmět', open: ['contract', c.id] })), 'red')

    // 5) Předměty „obsazeno“ bez platné smlouvy
    add('occupied', '🏠', 'Předměty označené jako obsazené bez platné smlouvy', 'Stav předmětu neodpovídá smlouvám (obsazenost se počítá ze smluv).',
      assets.filter(a => a.status === 'occupied' && !getCurrentAssetContract(contracts, a.id))
        .map(a => ({ key: a.id, text: a.unit || '?', sub: a.subject, open: ['asset', a.id] })), 'gray')

    // 6) Předměty v neexistující sekci
    add('section', '🗂️', 'Předměty v neexistující sekci', 'Sekce byla přejmenována nebo smazána – předmět přiřaďte správné sekci.',
      assets.filter(a => a.status !== 'archived' && a.subject && !subjects.includes(a.subject))
        .map(a => ({ key: a.id, text: a.unit || '?', sub: a.subject, open: ['asset', a.id] })))

    // 7) Platby bez smlouvy / skupiny
    const ids = new Set(contracts.map(c => c.id))
    const groups = new Set(contracts.map(c => c.groupLabel).filter(Boolean))
    add('payments', '💳', 'Platby bez smlouvy', 'Smlouva platby byla smazána (je v koši?) – platba se nikde nezapočítá.',
      // skupinové platby mají contractId "group:<název>" (v DB NULL)
      payments.filter(p => {
        const isGroup = !p.contractId || p.contractId.startsWith('group:')
        if (isGroup) return !p.groupLabel || !groups.has(p.groupLabel)
        return !ids.has(p.contractId)
      })
        .map(p => ({ key: p.id, text: `${Number(p.amount || 0).toLocaleString('cs-CZ')} Kč · ${p.date || 'bez data'}`, sub: p.groupLabel ? `skupina ${p.groupLabel}` : `měsíc ${p.month}` })), 'gray')

    // 8) Duplicitní platby (stejná smlouva/skupina, měsíc a typ)
    const seen = new Map(), dups = []
    payments.forEach(p => {
      const k = `${p.contractId || 'g:' + p.groupLabel}|${p.month}|${p.paymentType || ''}`
      if (seen.has(k)) dups.push(p); else seen.set(k, p)
    })
    add('dups', '👯', 'Duplicitní platby', 'Stejná platba je zapsaná dvakrát – jednu smažte v detailu smlouvy.',
      dups.map(p => {
        const c = contracts.find(x => x.id === p.contractId)
        return { key: p.id, text: c ? label(c) : `skupina ${p.groupLabel}`, sub: `měsíc ${p.month} · ${Number(p.amount || 0).toLocaleString('cs-CZ')} Kč`, open: c ? ['contract', c.id] : null }
      }), 'red')

    // 8b) Platby nájmu zapsané na jednotlivou smlouvu, která je ve skupině – Platby/Dashboard je nezapočítají
    const grouped = new Map(contracts.filter(c => c.groupLabel).map(c => [c.id, c]))
    add('groupSingle', '🔗', 'Platby jednotlivé smlouvy ve skupině plateb', 'U skupiny se platí jednou za celou skupinu – tyto platby se nezapočítají. Smažte je a zapište platbu skupiny v Platbách.',
      payments.filter(p => p.paymentType !== 'deposit' && grouped.has(p.contractId))
        .map(p => { const c = grouped.get(p.contractId); return { key: p.id, text: label(c), sub: `skupina ${c.groupLabel} · měsíc ${p.month} · ${Number(p.amount || 0).toLocaleString('cs-CZ')} Kč`, open: ['contract', c.id] } }), 'red')

    // 8c) Platby za měsíc, kdy smlouva neplatila (nikde se nezapočítají – typicky špatně zvolený měsíc)
    const byId = new Map(contracts.map(c => [c.id, c]))
    add('outside', '📅', 'Platby za měsíc mimo platnost smlouvy', 'Platba je zapsaná na měsíc před začátkem nebo po konci smlouvy, proto se nikde nezapočítá. Zkontrolujte měsíc platby.',
      payments.filter(p => {
        const c = byId.get(p.contractId)
        if (!c || !p.month) return false
        const [y, m] = p.month.split('-').map(Number)
        return !isContractInMonth(c, y, m)
      }).map(p => {
        const c = byId.get(p.contractId)
        const [y, m] = p.month.split('-').map(Number)
        return { key: p.id, text: label(c), sub: `platba za ${m + 1}/${y} · ${Number(p.amount || 0).toLocaleString('cs-CZ')} Kč · smlouva ${range(c)}`, open: ['contract', c.id] }
      }), 'red')

    // 8d) Skupina plateb s různou splatností / četností členů – „po splatnosti“ se u skupiny počítá podle prvního člena
    const groupMembers = new Map()
    contracts.filter(c => c.groupLabel && isContractOccupying(c) && c.paymentFrequency !== 'Zahrnuto v nájemném')
      .forEach(c => { if (!groupMembers.has(c.groupLabel)) groupMembers.set(c.groupLabel, []); groupMembers.get(c.groupLabel).push(c) })
    add('groupDue', '⏳', 'Skupina plateb s různou splatností', 'Všechna místa ve skupině by měla mít stejnou splatnost i četnost plateb – jinak nesedí „po splatnosti“. Sjednoťte je v úpravě smluv.',
      [...groupMembers.entries()]
        .filter(([, list]) => new Set(list.map(c => c.dueDay || '')).size > 1 || new Set(list.map(c => c.paymentFrequency || 'Měsíčně')).size > 1)
        .map(([g, list]) => ({ key: g, text: `skupina ${g}`,
          sub: [...new Set(list.map(c => `${c.dueDay || 'bez splatnosti'} (${c.paymentFrequency || 'Měsíčně'})`))].join(' × '), open: ['contract', list[0].id] })))

    // 8e) Platba výrazně vyšší než předpis (nad 150 %) – typicky překlep v částce.
    // Měsíce s kráceným předpisem (začátek / konec smlouvy uprostřed měsíce) se nehodnotí – celá platba tam je běžná.
    const kcs = (n) => `${Math.round(Number(n) || 0).toLocaleString('cs-CZ')} Kč`
    const prorated = (c, y, m) => {
      const s0 = parseDate(c.start), e0 = parseDate(c.end)
      return (s0 && s0.getFullYear() === y && s0.getMonth() === m && s0.getDate() > 1) ||
        (e0 && e0.getFullYear() === y && e0.getMonth() === m && e0.getDate() < new Date(y, m + 1, 0).getDate())
    }
    const highPays = []
    payments.filter(p => p.paymentType !== 'deposit' && p.month).forEach(p => {
      const [y, m] = p.month.split('-').map(Number)
      if (isGroupPayment(p)) {
        if (!p.groupLabel || contracts.some(c => c.groupLabel === p.groupLabel && isContractInMonth(c, y, m) && prorated(c, y, m))) return
        const exp = groupMonthStatus(p.groupLabel, y, m, { payments, contracts, assets }).expected
        if (exp > 0 && Number(p.amount) > exp * 1.5) highPays.push({ key: p.id, text: `skupina ${p.groupLabel}`, sub: `${m + 1}/${y} · zaplaceno ${kcs(p.amount)}, předpis ${kcs(exp)}` })
        return
      }
      const c = byId.get(p.contractId)
      if (!c || prorated(c, y, m)) return
      const exp = getMonthRent(c, y, m) / (PERIOD_LEN[c.paymentFrequency] || 1)
      if (exp > 0 && Number(p.amount) > exp * 1.5) highPays.push({ key: p.id, text: label(c), sub: `${m + 1}/${y} · zaplaceno ${kcs(p.amount)}, předpis ${kcs(exp)}`, open: ['contract', c.id] })
    })
    add('highPay', '💸', 'Platba výrazně vyšší než předpis', 'Platba přes 150 % předpisu – zkontrolujte částku (překlep, nula navíc), případně měsíc platby.', highPays)

    // 8f) Dodatek s účinností mimo platnost smlouvy (nikdy se neprojeví, nebo platí od začátku)
    add('amendRange', '📝', 'Dodatky s účinností mimo platnost smlouvy', 'Datum účinnosti dodatku je před začátkem nebo po konci smlouvy – zkontrolujte datum v záložce Dodatky.',
      contracts.flatMap(c => (c.amendments || []).map(a => ({ c, a }))).filter(({ c, a }) => {
        const e = parseDate(a.effectiveFrom), s = parseDate(c.start), en = parseDate(c.end)
        return e && ((s && e < s) || (en && e > en))
      }).map(({ c, a }) => ({ key: a.id || `${c.id}|${a.effectiveFrom}`, text: label(c), sub: `dodatek od ${a.effectiveFrom} · smlouva ${range(c)}`, open: ['contract', c.id] })))

    // 8g) Duplicitní nájemci (stejné jméno nebo IČO)
    const norm = (t) => String(t || '').trim().toLowerCase().replace(/\s+/g, ' ')
    const dupKeys = new Map()
    tenants.filter(t => t.status !== 'archived').forEach(t => {
      ;[norm(t.name) && 'n:' + norm(t.name), norm(t.ico) && 'i:' + norm(t.ico).replace(/\s/g, '')].filter(Boolean)
        .forEach(k => { if (!dupKeys.has(k)) dupKeys.set(k, []); dupKeys.get(k).push(t) })
    })
    const dupSeen = new Set()
    add('dupTenant', '👥', 'Duplicitní nájemci', 'Dva nájemci se stejným jménem nebo IČO – sloučte smlouvy pod jednoho (saldo a přehledy jsou jinak rozdělené).',
      [...dupKeys.entries()].filter(([, l]) => l.length > 1).flatMap(([k, l]) => {
        const id = l.map(t => t.id).sort().join('|')
        if (dupSeen.has(id)) return []
        dupSeen.add(id)
        return [{ key: id, text: l[0].name, sub: `${l.length}× ${k.startsWith('i:') ? `stejné IČO ${l[0].ico}` : 'stejné jméno'}`, open: ['tenant', l[0].id] }]
      }))

    // 8h) Splatnost, ze které nejde určit termín (informativně – „po splatnosti“ se u nich nehlídá)
    add('dueUnknown', '❔', 'Splatnost bez určitelného termínu', 'U těchto smluv appka nepozná datum splatnosti, takže je nehlídá „po splatnosti“. Pokud to vadí, nastavte splatnost z nabídky (den v měsíci, konkrétní datum).',
      contracts.filter(c => isContractOccupying(c) && c.paymentFrequency !== 'Zahrnuto v nájemném' && c.dueDay && c.dueDay !== 'Dle vystavené faktury')
        .filter(c => { const n = new Date(); return !dueDateFor(c, n.getFullYear(), n.getMonth()) })
        .map(c => ({ key: c.id, text: label(c), sub: `${c.dueDay} (${c.paymentFrequency || 'Měsíčně'})`, open: ['contract', c.id] })), 'gray')

    // 8i) Odchod nájemce bez odečtu měřidel – stačí odečet „Odchod“ na smlouvě nebo „Nástup“ na další smlouvě jiného nájemce.
    // Prodloužení téhož nájemce se nehlídá (nikdo neodchází); sekce bez měřidel také ne.
    const hasReading = (contractId, kind) => meterReadings.some(r => r.contractId === contractId && r.kind === kind)
    add('meterOut', '🔢', 'Odchod nájemce bez odečtu měřidel', 'Zapište stavy měřidel při odchodu v detailu smlouvy (nebo stav při nástupu u nového nájemce).',
      contracts.filter(c => {
        const e = parseDate(c.end)
        if (c.status !== 'archived' || !e || e < METERS_FROM || e >= today) return false
        const a = assetOf(c)
        if (!sectionMeters(subjectData.find(s => s.name === a?.subject) || { assetType: a?.type }).length) return false
        if (hasSuccessor(c, contracts, true) || hasReading(c.id, 'odchod')) return false
        const s0 = parseDate(c.start)?.getTime() ?? -Infinity
        return !contracts.some(o => o.id !== c.id && o.assetId === c.assetId && o.tenantId !== c.tenantId &&
          (parseDate(o.start)?.getTime() ?? -Infinity) > s0 && hasReading(o.id, 'nastup'))
      }).map(c => ({ key: c.id, text: label(c), sub: `konec ${c.end}`, open: ['contract', c.id] })))

    // 8j) Kauce stále „k vrácení“ víc než 30 dní po konci smlouvy
    add('cauceOpen', '💰', 'Nevypořádaná kauce po konci smlouvy', `Kauce je víc než ${CAUCE_GRACE_DAYS} dní po konci smlouvy stále „k vrácení“ – vypořádejte ji v detailu smlouvy nebo ve Smlouvách → 💰 Kauce.`,
      contracts.filter(c => {
        const e = parseDate(c.end)
        return e && (today - e) / 86400000 > CAUCE_GRACE_DAYS && cauceInfo(c, contracts, cauceSettlements)?.status === 'toReturn'
      }).map(c => ({ key: c.id, text: label(c), sub: `${fmtKc(c.cauce)} · konec ${c.end}`, open: ['contract', c.id] })))

    // 8k) Platná smlouva bytu bez kauce (informativně – byt bez kauce může být záměr)
    add('noCauce', '🔐', 'Byty bez kauce', 'Platná smlouva bytu nemá zapsanou kauci – pokud byla složena, doplňte ji v úpravě smlouvy.',
      contracts.filter(c => isContractOccupying(c) && assetOf(c)?.type === 'residential' && !(Number(c.cauce) > 0))
        .map(c => ({ key: c.id, text: label(c), sub: `smlouva ${range(c)}`, open: ['contract', c.id] })), 'gray')

    // 9) Budovy bez firmy
    add('objects', '🏛️', 'Budovy bez firmy', 'Přiřaďte budovu firmě v Nastavení → Firmy a sekce (jinak chybí ve filtrech Revizí a Nákladů).',
      objectFirms.filter(o => !o.firm || !firms.some(f => f.name === o.firm)).map(o => ({ key: o.name, text: o.name, sub: o.firm || 'bez firmy' })), 'gray')

    // 10) Nájemci s platnou smlouvou bez kontaktu
    add('contact', '📵', 'Nájemci s platnou smlouvou bez telefonu i e-mailu', 'Doplňte kontakt v detailu nájemce.',
      tenants.filter(t => contracts.some(c => c.tenantId === t.id && isContractOccupying(c)) && !t.phone && !t.email)
        .map(t => ({ key: t.id, text: t.name, sub: contracts.filter(c => c.tenantId === t.id && isContractOccupying(c)).map(c => contractSubject(c, assets)).filter(Boolean)[0] || '', open: ['tenant', t.id] })), 'gray')

    return out
}

/** Počet položek, které stojí za pozornost (červené a oranžové kontroly; šedé jsou jen informativní). */
export function dataCheckAlerts(checks) {
  const important = checks.filter(c => (c.tone === 'red' || c.tone === 'amber') && c.items.length > 0)
  return { total: important.reduce((s, c) => s + c.items.length, 0), groups: important, signature: important.flatMap(c => c.items.map(i => c.id + ':' + i.key)).sort().join('|') }
}

export default function DataCheck({ onClose, onOpen }) {
  const { contracts = [], assets = [], tenants = [], payments = [], subjects = [], objectFirms = [], firms = [], cauceSettlements = [], meterReadings = [], subjectData = [] } = useApp()
  const [open, setOpen] = useState(null)
  const checks = useMemo(() => computeDataChecks({ contracts, assets, tenants, payments, subjects, objectFirms, firms, cauceSettlements, meterReadings, subjectData }),
    [contracts, assets, tenants, payments, subjects, objectFirms, firms, cauceSettlements, meterReadings, subjectData])

  const problems = checks.filter(c => c.items.length > 0)
  const total = problems.reduce((s, c) => s + c.items.length, 0)

  return (
    <DialogShell icon="🩺" title="Kontrola dat" subtitle={total ? `Nalezeno ${total} ${total === 1 ? 'položka' : total < 5 ? 'položky' : 'položek'} k ověření` : 'Vše v pořádku'}
      tone={total ? 'amber' : 'green'} width={720} onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Zavřít</button>}>
      {checks.map(ch => {
        const n = ch.items.length
        const expanded = open === ch.id
        return (
          <div key={ch.id} style={{ border: `1.5px solid ${n ? `var(--tone-${ch.tone}-border)` : 'var(--border)'}`, borderRadius: 12, marginBottom: 8, overflow: 'hidden' }}>
            <button type="button" onClick={() => n && setOpen(expanded ? null : ch.id)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: 'none', textAlign: 'left',
                background: n ? `var(--tone-${ch.tone}-soft)` : 'var(--bg)', cursor: n ? 'pointer' : 'default', fontFamily: 'inherit' }}>
              <span style={{ fontSize: 17 }}>{ch.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: n ? `var(--tone-${ch.tone}-text)` : 'var(--text2)' }}>{ch.title}</span>
                {n > 0 && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text2)', marginTop: 1 }}>{ch.hint}</span>}
              </span>
              <span style={{ fontSize: 13, fontWeight: 900, color: n ? `var(--tone-${ch.tone}-text)` : 'var(--tone-green-text)', whiteSpace: 'nowrap' }}>{n ? `${n} ${expanded ? '▲' : '▼'}` : '✓'}</span>
            </button>
            {expanded && ch.items.slice(0, 100).map(it => (
              <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px 7px 41px', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>{it.text}</span>
                  {it.sub && <span style={{ color: 'var(--text3)' }}> · {it.sub}</span>}
                </span>
                {it.open && onOpen && <button className="btn btn-sm" onClick={() => onOpen(it.open[0], it.open[1])}>Otevřít ➔</button>}
              </div>
            ))}
          </div>
        )
      })}
    </DialogShell>
  )
}
