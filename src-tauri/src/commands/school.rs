use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::school::{self, School};

#[tauri::command]
pub fn list_schools(db: State<'_, Mutex<Connection>>) -> AppResult<Vec<School>> {
    let conn = lock_db(&db);
    school::list_all(&conn)
}

#[tauri::command]
pub fn create_school(db: State<'_, Mutex<Connection>>, name: String) -> AppResult<School> {
    let conn = lock_db(&db);
    school::create(&conn, &name)
}
