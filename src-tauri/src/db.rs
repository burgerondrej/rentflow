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
                let _ = self.conn.execute(
                    "UPDATE contracts SET end_date=?1, auto_renewal_type=CASE WHEN auto_renewal_type='once_2y' THEN NULL ELSE auto_renewal_type END WHERE id=?2",
                    rusqlite::params![new_end_str, c.id],
                );
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

    pub fn add_contract(&self, c: &Contract) -> Result<Contract> {
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

        // Ochrana před duplikáty — pokud platba pro (contract_id, month, payment_type) už existuje, vrátíme ji
        let existing: Option<String> = self.conn.query_row(
            "SELECT id FROM payments WHERE contract_id IS ?1 AND month=?2 AND payment_type=?3 LIMIT 1",
            params![contract_id_db, p.month, p.payment_type],
            |row| row.get(0),
        ).ok();
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
                GROUP BY COALESCE(contract_id, ''), month, COALESCE(payment_type, '')
            )",
            [],
        )?;
        Ok(deleted)
    }

    pub fn update_payment_amount(&self, id: &str, amount: f64, agreed: bool) -> Result<()> {
        self.conn.execute(
            "UPDATE payments SET amount=?1, agreed=?2 WHERE id=?3",
            params![amount, agreed as i64, id],
        )?;
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
}
