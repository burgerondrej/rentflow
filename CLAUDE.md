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
- Po změně frontendu ověř: `npm run build`.

## 2. Git a release — TVRDÁ PRAVIDLA

- NIKDY sám nespouštěj `git push`, `git tag`, `git reset --hard`, `git rebase`, `git push --force`, ani nemaž větve. Tyhle příkazy jen vypiš, spouští je Ondra.
- `git add` / `git commit` jen na výslovný pokyn.
- Na začátku práce zkontroluj `git status` – pokud není čisto, upozorni.
- NIKDY neměň `.github/workflows/release.yml` bez výslovného souhlasu.
- NIKDY nepoužívat `tauri-action@v0.5` (spouští `tauri init --ci`, rozbije build).
- Do repa nikdy neukládej hesla, klíče, tokeny. Podpisový klíč je mimo repo: `C:\Users\ondra\Documents\rentflow-updater.key` – nikdy ho nečti ani nekopíruj.

Release workflow (plně automatický):
1. Zvýšit verzi (povinné): ručně `version` v `src-tauri/tauri.conf.json` A ZÁROVEŇ `npm version X.X.X --no-git-tag-version` (package.json + package-lock.json). Všechny tři musí sedět.
2. `git add .` → `git commit -m "vX.X.X: popis"` → `git tag vX.X.X` → `git push origin main` → `git push origin vX.X.X`
3. Tag musí ukazovat na správný HEAD commit – ověřit před pushem (`git log -1 --oneline`, `git show vX.X.X --stat`).
4. GitHub Actions (~15 min): build + podpis → `.nsis.zip` do `burgerondrej/rentflow-releases` → `latest.json` do `burgerondrej/rentflow-updates`.
5. Ověření: `Invoke-RestMethod https://burgerondrej.github.io/rentflow-updates/latest.json` (verze musí sedět).
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
- `src/utils.js` – parseDate, getEffectiveValues(c, yr, mo), getEffectiveValuesToday(c), PERIOD_LEN.
- `src/AppContext.jsx` – Tauri IPC bridge, state, theme, showToast(message, type). archiveContract kontroluje jiné aktivní smlouvy.
- `src/App.jsx` – AppWithActivation wrapper, Ctrl+F, Ctrl+S, PIN modal, auto-update check po 3 s.
- `src/DetailPanel.jsx` – effectiveToday(c), formulář dodatku.
- `src/views/Payments.jsx` – platební logika (viz níže).
- `src/views/Export.jsx` – PDF přes getEffectiveValuesToday(c), sloupec Paušál. PDF = Edge headless `--print-to-pdf` (bez Google Fonts @import).
- `src/ActivationScreen.jsx` – aktivace (hash SHA-256 v Rustu, stav v settings.json "activated").
- `src-tauri/src/db.rs` – migrace (seed subjektů ODSTRANĚN, fresh install = prázdné tabulky).
- `src-tauri/src/commands.rs` – verify_activation, check_activation, load_settings (odstraňuje UTF-8 BOM), backup.

Subjekty (11) jsou VÝHRADNĚ v tabulce `subjects` (asset_type: commercial / residential / ads / parking / other, is_vat_payer). Načítání přes get_subjects() / get_objects().

## 4. Absolutní pravidla kódu

- NIKDY hardcoded názvy firem/subjektů v JS – vždy z DB přes context.
- DPH: isVatPayer z billingGroups.find(...) – NIKDY startsWith("firma").
- Žádné UI knihovny (MUI, Tailwind…) – jen inline styles + styles.css.
- NIKDY window.confirm() → ConfirmDialog (props: title, text, danger, okLabel, onOk). NIKDY alert() → showToast().
- JS nikdy negeneruje ID – UUID výhradně v Rustu.
- Každý Rust struct s `id: String` musí mít `#[serde(default)]`. `EMPTY_FORM.id` = `""`, nikdy `null`.
- VIEWS v App.jsx volat `{ActiveView()}`, NE `<ActiveView />` (remount, ztráta stavu).
- `whiteSpace: nowrap` na všech labelech SubjectSelectoru.
- Hodnoty smlouvy vždy přes getEffectiveValues / getEffectiveValuesToday, NIKDY Number(c.rent).
- Parking/voda/paušál vždy z EFEKTIVNÍ hodnoty, nikdy z c.parking / includedParkingSpots.
- Formulář dodatku: pole gatovat podle TYPU smlouvy (isRes/isComm), NIKDY podle základní hodnoty > 0.
- Export PDF: vždy getEffectiveValuesToday(c).
- `reqwest::blocking` uvnitř async Tauri commandu = deadlock.
- Payments.jsx: pořadí const arrow funkcí je kritické (temporal dead zone).

