use tauri::State;
use tauri::Manager;
use crate::models::*;
use crate::AppState;

// Helper macro to lock the DB mutex
macro_rules! db {
    ($state:expr) => {
        $state.db.lock().map_err(|e| AppError::Other(e.to_string()))?
    };
}

// ─────────────────────────────────────────
// TENANTS
// ─────────────────────────────────────────

#[tauri::command]
pub fn get_tenants(state: State<AppState>) -> std::result::Result<Vec<Tenant>, AppError> {
    db!(state).get_tenants()
}

#[tauri::command]
pub fn add_tenant(tenant: Tenant, user: String, state: State<AppState>) -> std::result::Result<Tenant, AppError> {
    let db = db!(state);
    let result = db.add_tenant(&tenant)?;
    db.add_log(&user, "Přidání", "Nájemníci", &format!("Vytvořen klient: {}", tenant.name))?;
    Ok(result)
}

#[tauri::command]
pub fn update_tenant(id: String, tenant: Tenant, user: String, state: State<AppState>) -> std::result::Result<(), AppError> {
    let db = db!(state);
    db.update_tenant(&id, &tenant)?;
    db.add_log(&user, "Úprava", "Nájemníci", &format!("Upraven klient: {}", tenant.name))?;
    Ok(())
}

#[tauri::command]
pub fn delete_tenant(id: String, name: String, user: String, state: State<AppState>) -> std::result::Result<TrashItem, AppError> {
    let db = db!(state);
    let tenants = db.get_tenants()?;
    if let Some(item) = tenants.iter().find(|t| t.id == id) {
        let item_json = serde_json::to_value(item)?;
        let trash_item = db.move_to_trash("tenant", &item_json, &name)?;
        db.delete_tenant(&id)?;
        db.add_log(&user, "Smazání", "Nájemníci", &format!("Smazán klient: {} (přesunuto do Koše)", name))?;
        Ok(trash_item)
    } else {
        Err(AppError::Other(format!("Tenant {} not found", id)))
    }
}

// ─────────────────────────────────────────
// ASSETS
// ─────────────────────────────────────────

#[tauri::command]
pub fn get_assets(state: State<AppState>) -> std::result::Result<Vec<Asset>, AppError> {
    db!(state).get_assets()
}

#[tauri::command]
pub fn add_asset(asset: Asset, user: String, state: State<AppState>) -> std::result::Result<Asset, AppError> {
    let db = db!(state);
    let result = db.add_asset(&asset)?;
    db.add_log(&user, "Přidání", "Předměty", &format!("Přidán objekt: {}", asset.unit))?;
    Ok(result)
}

#[tauri::command]
pub fn update_asset(id: String, asset: Asset, user: String, state: State<AppState>) -> std::result::Result<(), AppError> {
    let db = db!(state);
    db.update_asset(&id, &asset)?;
    db.add_log(&user, "Úprava", "Předměty", &format!("Upraven objekt: {}", asset.unit))?;
    Ok(())
}

#[tauri::command]
pub fn delete_asset(id: String, user: String, state: State<AppState>) -> std::result::Result<TrashItem, AppError> {
    let db = db!(state);
    let assets = db.get_assets()?;
    if let Some(item) = assets.iter().find(|a| a.id == id) {
        let title = format!("{} — {}", item.subject, item.unit);
        let item_json = serde_json::to_value(item)?;
        let trash_item = db.move_to_trash("asset", &item_json, &title)?;
        db.delete_asset(&id)?;
        db.add_log(&user, "Smazání", "Předměty", &format!("Smazán objekt: {}", item.unit))?;
        Ok(trash_item)
    } else {
        Err(AppError::Other(format!("Asset {} not found", id)))
    }
}

#[tauri::command]
pub fn set_asset_status(id: String, status: String, state: State<AppState>) -> std::result::Result<(), AppError> {
    let db = db!(state);
    let assets = db.get_assets()?;
    if let Some(mut asset) = assets.into_iter().find(|a| a.id == id) {
        asset.status = status;
        db.update_asset(&id, &asset)?;
    }
    Ok(())
}

