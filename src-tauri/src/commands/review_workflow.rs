use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::review_workflow::{self, ReviewHistory, ReviewPacket, ReviewRequest};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub fn list_review_packets(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<ReviewPacket>> {
    let conn = lock_db(&db);
    let (actor, school) = sessions.require_active_session(&conn)?;
    review_workflow::list(&conn, &school, &actor)
}
#[tauri::command]
pub fn act_review_packet(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    request: ReviewRequest,
) -> AppResult<ReviewPacket> {
    let conn = lock_db(&db);
    let (actor, school) = sessions.require_active_session(&conn)?;
    review_workflow::act(&conn, &school, &actor, request)
}
#[tauri::command]
pub fn review_packet_history(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    packet_id: String,
) -> AppResult<Vec<ReviewHistory>> {
    let conn = lock_db(&db);
    let (actor, school) = sessions.require_active_session(&conn)?;
    review_workflow::history(&conn, &school, &actor, &packet_id)
}

#[tauri::command]
pub fn export_tanaw_sample(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    packet_id: String,
) -> AppResult<String> {
    let conn = lock_db(&db);
    let (actor, school) = sessions.require_active_session(&conn)?;
    review_workflow::export_sample(&conn, &school, &actor, &packet_id)
}
#[tauri::command]
pub fn import_tanaw_sample(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    sample_json: String,
) -> AppResult<ReviewPacket> {
    let conn = lock_db(&db);
    let (actor, school) = sessions.require_active_session(&conn)?;
    review_workflow::import_sample(&conn, &school, &actor, &sample_json)
}
