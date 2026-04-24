# RentFlow — Setup & Vývoj

## Architektura

```
┌─────────────────────────────────────────────────┐
│  RentFlow Desktop (Tauri v1)                      │
│                                                   │
│  ┌──────────────────┐  IPC  ┌─────────────────┐  │
│  │  React / Vite    │──────▶│  Rust Backend   │  │
│  │  (Frontend UI)   │◀──────│  (Tauri + DB)   │  │
│  └──────────────────┘       └────────┬────────┘  │
│                                       │            │
│                              ┌────────▼────────┐  │
│                              │  SQLite (WAL)   │  │
│                              │  rentflow.db    │  │
│                              └─────────────────┘  │
└─────────────────────────────────────────────────┘

Databáze: %APPDATA%\rentflow\rentflow.db
```

---

## Požadavky

- **Node.js** 18+ (https://nodejs.org)
- **Rust** (https://rustup.rs) — `rustup default stable`
- **Tauri CLI** prerekvizity pro Windows:
  - Microsoft Visual Studio C++ Build Tools
  - WebView2 Runtime (obvykle již součást Windows 11)

Instalace WebView2 a Build Tools: https://tauri.app/v1/guides/getting-started/prerequisites#windows

---

## Vývoj (lokálně)

```bash
# 1. Nainstaluj Node závislosti
npm install

# 2. Spusť vývojový server + Tauri okno
npm run tauri:dev
```

Tauri automaticky spustí Vite dev server (port 5173) a otevře nativní okno aplikace.

---

## Build (produkce)

```bash
# Vytvoří .exe installer pro Windows
npm run tauri:build
```

Výstup: `src-tauri/target/release/bundle/msi/RentFlow_0.5.0_x64_en-US.msi`

---

## Databáze

SQLite soubor je uložen v:
- **Windows**: `C:\Users\<jméno>\AppData\Roaming\rentflow\rentflow.db`

### Google Drive sync

Pro sdílení s tatínkem (read-only přístup přes Android app):

**Varianta A — jednoduchá (doporučená pro start):**
1. Celý adresář `%APPDATA%\rentflow\` nastav jako synced složku přes Google Drive for Desktop
2. Databáze se automaticky synchronizuje při každém spuštění/ukončení aplikace

**Varianta B — přesun DB do Google Drive složky (pokročilé):**
Bude implementováno jako nastavení v aplikaci (Fáze 2)

---

## Struktura projektu

```
rentflow/
├── src/                    # React frontend
│   ├── AppContext.jsx       # Tauri IPC + state management
│   ├── App.jsx              # Hlavní layout + routing
│   ├── Sidebar.jsx          # Navigace
│   ├── DetailPanel.jsx      # Výsuvný detail panel
│   └── views/              # Jednotlivé sekce
│       ├── Dashboard.jsx
│       ├── Tenants.jsx
│       ├── Assets.jsx
│       ├── Contracts.jsx
│       ├── Kanban.jsx
│       └── ...
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs          # Entry point
│   │   ├── db.rs            # SQLite operace
│   │   ├── models.rs        # Datové typy
│   │   └── commands.rs      # Tauri IPC handlery
│   ├── Cargo.toml           # Rust závislosti
│   └── tauri.conf.json      # Tauri konfigurace
├── package.json
└── vite.config.js
```

---

## Roadmap

### Fáze 2 (další sprint)
- [ ] Import z Excelu (historická data)
- [ ] Generování smlouvy z Word šablony
- [ ] Google Drive sync nastavení v UI
- [ ] Revize a pojistky — kompletní modul

### Fáze 3 (mobilní)
- [ ] Capacitor wrapper pro Android
- [ ] Read-only mode pro tátu

---

## Databázové schéma

Viz `src-tauri/src/db.rs` — funkce `init_tables()`.

Klíčové tabulky: `tenants`, `assets`, `contracts`, `payments`, `tasks`, `revisions`, `documents`, `logs`, `trash`