// ─────────────────────────────────────────
// CONTRACTS
// ─────────────────────────────────────────

#[tauri::command]
pub fn get_contracts(state: State<AppState>) -> std::result::Result<Vec<Contract>, AppError> {
    db!(state).get_contracts()
}

#[tauri::command]
pub fn add_contract(contract: Contract, user: String, state: State<AppState>) -> std::result::Result<Contract, AppError> {
    let db = db!(state);
    let result = db.add_contract(&contract)?;
    db.add_log(&user, "Přidání", "Smlouvy", &format!("Vytvořena smlouva (Nájem: {} Kč, Zálohy: {} Kč)", contract.rent, contract.deposit))?;
    Ok(result)
}

#[tauri::command]
pub fn update_contract(id: String, contract: Contract, user: String, state: State<AppState>) -> std::result::Result<(), AppError> {
    let db = db!(state);
    db.update_contract(&id, &contract)?;
    // Dohledej jméno assetu a nájemce pro srozumitelný log
    let asset_unit = db.get_assets().ok()
        .and_then(|assets| assets.into_iter().find(|a| a.id == contract.asset_id))
        .map(|a| a.unit)
        .unwrap_or_else(|| contract.asset_id.clone());
    let tenant_name = db.get_tenants().ok()
        .and_then(|tenants| tenants.into_iter().find(|t| t.id == contract.tenant_id))
        .map(|t| t.name)
        .unwrap_or_else(|| "?".to_string());
    db.add_log(&user, "Úprava", "Smlouvy", &format!("Upravena smlouva: {} – {} (nájem: {} Kč)", asset_unit, tenant_name, contract.rent))?;
    Ok(())
}

#[tauri::command]
pub fn delete_contract(id: String, user: String, state: State<AppState>) -> std::result::Result<TrashItem, AppError> {
    let db = db!(state);
    let contracts = db.get_contracts()?;
    if let Some(item) = contracts.iter().find(|c| c.id == id) {
        // Get asset unit name for a descriptive trash title
        let assets = db.get_assets().unwrap_or_default();
        let asset_unit = assets.iter()
            .find(|a| a.id == item.asset_id)
            .map(|a| a.unit.clone())
            .unwrap_or_else(|| item.asset_id.clone());
        let tenants = db.get_tenants().unwrap_or_default();
        let tenant_name = tenants.iter()
            .find(|t| t.id == item.tenant_id)
            .map(|t| t.name.clone())
            .unwrap_or_else(|| "Neznámý nájemce".to_string());
        let title = format!("Smlouva: {} – {}", asset_unit, tenant_name);
        let item_json = serde_json::to_value(item)?;
        let asset_id = item.asset_id.clone();
        let trash_item = db.move_to_trash("contract", &item_json, &title)?;
        db.delete_contract(&id)?;
        // Uvolni předmět nájmu — zkontroluj, zda neexistuje jiná aktivní smlouva
        let remaining = db.get_contracts().unwrap_or_default();
        let still_occupied = remaining.iter().any(|c| c.asset_id == asset_id && c.status == "active");
        if !still_occupied {
            let assets = db.get_assets().unwrap_or_default();
            if let Some(mut a) = assets.into_iter().find(|a| a.id == asset_id) {
                a.status = "free".to_string();
                let _ = db.update_asset(&asset_id, &a);
            }
        }
        db.add_log(&user, "Smazání", "Smlouvy", &format!("Smazána smlouva: {} ({})", asset_unit, id))?;
        Ok(trash_item)
    } else {
        Err(AppError::Other(format!("Contract {} not found", id)))
    }
}

// ─────────────────────────────────────────
// PAYMENTS
// ─────────────────────────────────────────

#[tauri::command]
pub fn get_payments(state: State<AppState>) -> std::result::Result<Vec<Payment>, AppError> {
    db!(state).get_payments()
}

