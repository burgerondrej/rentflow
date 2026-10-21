# RentFlow — desktop (CLAUDE.md)

Tento soubor je jediný zdroj pravdy pro vývoj RentFlow desktop (nahrazuje Project Knowledge DOCX v0.63).
Komunikace: česky, přímo, stručně, bez vaty. Šetři tokeny.

## 1. Pracovní režim (POVINNÉ)

- Diagnóza před opravou. Nikdy nestřílet naslepo. Nejdřív najdi root cause (statická analýza, pak runtime diagnostika).
- Když zadání nebo bug není 100% jasný, NEJDŘÍV se zeptej. Neplýtvej opravami na prázdno. Klidně si řekni o screenshot.
- Před opravou projdi VŠECHNY soubory, kde se stejný vzor může vyskytovat (ne jen ten zjevný).
- Minimální rozsah změn. Nic, co může rozbít jinou funkčnost.
- ZÁKAZ změn UI/UX bez explicitního souhlasu.
- Nejdřív navrhni plán (co, kde, proč), počkej na souhlas, teprve pak edituj.
- Po každé úpravě vypiš: seznam změněných souborů (s cestou), postup testu (konkrétní kroky v appce), případný build postup.
- Po změně Rust souborů (commands.rs, models.rs, db.rs) ověř kompilaci: `cd src-tauri; cargo check`.
- Po změně frontendu ověř: `npm run build`. Po změně výpočtů v utils.js navíc `npm test` (pevné „dnes“ 16. 10. 2026). `tests/payments.test.mjs` testuje JEN utils.js (přebírá ho i RentFlow Android) – testy ostatních souborů do vlastních souborů (např. `tests/reports.test.mjs`).
- Pracovat v JEDNÉ složce `C:\Users\ondra\rentflow`. Pokud session běží ve worktree, před testem změny commitni a srovnej hlavní složku (`git -C C:\Users\ondra\rentflow merge --ff-only <větev>`) – Ondra testuje vždy z hlavní složky.
- Ke každé žádosti o test přidej spustitelný blok: `cd C:\Users\ondra\rentflow; npm run tauri:dev` (před testem připomenout Ctrl+S).
- Změny UI dělej po blocích; větší grafické změny nejdřív jako náhled (mockup) k odsouhlasení.

## 2. Git a release — TVRDÁ PRAVIDLA

- Release (zvýšení verze, commit, push do main, tag, push tagu) dělá Claude SÁM, celý až do konce – ale VÝHRADNĚ po Ondrově výslovném schválení releasu po otestování v `npm run tauri:dev`. Bez schválení nikdy nepushovat ani netagovat.
- NIKDY: `git push --force` / `-f`, `git reset --hard`, `git rebase`, mazání větví, mazání či přepis existujícího tagu. Když push neprojde (není fast-forward), zastavit a ohlásit.
- `git add` / `git commit` mimo release jen na výslovný pokyn.
- Na začátku práce zkontroluj `git status` – pokud není čisto, upozorni.
- NIKDY neměň `.github/workflows/release.yml` bez výslovného souhlasu.
- NIKDY nepoužívat `tauri-action@v0.5` (spouští `tauri init --ci`, rozbije build).
- Do repa nikdy neukládej hesla, klíče, tokeny. Podpisový klíč je mimo repo: `C:\Users\ondra\Documents\rentflow-updater.key` – nikdy ho nečti ani nekopíruj.

Release workflow (po schválení provede Claude sám, bez Ondrova zásahu):
1. Zvýšit verzi (povinné): ručně `version` v `src-tauri/tauri.conf.json` A ZÁROVEŇ `npm version X.X.X --no-git-tag-version` (package.json + package-lock.json). Všechny tři musí sedět.
2. Ověřit `npm test` + `npm run build` (+ `cargo check` při změně Rustu). `git add` jen záměrné soubory → `git commit -m "vX.X.X: popis"`.
3. Push do main: z main checkoutu `git push origin main`, z worktree `git push origin HEAD:main` (jen fast-forward).
4. `git tag vX.X.X` → ověřit, že tag ukazuje na pushnutý HEAD (`git log -1 --oneline`, `git show vX.X.X --stat`) → `git push origin vX.X.X`.
5. GitHub Actions (~15 min): build + podpis → `.nsis.zip` do `burgerondrej/rentflow-releases` → `latest.json` do `burgerondrej/rentflow-updates`.
6. Ověření: `Invoke-RestMethod https://burgerondrej.github.io/rentflow-updates/latest.json` (verze musí sedět) – Claude hlídá sám a ohlásí výsledek.
7. Pracoval-li Claude ve worktree: srovnat lokální main (`git -C C:\Users\ondra\rentflow fetch origin` + `git -C C:\Users\ondra\rentflow merge --ff-only origin/main`).
Release se spouští JEN pushnutím tagu. Push do main bez tagu release nedělá.

