pub mod auth;
mod commands;
pub mod crypto;
pub mod db;
pub mod error;
pub mod repository;

use std::sync::Mutex;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let conn = db::open_app_db(app.handle())?;
            app.manage(Mutex::new(conn));
            app.manage(auth::SessionManager::new());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::school::list_schools,
            commands::school::create_school,
            commands::learner::list_learners_by_school,
            commands::learner::create_learner,
            commands::learner::get_learner,
            commands::learner::update_learner,
            commands::user::register_user,
            commands::user::add_user_to_school,
            commands::setup::installation_status,
            commands::setup::bootstrap_installation,
            commands::auth::login,
            commands::auth::logout,
            commands::auth::current_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