## 5. Platby a dodatky – logika

- effPeriodRent(c, yr, mo) = getEffectiveValues(c, yr, mo).rent + parking + flatFee
- effRent(c, yr, mo) = effPeriodRent / periodLen(c) – měsíční ekvivalent
- globalReceived / subReceived / last6Months = vždy Number(p.amount) (skutečně zaplaceno).
- deletePeriodPayments maže POUZE aktuální platební okno, nikdy historii.
- calendar_year_billing: Ročně + true → platební okno = leden–prosinec refYear.
- agreed=1 → platba vždy "paid" bez ohledu na výši.
- add_payment(): duplicate guard před každým INSERT.
- getEffectiveValues aplikuje jen dodatky s effectiveFrom <= 1. den dotazovaného měsíce.
- Uložené platby se nikdy zpětně nemění. Základní pole smlouvy platí pro celou historii, dodatky jen od data účinnosti.

## 6. Design

--bg #ffffff, --bg2 #F0FDF4, --accent #12654A. Sidebar gradient linear-gradient(155deg, #0A3D2B, #12654A, #1A8A62, #0E5540).
Platba uhrazena/neuhrazena/částečná: #16A34A / #DC2626 / #D97706. Toast error/warning/success: #991B1B / #92400E / #166534.
Ikona: tmavě zelený kruh #0A3D2B, bílé R (Georgia bold), tři zelené tečky #4ade80 vpravo (opacity 100/65/35 %).

## 7. Pavel – read-only sync (mimo repo, NEMĚNIT bez souhlasu)

Tok: Ondra PC → Google Drive (mirror mode, `C:\Users\ondra\Můj disk\...`) → Pavel (2 PC: "Pavel Burger" práce, "pavel" doma).
Pavel: `rentflow-sync.ps1` (maže -wal/-shm, 3× retry, kontrola velikosti, log `rentflow-sync.log`, documents přes CreateDirectory) + `rentflow-launch.ps1` (ukončí RF → sync -Force → spustí RF) + ikona na ploše + task "RentFlow DB Sync" (1×/min).
Aktualizace appky u Pavla jdou přes auto-updater (latest.json) – nic ručně.

Pravidla:
- Před kopií DB vždy checkpoint WAL. Stará -wal/-shm + nový .db = STARÁ DATA. Mazat tvrdě.
- Nikdy nekopírovat DB při běžícím RF.
- `cz.rentflow.app\rentflow` může být omylem SOUBOR místo složky – kontrola (Get-Item).PSIsContainer.

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

## 10. Otevřené / roadmap

- Bug batch (říjen 2026): (1) roční platba se v detailu nájemníka ukazuje 12× plnou částkou; (2) dodatek od jiného než 1. dne v měsíci se projeví až další měsíc; (3) Bürger reklamní plochy – nesmyslný měsíční poměr a % plnění; (4) poměrné krácení nájmu při začátku/konci uprostřed měsíce; (5) po předčasném ukončení smlouvy zůstává předmět nájmu blokovaný pro novou smlouvu.
- localStorage pro currentUser; správa subjektů v Settings UI.
- Odložené: sdružování parkovacích stání (group_label) – částečně implementováno.

## 11. Údržba tohoto souboru

Na konci každé větší session navrhni úpravu CLAUDE.md (nová pravidla, poučení, verze). Zapisuj jen po odsouhlasení.
Aktuální verze appky: viz `src-tauri/tauri.conf.json` (k 10/2026: v1.2.1).
