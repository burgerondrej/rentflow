#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod models;
mod commands;

use db::Database;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Database>,
    /// total_changes() DB v okamžiku poslední zálohy (nebo startu) – vyšší hodnota = neuložené změny
    pub backup_changes: AtomicI64,
    /// Záloha při zavření povolena (jen admin; frontend nastaví přes set_close_backup)
    pub close_backup: AtomicBool,
    /// Zavírání po záloze už probíhá – druhý CloseRequested okno zavře
    pub closing: AtomicBool,
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app.path_resolver()
                .app_data_dir()
                .expect("Nelze získat adresář aplikace");
            std::fs::create_dir_all(&app_dir)
                .expect("Nelze vytvořit adresář aplikace");

            // Načti settings.json – pokud je dbPath nastaveno, použij tu cestu
            let settings_path = app_dir.join("settings.json");
            let settings: serde_json::Value = std::fs::read_to_string(&settings_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_else(|| serde_json::json!({}));

            let db_path = if let Some(custom) = settings.get("dbPath").and_then(|v| v.as_str()) {
                if !custom.is_empty() {
                    std::path::PathBuf::from(custom)
                } else {
                    app_dir.join("rentflow.db")
                }
            } else {
                app_dir.join("rentflow.db")
            };

            // Ujisti se, že nadřazená složka existuje
            if let Some(parent) = db_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }

            let db = Database::new(&db_path)
                .expect("Nelze otevřít databázi");

            let baseline = db.total_changes();
            app.manage(AppState {
                db: Mutex::new(db),
                backup_changes: AtomicI64::new(baseline),
                close_backup: AtomicBool::new(false),
                closing: AtomicBool::new(false),
            });

            // ─── Denní záloha v 19:00 ───
            let app_handle_backup = app.handle();
            std::thread::spawn(move || {
                use chrono::Timelike;
                let mut last_backup_day: Option<String> = None;
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(60));
                    let now = chrono::Local::now();
                    let hour = now.hour();
                    let today = now.format("%Y-%m-%d").to_string();
                    if hour == 19 && last_backup_day.as_deref() != Some(&today) {
                        match commands::create_backup(app_handle_backup.clone()) {
                            Ok(_) => { last_backup_day = Some(today); }
                            Err(e) => { eprintln!("Denní záloha selhala: {:?}", e); }
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![            commands::get_tenants,
            commands::add_tenant,
            commands::update_tenant,
            commands::delete_tenant,
            commands::get_assets,
            commands::add_asset,
            commands::update_asset,
            commands::delete_asset,
            commands::set_asset_status,
            commands::get_contracts,
            commands::add_contract,
            commands::update_contract,
            commands::delete_contract,
            commands::get_payments,
            commands::add_payment,
            commands::delete_payment,
            commands::cleanup_duplicate_payments,
            commands::update_payment_amount,
            commands::get_tasks,
            commands::add_task,
            commands::update_task,
            commands::delete_task,
            commands::get_revisions,
            commands::add_revision,
            commands::update_revision,
            commands::delete_revision,
            commands::get_documents,
            commands::add_document,
            commands::delete_document,
            commands::get_logs,
            commands::search_logs,
            commands::add_log,
            commands::get_trash,
            commands::restore_from_trash,
            commands::permanent_delete,
            commands::empty_trash,
            commands::get_db_path,
            commands::create_backup,
            commands::get_backup_info,
            commands::set_close_backup,
            commands::save_settings,
            commands::get_settings,
            commands::export_html,
            commands::export_html_to_path,
            commands::export_to_pdf,
            commands::get_operational_costs,
            commands::add_operational_cost,
            commands::update_operational_cost,
            commands::delete_operational_cost,
            commands::add_amendment,
            commands::delete_amendment,
            commands::check_for_update,
            commands::install_update,
            commands::get_subjects,
            commands::get_objects,
            commands::get_object_firms,
            commands::update_section,
            commands::update_firm,
            commands::add_section,
            commands::delete_section,
            commands::reorder_subjects,
            commands::save_object,
            commands::delete_object,
            commands::verify_activation,
            commands::check_activation,
        ])
        // ⚠️ KLÍČOVÁ OPRAVA: Checkpoint WAL při zavírání okna.
        // Bez toho může dojít ke ztrátě dat pokud je proces ukončen před
        // automatickým checkpointem SQLite.
        .on_window_event(|event| {
            // Záloha při zavření: jen pokud od poslední zálohy proběhla změna v DB (a nejde o Pavla)
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                if let Some(state) = event.window().try_state::<AppState>() {
                    if !state.closing.load(Ordering::SeqCst) && state.close_backup.load(Ordering::SeqCst) {
                        let dirty = state.db.lock()
                            .map(|db| db.total_changes() > state.backup_changes.load(Ordering::SeqCst))
                            .unwrap_or(false);
                        if dirty {
                            api.prevent_close();
                            state.closing.store(true, Ordering::SeqCst);
                            let window = event.window().clone();
                            let _ = window.emit("backup-on-close", ());
                            let handle = window.app_handle();
                            std::thread::spawn(move || {
                                if let Err(e) = commands::create_backup(handle) {
                                    eprintln!("Záloha při zavření selhala: {:?}", e);
                                }
                                let _ = window.close();
                            });
                        }
                    }
                }
            }
            if let tauri::WindowEvent::Destroyed = event.event() {
                if let Some(state) = event.window().try_state::<AppState>() {
                    if let Ok(db) = state.db.lock() {
                        let _ = db.checkpoint();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Chyba při spouštění aplikace RentFlow");
}
