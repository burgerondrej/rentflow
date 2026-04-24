use serde::{Deserialize, Serialize};

// ─────────────────────────────────────────
// TENANT (Nájemník)
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Tenant {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ico: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dic: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
    pub status: String,
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub added: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initials: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_bg: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bank_account: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tenant_type: Option<String>,       // "company" | "person"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact_person: Option<String>,    // Firma: kontaktní osoba
    #[serde(skip_serializing_if = "Option::is_none")]
    pub whatsapp: Option<String>,          // Firma: WhatsApp skupina
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_email: Option<String>,     // Firma: e-mail fakturace
    #[serde(skip_serializing_if = "Option::is_none")]
    pub birth_date: Option<String>,        // Osoba: datum narození
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id_card: Option<String>,           // Osoba: číslo OP
}

// ─────────────────────────────────────────
// ASSET (Předmět nájmu / Jednotka)
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    #[serde(default)]
    pub id: String,
    #[serde(rename = "type")]
    pub asset_type: String,
    pub subject: String,
    pub unit: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub floor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub balcony: Option<String>,       // bytové jednotky: plocha balkónu/terasy
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commerce_type: Option<String>, // komerční prostory: typ provozu
}

// ─────────────────────────────────────────
// CONTRACT (Smlouva)
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Contract {
    #[serde(default)]
    pub id: String,
    pub tenant_id: String,
    pub asset_id: String,
    pub rent: f64,
    pub deposit: f64,
    pub cauce: f64,
    #[serde(default)]
    pub parking: f64,
    pub start: String,
    pub end: String,
    pub status: String,
    pub addenda: Vec<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_day: Option<String>, // den splatnosti: "15", "dle faktury", nebo vlastní
    #[serde(skip_serializing_if = "Option::is_none")]
    pub termination_months: Option<i64>, // počet měsíců pro výpověd před koncem
    #[serde(skip_serializing_if = "Option::is_none")]
    pub renewal_method: Option<String>,  // "Formou dodatku" | "Formou nové smlouvy"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub valorization_enabled: Option<i64>, // 0 = ne, 1 = ano
    #[serde(skip_serializing_if = "Option::is_none")]
    pub valorization_date: Option<String>, // datum poslední valorizace
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invoice_due: Option<String>,     // "Dle vystavené faktury" | "Do 15. dne v měsíci"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contract_version: Option<String>, // "Nová verze" | "Stará verze" (bytové jednotky)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub occupants: Option<i64>,           // počet osob v bytové jednotce
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permanent_residents: Option<i64>, // počet osob s trvalým bydlištěm
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_frequency: Option<String>, // "Měsíčně" | "Čtvrtletně" | "Pololetně" | "Ročně"
    #[serde(default)]
    pub deposit_water: f64, // zálohy voda – 12% DPH (jen komerční)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub co_residents: Option<String>, // osoby sdílející byt (jen bytové)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contract_notes: Option<String>, // poznámky ke smlouvě (všechny typy)
    #[serde(default)]
    pub included_parking_spots: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_subject: Option<String>,
    #[serde(default)]
    pub vat_exempt: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_renewal_type: Option<String>, // 'repeat_2y' | 'repeat_5y' | 'once_2y' // 0 = dle subjektu, 1 = vždy bez DPH, 2 = vždy s DPH // počet parkovacích stání zahrnutých v nájemném (bytové + komerční)
    #[serde(default)]
    pub energy_settlements: Vec<serde_json::Value>, // vyúčtování energií [{year, amount}]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub handover_date: Option<String>, // datum předání předmětu nájmu nájemci
    #[serde(default)]
    pub flat_fee: f64, // paušální poplatek energií a služeb (komerční) – počítá se jako nájem
    #[serde(default)]
    pub rent_total: f64, // informativní: celkové nájemné za dobu smlouvy (zadává uživatel ručně)
    #[serde(default)]
    pub amendments: Vec<ContractAmendment>, // historie změn nájemného/záloh s datem účinnosti
}

// ─────────────────────────────────────────
// CONTRACT AMENDMENT (Změna podmínek smlouvy)
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ContractAmendment {
    #[serde(default)]
    pub id: String,
    pub contract_id: String,
    pub effective_from: String,        // "D. M. RRRR" – datum účinnosti změny
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rent: Option<f64>,             // nová výše nájemného (None = beze změny)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deposit: Option<f64>,          // nové zálohy energie (None = beze změny)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deposit_water: Option<f64>,    // nové zálohy voda (None = beze změny)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flat_fee: Option<f64>,         // nový paušál (None = beze změny)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parking: Option<f64>,          // nové parkování (None = beze změny)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,          // poznámka k důvodu změny (valorizace, dohoda…)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub added: Option<String>,
}

// ─────────────────────────────────────────
// OPERATIONAL COST (Provozní náklady)
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OperationalCost {
    #[serde(default)]
    pub id: String,
    pub object_name: String,       // název objektu
    pub category: String,          // kategorie nákladu
    pub amount: f64,               // částka
    pub frequency: String,         // Měsíčně | Čtvrtletně | Pololetně | Ročně
    #[serde(skip_serializing_if = "Option::is_none")]
    pub period_from: Option<String>, // uhrazeno od
    #[serde(skip_serializing_if = "Option::is_none")]
    pub period_to: Option<String>,   // uhrazeno do
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub added: Option<String>,
}

// ─────────────────────────────────────────
// PAYMENT (Platba)
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Payment {
    #[serde(default)]
    pub id: String,
    pub contract_id: String,
    pub amount: f64,
    pub date: String,
    pub month: String,
    #[serde(default)]
    pub payment_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_label: Option<String>,
    #[serde(default)]
    pub note: String,
}

// ─────────────────────────────────────────
// TASK (Kanban úkol)
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    #[serde(default)]
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub priority: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deadline: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
    pub reminders: serde_json::Value,
    pub recurring: bool,
    pub status: String,
}

// ─────────────────────────────────────────
// REVISION (Revize)
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Revision {
    #[serde(default)]
    pub id: String,
    pub title: String,
    pub last_date: String,
    pub interval: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

// ─────────────────────────────────────────
// DOCUMENT (Dokument / Soubor)
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub doc_type: String,
    pub subject: String,
    pub ext: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub related_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub related_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uploaded_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contract_link_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contract_link_type: Option<String>,
}

// ─────────────────────────────────────────
// LOG (Historie změn)
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Log {
    pub id: String,
    pub timestamp: String,
    pub user: String,
    pub action: String,
    pub module: String,
    pub detail: String,
}

// ─────────────────────────────────────────
// TRASH ITEM (Položka v koši)
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub trash_id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub item: serde_json::Value,
    pub title: String,
    pub deleted_at: String,
}

// ─────────────────────────────────────────
// ERROR TYPE
// ─────────────────────────────────────────
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("Serialization error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
