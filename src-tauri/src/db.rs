use rusqlite::{Connection, params};
use chrono::{Local, Datelike};
use uuid::Uuid;
use crate::models::*;

pub struct Database {
    pub conn: Connection,
    pub db_path: std::path::PathBuf,
}

impl Database {
    pub fn new(path: &std::path::Path) -> Result<Self> {
        let conn = Connection::open(path)?;

        // Performance pragmas
        conn.execute_batch("
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=NORMAL;
            PRAGMA foreign_keys=ON;
        ")?;

        // Checkpoint WAL při startu – ochrana před ztrátou dat z předchozího nečistého ukončení
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);");

        let db = Database { conn, db_path: path.to_path_buf() };
        db.init_tables()?;
        Ok(db)
    }

    /// Vynutí zápis WAL do hlavního DB souboru (volat před zálohováním a zavřením)
    /// Počet řádků změněných tímto spojením od otevření DB (pro detekci změn od poslední zálohy).
    pub fn total_changes(&self) -> i64 {
        self.conn.query_row("SELECT total_changes()", [], |r| r.get(0)).unwrap_or(0)
    }

    pub fn checkpoint(&self) -> Result<()> {
        self.conn.execute_batch("PRAGMA wal_checkpoint(FULL);")?;
        Ok(())
    }

