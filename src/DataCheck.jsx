import React, { useMemo, useState } from 'react'
import { useApp } from './AppContext.jsx'
import DialogShell from './DialogShell.jsx'
import { parseDate, isContractBillable, isContractOccupying, getCurrentAssetContract, contractSubject } from './utils.js'

/**
 * Kontrola dat (jen čtení): najde nesrovnalosti, které rozbíjejí přehledy a platby.
 * Nic neopravuje – u každé položky je odkaz do detailu.
 */
export default function DataCheck({ onClose, onOpen }) {
  const { contracts = [], assets = [], tenants = [], payments = [], subjects = [], objectFirms = [], firms = [] } = useApp()
  const [open, setOpen] = useState(null)

  const checks = useMemo(() => {
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
      payments.filter(p => (p.contractId && !ids.has(p.contractId)) || (!p.contractId && p.groupLabel && !groups.has(p.groupLabel)) || (!p.contractId && !p.groupLabel))
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

    // 9) Budovy bez firmy
    add('objects', '🏛️', 'Budovy bez firmy', 'Přiřaďte budovu firmě v Nastavení → Firmy a sekce (jinak chybí ve filtrech Revizí a Nákladů).',
      objectFirms.filter(o => !o.firm || !firms.some(f => f.name === o.firm)).map(o => ({ key: o.name, text: o.name, sub: o.firm || 'bez firmy' })), 'gray')

    // 10) Nájemci s platnou smlouvou bez kontaktu
    add('contact', '📵', 'Nájemci s platnou smlouvou bez telefonu i e-mailu', 'Doplňte kontakt v detailu nájemce.',
      tenants.filter(t => contracts.some(c => c.tenantId === t.id && isContractOccupying(c)) && !t.phone && !t.email)
        .map(t => ({ key: t.id, text: t.name, sub: contracts.filter(c => c.tenantId === t.id && isContractOccupying(c)).map(c => contractSubject(c, assets)).filter(Boolean)[0] || '', open: ['tenant', t.id] })), 'gray')

    return out
  }, [contracts, assets, tenants, payments, subjects, objectFirms, firms])

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
