use std::sync::Mutex;
use rusqlite::Connection;
use tauri::State;
use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::review_workflow::{self, ReviewHistory, ReviewPacket, ReviewRequest};

#[tauri::command]
pub fn list_review_packets(db: State<'_, Mutex<Connection>>, sessions: State<'_, SessionManager>) -> AppResult<Vec<ReviewPacket>> {
    let conn=lock_db(&db); let (actor,school)=sessions.require_active_session(&conn)?;
    review_workflow::list(&conn,&school,&actor)
}
#[tauri::command]
pub fn act_review_packet(db: State<'_, Mutex<Connection>>, sessions: State<'_, SessionManager>, request: ReviewRequest) -> AppResult<ReviewPacket> {
    let conn=lock_db(&db); let (actor,school)=sessions.require_active_session(&conn)?;
    review_workflow::act(&conn,&school,&actor,request)
}
#[tauri::command]
pub fn review_packet_history(db: State<'_, Mutex<Connection>>, sessions: State<'_, SessionManager>, packet_id: String) -> AppResult<Vec<ReviewHistory>> {
    let conn=lock_db(&db); let (actor,school)=sessions.require_active_session(&conn)?;
    review_workflow::history(&conn,&school,&actor,&packet_id)
}
