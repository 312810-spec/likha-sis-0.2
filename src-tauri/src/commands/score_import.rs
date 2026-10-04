use std::sync::Mutex;
use rusqlite::Connection;
use tauri::{AppHandle,State};
use crate::{auth::SessionManager,commands::lock_db,error::{AppError,AppResult},repository::{score_import,device_credential},db};
#[tauri::command]
pub fn preview_score_import(db:State<'_,Mutex<Connection>>,sessions:State<'_,SessionManager>,assessment_item_id:String,csv:String)->AppResult<score_import::ScoreImportPreview> {
 let conn=lock_db(&db);let(actor,school)=sessions.require_active_session(&conn)?;
 score_import::preview(&conn,&school,&actor,&assessment_item_id,&csv)
}
#[tauri::command]
pub fn commit_score_import(app:AppHandle,db:State<'_,Mutex<Connection>>,sessions:State<'_,SessionManager>,assessment_item_id:String,csv:String,expected_snapshot:String,reason:String)->AppResult<usize> {
 let conn=lock_db(&db);let(actor,school)=sessions.require_active_session(&conn)?;
 let key=if device_credential::has_active_for_school(&conn,&school)? {Some(db::load_or_mint_sspk(&app)?)} else {None};
 score_import::commit(&conn,&school,&actor,&assessment_item_id,&csv,&expected_snapshot,&reason,|row|{
  crate::commands::learner_score::record_learner_score_with_optional_sync(&conn,&school,&actor,&assessment_item_id,&row.learner_id,row.status,row.score,key.as_ref())?.ok_or(AppError::Import("One score was rejected. No imported scores were saved.".into()))
 })
}
#[tauri::command]
pub fn list_score_history(db:State<'_,Mutex<Connection>>,sessions:State<'_,SessionManager>,assessment_item_id:String)->AppResult<Vec<score_import::ScoreHistoryEntry>> {
 let conn=lock_db(&db);let(actor,school)=sessions.require_active_session(&conn)?;
 score_import::history(&conn,&school,&actor,&assessment_item_id)
}