#[tauri::command]
pub fn add_payment(payment: Payment, user: String, state: State<AppState>) -> std::result::Result<Payment, AppError> {
    let db = db!(state);
    let result = db.add_payment(&payment)?;
    // Sestavení kontextu pro log
    let context = if let Some(group) = &payment.group_label {
        format!("skupina \"{}\"", group)
    } else {
        // Dohledej smlouvu → asset + tenant
        let contracts = db.get_contracts().unwrap_or_default();
        if let Some(c) = contracts.iter().find(|c| c.id == payment.contract_id) {
            let asset_unit = db.get_assets().ok()
                .and_then(|assets| assets.into_iter().find(|a| a.id == c.asset_id))
                .map(|a| a.unit)
                .unwrap_or_else(|| "?".to_string());
            let tenant_name = db.get_tenants().ok()
                .and_then(|tenants| tenants.into_iter().find(|t| t.id == c.tenant_id))
                .map(|t| t.name)
                .unwrap_or_else(|| "?".to_string());
            let subj = c.billing_subject.clone().unwrap_or_else(|| "?".to_string());
            format!("{} – {} ({})", asset_unit, tenant_name, subj)
        } else {
            payment.contract_id.clone()
        }
    };
    let type_label = if payment.payment_type == "deposit" { "zálohy" } else { "nájem" };
    db.add_log(&user, "Přidání", "Platby", &format!("Zapsána platba {}: {} Kč | {}", type_label, payment.amount, context))?;
    Ok(result)
}

#[tauri::command]
pub fn delete_payment(id: String, state: State<AppState>) -> std::result::Result<(), AppError> {
    db!(state).delete_payment(&id)
}

// ─────────────────────────────────────────
// TASKS (Kanban)
// ─────────────────────────────────────────

#[tauri::command]
pub fn get_tasks(state: State<AppState>) -> std::result::Result<Vec<Task>, AppError> {
    db!(state).get_tasks()
}

#[tauri::command]
pub fn add_task(task: Task, user: String, state: State<AppState>) -> std::result::Result<Task, AppError> {
    let db = db!(state);
    let result = db.add_task(&task)?;
    db.add_log(&user, "Přidání", "Kanban", &format!("Vytvořen úkol: {}", task.title))?;
    Ok(result)
}