Repa: `burgerondrej/rentflow` (private, zdroj), `burgerondrej/rentflow-releases` (public, binárky), `burgerondrej/rentflow-updates` (GitHub Pages, latest.json).
Secrets: TAURI_PRIVATE_KEY, TAURI_KEY_PASSWORD, PAGES_TOKEN, RELEASES_TOKEN.

## 3. Projekt

- Tauri v1 + React 18 + Vite 5 + Rust + SQLite (WAL, FOREIGN KEYS ON). Font DM Sans.
- Složka: `C:\Users\ondra\rentflow`. App identifier: `cz.rentflow.app`.
- Produkční DB: `%APPDATA%\cz.rentflow.app\rentflow\rentflow.db` – NIKDY na ni nesahej, nečti ji zápisem, nekopíruj. Pro testy jen kopie.
- Lokalizace CZ, CZK, datum D.M.RRRR.
- Uživatelé: Ondra (admin) + Pavel (read-only mirror přes GDrive). `const ADMIN_PIN` v kódu NIKDY nepřepisovat.
- Dev: `npm run tauri:dev`. Build: `npm run tauri:build`.
- Ctrl+S v appce = záloha `YYYY-MM-DD_HHMM.db` + kopie DB a documents/ na GDrive.

Klíčové soubory:
- `src/utils.js` – parseDate, getEffectiveValues/Today, getMonthRent/RentParking, getMonthDeposits, isContractBillable/InMonth/Occupying, getCurrentAssetContract, getPeriodMonthKeys, applyContractOrder, dueDateFor/overdueDays, firmOf/sectionOf, firmSelection/selectionMatches/selectionLabel, firmColors (paleta firem), ASSET_TYPES/assetTypeStyle, contractSubject, tenantRentsByFirm; **stav platby** contractMonthStatus / groupMonthStatus / isGroupPayment; hasSuccessor / currentPerAsset / isEndingWithoutSuccessor; tenantSaldo (SALDO_FROM = 1. 1. 2026); **po splatnosti** overdueItems / dueDateFor / overdueDays / DUE_PREPAID; depositMonths / depositYearRows; noticeDeadline; getLastPayDate / setLastPayDate; prettyLogDetail (ID v historii → název při zobrazení); tenantPaymentDiscipline (platební morálka – úhrada vs. splatnost, 12 měsíců).
- `src/UI.jsx` – SectionHeader / SectionCard (hlavička sekce), Segmented (přepínač/záložky), EmptyState (prázdný stav).
- `src/CauceUI.jsx` – kauce: cauceInfo (held / toReturn / transferred = převzatá navazující smlouvou téhož nájemce / settled), CauceSettleFields (vrátit / započíst / později – okno ukončení a změna nájemce), CauceSettleDialog. Přehled ve Smlouvách → „💰 Kauce“, řádek v detailu smlouvy.
- `src/DebtNoteUI.jsx` – poznámka k dlužníkovi + „slíbil zaplatit do“ (nájemce + firma): DebtNoteLine, DebtNoteDialog, promiseState. Platby → Po splatnosti, saldo v detailu nájemce, PDF report.
- `src/MeterUI.jsx` – stavy měřidel ke smlouvě (nástup / odchod / průběžný). Měřidla určuje sekce (subjects.meters: '' = výchozí podle typu – byt topení + SV + TV, komerční + chlazení; 'none' = žádná; jinak výčet); topení a chlazení s ručně zapsanou jednotkou.
- `src/DialogShell.jsx` – jednotná kostra všech dialogů (ikona, nadpis, ✕, patička); isDialogOpen() – Esc zavírá jen horní dialog.
- `src/shortcuts.js` – Ctrl+N (událost rf-new, useNewShortcut), isTyping/isOverlayOpen, předání filtru Plateb / Smluv z jiné obrazovky.
- `src/ChangeTenantDialog.jsx` – změna nájemce na předmětu (changeTenant v AppContext). `src/FirmsSettings.jsx` – Nastavení → firmy, sekce, budovy. `src/DataCheck.jsx` – kontrola dat (computeDataChecks, proužek na Dashboardu; 1× za 14 dní se proužek ukáže znovu i se zavřenými nálezy – localStorage rf_datacheck_review). `src/ContractHistory.jsx` – záložka Historie smlouvy (search_logs).
- `src/FirmUI.jsx` – FirmBadge (zkratka firmy), FirmRentSummary (součty po firmách), FirmPicker (strom firma → sekce/budova, „Vše“), FirmPickerButton (horní lišta), useObjectFirms (budovy po firmách), progressStat.
- `src/StatusUI.jsx` – STATUS (jednotný slovník stavů), StatusPill, contractStatus(c).
- `src/RenewContractsDialog.jsx` – navazující smlouvy (hromadné prodloužení).
- `src/views/Calendar.jsx` – kalendář (konce smluv, revize, úkoly); buildCalendarEvents sdílí Dashboard.
- `src/AppContext.jsx` – Tauri IPC bridge, state, theme, showToast(message, type), confirmAction({ title, text, okLabel, danger, onOk }) – společné potvrzovací okno, removePayments (zrušení plateb s potvrzením). archiveContract kontroluje jiné aktivní smlouvy.
- `src/App.jsx` – AppWithActivation wrapper, Ctrl+F (i podle částky předpisu ±1 Kč a čísla účtu nájemce), Ctrl+S, PIN modal, auto-update check po 3 s. Zásobník detailů (openDetail / closeDetail / closeAllDetails, onReturn). Štítek „💾 Poslední záloha“ (get_sync_status: čas kopie rentflow.db na Google Disku + neuložené změny), klik = Ctrl+S.
- `src/DetailPanel.jsx` – detaily smlouvy / předmětu / nájemce: barevný pás + klíčové údaje + záložky (smlouva: Přehled/Platby/Dodatky/Dokumenty; předmět: Přehled/Smlouvy/Dokumenty; nájemce: Přehled/Smlouvy/Platby/Dokumenty). Podíl na platbě skupiny (jen zobrazení).
- `src/views/Payments.jsx` – platební logika (viz níže). Záložky: Přehled za měsíc / Historie 6 měsíců / ⚠ Po splatnosti (všechny měsíce, Zapsat, Report PDF). `src/reports.js` – HTML PDF reportu Po splatnosti (buildOverdueReportHtml, REPORT_CSS).
- `src/views/Export.jsx` – PDF přes getEffectiveValuesToday(c), sloupec Paušál. PDF = Edge headless `--print-to-pdf` (bez Google Fonts @import).
- `src/ActivationScreen.jsx` – aktivace (hash SHA-256 v Rustu, stav v settings.json "activated").
- `src-tauri/src/db.rs` – migrace (seed subjektů ODSTRANĚN, fresh install = prázdné tabulky). Tabulky v1.4.3: cauce_settlements (contract_id PK), debt_notes (UNIQUE tenant_id + firm; přejmenování firmy je propisuje), meter_readings (vč. cooling, heat_unit, cooling_unit), subjects.meters – bez FK na smlouvy (obnova z koše). `main.rs`: při prvním spuštění nové verze (`last_version.txt`) záloha DB PŘED migracemi → `backups/backup-…-pred-vX.Y.Z.db` (VACUUM INTO).
- `src-tauri/src/commands.rs` – verify_activation, check_activation, load_settings (odstraňuje UTF-8 BOM), backup.