    fn init_tables(&self) -> Result<()> {
        self.conn.execute_batch("
            CREATE TABLE IF NOT EXISTS tenants (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                phone       TEXT,
                email       TEXT,
                ico         TEXT,
                dic         TEXT,
                address     TEXT,
                bank_account TEXT,
                status      TEXT DEFAULT 'active',
                tags        TEXT DEFAULT '[]',
                added       TEXT,
                initials    TEXT,
                avatar_bg   TEXT,
                avatar_color TEXT,
                created_at  TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS assets (
                id          TEXT PRIMARY KEY,
                asset_type  TEXT NOT NULL,
                subject     TEXT NOT NULL,
                unit        TEXT NOT NULL,
                floor       TEXT,
                size        TEXT,
                format      TEXT,
                status      TEXT DEFAULT 'free',
                notes       TEXT,
                balcony     TEXT,
                commerce_type TEXT,
                created_at  TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS contracts (
                id          TEXT PRIMARY KEY,
                tenant_id   TEXT,
                asset_id    TEXT,
                rent        REAL DEFAULT 0,
                deposit     REAL DEFAULT 0,
                cauce       REAL DEFAULT 0,
                parking     REAL DEFAULT 0,
                start_date  TEXT,
                end_date    TEXT,
                status      TEXT DEFAULT 'active',
                addenda     TEXT DEFAULT '[]',
                due_day     TEXT,
                created_at  TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                FOREIGN KEY (asset_id) REFERENCES assets(id)
            );

            CREATE TABLE IF NOT EXISTS payments (
                id          TEXT PRIMARY KEY,
                contract_id TEXT,
                amount      REAL,
                date        TEXT,
                month       TEXT,
                created_at  TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (contract_id) REFERENCES contracts(id)
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                description TEXT,
                priority    TEXT DEFAULT 'Nízká',
                deadline    TEXT,
                tag         TEXT,
                reminders   TEXT DEFAULT '{\"d3\":false,\"d1\":false,\"d0\":false,\"h1\":false}',
                recurring   INTEGER DEFAULT 0,
                status      TEXT DEFAULT 'todo',
                created_at  TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS revisions (
                id          TEXT PRIMARY KEY,
                title       TEXT,
                last_date   TEXT,
                interval_months INTEGER DEFAULT 12,
                asset_id    TEXT,
                notes       TEXT,
                created_at  TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS documents (
                id          TEXT PRIMARY KEY,
                name        TEXT,
                doc_type    TEXT DEFAULT 'Ostatní',
                subject     TEXT,
                ext         TEXT DEFAULT 'pdf',
                related_id  TEXT,
                related_type TEXT,
                uploaded_at TEXT,
                created_at  TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS logs (
                id          TEXT PRIMARY KEY,
                timestamp   TEXT,
                user_name   TEXT,
                action      TEXT,
                module      TEXT,
                detail      TEXT,
                created_at  TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS trash (
                trash_id    TEXT PRIMARY KEY,
                item_type   TEXT,
                item_data   TEXT,
                title       TEXT,
                deleted_at  TEXT,
                created_at  TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS contract_amendments (
                id              TEXT PRIMARY KEY,
                contract_id     TEXT NOT NULL,
                effective_from  TEXT NOT NULL,
                rent            REAL,
                deposit         REAL,
                deposit_water   REAL,
                flat_fee        REAL,
                parking         REAL,
                note            TEXT,
                added           TEXT,
                created_at      TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
            );
        ")?;

        // Migrace: přidej parking sloupec pokud ještě neexistuje
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN parking REAL DEFAULT 0", []);
        // Migrace: přidej dic a address do tenants
        let _ = self.conn.execute("ALTER TABLE tenants ADD COLUMN dic TEXT", []);
        let _ = self.conn.execute("ALTER TABLE tenants ADD COLUMN address TEXT", []);
        // v0.11 migrace
        let _ = self.conn.execute("ALTER TABLE assets ADD COLUMN balcony TEXT", []);
        let _ = self.conn.execute("ALTER TABLE assets ADD COLUMN commerce_type TEXT", []);
        let _ = self.conn.execute("ALTER TABLE tenants ADD COLUMN bank_account TEXT", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN due_day TEXT", []);
        // Migrace v0.18: nová pole nájemníků
        let _ = self.conn.execute("ALTER TABLE tenants ADD COLUMN tenant_type TEXT", []);
        let _ = self.conn.execute("ALTER TABLE tenants ADD COLUMN contact_person TEXT", []);
        let _ = self.conn.execute("ALTER TABLE tenants ADD COLUMN whatsapp TEXT", []);
        let _ = self.conn.execute("ALTER TABLE tenants ADD COLUMN billing_email TEXT", []);
        let _ = self.conn.execute("ALTER TABLE tenants ADD COLUMN birth_date TEXT", []);
        let _ = self.conn.execute("ALTER TABLE tenants ADD COLUMN id_card TEXT", []);
        // v0.19 migrations
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN termination_months INTEGER", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN renewal_method TEXT", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN valorization_enabled INTEGER DEFAULT 0", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN valorization_date TEXT", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN invoice_due TEXT", []);
        // v0.19c migrations
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN contract_version TEXT", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN occupants INTEGER", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN permanent_residents INTEGER", []);
        // v0.20 migrations
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN payment_frequency TEXT", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN deposit_water REAL DEFAULT 0", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN co_residents TEXT", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN contract_notes TEXT", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN included_parking_spots INTEGER NOT NULL DEFAULT 0", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN billing_subject TEXT", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN vat_exempt INTEGER NOT NULL DEFAULT 0", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN group_label TEXT", []);
        let _ = self.conn.execute("ALTER TABLE payments ADD COLUMN group_label TEXT", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN auto_renewal_type TEXT", []);

        // ── Automatické prodloužení komerčních smluv ──────────────────────
        // Spustí se při každém startu. Pokud dnes >= (konec - výpovědní lhůta),
        // smlouva se prodlouží dle auto_renewal_type a typ 'once_2y' se poté vynuluje.
        {
            let today = chrono::Local::now().date_naive();
            let contracts = self.get_contracts().unwrap_or_default();
            for c in &contracts {
                let renewal = match &c.auto_renewal_type {
                    Some(r) if !r.is_empty() => r.clone(),
                    _ => continue,
                };
                // Parsuj datum konce ve formátu D.M.YYYY
                let end_date = {
                    let parts: Vec<&str> = c.end.split('.').map(str::trim).collect();
                    if parts.len() != 3 { continue }
                    let (d, m, y) = (parts[0].parse::<u32>().ok(), parts[1].parse::<u32>().ok(), parts[2].parse::<i32>().ok());
                    match (d, m, y) {
                        (Some(d), Some(m), Some(y)) => match chrono::NaiveDate::from_ymd_opt(y, m, d) {
                            Some(dt) => dt,
                            None => continue,
                        },
                        _ => continue,
                    }
                };
                // Výpovědní lhůta v měsících (default 6 pro komerční)
                let notice_months = c.termination_months.unwrap_or(6) as i64;
                // Odečti 1 den, pak N měsíců (správné měsíční odečítání s clampingem)
                let pre = end_date - chrono::Duration::days(1);
                let total_m = (pre.year() as i64) * 12 + (pre.month() as i64) - 1 - notice_months;
                let t_year = (total_m / 12) as i32;
                let t_month = (total_m % 12 + 1) as u32;
                let deadline = chrono::NaiveDate::from_ymd_opt(t_year, t_month, pre.day())
                    .unwrap_or_else(|| {
                        let (ny, nm) = if t_month == 12 { (t_year + 1, 1u32) } else { (t_year, t_month + 1) };
                        chrono::NaiveDate::from_ymd_opt(ny, nm, 1).unwrap() - chrono::Duration::days(1)
                    });
                if today < deadline { continue } // ještě není čas
                if today >= end_date { continue } // smlouva už vypršela, nerozšiřujeme
                // Prodlouž
                let years_add: i32 = if renewal.contains("5y") { 5 } else { 2 };
                let new_end = chrono::NaiveDate::from_ymd_opt(
                    end_date.year() + years_add, end_date.month(), end_date.day()
                ).unwrap_or(end_date);
                let new_end_str = format!("{}. {}. {}", new_end.day(), new_end.month(), new_end.year());
                let changed = self.conn.execute(
                    "UPDATE contracts SET end_date=?1, auto_renewal_type=CASE WHEN auto_renewal_type='once_2y' THEN NULL ELSE auto_renewal_type END WHERE id=?2",
                    rusqlite::params![new_end_str, c.id],
                ).unwrap_or(0);
                // Záznam do historie změn (zobrazí se i v Historii smlouvy a jako oznámení po spuštění)
                if changed > 0 {
                    let unit: String = self.conn.query_row("SELECT unit FROM assets WHERE id = ?1", params![c.asset_id], |r| r.get(0))
                        .unwrap_or_else(|_| "?".to_string());
                    let tenant: String = self.conn.query_row("SELECT name FROM tenants WHERE id = ?1", params![c.tenant_id], |r| r.get(0))
                        .unwrap_or_else(|_| "?".to_string());
                    let how = match renewal.as_str() {
                        "repeat_5y" => "o 5 let, opakovaně",
                        "once_2y" => "jednorázově o 2 roky",
                        _ => "o 2 roky, opakovaně",
                    };
                    let _ = self.add_log("Systém", "Automatické prodloužení", "Smlouvy",
                        &format!("Automaticky prodloužena smlouva: {} – {} z {} do {} ({}) [{}]", unit, tenant, c.end, new_end_str, how, c.id));
                }
            }
        }
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN energy_settlements TEXT DEFAULT '[]'", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN handover_date TEXT", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN flat_fee REAL NOT NULL DEFAULT 0", []);
        // v0.21 migrations
        let _ = self.conn.execute("ALTER TABLE revisions ADD COLUMN subject TEXT", []);
        let _ = self.conn.execute("ALTER TABLE payments ADD COLUMN payment_type TEXT NOT NULL DEFAULT ''", []);
        let _ = self.conn.execute("ALTER TABLE documents ADD COLUMN notes TEXT", []);
        self.conn.execute_batch("
            CREATE TABLE IF NOT EXISTS operational_costs (
                id          TEXT PRIMARY KEY,
                object_name TEXT NOT NULL,
                category    TEXT NOT NULL,
                amount      REAL DEFAULT 0,
                frequency   TEXT DEFAULT 'Ročně',
                period_from TEXT,
                period_to   TEXT,
                notes       TEXT,
                added       TEXT,
                created_at  TEXT DEFAULT (datetime('now'))
            );
        ")?;
        // Migrace: oprava názvů subjektů (velká písmena po pomlčce u Bürger Pavel)
        let _ = self.conn.execute("UPDATE assets SET subject = 'Bürger Pavel – Parkování' WHERE subject = 'Bürger Pavel – parkování'", []);
        let _ = self.conn.execute("UPDATE assets SET subject = 'Bürger Pavel – Reklamní plochy' WHERE subject = 'Bürger Pavel – reklamní plochy'", []);
        let _ = self.conn.execute("UPDATE assets SET subject = 'METROPOLE CB – Parkování' WHERE subject = 'METROPOLE CB – parkování'", []);
        let _ = self.conn.execute("UPDATE assets SET subject = 'METROPOLE CB – Reklamní plochy' WHERE subject = 'METROPOLE CB – reklamní plochy'", []);
        let _ = self.conn.execute("UPDATE assets SET subject = 'METROPOLE CB – Komerční prostory' WHERE subject = 'METROPOLE CB – komerční prostory'", []);
        let _ = self.conn.execute("UPDATE assets SET subject = 'METROPOLE CB – Ubytovací jednotky' WHERE subject = 'METROPOLE CB – ubytovací jednotky'", []);
        // Migrace: oprava hodnoty splatnosti
        let _ = self.conn.execute("UPDATE contracts SET due_day = 'Dle vystavené faktury' WHERE due_day = 'Dle faktury'", []);
        // Migrace: oprava billing_subject pro typ Ostatní (staré hodnoty 'X – Ostatní' → čistý název pronajímatele)
        let _ = self.conn.execute("UPDATE contracts SET billing_subject = 'METROPOLE CB' WHERE billing_subject = 'METROPOLE CB – Ostatní'", []);
        let _ = self.conn.execute("UPDATE contracts SET billing_subject = 'Bürger Pavel' WHERE billing_subject = 'Bürger Pavel – Ostatní'", []);
        // Migrace: smazat billing_subject u reklam a parkování kde asset patří přímo Bürger Pavel
        let _ = self.conn.execute(
            "UPDATE contracts SET billing_subject = NULL \
             WHERE asset_id IN (SELECT id FROM assets WHERE type IN ('ads','parking') AND subject NOT LIKE 'METROPOLE CB%')",
            [],
        );
        let _ = self.conn.execute(
            "UPDATE contracts SET invoice_due = NULL WHERE invoice_due IS NOT NULL AND asset_id IN (SELECT id FROM assets WHERE type != 'commercial')",
            [],
        );

        // Cleanup: uvolni předměty nájmu bez aktivní smlouvy
        let _ = self.conn.execute(
            "UPDATE assets SET status = 'free' WHERE status = 'occupied' AND id NOT IN (SELECT DISTINCT asset_id FROM contracts WHERE status = 'active')",
            [],
        );

        // v0.26 migrations
        let _ = self.conn.execute("ALTER TABLE payments ADD COLUMN note TEXT NOT NULL DEFAULT ''", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN rent_total REAL NOT NULL DEFAULT 0", []);

        // v0.27 migrations — contract_amendments tabulka je vytvořena v init_tables výše (CREATE TABLE IF NOT EXISTS)
        // Žádné ALTER TABLE potřeba — vše nové

        // v0.28 migrations
        let _ = self.conn.execute("ALTER TABLE documents ADD COLUMN contract_link_id TEXT", []);
        let _ = self.conn.execute("ALTER TABLE documents ADD COLUMN contract_link_type TEXT", []);

        // v0.53 migrations
        let _ = self.conn.execute("ALTER TABLE payments ADD COLUMN agreed INTEGER NOT NULL DEFAULT 0", []);

        // v0.56 migrations
        let _ = self.conn.execute("ALTER TABLE operational_costs ADD COLUMN vat_included INTEGER NOT NULL DEFAULT 0", []);
        let _ = self.conn.execute("ALTER TABLE contracts ADD COLUMN calendar_year_billing INTEGER NOT NULL DEFAULT 0", []);

        // v0.57 migrations — subjects + objects tables
        self.conn.execute_batch("
            CREATE TABLE IF NOT EXISTS subjects (
                id           TEXT PRIMARY KEY,
                name         TEXT NOT NULL UNIQUE,
                sort_order   INTEGER NOT NULL,
                asset_type   TEXT NOT NULL DEFAULT 'other',
                is_vat_payer INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS objects (
                id           TEXT PRIMARY KEY,
                name         TEXT NOT NULL UNIQUE,
                sort_order   INTEGER NOT NULL
            );
        ")?;

        // Subjects a objects jsou spravovány výhradně uživatelem přes Settings.
        // Seed byl odstraněn — fresh install začíná s prázdnými tabulkami.

        // v1.2.4 — firmy: zkratka + barva, sekce JIHOTANK / JIHOTANK CB / METROPOLE CZ, pořadí
        let _ = self.conn.execute("ALTER TABLE subjects ADD COLUMN short_name TEXT NOT NULL DEFAULT ''", []);
        let _ = self.conn.execute("ALTER TABLE subjects ADD COLUMN color TEXT NOT NULL DEFAULT ''", []);
        self.migrate_firms_v124()?;
        // v1.2.4 — finální sytá paleta: BP královská modrá, JT tyrkysová, JCB oranžová (jen z dřívějších návrhových hodnot)
        let _ = self.conn.execute("UPDATE subjects SET color = 'royal' WHERE short_name = 'BP' AND color IN ('orange', 'mint')", []);
        let _ = self.conn.execute("UPDATE subjects SET color = 'teal' WHERE short_name = 'JT' AND color = 'blue'", []);
        let _ = self.conn.execute("UPDATE subjects SET color = 'orange' WHERE short_name = 'JCB' AND color = 'emerald'", []);
        // v1.2.4 — objekty (budovy) patří firmě; revize a provozní náklady se filtrují firma → budova
        let _ = self.conn.execute("ALTER TABLE objects ADD COLUMN firm TEXT NOT NULL DEFAULT ''", []);
        for (name, firm) in [
            ("METROPOLE CB – U Staré trati", "METROPOLE CB"),
            ("Novohradská 57a", "METROPOLE CB"),
            ("Novohradská 53/55", "METROPOLE CB"),
            ("JIHOTANK", "JIHOTANK"),
            ("JIHOTANK CB", "JIHOTANK CB"),
        ] {
            let _ = self.conn.execute("UPDATE objects SET firm = ?1 WHERE name = ?2 AND firm = ''", params![firm, name]);
        }
        // v1.4.1 — byty a ubytovací jednotky se platí předem (říjen do 15. 9.); jednorázově (user_version),
        // aby se pozdější ruční změna splatnosti nepřepsala
        let ver: i64 = self.conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if ver < 1 {
            let _ = self.conn.execute(
                "UPDATE contracts SET due_day = '15. den předchozího měsíce na měsíc následující' \
                 WHERE due_day = '15. den v měsíci' AND asset_id IN (SELECT id FROM assets WHERE asset_type = 'residential')",
                [],
            );
            self.conn.execute_batch("PRAGMA user_version = 1")?;
        }

        Ok(())
    }

    /// Jednorázová migrace firem (v1.2.4). Běží jen dokud neexistuje sekce METROPOLE CZ.
    /// Na existující DB bez subjektů (fresh install) nic nezakládá.
    fn migrate_firms_v124(&self) -> Result<()> {
        let done: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM subjects WHERE name = 'METROPOLE CZ – Komerční prostory'", [], |r| r.get(0))?;
        let has_any: i64 = self.conn.query_row("SELECT COUNT(*) FROM subjects", [], |r| r.get(0))?;
        if done > 0 || has_any == 0 {
            return Ok(());
        }
        let tx = self.conn.unchecked_transaction()?;
        // JIHOTANK / JIHOTANK CB → sekce "Komerční prostory" (přejmenovat i všechny odkazy)
        for (old, new) in [("JIHOTANK", "JIHOTANK – Komerční prostory"), ("JIHOTANK CB", "JIHOTANK CB – Komerční prostory")] {
            let exists_new: i64 = tx.query_row("SELECT COUNT(*) FROM subjects WHERE name = ?1", params![new], |r| r.get(0))?;
            if exists_new == 0 {
                tx.execute("UPDATE subjects SET name = ?1 WHERE name = ?2", params![new, old])?;
            }
            tx.execute("UPDATE assets SET subject = ?1 WHERE subject = ?2", params![new, old])?;
            tx.execute("UPDATE documents SET subject = ?1 WHERE subject = ?2", params![new, old])?;
            tx.execute("UPDATE revisions SET subject = ?1 WHERE subject = ?2", params![new, old])?;
        }
        // Nové sekce (komerční + parkování); prázdné se v UI nezobrazují
        for (name, asset_type) in [
            ("JIHOTANK – Komerční prostory", "commercial"),
            ("JIHOTANK – Parkování", "parking"),
            ("JIHOTANK CB – Komerční prostory", "commercial"),
            ("JIHOTANK CB – Parkování", "parking"),
            ("METROPOLE CZ – Komerční prostory", "commercial"),
            ("METROPOLE CZ – Parkování", "parking"),
        ] {
            tx.execute(
                "INSERT OR IGNORE INTO subjects (id, name, sort_order, asset_type, is_vat_payer) VALUES (?1, ?2, 999, ?3, 1)",
                params![Self::new_id(), name, asset_type],
            )?;
        }
        // Pořadí firem: METROPOLE CB, Bürger Pavel, METROPOLE CZ, JIHOTANK, JIHOTANK CB, Ostatní
        // (sekce uvnitř firmy si drží dosavadní pořadí)
        let firms = [
            ("METROPOLE CB", "MCB", "wine"),
            ("Bürger Pavel", "BP", "royal"),
            ("METROPOLE CZ", "MCZ", "violet"),
            ("JIHOTANK", "JT", "teal"),
            ("JIHOTANK CB", "JCB", "orange"),
            ("Ostatní", "OST", "slate"),
        ];
        let mut order = 1i64;
        for (firm, short, color) in firms {
            let prefix = format!("{} – %", firm);
            let names: Vec<String> = {
                let mut stmt = tx.prepare(
                    "SELECT name FROM subjects WHERE name = ?1 OR name LIKE ?2 ORDER BY sort_order, name")?;
                let rows = stmt.query_map(params![firm, prefix], |r| r.get::<_, String>(0))?;
                rows.collect::<std::result::Result<Vec<_>, _>>()?
            };
            for n in names {
                tx.execute("UPDATE subjects SET sort_order = ?1, short_name = ?2, color = ?3 WHERE name = ?4",
                    params![order, short, color, n])?;
                order += 1;
            }
        }
        // Ostatní subjekty mimo známé firmy → na konec, původní pořadí zachováno
        tx.execute("UPDATE subjects SET sort_order = sort_order + 1000 WHERE short_name = ''", [])?;
        tx.commit()?;
        Ok(())
    }

    fn new_id() -> String {
        Uuid::new_v4().to_string()
    }

    fn now_cs() -> String {
        Local::now().format("%-d. %-m. %Y %H:%M").to_string()
    }

    // ─────────────────────────────────────────
    // TENANTS
    // ─────────────────────────────────────────

    pub fn get_tenants(&self) -> Result<Vec<Tenant>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, phone, email, ico, dic, address, bank_account, status, tags, added, initials, avatar_bg, avatar_color, tenant_type, contact_person, whatsapp, billing_email, birth_date, id_card FROM tenants ORDER BY name"
        )?;
        let items = stmt.query_map([], |row| {
            let tags_str: String = row.get(9).unwrap_or_default();
            Ok(Tenant {
                id: row.get(0)?,
                name: row.get(1)?,
                phone: row.get(2)?,
                email: row.get(3)?,
                ico: row.get(4)?,
                dic: row.get(5)?,
                address: row.get(6)?,
                bank_account: row.get(7)?,
                status: row.get::<_, Option<String>>(8)?.unwrap_or_else(|| "active".into()),
                tags: serde_json::from_str(&tags_str).unwrap_or_default(),
                added: row.get(10)?,
                initials: row.get(11)?,
                avatar_bg: row.get(12)?,
                avatar_color: row.get(13)?,
                tenant_type: row.get(14)?,
                contact_person: row.get(15)?,
                whatsapp: row.get(16)?,
                billing_email: row.get(17)?,
                birth_date: row.get(18)?,
                id_card: row.get(19)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn add_tenant(&self, t: &Tenant) -> Result<Tenant> {
        let id = Self::new_id();
        let tags_json = serde_json::to_string(&t.tags)?;
        let today = Local::now().format("%-d. %-m. %Y").to_string();
        self.conn.execute(
            "INSERT INTO tenants (id, name, phone, email, ico, dic, address, bank_account, status, tags, added, initials, avatar_bg, avatar_color, tenant_type, contact_person, whatsapp, billing_email, birth_date, id_card)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
            params![id, t.name, t.phone, t.email, t.ico, t.dic, t.address, t.bank_account,
                    t.status, tags_json,
                    t.added.as_deref().unwrap_or(&today),
                    t.initials, t.avatar_bg, t.avatar_color,
                    t.tenant_type, t.contact_person, t.whatsapp, t.billing_email, t.birth_date, t.id_card],
        )?;
        let mut result = t.clone();
        result.id = id;
        Ok(result)
    }

    pub fn update_tenant(&self, id: &str, t: &Tenant) -> Result<()> {
        let tags_json = serde_json::to_string(&t.tags)?;
        self.conn.execute(
            "UPDATE tenants SET name=?1, phone=?2, email=?3, ico=?4, dic=?5, address=?6, bank_account=?7, status=?8, tags=?9, initials=?10, avatar_bg=?11, avatar_color=?12, tenant_type=?13, contact_person=?14, whatsapp=?15, billing_email=?16, birth_date=?17, id_card=?18 WHERE id=?19",
            params![t.name, t.phone, t.email, t.ico, t.dic, t.address, t.bank_account, t.status, tags_json, t.initials, t.avatar_bg, t.avatar_color, t.tenant_type, t.contact_person, t.whatsapp, t.billing_email, t.birth_date, t.id_card, id],
        )?;
        Ok(())
    }

    pub fn delete_tenant(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM tenants WHERE id=?1", params![id])?;
        Ok(())
    }

    // ─────────────────────────────────────────
    // ASSETS
    // ─────────────────────────────────────────

    pub fn get_assets(&self) -> Result<Vec<Asset>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, asset_type, subject, unit, floor, size, format, status, notes, balcony, commerce_type FROM assets ORDER BY subject, unit"
        )?;
        let items = stmt.query_map([], |row| {
            Ok(Asset {
                id: row.get(0)?,
                asset_type: row.get(1)?,
                subject: row.get(2)?,
                unit: row.get(3)?,
                floor: row.get(4)?,
                size: row.get(5)?,
                format: row.get(6)?,
                status: row.get::<_, Option<String>>(7)?.unwrap_or_else(|| "free".into()),
                notes: row.get(8)?,
                balcony: row.get(9)?,
                commerce_type: row.get(10)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn add_asset(&self, a: &Asset) -> Result<Asset> {
        let id = Self::new_id();
        self.conn.execute(
            "INSERT INTO assets (id, asset_type, subject, unit, floor, size, format, status, notes, balcony, commerce_type)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![id, a.asset_type, a.subject, a.unit, a.floor, a.size, a.format, a.status, a.notes, a.balcony, a.commerce_type],
        )?;
        let mut result = a.clone();
        result.id = id;
        Ok(result)
    }

    pub fn update_asset(&self, id: &str, a: &Asset) -> Result<()> {
        self.conn.execute(
            "UPDATE assets SET asset_type=?1, subject=?2, unit=?3, floor=?4, size=?5, format=?6, status=?7, notes=?8, balcony=?9, commerce_type=?10 WHERE id=?11",
            params![a.asset_type, a.subject, a.unit, a.floor, a.size, a.format, a.status, a.notes, a.balcony, a.commerce_type, id],
        )?;
        Ok(())
    }

    pub fn delete_asset(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM assets WHERE id=?1", params![id])?;
        Ok(())
    }

    // ─────────────────────────────────────────
    // CONTRACTS
    // ─────────────────────────────────────────

    pub fn get_contracts(&self) -> Result<Vec<Contract>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, tenant_id, asset_id, rent, deposit, cauce, parking, start_date, end_date, status, addenda, due_day, termination_months, renewal_method, valorization_enabled, valorization_date, invoice_due, contract_version, occupants, permanent_residents, payment_frequency, deposit_water, co_residents, contract_notes, energy_settlements, handover_date, included_parking_spots, billing_subject, vat_exempt, group_label, auto_renewal_type, flat_fee, rent_total, COALESCE(calendar_year_billing, 0) FROM contracts ORDER BY created_at"
        )?;
        let items = stmt.query_map([], |row| {
            let addenda_str: String = row.get(10).unwrap_or_else(|_| "[]".into());
            let energy_str: String = row.get(24).unwrap_or_else(|_| "[]".into());
            Ok(Contract {
                id: row.get(0)?,
                tenant_id: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                asset_id: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                rent: row.get(3).unwrap_or(0.0),
                deposit: row.get(4).unwrap_or(0.0),
                cauce: row.get(5).unwrap_or(0.0),
                parking: row.get(6).unwrap_or(0.0),
                start: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                end: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
                status: row.get::<_, Option<String>>(9)?.unwrap_or_else(|| "active".into()),
                addenda: serde_json::from_str(&addenda_str).unwrap_or_default(),
                due_day: row.get(11)?,
                termination_months: row.get(12)?,
                renewal_method: row.get(13)?,
                valorization_enabled: row.get(14)?,
                valorization_date: row.get(15)?,
                invoice_due: row.get(16)?,
                contract_version: row.get(17)?,
                occupants: row.get(18)?,
                permanent_residents: row.get(19)?,
                payment_frequency: row.get(20)?,
                deposit_water: row.get(21).unwrap_or(0.0),
                co_residents: row.get(22)?,
                contract_notes: row.get(23)?,
                energy_settlements: serde_json::from_str(&energy_str).unwrap_or_default(),
                handover_date: row.get(25)?,
                included_parking_spots: row.get::<_, Option<i64>>(26)?.unwrap_or(0),
                billing_subject: row.get(27)?,
                vat_exempt: row.get::<_, Option<i64>>(28)?.unwrap_or(0),
                group_label: row.get(29)?,
                auto_renewal_type: row.get(30)?,
                flat_fee: row.get(31).unwrap_or(0.0),
                rent_total: row.get(32).unwrap_or(0.0),
                amendments: vec![],
                calendar_year_billing: row.get::<_, i64>(33).unwrap_or(0) != 0,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;

        // Načti amendments pro všechny smlouvy
        let mut amend_stmt = self.conn.prepare(
            "SELECT id, contract_id, effective_from, rent, deposit, deposit_water, flat_fee, parking, note, added FROM contract_amendments ORDER BY effective_from ASC"
        )?;
        let amendments: Vec<ContractAmendment> = amend_stmt.query_map([], |row| {
            Ok(ContractAmendment {
                id: row.get(0)?,
                contract_id: row.get(1)?,
                effective_from: row.get(2)?,
                rent: row.get(3)?,
                deposit: row.get(4)?,
                deposit_water: row.get(5)?,
                flat_fee: row.get(6)?,
                parking: row.get(7)?,
                note: row.get(8)?,
                added: row.get(9)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;

        // Přiřaď amendments ke správným smlouvám
        let mut result = items;
        for c in &mut result {
            c.amendments = amendments.iter().filter(|a| a.contract_id == c.id).cloned().collect();
        }
        Ok(result)
    }

    /// Firma = část názvu subjektu před " – " (celý název, pokud oddělovač chybí).
    fn firm_of(subject: &str) -> String {
        subject.split(" – ").next().unwrap_or(subject).trim().to_string()
    }

    /// Firma (pronajímatel) smlouvy: u typu Ostatní subjekt předmětu, jinak billing_subject nebo subjekt předmětu.
    fn firm_of_contract(&self, asset_id: &str, billing_subject: &Option<String>) -> Result<String> {
        let (asset_type, asset_subject): (String, String) = self.conn.query_row(
            "SELECT asset_type, COALESCE(subject, '') FROM assets WHERE id = ?1",
            params![asset_id], |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap_or_default();
        let subj = match billing_subject {
            Some(b) if asset_type != "ostatni" && !b.trim().is_empty() => b.clone(),
            _ => asset_subject,
        };
        Ok(Self::firm_of(&subj))
    }

    /// Skupina smluv (group_label) nesmí být sdílená mezi firmami – skupinové platby se párují
    /// jen podle názvu skupiny, sdílený název by slil platby dvou firem.
    fn check_group_label(&self, c: &Contract, self_id: Option<&str>) -> Result<()> {
        let label = match &c.group_label {
            Some(l) if !l.trim().is_empty() => l.clone(),
            _ => return Ok(()),
        };
        let firm = self.firm_of_contract(&c.asset_id, &c.billing_subject)?;
        let others: Vec<(String, String, Option<String>)> = {
            let mut stmt = self.conn.prepare("SELECT id, asset_id, billing_subject FROM contracts WHERE group_label = ?1")?;
            let rows = stmt.query_map(params![label], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };
        for (oid, oasset, obilling) in others {
            if Some(oid.as_str()) == self_id { continue; }
            let ofirm = self.firm_of_contract(&oasset, &obilling)?;
            if ofirm != firm {
                return Err(AppError::Other(format!(
                    "Skupina „{}“ už patří firmě {}. Každá firma musí mít vlastní název skupiny.", label, ofirm)));
            }
        }
        Ok(())
    }

    pub fn add_contract(&self, c: &Contract) -> Result<Contract> {
        self.check_group_label(c, None)?;
        let id = Self::new_id();
        let addenda_json = serde_json::to_string(&c.addenda)?;
        let energy_json = serde_json::to_string(&c.energy_settlements)?;
        self.conn.execute(
            "INSERT INTO contracts (id, tenant_id, asset_id, rent, deposit, cauce, parking, start_date, end_date, status, addenda, due_day, termination_months, renewal_method, valorization_enabled, valorization_date, invoice_due, contract_version, occupants, permanent_residents, payment_frequency, deposit_water, co_residents, contract_notes, energy_settlements, handover_date, included_parking_spots, billing_subject, vat_exempt, group_label, auto_renewal_type, flat_fee, rent_total, calendar_year_billing)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,?33,?34)",
            params![id, c.tenant_id, c.asset_id, c.rent, c.deposit, c.cauce, c.parking, c.start, c.end, c.status, addenda_json, c.due_day, c.termination_months, c.renewal_method, c.valorization_enabled, c.valorization_date, c.invoice_due, c.contract_version, c.occupants, c.permanent_residents, c.payment_frequency, c.deposit_water, c.co_residents, c.contract_notes, energy_json, c.handover_date, c.included_parking_spots, c.billing_subject, c.vat_exempt, c.group_label, c.auto_renewal_type, c.flat_fee, c.rent_total, c.calendar_year_billing as i64],
        )?;
        self.conn.execute("UPDATE assets SET status='occupied' WHERE id=?1", params![c.asset_id])?;
        let mut result = c.clone();
        result.id = id;
        Ok(result)
    }

    pub fn update_contract(&self, id: &str, c: &Contract) -> Result<()> {
        self.check_group_label(c, Some(id))?;
        let addenda_json = serde_json::to_string(&c.addenda)?;
        let energy_json = serde_json::to_string(&c.energy_settlements)?;
        self.conn.execute(
            "UPDATE contracts SET tenant_id=?1, asset_id=?2, rent=?3, deposit=?4, cauce=?5, parking=?6, start_date=?7, end_date=?8, status=?9, addenda=?10, due_day=?11, termination_months=?12, renewal_method=?13, valorization_enabled=?14, valorization_date=?15, invoice_due=?16, contract_version=?17, occupants=?18, permanent_residents=?19, payment_frequency=?20, deposit_water=?21, co_residents=?22, contract_notes=?23, energy_settlements=?24, handover_date=?25, included_parking_spots=?26, billing_subject=?27, vat_exempt=?28, group_label=?29, auto_renewal_type=?30, flat_fee=?31, rent_total=?32, calendar_year_billing=?33 WHERE id=?34",
            params![c.tenant_id, c.asset_id, c.rent, c.deposit, c.cauce, c.parking, c.start, c.end, c.status, addenda_json, c.due_day, c.termination_months, c.renewal_method, c.valorization_enabled, c.valorization_date, c.invoice_due, c.contract_version, c.occupants, c.permanent_residents, c.payment_frequency, c.deposit_water, c.co_residents, c.contract_notes, energy_json, c.handover_date, c.included_parking_spots, c.billing_subject, c.vat_exempt, c.group_label, c.auto_renewal_type, c.flat_fee, c.rent_total, c.calendar_year_billing as i64, id],
        )?;
        Ok(())
    }

    pub fn delete_contract(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM contracts WHERE id=?1", params![id])?;
        Ok(())
    }

    // ─────────────────────────────────────────
    // CONTRACT AMENDMENTS
    // ─────────────────────────────────────────

    pub fn add_amendment(&self, a: &ContractAmendment) -> Result<ContractAmendment> {
        let id = Self::new_id();
        let added = Self::now_cs();
        self.conn.execute(
            "INSERT INTO contract_amendments (id, contract_id, effective_from, rent, deposit, deposit_water, flat_fee, parking, note, added) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![id, a.contract_id, a.effective_from, a.rent, a.deposit, a.deposit_water, a.flat_fee, a.parking, a.note, added],
        )?;
        let mut result = a.clone();
        result.id = id;
        result.added = Some(added);
        Ok(result)
    }

    pub fn delete_amendment(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM contract_amendments WHERE id=?1", params![id])?;
        Ok(())
    }

    // ─────────────────────────────────────────
    // PAYMENTS
    // ─────────────────────────────────────────

    pub fn get_payments(&self) -> Result<Vec<Payment>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contract_id, amount, date, month, COALESCE(payment_type, ''), COALESCE(group_label, ''), COALESCE(note, ''), COALESCE(agreed, 0) FROM payments ORDER BY created_at DESC"
        )?;
        let items = stmt.query_map([], |row| {
            let contract_id_raw: String = row.get::<_, Option<String>>(1)?.unwrap_or_default();
            let group_label_raw: String = row.get(6).unwrap_or_default();
            // Skupinové platby mají contract_id NULL v DB — rekonstruujeme "group:label"
            let contract_id = if contract_id_raw.is_empty() && !group_label_raw.is_empty() {
                format!("group:{}", group_label_raw)
            } else {
                contract_id_raw
            };
            Ok(Payment {
                id: row.get(0)?,
                contract_id,
                amount: row.get(2).unwrap_or(0.0),
                date: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                month: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                payment_type: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                group_label: if group_label_raw.is_empty() { None } else { Some(group_label_raw) },
                note: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                agreed: row.get::<_, i64>(8).unwrap_or(0) != 0,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn add_payment(&self, p: &Payment) -> Result<Payment> {
        let id = Self::new_id();
        // Skupinové platby mají contract_id ve tvaru "group:label" — uložíme NULL aby neporušily FK
        let contract_id_db: Option<&str> = if p.contract_id.starts_with("group:") {
            None
        } else {
            Some(&p.contract_id)
        };

        // Ochrana před duplikáty — pokud platba pro (contract_id, group_label, month, payment_type) už existuje, vrátíme ji
        // POZOR: skupinové platby musí matchovat i group_label, jinak se různé skupiny se stejným měsícem kříží
        let existing: Option<String> = if contract_id_db.is_none() {
            // Skupinová platba — matchuj přesně podle group_label
            self.conn.query_row(
                "SELECT id FROM payments WHERE contract_id IS NULL AND group_label=?1 AND month=?2 AND payment_type=?3 LIMIT 1",
                params![p.group_label, p.month, p.payment_type],
                |row| row.get(0),
            ).ok()
        } else {
            // Běžná platba — matchuj podle contract_id
            self.conn.query_row(
                "SELECT id FROM payments WHERE contract_id IS ?1 AND month=?2 AND payment_type=?3 LIMIT 1",
                params![contract_id_db, p.month, p.payment_type],
                |row| row.get(0),
            ).ok()
        };
        if let Some(existing_id) = existing {
            let mut result = p.clone();
            result.id = existing_id;
            return Ok(result);
        }

        self.conn.execute(
            "INSERT INTO payments (id, contract_id, amount, date, month, payment_type, group_label, note, agreed) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, contract_id_db, p.amount, p.date, p.month, p.payment_type, p.group_label, p.note, p.agreed as i64],
        )?;
        let mut result = p.clone();
        result.id = id;
        Ok(result)
    }

    pub fn delete_payment(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM payments WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn cleanup_duplicate_payments(&self) -> Result<usize> {
        let deleted = self.conn.execute(
            "DELETE FROM payments WHERE id NOT IN (
                SELECT MIN(id) FROM payments
                GROUP BY COALESCE(contract_id, ''), COALESCE(group_label, ''), month, COALESCE(payment_type, '')
            )",
            [],
        )?;
        Ok(deleted)
    }

    pub fn update_payment_amount(&self, id: &str, amount: f64, agreed: bool, date: Option<String>) -> Result<()> {
        match date {
            Some(d) => self.conn.execute(
                "UPDATE payments SET amount=?1, agreed=?2, date=?3 WHERE id=?4",
                params![amount, agreed as i64, d, id],
            )?,
            None => self.conn.execute(
                "UPDATE payments SET amount=?1, agreed=?2 WHERE id=?3",
                params![amount, agreed as i64, id],
            )?,
        };
        Ok(())
    }

    // ─────────────────────────────────────────
    // TASKS (Kanban)
    // ─────────────────────────────────────────

    pub fn get_tasks(&self) -> Result<Vec<Task>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, description, priority, deadline, tag, reminders, recurring, status FROM tasks ORDER BY created_at"
        )?;
        let items = stmt.query_map([], |row| {
            let rem_str: String = row.get(6).unwrap_or_else(|_| "{\"d3\":false,\"d1\":false,\"d0\":false,\"h1\":false}".into());
            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                priority: row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "Nízká".into()),
                deadline: row.get(4)?,
                tag: row.get(5)?,
                reminders: serde_json::from_str(&rem_str).unwrap_or(serde_json::json!({})),
                recurring: row.get::<_, i32>(7).unwrap_or(0) != 0,
                status: row.get::<_, Option<String>>(8)?.unwrap_or_else(|| "todo".into()),
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn add_task(&self, t: &Task) -> Result<Task> {
        let id = Self::new_id();
        let rem_json = serde_json::to_string(&t.reminders)?;
        self.conn.execute(
            "INSERT INTO tasks (id, title, description, priority, deadline, tag, reminders, recurring, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, t.title, t.description, t.priority, t.deadline, t.tag, rem_json, t.recurring as i32, t.status],
        )?;
        let mut result = t.clone();
        result.id = id;
        Ok(result)
    }

    pub fn update_task(&self, id: &str, t: &Task) -> Result<()> {
        let rem_json = serde_json::to_string(&t.reminders)?;
        self.conn.execute(
            "UPDATE tasks SET title=?1, description=?2, priority=?3, deadline=?4, tag=?5, reminders=?6, recurring=?7, status=?8 WHERE id=?9",
            params![t.title, t.description, t.priority, t.deadline, t.tag, rem_json, t.recurring as i32, t.status, id],
        )?;
        Ok(())
    }

    pub fn delete_task(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM tasks WHERE id=?1", params![id])?;
        Ok(())
    }

    // ─────────────────────────────────────────
    // REVISIONS
    // ─────────────────────────────────────────

    pub fn get_revisions(&self) -> Result<Vec<Revision>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, last_date, interval_months, asset_id, notes, subject FROM revisions ORDER BY last_date"
        )?;
        let items = stmt.query_map([], |row| {
            Ok(Revision {
                id: row.get(0)?,
                title: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                last_date: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                interval: row.get(3).unwrap_or(12),
                asset_id: row.get(4)?,
                notes: row.get(5)?,
                subject: row.get(6)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn add_revision(&self, r: &Revision) -> Result<Revision> {
        let id = Self::new_id();
        self.conn.execute(
            "INSERT INTO revisions (id, title, last_date, interval_months, asset_id, notes, subject) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, r.title, r.last_date, r.interval, r.asset_id, r.notes, r.subject],
        )?;
        let mut result = r.clone();
        result.id = id;
        Ok(result)
    }

    pub fn update_revision(&self, id: &str, r: &Revision) -> Result<()> {
        self.conn.execute(
            "UPDATE revisions SET title=?1, last_date=?2, interval_months=?3, asset_id=?4, notes=?5, subject=?6 WHERE id=?7",
            params![r.title, r.last_date, r.interval, r.asset_id, r.notes, r.subject, id],
        )?;
        Ok(())
    }

    pub fn delete_revision(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM revisions WHERE id=?1", params![id])?;
        Ok(())
    }

    // ─────────────────────────────────────────
    // DOCUMENTS
    // ─────────────────────────────────────────

    pub fn get_documents(&self) -> Result<Vec<Document>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, doc_type, subject, ext, related_id, related_type, uploaded_at, notes, contract_link_id, contract_link_type FROM documents ORDER BY created_at DESC"
        )?;
        let items = stmt.query_map([], |row| {
            Ok(Document {
                id: row.get(0)?,
                name: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                doc_type: row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "Ostatní".into()),
                subject: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                ext: row.get::<_, Option<String>>(4)?.unwrap_or_else(|| "pdf".into()),
                related_id: row.get(5)?,
                related_type: row.get(6)?,
                uploaded_at: row.get(7)?,
                notes: row.get(8)?,
                contract_link_id: row.get(9)?,
                contract_link_type: row.get(10)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn add_document(&self, d: &Document) -> Result<Document> {
        let id = Self::new_id();
        let today = Local::now().format("%-d. %-m. %Y").to_string();
        self.conn.execute(
            "INSERT INTO documents (id, name, doc_type, subject, ext, related_id, related_type, uploaded_at, notes, contract_link_id, contract_link_type)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![id, d.name, d.doc_type, d.subject, d.ext, d.related_id, d.related_type,
                    d.uploaded_at.as_deref().unwrap_or(&today), d.notes,
                    d.contract_link_id, d.contract_link_type],
        )?;
        let mut result = d.clone();
        result.id = id;
        Ok(result)
    }

    pub fn delete_document(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM documents WHERE id=?1", params![id])?;
        Ok(())
    }

    // ─────────────────────────────────────────
    // LOGS (Audit trail)
    // ─────────────────────────────────────────

    /// Záznamy historie, jejichž detail obsahuje některý z textů (pro historii smlouvy), nejnovější první.
    pub fn search_logs(&self, terms: &[String], limit: i64) -> Result<Vec<Log>> {
        let terms: Vec<&String> = terms.iter().filter(|t| t.trim().len() >= 3).take(200).collect();
        if terms.is_empty() { return Ok(vec![]); }
        let cond = terms.iter().enumerate().map(|(i, _)| format!("instr(detail, ?{}) > 0", i + 1)).collect::<Vec<_>>().join(" OR ");
        let sql = format!("SELECT id, timestamp, user_name, action, module, detail FROM logs WHERE {} ORDER BY created_at DESC LIMIT {}", cond, limit.clamp(1, 1000));
        let mut stmt = self.conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> = terms.iter().map(|t| *t as &dyn rusqlite::ToSql).collect();
        let items = stmt.query_map(params.as_slice(), |row| {
            Ok(Log {
                id: row.get(0)?,
                timestamp: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                user: row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "Ondra".into()),
                action: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                module: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                detail: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn get_logs(&self) -> Result<Vec<Log>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, user_name, action, module, detail FROM logs ORDER BY created_at DESC LIMIT 500"
        )?;
        let items = stmt.query_map([], |row| {
            Ok(Log {
                id: row.get(0)?,
                timestamp: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                user: row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "Ondra".into()),
                action: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                module: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                detail: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn add_log(&self, user: &str, action: &str, module: &str, detail: &str) -> Result<Log> {
        let id = Self::new_id();
        let ts = Self::now_cs();
        self.conn.execute(
            "INSERT INTO logs (id, timestamp, user_name, action, module, detail) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, ts, user, action, module, detail],
        )?;
        Ok(Log { id, timestamp: ts, user: user.into(), action: action.into(), module: module.into(), detail: detail.into() })
    }

    // ─────────────────────────────────────────
    // TRASH
    // ─────────────────────────────────────────

    pub fn get_trash(&self) -> Result<Vec<TrashItem>> {
        let mut stmt = self.conn.prepare(
            "SELECT trash_id, item_type, item_data, title, deleted_at FROM trash ORDER BY created_at DESC"
        )?;
        let items = stmt.query_map([], |row| {
            let item_str: String = row.get(2).unwrap_or_else(|_| "{}".into());
            Ok(TrashItem {
                trash_id: row.get(0)?,
                item_type: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                item: serde_json::from_str(&item_str).unwrap_or(serde_json::json!({})),
                title: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                deleted_at: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn move_to_trash(&self, item_type: &str, item: &serde_json::Value, title: &str) -> Result<TrashItem> {
        let trash_id = Self::new_id();
        let deleted_at = Self::now_cs();
        let item_json = serde_json::to_string(item)?;
        self.conn.execute(
            "INSERT INTO trash (trash_id, item_type, item_data, title, deleted_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![trash_id, item_type, item_json, title, deleted_at],
        )?;
        Ok(TrashItem {
            trash_id,
            item_type: item_type.into(),
            item: item.clone(),
            title: title.into(),
            deleted_at,
        })
    }

    pub fn delete_trash_item(&self, trash_id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM trash WHERE trash_id=?1", params![trash_id])?;
        Ok(())
    }

    pub fn empty_trash(&self) -> Result<()> {
        self.conn.execute("DELETE FROM trash", [])?;
        Ok(())
    }

    // ─────────────────────────────────────────
    // OPERATIONAL COSTS (Provozní náklady)
    // ─────────────────────────────────────────

    pub fn get_operational_costs(&self) -> Result<Vec<OperationalCost>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, object_name, category, amount, frequency, period_from, period_to, notes, added, COALESCE(vat_included, 0) FROM operational_costs ORDER BY created_at DESC"
        )?;
        let items = stmt.query_map([], |row| {
            Ok(OperationalCost {
                id: row.get(0)?,
                object_name: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                category: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                amount: row.get(3).unwrap_or(0.0),
                frequency: row.get::<_, Option<String>>(4)?.unwrap_or_else(|| "Ročně".into()),
                period_from: row.get(5)?,
                period_to: row.get(6)?,
                notes: row.get(7)?,
                added: row.get(8)?,
                vat_included: row.get::<_, i64>(9).unwrap_or(0) != 0,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn add_operational_cost(&self, oc: &OperationalCost) -> Result<OperationalCost> {
        let id = Self::new_id();
        let today = Local::now().format("%-d. %-m. %Y").to_string();
        self.conn.execute(
            "INSERT INTO operational_costs (id, object_name, category, amount, frequency, period_from, period_to, notes, added, vat_included) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![id, oc.object_name, oc.category, oc.amount, oc.frequency, oc.period_from, oc.period_to, oc.notes, oc.added.as_deref().unwrap_or(&today), oc.vat_included as i64],
        )?;
        let mut result = oc.clone();
        result.id = id;
        Ok(result)
    }

    pub fn update_operational_cost(&self, id: &str, oc: &OperationalCost) -> Result<()> {
        self.conn.execute(
            "UPDATE operational_costs SET object_name=?1, category=?2, amount=?3, frequency=?4, period_from=?5, period_to=?6, notes=?7, vat_included=?8 WHERE id=?9",
            params![oc.object_name, oc.category, oc.amount, oc.frequency, oc.period_from, oc.period_to, oc.notes, oc.vat_included as i64, id],
        )?;
        Ok(())
    }

    pub fn delete_operational_cost(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM operational_costs WHERE id=?1", params![id])?;
        Ok(())
    }

    // ─────────────────────────────────────────
    // SUBJECTS (Subjekty pronajímatelů)
    // ─────────────────────────────────────────

    pub fn get_subjects(&self) -> Result<Vec<Subject>> {
        let mut stmt = self.conn.prepare(
            "SELECT name, asset_type, is_vat_payer, COALESCE(short_name, ''), COALESCE(color, '') FROM subjects ORDER BY sort_order"
        )?;
        let items = stmt.query_map([], |row| {
            Ok(Subject {
                name: row.get(0)?,
                asset_type: row.get(1)?,
                is_vat_payer: row.get::<_, i64>(2)? != 0,
                short_name: row.get(3)?,
                color: row.get(4)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(items)
    }

    // ─────────────────────────────────────────
    // OBJECTS (Fyzické budovy — provozní náklady + revize)
    // ─────────────────────────────────────────

    /// Objekty (budovy) s firmou, které patří – pro výběr firma → budova.
    pub fn get_object_firms(&self) -> Result<Vec<ObjectItem>> {
        let mut stmt = self.conn.prepare(
            "SELECT name, COALESCE(firm, '') FROM objects ORDER BY sort_order"
        )?;
        let items = stmt.query_map([], |row| {
            Ok(ObjectItem { name: row.get(0)?, firm: row.get(1)? })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(items)
    }

    // ─────────────────────────────────────────
    // SPRÁVA FIREM, SEKCÍ A BUDOV (Nastavení) – přejmenování propisuje všechny odkazy v jedné transakci
    // ─────────────────────────────────────────

    /// Přejmenuje sekci (subjekt) a všechny odkazy na ni; nastaví typ a DPH.
    pub fn update_section(&self, old_name: &str, new_name: &str, asset_type: &str, is_vat_payer: bool) -> Result<()> {
        let new_name = new_name.trim();
        if new_name.is_empty() { return Err(AppError::Other("Název sekce nesmí být prázdný.".into())); }
        let tx = self.conn.unchecked_transaction()?;
        if new_name != old_name {
            let exists: i64 = tx.query_row("SELECT COUNT(*) FROM subjects WHERE name = ?1", params![new_name], |r| r.get(0))?;
            if exists > 0 { return Err(AppError::Other(format!("Sekce „{}“ už existuje.", new_name))); }
            tx.execute("UPDATE subjects SET name = ?1 WHERE name = ?2", params![new_name, old_name])?;
            tx.execute("UPDATE assets SET subject = ?1 WHERE subject = ?2", params![new_name, old_name])?;
            tx.execute("UPDATE documents SET subject = ?1 WHERE subject = ?2", params![new_name, old_name])?;
            tx.execute("UPDATE revisions SET subject = ?1 WHERE subject = ?2", params![new_name, old_name])?;
            tx.execute("UPDATE contracts SET billing_subject = ?1 WHERE billing_subject = ?2", params![new_name, old_name])?;
        }
        tx.execute("UPDATE subjects SET asset_type = ?1, is_vat_payer = ?2 WHERE name = ?3",
            params![asset_type, if is_vat_payer { 1 } else { 0 }, new_name])?;
        tx.commit()?;
        Ok(())
    }

    /// Přejmenuje firmu (část názvu před " – ") ve všech sekcích a odkazech; nastaví zkratku a barvu.
    pub fn update_firm(&self, old_firm: &str, new_firm: &str, short_name: &str, color: &str) -> Result<()> {
        let new_firm = new_firm.trim();
        if new_firm.is_empty() { return Err(AppError::Other("Název firmy nesmí být prázdný.".into())); }
        if new_firm.contains(" – ") { return Err(AppError::Other("Název firmy nesmí obsahovat „ – “.".into())); }
        let tx = self.conn.unchecked_transaction()?;
        let prefix_old = format!("{} – ", old_firm);
        let names: Vec<String> = {
            let mut stmt = tx.prepare("SELECT name FROM subjects WHERE name = ?1 OR name LIKE ?2")?;
            let rows = stmt.query_map(params![old_firm, format!("{}%", prefix_old)], |r| r.get::<_, String>(0))?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };
        if new_firm != old_firm {
            let clash: i64 = tx.query_row("SELECT COUNT(*) FROM subjects WHERE name = ?1 OR name LIKE ?2",
                params![new_firm, format!("{} – %", new_firm)], |r| r.get(0))?;
            if clash > 0 { return Err(AppError::Other(format!("Firma „{}“ už existuje.", new_firm))); }
            for old in &names {
                let new = if old == old_firm { new_firm.to_string() } else { format!("{} – {}", new_firm, &old[prefix_old.len()..]) };
                tx.execute("UPDATE subjects SET name = ?1 WHERE name = ?2", params![new, old])?;
                tx.execute("UPDATE assets SET subject = ?1 WHERE subject = ?2", params![new, old])?;
                tx.execute("UPDATE documents SET subject = ?1 WHERE subject = ?2", params![new, old])?;
                tx.execute("UPDATE revisions SET subject = ?1 WHERE subject = ?2", params![new, old])?;
                tx.execute("UPDATE contracts SET billing_subject = ?1 WHERE billing_subject = ?2", params![new, old])?;
            }
            // billing_subject může obsahovat i čistý název firmy
            tx.execute("UPDATE contracts SET billing_subject = ?1 WHERE billing_subject = ?2", params![new_firm, old_firm])?;
            tx.execute("UPDATE objects SET firm = ?1 WHERE firm = ?2", params![new_firm, old_firm])?;
            // Štítky úkolů (Kanban) – čárkami oddělené, firma přesnou shodou
            let tags: Vec<(String, String)> = {
                let mut stmt = tx.prepare("SELECT id, tag FROM tasks WHERE tag IS NOT NULL AND tag <> ''")?;
                let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
                rows.collect::<std::result::Result<Vec<_>, _>>()?
            };
            for (id, tag) in tags {
                let parts: Vec<String> = tag.split(',').map(|x| x.trim().to_string()).collect();
                if parts.iter().any(|x| x == old_firm) {
                    let new_tag = parts.iter().map(|x| if x == old_firm { new_firm.to_string() } else { x.clone() }).collect::<Vec<_>>().join(", ");
                    tx.execute("UPDATE tasks SET tag = ?1 WHERE id = ?2", params![new_tag, id])?;
                }
            }
        }
        tx.execute("UPDATE subjects SET short_name = ?1, color = ?2 WHERE name = ?3 OR name LIKE ?4",
            params![short_name.trim(), color, new_firm, format!("{} – %", new_firm)])?;
        tx.commit()?;
        Ok(())
    }

    /// Přidá sekci (název "FIRMA – Sekce" nebo jen "FIRMA") na konec své firmy.
    pub fn add_section(&self, name: &str, asset_type: &str, is_vat_payer: bool, short_name: &str, color: &str) -> Result<()> {
        let name = name.trim();
        if name.is_empty() { return Err(AppError::Other("Název sekce nesmí být prázdný.".into())); }
        let exists: i64 = self.conn.query_row("SELECT COUNT(*) FROM subjects WHERE name = ?1", params![name], |r| r.get(0))?;
        if exists > 0 { return Err(AppError::Other(format!("Sekce „{}“ už existuje.", name))); }
        let firm = name.split(" – ").next().unwrap_or(name).trim().to_string();
        let tx = self.conn.unchecked_transaction()?;
        // Pozice: za poslední sekcí firmy, jinak na konec; ostatní posunout
        let after: Option<i64> = tx.query_row("SELECT MAX(sort_order) FROM subjects WHERE name = ?1 OR name LIKE ?2",
            params![firm, format!("{} – %", firm)], |r| r.get(0))?;
        let pos = match after {
            Some(p) => { tx.execute("UPDATE subjects SET sort_order = sort_order + 1 WHERE sort_order > ?1", params![p])?; p + 1 }
            None => tx.query_row("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM subjects", [], |r| r.get(0))?,
        };
        tx.execute("INSERT INTO subjects (id, name, sort_order, asset_type, is_vat_payer, short_name, color) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![Self::new_id(), name, pos, asset_type, if is_vat_payer { 1 } else { 0 }, short_name.trim(), color])?;
        tx.commit()?;
        Ok(())
    }

    /// Smaže sekci – jen pokud na ni nic neodkazuje.
    pub fn delete_section(&self, name: &str) -> Result<()> {
        let used: i64 = self.conn.query_row(
            "SELECT (SELECT COUNT(*) FROM assets WHERE subject = ?1) + (SELECT COUNT(*) FROM documents WHERE subject = ?1)
                  + (SELECT COUNT(*) FROM revisions WHERE subject = ?1) + (SELECT COUNT(*) FROM contracts WHERE billing_subject = ?1)",
            params![name], |r| r.get(0))?;
        if used > 0 { return Err(AppError::Other(format!("Sekci nelze smazat – používá ji {} záznamů (předměty, smlouvy, dokumenty, revize).", used))); }
        self.conn.execute("DELETE FROM subjects WHERE name = ?1", params![name])?;
        Ok(())
    }

    /// Nové pořadí sekcí (celý seznam názvů v pořadí).
    pub fn reorder_subjects(&self, names: &[String]) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        for (i, n) in names.iter().enumerate() {
            tx.execute("UPDATE subjects SET sort_order = ?1 WHERE name = ?2", params![(i + 1) as i64, n])?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Přidá nebo upraví budovu (old_name prázdné = nová); přejmenování propíše náklady, revize a dokumenty.
    pub fn save_object(&self, old_name: &str, name: &str, firm: &str) -> Result<()> {
        let name = name.trim();
        if name.is_empty() { return Err(AppError::Other("Název budovy nesmí být prázdný.".into())); }
        let tx = self.conn.unchecked_transaction()?;
        if old_name.is_empty() || name != old_name {
            let exists: i64 = tx.query_row("SELECT COUNT(*) FROM objects WHERE name = ?1", params![name], |r| r.get(0))?;
            if exists > 0 { return Err(AppError::Other(format!("Budova „{}“ už existuje.", name))); }
        }
        if old_name.is_empty() {
            let pos: i64 = tx.query_row("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM objects", [], |r| r.get(0))?;
            tx.execute("INSERT INTO objects (id, name, sort_order, firm) VALUES (?1, ?2, ?3, ?4)", params![Self::new_id(), name, pos, firm])?;
        } else {
            if name != old_name {
                tx.execute("UPDATE objects SET name = ?1 WHERE name = ?2", params![name, old_name])?;
                tx.execute("UPDATE operational_costs SET object_name = ?1 WHERE object_name = ?2", params![name, old_name])?;
                tx.execute("UPDATE revisions SET subject = ?1 WHERE subject = ?2", params![name, old_name])?;
                tx.execute("UPDATE documents SET subject = ?1 WHERE subject = ?2", params![name, old_name])?;
            }
            tx.execute("UPDATE objects SET firm = ?1 WHERE name = ?2", params![firm, name])?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Smaže budovu – jen pokud na ni nic neodkazuje.
    pub fn delete_object(&self, name: &str) -> Result<()> {
        let used: i64 = self.conn.query_row(
            "SELECT (SELECT COUNT(*) FROM operational_costs WHERE object_name = ?1) + (SELECT COUNT(*) FROM revisions WHERE subject = ?1)
                  + (SELECT COUNT(*) FROM documents WHERE subject = ?1)",
            params![name], |r| r.get(0))?;
        if used > 0 { return Err(AppError::Other(format!("Budovu nelze smazat – používá ji {} záznamů (náklady, revize, dokumenty).", used))); }
        self.conn.execute("DELETE FROM objects WHERE name = ?1", params![name])?;
        Ok(())
    }

    pub fn get_objects(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT name FROM objects ORDER BY sort_order"
        )?;
        let items = stmt.query_map([], |row| {
            row.get::<_, String>(0)
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(items)
    }
}