#[tauri::command]
pub fn update_task(id: String, task: Task, user: String, state: State<AppState>) -> std::result::Result<(), AppError> {
    let db = db!(state);
    db.update_task(&id, &task)?;
    if !task.title.is_empty() {
        db.add_log(&user, "Úprava", "Kanban", &format!("Upraven úkol: {}", task.title))?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_task(id: String, user: String, state: State<AppState>) -> std::result::Result<TrashItem, AppError> {
    let db = db!(state);
    let tasks = db.get_tasks()?;
    if let Some(item) = tasks.iter().find(|t| t.id == id) {
        let item_json = serde_json::to_value(item)?;
        let trash_item = db.move_to_trash("task", &item_json, &item.title)?;
        db.delete_task(&id)?;
        db.add_log(&user, "Smazání", "Kanban", &format!("Smazán úkol: {}", item.title))?;
        Ok(trash_item)
    } else {
        Err(AppError::Other(format!("Task {} not found", id)))
    }
}

// ─────────────────────────────────────────
// REVISIONS
// ─────────────────────────────────────────

#[tauri::command]
pub fn get_revisions(state: State<AppState>) -> std::result::Result<Vec<Revision>, AppError> {
    db!(state).get_revisions()
}

#[tauri::command]
pub fn add_revision(revision: Revision, user: String, state: State<AppState>) -> std::result::Result<Revision, AppError> {
    let db = db!(state);
    let result = db.add_revision(&revision)?;
    db.add_log(&user, "Přidání", "Revize", &format!("Nová revize: {}", revision.title))?;
    Ok(result)
}

#[tauri::command]
pub fn update_revision(id: String, revision: Revision, state: State<AppState>) -> std::result::Result<(), AppError> {
    db!(state).update_revision(&id, &revision)
}

#[tauri::command]
pub fn delete_revision(id: String, user: String, state: State<AppState>) -> std::result::Result<TrashItem, AppError> {
    let db = db!(state);
    let revisions = db.get_revisions()?;
    if let Some(item) = revisions.iter().find(|r| r.id == id) {
        let item_json = serde_json::to_value(item)?;
        let trash_item = db.move_to_trash("revision", &item_json, &item.title)?;
        db.delete_revision(&id)?;
        db.add_log(&user, "Smazání", "Revize", &format!("Smazána revize: {}", item.title))?;
        Ok(trash_item)
    } else {
        Err(AppError::Other(format!("Revision {} not found", id)))
    }
}

// ─────────────────────────────────────────
// DOCUMENTS
// ─────────────────────────────────────────

#[tauri::command]
pub fn get_documents(state: State<AppState>) -> std::result::Result<Vec<Document>, AppError> {
    db!(state).get_documents()
}

#[tauri::command]
pub fn add_document(document: Document, user: String, state: State<AppState>) -> std::result::Result<Document, AppError> {
    let db = db!(state);
    let result = db.add_document(&document)?;
    db.add_log(&user, "Přidání", "Dokumenty", &format!("Nahrán soubor: {}", document.name))?;
    Ok(result)
}

#[tauri::command]
pub fn delete_document(id: String, user: String, state: State<AppState>) -> std::result::Result<TrashItem, AppError> {
    let db = db!(state);
    let docs = db.get_documents()?;
    if let Some(item) = docs.iter().find(|d| d.id == id) {
        let item_json = serde_json::to_value(item)?;
        let trash_item = db.move_to_trash("document", &item_json, &item.name)?;
        db.delete_document(&id)?;
        db.add_log(&user, "Smazání", "Dokumenty", &format!("Smazán soubor: {}", item.name))?;
        Ok(trash_item)
    } else {
        Err(AppError::Other(format!("Document {} not found", id)))
    }
}

// ─────────────────────────────────────────
// LOGS
// ─────────────────────────────────────────

#[tauri::command]
pub fn get_logs(state: State<AppState>) -> std::result::Result<Vec<Log>, AppError> {
    db!(state).get_logs()
}

#[tauri::command]
pub fn add_log(user: String, action: String, module: String, detail: String, state: State<AppState>) -> std::result::Result<Log, AppError> {
    let db = db!(state);
    db.add_log(&user, &action, &module, &detail)?;
    // Vrátíme poslední log (náš)
    let logs = db.get_logs()?;
    logs.into_iter().next().ok_or_else(|| AppError::Other("Log not found after insert".into()))
}

// ─────────────────────────────────────────
// TRASH
// ─────────────────────────────────────────

#[tauri::command]
pub fn get_trash(state: State<AppState>) -> std::result::Result<Vec<TrashItem>, AppError> {
    db!(state).get_trash()
}

#[tauri::command]
pub fn restore_from_trash(trash_id: String, user: String, state: State<AppState>) -> std::result::Result<TrashItem, AppError> {
    let db = db!(state);
    let trash = db.get_trash()?;
    if let Some(item) = trash.iter().find(|t| t.trash_id == trash_id) {
        let result = item.clone();
        // Re-insert into the correct table based on type
        match item.item_type.as_str() {
            "tenant" => {
                if let Ok(t) = serde_json::from_value::<Tenant>(item.item.clone()) {
                    db.add_tenant(&t)?;
                }
            }
            "asset" => {
                if let Ok(a) = serde_json::from_value::<Asset>(item.item.clone()) {
                    db.add_asset(&a)?;
                }
            }
            "contract" => {
                if let Ok(c) = serde_json::from_value::<Contract>(item.item.clone()) {
                    db.add_contract(&c)?;
                }
            }
            "task" => {
                if let Ok(t) = serde_json::from_value::<Task>(item.item.clone()) {
                    db.add_task(&t)?;
                }
            }
            "revision" => {
                if let Ok(r) = serde_json::from_value::<Revision>(item.item.clone()) {
                    db.add_revision(&r)?;
                }
            }
            "document" => {
                if let Ok(d) = serde_json::from_value::<Document>(item.item.clone()) {
                    db.add_document(&d)?;
                }
            }
            _ => {}
        }
        db.add_log(&user, "Obnova", "Koš", &format!("Obnovena položka: {}", item.title))?;
        db.delete_trash_item(&trash_id)?;
        Ok(result)
    } else {
        Err(AppError::Other(format!("Trash item {} not found", trash_id)))
    }
}

#[tauri::command]
pub fn permanent_delete(trash_id: String, state: State<AppState>) -> std::result::Result<(), AppError> {
    db!(state).delete_trash_item(&trash_id)
}

#[tauri::command]
pub fn empty_trash(state: State<AppState>) -> std::result::Result<(), AppError> {
    db!(state).empty_trash()
}

// ─────────────────────────────────────────
// DB INFO + ZÁLOHY + NASTAVENÍ
// ─────────────────────────────────────────

#[tauri::command]
pub fn get_db_path(app_handle: tauri::AppHandle) -> std::result::Result<String, AppError> {
    let app_dir = app_handle.path_resolver().app_data_dir()
        .ok_or_else(|| AppError::Other("Cannot get app data dir".into()))?;
    let settings = load_settings(&app_dir);
    let db_path = if let Some(custom) = settings.get("dbPath").and_then(|v| v.as_str()) {
        if !custom.is_empty() { std::path::PathBuf::from(custom) } else { app_dir.join("rentflow.db") }
    } else {
        app_dir.join("rentflow.db")
    };
    Ok(db_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn create_backup(app_handle: tauri::AppHandle) -> std::result::Result<String, AppError> {
    use std::fs;
    use chrono::Local;
    use tauri::Manager;

    let app_dir = app_handle.path_resolver().app_data_dir()
        .ok_or_else(|| AppError::Other("Cannot get app data dir".into()))?;
    let backup_dir = app_dir.join("backups");
    fs::create_dir_all(&backup_dir)
        .map_err(|e| AppError::Other(e.to_string()))?;

    // Získej skutečnou cestu DB (respektuj případný custom dbPath ze settings)
    let settings = load_settings(&app_dir);
    let db_path = if let Some(custom) = settings.get("dbPath").and_then(|v| v.as_str()) {
        if !custom.is_empty() {
            std::path::PathBuf::from(custom)
        } else {
            app_dir.join("rentflow.db")
        }
    } else {
        app_dir.join("rentflow.db")
    };

    // ⚠️ KLÍČOVÁ OPRAVA: Před kopírováním souboru vynutit checkpoint WAL.
    // V WAL módu jdou zápisy do rentflow.db-wal, hlavní soubor se aktualizuje
    // až při checkpointu. Bez toho záloha vždy kopíruje stará data.
    if let Some(state) = app_handle.try_state::<crate::AppState>() {
        if let Ok(db) = state.db.lock() {
            let _ = db.checkpoint();
        }
    }

    let today = Local::now().format("%Y-%m-%d").to_string();
    let backup_name = format!("backup-{}.db", today);
    let backup_path = backup_dir.join(&backup_name);

    fs::copy(&db_path, &backup_path)
        .map_err(|e| AppError::Other(format!("Záloha selhala: {}", e)))?;

    // Pruning — uchovat max 30 záloh
    if let Ok(entries) = fs::read_dir(&backup_dir) {
        let mut backups: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with("backup-"))
            .collect();
        backups.sort_by_key(|e| e.file_name());
        if backups.len() > 30 {
            for old in &backups[..backups.len() - 30] {
                let _ = fs::remove_file(old.path());
            }
        }
    }

    // Kopie na Google Drive cestu pokud je nastavena
    let settings = load_settings(&app_dir);
    if let Some(gdrive) = settings.get("gdrivePath").and_then(|v| v.as_str()) {
        if !gdrive.is_empty() {
            let gdrive_path = std::path::Path::new(gdrive);
            if gdrive_path.exists() {
                let _ = fs::copy(&backup_path, gdrive_path.join(&backup_name));
                // Také přepsat hlavní soubor pro přímý sync
                let _ = fs::copy(&db_path, gdrive_path.join("rentflow.db"));
                // Synchronizace složky documents/ na GDrive
                let local_docs = app_dir.join("documents");
                let gdrive_docs = gdrive_path.join("documents");
                if local_docs.exists() {
                    let _ = fs::create_dir_all(&gdrive_docs);
                    if let Ok(entries) = fs::read_dir(&local_docs) {
                        for entry in entries.filter_map(|e| e.ok()) {
                            let dest = gdrive_docs.join(entry.file_name());
                            if !dest.exists() {
                                let _ = fs::copy(entry.path(), dest);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(backup_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn get_backup_info(app_handle: tauri::AppHandle) -> std::result::Result<serde_json::Value, AppError> {
    use std::fs;

    let app_dir = app_handle.path_resolver().app_data_dir()
        .ok_or_else(|| AppError::Other("Cannot get app data dir".into()))?;
    let backup_dir = app_dir.join("backups");

    let mut last_backup = String::from("Nikdy");
    let mut backup_count = 0u32;

    if let Ok(entries) = fs::read_dir(&backup_dir) {
        let mut backups: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with("backup-"))
            .collect();
        backups.sort_by_key(|e| e.file_name());
        backup_count = backups.len() as u32;
        if let Some(last) = backups.last() {
            let name = last.file_name();
            let s = name.to_string_lossy();
            // backup-2026-04-01.db → "1. 4. 2026"
            if let Some(date_part) = s.strip_prefix("backup-").and_then(|s| s.strip_suffix(".db")) {
                let parts: Vec<&str> = date_part.split('-').collect();
                if parts.len() == 3 {
                    last_backup = format!("{}. {}. {}", 
                        parts[2].trim_start_matches('0'), 
                        parts[1].trim_start_matches('0'), 
                        parts[0]);
                }
            }
        }
    }

    let settings = load_settings(&app_dir);
    let gdrive_path = settings.get("gdrivePath")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(serde_json::json!({
        "lastBackup": last_backup,
        "backupCount": backup_count,
        "gdrivePath": gdrive_path,
    }))
}

#[tauri::command]
pub fn save_settings(settings: serde_json::Value, app_handle: tauri::AppHandle) -> std::result::Result<(), AppError> {
    let app_dir = app_handle.path_resolver().app_data_dir()
        .ok_or_else(|| AppError::Other("Cannot get app data dir".into()))?;
    let settings_path = app_dir.join("settings.json");
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| AppError::Other(e.to_string()))?;
    std::fs::write(&settings_path, content)
        .map_err(|e| AppError::Other(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub fn get_settings(app_handle: tauri::AppHandle) -> std::result::Result<serde_json::Value, AppError> {
    let app_dir = app_handle.path_resolver().app_data_dir()
        .ok_or_else(|| AppError::Other("Cannot get app data dir".into()))?;
    Ok(load_settings(&app_dir))
}

// Interní helper — načte settings.json nebo vrátí prázdný objekt
pub fn load_settings(app_dir: &std::path::Path) -> serde_json::Value {
    let settings_path = app_dir.join("settings.json");
    std::fs::read_to_string(&settings_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

// ─────────────────────────────────────────
// HTML EXPORT → otevře v prohlížeči pro tisk/PDF
// ─────────────────────────────────────────
#[tauri::command]
pub fn export_html(
    html: String,
    filename: String,
    app_handle: tauri::AppHandle,
) -> std::result::Result<String, AppError> {
    let base = app_handle.path_resolver().app_data_dir()
        .ok_or_else(|| AppError::Other("Nelze získat adresář".into()))?;
    let desktop = std::env::var("USERPROFILE")
        .map(|p| std::path::PathBuf::from(p).join("Desktop"))
        .unwrap_or_else(|_| base.clone());
    let export_dir = if desktop.exists() { desktop } else { base };
    let out_path = export_dir.join(&filename);
    std::fs::write(&out_path, html.as_bytes())
        .map_err(|e| AppError::Other(format!("Chyba zápisu: {}", e)))?;
    tauri::api::shell::open(&app_handle.shell_scope(), out_path.to_string_lossy().to_string(), None)
        .map_err(|e| AppError::Other(format!("Nelze otevřít soubor: {}", e)))?;
    Ok(out_path.to_string_lossy().to_string())
}

// Uloží HTML na cestu zvolenou uživatelem (bez otevírání v prohlížeči)
#[tauri::command]
pub fn export_html_to_path(
    html: String,
    path: String,
) -> std::result::Result<String, AppError> {
    std::fs::write(&path, html.as_bytes())
        .map_err(|e| AppError::Other(format!("Chyba zápisu: {}", e)))?;
    Ok(path)
}

// Vygeneruje PDF přes Edge headless → přímé uložení bez dialogu tisku
#[tauri::command]
pub fn export_to_pdf(
    html: String,
    out_path: String,
) -> std::result::Result<String, AppError> {
    // Zapsat HTML do temp souboru
    let tmp_path = std::env::temp_dir().join("rentflow_export_tmp.html");
    std::fs::write(&tmp_path, html.as_bytes())
        .map_err(|e| AppError::Other(format!("Chyba zápisu temp: {}", e)))?;

    let tmp_str = tmp_path.to_string_lossy().to_string();
    let pdf_arg = format!("--print-to-pdf={}", out_path);

    // Hledat Edge (vždy přítomen na Win10/11)
    let edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ];

    let edge = edge_paths.iter().find(|p| std::path::Path::new(p).exists())
        .ok_or_else(|| AppError::Other("Microsoft Edge nebyl nalezen.".into()))?;

    let status = std::process::Command::new(edge)
        .args(&[
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--run-all-compositor-stages-before-draw",
            "--print-to-pdf-no-header",
            &pdf_arg,
            &tmp_str,
        ])
        .status()
        .map_err(|e| AppError::Other(format!("Chyba spuštění Edge: {}", e)))?;

    if !status.success() {
        return Err(AppError::Other(format!("Edge vrátil chybu: {:?}", status.code())));
    }

    // Ověřit že soubor vznikl
    if !std::path::Path::new(&out_path).exists() {
        return Err(AppError::Other("PDF soubor nebyl vytvořen.".into()));
    }

    let _ = std::fs::remove_file(&tmp_path);
    Ok(out_path)
}
// ─────────────────────────────────────────
// OPERATIONAL COSTS (Provozní náklady)
// ─────────────────────────────────────────

#[tauri::command]
pub fn get_operational_costs(state: State<AppState>) -> std::result::Result<Vec<OperationalCost>, AppError> {
    db!(state).get_operational_costs()
}

#[tauri::command]
pub fn add_operational_cost(cost: OperationalCost, user: String, state: State<AppState>) -> std::result::Result<OperationalCost, AppError> {
    let db = db!(state);
    let result = db.add_operational_cost(&cost)?;
    db.add_log(&user, "Přidání", "Provozní náklady", &format!("Přidán náklad: {} – {}", cost.object_name, cost.category))?;
    Ok(result)
}

#[tauri::command]
pub fn update_operational_cost(id: String, cost: OperationalCost, user: String, state: State<AppState>) -> std::result::Result<(), AppError> {
    let db = db!(state);
    db.update_operational_cost(&id, &cost)?;
    db.add_log(&user, "Úprava", "Provozní náklady", &format!("Upraven náklad: {} – {}", cost.object_name, cost.category))?;
    Ok(())
}

#[tauri::command]
pub fn delete_operational_cost(id: String, user: String, state: State<AppState>) -> std::result::Result<(), AppError> {
    let db = db!(state);
    // Dohledej název před smazáním
    let name = db.get_operational_costs().ok()
        .and_then(|costs| costs.into_iter().find(|c| c.id == id))
        .map(|c| format!("{} – {}", c.object_name, c.category))
        .unwrap_or_else(|| id.clone());
    db.delete_operational_cost(&id)?;
    db.add_log(&user, "Smazání", "Provozní náklady", &format!("Smazán náklad: {}", name))?;
    Ok(())
}

// ─────────────────────────────────────────
// CONTRACT AMENDMENTS
// ─────────────────────────────────────────

#[tauri::command]
pub fn add_amendment(amendment: ContractAmendment, user: String, state: State<AppState>) -> std::result::Result<ContractAmendment, AppError> {
    let db = db!(state);
    let result = db.add_amendment(&amendment)?;
    let context = db.get_contracts().ok()
        .and_then(|cs| cs.into_iter().find(|c| c.id == amendment.contract_id))
        .map(|c| {
            let asset_unit = db.get_assets().ok()
                .and_then(|assets| assets.into_iter().find(|a| a.id == c.asset_id))
                .map(|a| a.unit).unwrap_or_else(|| "?".to_string());
            let tenant_name = db.get_tenants().ok()
                .and_then(|tenants| tenants.into_iter().find(|t| t.id == c.tenant_id))
                .map(|t| t.name).unwrap_or_else(|| "?".to_string());
            format!("{} – {}", asset_unit, tenant_name)
        })
        .unwrap_or_else(|| amendment.contract_id.clone());
    db.add_log(&user, "Přidání", "Dodatek smlouvy", &format!("Změna nájemného/záloh od {} | {}", amendment.effective_from, context))?;
    Ok(result)
}

#[tauri::command]
pub fn delete_amendment(id: String, user: String, state: State<AppState>) -> std::result::Result<(), AppError> {
    let db = db!(state);
    db.delete_amendment(&id)?;
    db.add_log(&user, "Smazání", "Dodatek smlouvy", &format!("Smazán dodatek id: {}", id))?;
    Ok(())
}

// ─────────────────────────────────────────
// UPDATER
// ─────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub version: Option<String>,
    pub body: Option<String>,
}

#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> std::result::Result<UpdateInfo, String> {
    let log_path = app.path_resolver().app_data_dir()
        .map(|p| p.join("update_check.log"))
        .unwrap_or_else(|| std::path::PathBuf::from("update_check.log"));

    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    match app.updater().check().await {
        Ok(update) => {
            let available = update.is_update_available();
            let version = update.latest_version().to_string();
            let msg = format!("[{}] Check OK – available: {}, latest: {}\n", timestamp, available, version);
            let _ = std::fs::OpenOptions::new().create(true).append(true).open(&log_path)
                .and_then(|mut f| { use std::io::Write; f.write_all(msg.as_bytes()) });

            if available {
                Ok(UpdateInfo {
                    available: true,
                    version: Some(version),
                    body: update.body().map(|s| s.to_string()),
                })
            } else {
                Ok(UpdateInfo { available: false, version: Some(version), body: None })
            }
        }
        Err(e) => {
            let msg = format!("[{}] Check ERROR: {:?}\n", timestamp, e);
            let _ = std::fs::OpenOptions::new().create(true).append(true).open(&log_path)
                .and_then(|mut f| { use std::io::Write; f.write_all(msg.as_bytes()) });
            Ok(UpdateInfo { available: false, version: None, body: None })
        }
    }
}

#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> std::result::Result<(), String> {
    match app.updater().check().await {
        Ok(update) => {
            if update.is_update_available() {
                update.download_and_install().await.map_err(|e| e.to_string())?;
            }
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}