Subjekty jsou VÝHRADNĚ v tabulce `subjects` (name, asset_type, is_vat_payer, short_name, color, sort_order). Název = „FIRMA – Sekce“ (oddělovač ` – ` EN DASH), firma = část před oddělovačem.
Firmy v pořadí: METROPOLE CB (MCB, wine), Bürger Pavel (BP, royal), METROPOLE CZ (MCZ, violet), JIHOTANK (JT, teal), JIHOTANK CB (JCB, orange), Ostatní (OST, slate). JIHOTANK / JIHOTANK CB / MCZ mají sekce „– Komerční prostory“ a „– Parkování“. Prázdné sekce se v UI nezobrazují (kromě formuláře předmětu).
Budovy (`objects`, sloupec `firm`) patří firmám – Revize a Provozní náklady filtrují firma → budova. Načítání: get_subjects(), get_objects(), get_object_firms().

## 4. Absolutní pravidla kódu

- NIKDY hardcoded názvy firem/subjektů v JS – vždy z DB přes context.
- DPH: isVatPayer z billingGroups.find(...) – NIKDY startsWith("firma").
- Žádné UI knihovny (MUI, Tailwind…) – jen inline styles + styles.css.
- NIKDY window.confirm() → ConfirmDialog (props: title, text, danger, okLabel, onOk). NIKDY alert() → showToast().
- JS nikdy negeneruje ID – UUID výhradně v Rustu.
- Každý Rust struct s `id: String` musí mít `#[serde(default)]`. `EMPTY_FORM.id` = `""`, nikdy `null`.
- VIEWS v App.jsx volat `{ActiveView()}`, NE `<ActiveView />` (remount, ztráta stavu). Každá položka VIEWS MUSÍ být `() => <View … />`, NIKDY samotná komponenta (`history: History`) – ta by se zavolala jako funkce a její hooky by patřily App → po přidání hooku bílá obrazovka (bug Logu aktivity v1.4.1).
- `whiteSpace: nowrap` na všech labelech SubjectSelectoru.
- Hodnoty smlouvy vždy přes getEffectiveValues / getEffectiveValuesToday, NIKDY Number(c.rent).
- Parking/voda/paušál vždy z EFEKTIVNÍ hodnoty, nikdy z c.parking / includedParkingSpots.
- Formulář dodatku: pole gatovat podle TYPU smlouvy (isRes/isComm), NIKDY podle základní hodnoty > 0.
- Export PDF: vždy getEffectiveValuesToday(c).
- Obsazenost předmětu nájmu přes getCurrentAssetContract / isContractOccupying (utils.js), NIKDY jen podle asset.status nebo c.status === 'active'.
- Pořadí smluv (Platby, Smlouvy) vždy přes applyContractOrder (utils.js) – navazující smlouva převezme pozici předchozí smlouvy na stejném předmětu.
- Dodatky řadí chronologicky _getEffVals v utils.js. DB je vrací řazené jako TEXT ("15. 10." < "5. 9.") – na pořadí z DB nikdy nespoléhat.
- Firma VŽDY přesnou shodou přes firmOf() – NIKDY startsWith ("JIHOTANK CB" ≠ "JIHOTANK"). Pronajímatel smlouvy = contractSubject(c, assets) (u Ostatní subjekt předmětu, jinak billing_subject || subjekt předmětu) – NIKDY jen asset.subject (exporty, součty, filtry).
- Firmy STRIKTNĚ oddělené: součty, %, dlužníci, exporty vždy za jednu firmu (nebo „Vše“ jedné firmy). Název skupiny (group_label) nesmí sdílet dvě firmy – hlídá Rust (check_group_label v add/update_contract) i formuláře (groupLabelConflict).
- Výběr firmy/sekce: hodnota = název sekce | firmSelection(firma) | 'all'; filtrovat VŽDY přes selectionMatches().
- Stavové štítky VÝHRADNĚ přes StatusPill (StatusUI.jsx): zelená = OK/dostupné (Uhrazeno, Aktivní, Volné), oranžová = pozor, červená = problém, šedá = neaktivní (Ukončeno, Obsazeno).
- Barvy typů předmětů jen z CSS proměnných `--asset-<typ>-bg/header/accent/border/strong` (assetTypeStyle). Byt zelená, komerční fialová, reklama oranžová, parkování modrá, ostatní tyrkysová. Ikony z ASSET_TYPES (🏠 🏢 📢 🅿️ 📄).
- Barvy firem jen přes firmColors(color, theme) – žádné natvrdo psané barvy firem.
- Velikost písma = zoom celé appky (`--ui-zoom`). Jednotky vh/vw psát VŽDY jako `calc(NNvh / var(--ui-zoom, 1))`; souřadnice myši dělit uiZoom.
- Tmavý režim: žádné natvrdo bílé pozadí s textem z var(--text*) (v dark nečitelné) – používat var(--bg)/var(--bg2). Vedlejší text var(--text2)/var(--text3), ne opacity < 0.8.
- Úpravy velkých souborů skriptem: hledat anchor až od začátku konkrétní render funkce (stejné bloky jsou v DetailPanel víckrát).
- Platná smlouva = isContractOccupying(c) (aktivní + ukončená s budoucím koncem), NIKDY jen status === 'active'. Výjimka: akce jen pro aktivní smlouvu (navazující smlouva, změna nájemce).
- Součty nájmu (nájemník, portfolio) přes currentPerAsset – stará smlouva do konce + navazující od budoucna se NESČÍTAJÍ. „Končící“ smlouvy (Dashboard, Kalendář, upozornění, filtry) bez navazující smlouvy: hasSuccessor / isEndingWithoutSuccessor.
- Dialogy VŽDY přes DialogShell (formuláře: submit tlačítko v patičce přes atribut form="…"). Hlavičky sekcí přes SectionHeader, záložky přes Segmented, prázdné stavy přes EmptyState (UI.jsx).
- Tónové barvy jen z proměnných `--tone-<green|amber|red|blue|violet|gray>-bg/soft/border/text` a tříd `btn-tone-*` – žádné natvrdo světlé odstíny (#F0FDF4, #FEF2F2…) v JSX. Výjimka: HTML pro PDF (Export, report v Platbách) – tam VŽDY hex, CSS proměnné v PDF nefungují.
- Připnuté záhlaví tabulky: `.sticky-head` (top: -24px kvůli odsazení .content), obal tabulky overflow: clip (ne hidden).
- `reqwest::blocking` uvnitř async Tauri commandu = deadlock.
- Popup / detail se otevírá NAD aktuální obrazovkou – nikdy nepřepínat záložku/stránku kvůli otevření okna. Po zavření zůstat, odkud se otevřel (potřebuje-li okno jiný měsíc, přepnout dočasně a po zavření vrátit). Detaily VŽDY přes openDetail (zásobník v App.jsx): Esc / ✕ = krok zpět (i na předchozí záložku), klik mimo = zavřít vše; okno, ze kterého se detail otevřel (Kontrola dat, Nastavení), předat jako onReturn.
- Záznamy historie (add_log / logAction) VŽDY s popisem „předmět – nájemce“ (u platby i druh a měsíc, u skupiny `skupina "název"`), NIKDY jen ID. Historie smlouvy záznamy dohledává podle tohoto textu.
- Jednorázové migrace dat v db.rs hlídat přes `PRAGMA user_version` (1 = splatnost bytů v1.4.1), aby nepřepsaly pozdější ruční změny.
- Nevratné akce (zrušení platby, mazání, archivace, trvalé smazání, čištění) VŽDY až po potvrzení: ConfirmDialog / confirmAction (okno uprostřed s konkrétním popisem, co se stane). Platby rušit VÝHRADNĚ přes removePayments (potvrzuje samo; `{ confirm: false }` jen tam, kde se už potvrdilo).
- Payments.jsx: pořadí const arrow funkcí je kritické (temporal dead zone).

## 5. Platby a dodatky – logika

- Předpis za měsíc vždy přes getMonthRent(c, yr, mo) (= nájem + parking + paušál) / getMonthRentParking (bytové, bez paušálu). NIKDY ručně ev.rent + ev.parking + ev.flatFee.
- Měsíční smlouvy: nájem + parking POMĚRNĚ podle dní (začátek/konec smlouvy uprostřed měsíce, dodatek uprostřed měsíce = dny před ním stará sazba, od něj nová), zaokrouhleno na celé Kč. Paušál a zálohy se NEkrátí (hodnota k 1. dni měsíce). Čtvrtletní/pololetní/roční bez krácení.
- effPeriodRent(c, yr, mo) = getMonthRent(c, yr, mo)
- effRent(c, yr, mo) = effPeriodRent / periodLen(c) – měsíční ekvivalent
- globalReceived / subReceived / last6Months = vždy Number(p.amount) (skutečně zaplaceno).
- deletePeriodPayments maže POUZE aktuální platební okno, nikdy historii.
- calendar_year_billing: Ročně + true → platební okno = leden–prosinec refYear.
- agreed=1 → platba vždy "paid" bez ohledu na výši.
- add_payment(): duplicate guard před každým INSERT.
- getEffectiveValues aplikuje jen dodatky s effectiveFrom <= 1. den dotazovaného měsíce (používat pro zálohy/paušál; nájem + parking přes getMonthRent).
- Výběr smluv pro Platby a Dashboard: isContractBillable(c) + datum platnosti v měsíci, NIKDY jen status === 'active'. Ukončená smlouva = status 'archived' + datum konce (poslední den nájmu) → zůstává v historii plateb do tohoto data. Archived bez data konce se nezobrazuje.
- Platební okno víceměsíčních smluv: getPeriodMonthKeys (utils.js) – jediná implementace pro Payments i DetailPanel. Víceměsíční platba se vždy ukládá rozdělená do měsíců okna (částka / počet měsíců).
- Zálohy za měsíc přes getMonthDeposits(c, yr, mo, contracts) – contracts VŽDY předávat. Předávka JINÉMU nájemci uprostřed měsíce: plné zálohy platí oba. Navazující smlouva TÉHOŽ nájemce uprostřed měsíce: zálohy platí jen předchozí smlouva, nová od dalšího měsíce.
- STAV PLATBY ZA MĚSÍC – jediná implementace contractMonthStatus(c, y, m, { payments, contracts, assets }) / groupMonthStatus(label, y, m, ctx) v utils.js; používají ji Platby (řádky, počty, filtry, dlužníci, report), Dashboard (po splatnosti), detaily a saldo. NIKDY vlastní výpočet stavu. Smlouva = nájem (+ zálohy jen u bytů, částečné zálohy = částečně); víceměsíční = měsíční díl, okno uhrazené platbou v okně; skupina = platba skupiny proti předpisu VŠECH členů.
- Skupinová platba se z DB načítá s contractId „group:<název>“ (v DB NULL) – rozlišovat přes isGroupPayment(p). Platby jednotlivé smlouvy ve skupině se nezapočítávají (hlídá Kontrola dat).
- „Komplet uhrazeno dne“ = datum poslední z plateb (nájem i zálohy), jen když je měsíc uhrazen celý.
- Saldo nájemce = tenantSaldo (od 1. 1. 2026, jen měsíce po splatnosti, striktně po firmách). Zálohy za rok = depositMonths / depositYearRows; vyúčtování = contract.energySettlements [{year, amount}] (kladné = doplatek, záporné = přeplatek).
- Formulář platby v detailu smlouvy: měsíc platby se volí („Za měsíc“), NE podle data úhrady; při existující platbě za měsíc upozorní. U skupiny se platí jen v Platbách.
- Datum úhrady se pamatuje (getLastPayDate / setLastPayDate, localStorage rf_last_pay_date).
- Změna nájemce: changeTenant (AppContext) + ChangeTenantDialog – záloha → stará smlouva archived k předávce → nová smlouva jiného nájemce (zálohy/paušál/parking převzaté, skupina volitelně, dodatky a kauce ne).
- Automatické prodloužení (auto_renewal_type, jen u smluv se zapnutou volbou) proběhne v Rustu při startu; zapisuje se do historie (uživatel „Systém“, akce „Automatické prodloužení“) a po spuštění se oznámí.
- Navazující smlouvy: renewContracts (AppContext) + RenewContractsDialog. Pořadí: záloha → stará smlouva archived s koncem = den před novým začátkem → nová smlouva se stejným předmětem, skupinou a nastavením; zálohy/paušál/parking v aktuálně platné výši, dodatky se nekopírují, rentTotal = 0. Skupinové platby navazují přes group_label.
- Smlouvy: záložky Platné (aktivní + ukončené s budoucím koncem) / Ukončené.
- Po splatnosti: dueDateFor(c, y, m) z pole due_day („15. den v měsíci“ měsíčně, „30. 4.“ ročně; „Dle vystavené faktury“ = neurčuje se); overdueDays() zobrazit v Platbách, na kartách firem a v detailu nájemce.
- Platba předem: due_day „15. den předchozího měsíce na měsíc následující“ (DUE_PREPAID; byty a ubytovací jednotky, vybraná parkovací stání) → splatnost 15. den PŘEDCHOZÍHO měsíce (říjen do 15. 9.). Platby se dál zapisují za měsíc, kterého se týkají (v Platbách listopad = listopadový nájem). Saldo i Po splatnosti proto počítají až do příštího měsíce.
- Seznam a počty „po splatnosti“ (karta firmy na Dashboardu, záložka Po splatnosti, Report PDF) VÝHRADNĚ přes overdueItems(ctx, match) – všechny měsíce od 1. 1. 2026, víceměsíční smlouva = jedna položka za okno. Plnění (kolečko) karty firmy přes contractMonthStatus / groupMonthStatus po položkách (přeplatek nesmí schovat dluh).
- Skupinové platby: v DB jedna platba na skupinu (contract_id NULL + group_label). Detail smlouvy ve skupině ukazuje jen PODÍL (platba × předpis místa / předpis skupiny v měsíci) – nic se nerozděluje v DB.
- Uložené platby se nikdy zpětně nemění. Základní pole smlouvy platí pro celou historii, dodatky jen od data účinnosti.

## 6. Design

--bg #ffffff, --bg2 #F0FDF4, --accent #12654A. Sidebar gradient linear-gradient(155deg, #0A3D2B, #12654A, #1A8A62, #0E5540).
Platba uhrazena/neuhrazena/částečná: #16A34A / #DC2626 / #D97706. Toast error/warning/success: #991B1B / #92400E / #166534.
Ikona: tmavě zelený kruh #0A3D2B, bílé R (Georgia bold), tři zelené tečky #4ade80 vpravo (opacity 100/65/35 %).
Firmy (sytá paleta, utils FIRM_PALETTE): MCB bordó #7A1029, BP modrá #2563EB, MCZ fialová #9333EA, JT tyrkysová #0D9488, JCB oranžová #EA580C, OST břidlicová #475569.
Styl (v1.4): dialogy DialogShell; hlavičky sekcí tiché (ikona v barevném čtverečku); segmentové přepínače; přepínač měsíců v Platbách = tmavě zelená pilulka (nahoře i plovoucí dole, sticky – na konci stránky nic nepřekrývá); vyhledávání = paleta (↑↓ Enter Esc); bloky firem v detailu nájemce (pruh v barvě firmy + součet / měs.).
Styl (v1.3): karty barevné podle TYPU předmětu + proužek a zkratka FIRMY vlevo; uvnitř bílé rámečky (nájemce, platnost/nájem) s 1.5px čarami. Detaily = plný barevný pás + 4 klíčové údaje + kontrastní záložky (neaktivní tmavý text na světlém, aktivní bílý na barvě). Hlavička stránky = karta s ikonou sekce (`.page-header data-icon` / `data-type`) a čísly. Ondra nechce „prázdný vzdušný“ minimalismus – chce přehledné, výrazné, barevné.

## 7. Pavel – read-only sync (mimo repo, NEMĚNIT bez souhlasu)

Tok: Ondra PC → Google Drive (mirror mode, `C:\Users\ondra\Můj disk\...`) → Pavel (2 PC: "Pavel Burger" práce, "pavel" doma).
Pavel: `rentflow-sync.ps1` (maže -wal/-shm, 3× retry, kontrola velikosti, log `rentflow-sync.log`, documents přes CreateDirectory) + `rentflow-launch.ps1` (ukončí RF → sync -Force → spustí RF) + ikona na ploše + task "RentFlow DB Sync" (1×/min).
Aktualizace appky u Pavla jdou přes auto-updater (latest.json) – nic ručně.

Pravidla:
- Před kopií DB vždy checkpoint WAL. Stará -wal/-shm + nový .db = STARÁ DATA. Mazat tvrdě.
- Nikdy nekopírovat DB při běžícím RF.
- `cz.rentflow.app\rentflow` může být omylem SOUBOR místo složky – kontrola (Get-Item).PSIsContainer.

## 7a. Android aplikace (RentFlow Android, `C:\Users\ondra\rentflow-android`) – VŽDY MYSLET

- Mobil je read-only kopie (samostatný projekt / vlákno): přebírá `src/utils.js` (`npm run sync-core`) a čte DB podle `db.rs` / `models.rs` (kopie `Můj disk/RentFlow backup/rentflow.db`).
- Po každé změně `utils.js`, `db.rs` / `models.rs` (schéma, sloupce, migrace, serde názvy) nebo zobrazení dat (Dashboard, Platby, detaily) na konci odpovědi připomeň: „Promítnout do mobilu: v RentFlow Android napiš ‚synchronizuj s desktopem‘.“ Totéž v souhrnu releasu.
- Desktop kvůli mobilu nikdy neupravovat. Změna formátu / umístění kopie DB na Google Disku (Ctrl+S, záloha při zavření) = upozornit na dopad do mobilu.

## 8. PowerShell pravidla

- `[Text.Encoding]::UTF8` přidává BOM → používat `[Text.UTF8Encoding]::new($false)`.
- `[IO.File]` metody vyžadují absolutní cesty.
- `Get-Content -Raw` bez `-Encoding UTF8` rozbije diakritiku → zápis přes `[System.IO.File]::WriteAllText` s UTF8 bez BOM.
- settings.json: load_settings v Rustu stripuje BOM, ale stejně zapisovat bez BOM.

## 9. Vývojové prostředí (obnoveno 10/2026 po reinstalaci)

- Repo naklonováno z GitHubu do `C:\Users\ondra\rentflow` (výchozí stav v1.2.1, commit 696f124). Záloha starého PC: `D:\Zaloha ntb červenec\user_Ondra\RentFlow` – jen pro čtení.
- Node v24, Rust stable-msvc + VS 2022 Build Tools (VCTools).
- Windows Smart App Control VYPNUTO – jinak blokuje Rust build skripty (os error 4551).
- PowerShell ExecutionPolicy CurrentUser = RemoteSigned – jinak npm.ps1 nejde spustit.
- `vite.config.js`: `server.watch.ignored: ["**/src-tauri/**"]` – NIKDY neodstraňovat. Bez toho Vite padá na EBUSY (sleduje zamčené soubory v src-tauri/target).
- `npm run tauri:dev` pracuje s OSTROU DB (stejný identifier cz.rentflow.app). Před testem Ctrl+S záloha; testovací zápisy dělat vědomě.
- Záloha při zavření: Rust (CloseRequested) udělá zálohu jako Ctrl+S, jen když DB má změny od poslední zálohy (total_changes); frontend ji povolí přes set_close_backup jen adminovi (u Pavla vypnuto).
- Ověřování logiky plateb: scénáře nad utils.js v Node (ESM, package „type: module“) a analýza KOPIE zálohy z %APPDATA%\cz.rentflow.app\backups (nikdy ostrá DB).

## 10. Otevřené / roadmap

- Bug batch (říjen 2026) – VYŘEŠENO ve v1.2.2: ukončení smlouvy k datu (platby nemizí), poměrné krácení nájmu, fix ročních plateb v detailu smlouvy, víceměsíční platby v detailu jako jedna položka. Bug 3 (385 %) = stará data z doby před v1.0.0 (AutoWallis, STRADE) – opraveno ručně v appce.
- v1.2.3: navazující smlouvy (hromadné prodloužení), záložky Platné/Ukončené ve Smlouvách, zálohy při předávce uprostřed měsíce, zachování pořadí smluv po prodloužení.
- v1.3.0: firmy METROPOLE CZ, JIHOTANK, JIHOTANK CB se striktním oddělením; barvy a zkratky firem; strom firma → sekce/budova (Platby, Dokumenty, Revize, Provozní náklady, horní lišta, Export); karty firem a Nejbližší termíny na Dashboardu; Kalendář; po splatnosti; podíl na platbě skupiny; detaily se záložkami; jednotné štítky, barvy typů a hlavičky; velikost písma; kontrast + tmavý režim; Kanban filtr firem; PDF v barvách firem.
- v1.4.0: revize plateb (jednotný stav měsíce, zálohy při prodloužení, součty bez zdvojení), saldo, zálohy za rok a vyúčtování, změna nájemce, firmy a sekce v Nastavení, kontrola dat, historie smlouvy, záloha při zavření, filtry končících smluv, plovoucí přepínač měsíců, sjednocený design a tmavý režim, zkratky (← →, Ctrl+N), zapamatování data úhrady, dokumenty smluv u nájemce.
- v1.4.1: splatnost předem (byty, ubytovací jednotky; migrace), záložka ⚠ Po splatnosti (všechny měsíce, Zapsat, Report PDF, podle nájemce) + karta firmy s proklikem, kolečko karty přes jednotný stav, karty firem bez grafu 6 měsíců, historie bez ID (i zpětně při zobrazení, smazání platby v logu), zásobník detailů (Esc = krok zpět, ← Zpět), Kč bez zalomení, přejmenované záložky Plateb, automatické testy (npm test).
- v1.4.2: oprava bílé obrazovky Logu aktivity, potvrzovací okna u nevratných akcí (zrušení platby, archivace, mazání, koš, čištění duplicit), záloha DB před aktualizací, Kontrola dat (pravidelně 1× za 14 dní; nové kontroly: skupina s různou splatností, platba nad 150 % předpisu, dodatky mimo platnost, duplicitní nájemci, splatnost bez termínu), Platby bez záložky Neuhrazené a starého reportu, detail nájemce „Příští měsíc“ u plateb předem.
- v1.4.3: kauce (vypořádání při ukončení / změně nájemce, přehled, detail smlouvy), poznámky k dlužníkům se slibem platby, štítek Poslední záloha, hledání podle částky a čísla účtu, stavy měřidel podle sekce (chlazení, ruční jednotky, průběžné odečty), platební morálka nájemce.
- Nápady na později: uživatelský manuál RF (vč. splatnosti předem a Po splatnosti); „Co dnes řešit“ na Dashboardu, předávací protokol PDF, evidence klíčů a čipů. NE: hromadná valorizace, import z banky, upomínky PDF, připomínka valorizace, hromadné „Uhrazeno“, začátky smluv v Kalendáři.
- localStorage pro currentUser.
- Odložené: sdružování parkovacích stání (group_label) – částečně implementováno.

## 11. Údržba tohoto souboru

Na konci každé větší session navrhni úpravu CLAUDE.md (nová pravidla, poučení, verze). Zapisuj jen po odsouhlasení.
Aktuální verze appky: viz `src-tauri/tauri.conf.json` (k 21. 10. 2026: v1.4.3).
