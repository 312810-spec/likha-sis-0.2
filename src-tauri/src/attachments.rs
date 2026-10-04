use std::sync::Mutex;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::State;
use uuid::Uuid;
use crate::{auth::SessionManager, commands::lock_db, error::{AppError, AppResult}};

const MAX_FILE: usize = 2 * 1024 * 1024;
const MAX_TOTAL: i64 = 64 * 1024 * 1024;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentInput {
 pub filename: String, pub mime_type: String, pub bytes: Vec<u8>, pub link_kind: String,
 pub link_id: Option<String>, pub previous_id: Option<String>, pub reviewer_user_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
 pub id: String, pub filename: String, pub mime_type: String, pub sha256: String,
 pub previous_id: Option<String>, pub link_kind: String, pub link_id: Option<String>, pub created_at: String,
}
pub(crate) fn invalid(message: &str) -> AppError { AppError::Import(message.into()) }
pub(crate) fn is_head(conn: &Connection, school: &str, actor: &str) -> AppResult<bool> {
 Ok(conn.query_row("SELECT EXISTS(SELECT 1 FROM user_school_roles WHERE school_id=?1 AND user_id=?2 AND role='school_head')", params![school,actor], |r| r.get(0))?)
}
pub(crate) fn ensure_learner(conn: &Connection, school: &str, actor: &str, learner: &str) -> AppResult<()> {
 let exists: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM learners WHERE id=?1 AND school_id=?2)",params![learner,school],|r|r.get(0))?;
 if !exists { return Err(AppError::Unauthorized); }
 if is_head(conn,school,actor)? { return Ok(()); }
 let allowed: bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM section_memberships m WHERE m.school_id=?1 AND m.learner_id=?2 AND m.ends_on IS NULL AND (EXISTS(SELECT 1 FROM teaching_assignments t WHERE t.section_id=m.section_id AND t.teacher_user_id=?3) OR EXISTS(SELECT 1 FROM section_advisories a WHERE a.section_id=m.section_id AND a.teacher_user_id=?3 AND a.ends_on IS NULL)))",params![school,learner,actor],|r|r.get(0))?;
 if allowed {Ok(())} else {Err(AppError::Unauthorized)}
}
fn validate_file(input: &AttachmentInput) -> AppResult<()> {
 let name = input.filename.trim();
 if name.is_empty() || name.len()>180 || name.contains(['/', '\\', '\0']) || input.bytes.is_empty() || input.bytes.len()>MAX_FILE {return Err(invalid("Choose a named file no larger than 2 MiB."));}
 let b=&input.bytes;
 let valid=match input.mime_type.as_str(){
 "application/pdf"=>b.starts_with(b"%PDF-"), "image/png"=>b.starts_with(b"\x89PNG\r\n\x1a\n"),
 "image/jpeg"=>b.starts_with(&[0xff,0xd8,0xff]) && b.ends_with(&[0xff,0xd9]),
 "text/plain"=>std::str::from_utf8(b).is_ok() && !b.contains(&0), _=>false};
 if !valid {return Err(invalid("The file content does not match a supported PDF, PNG, JPEG or text file."));} Ok(())
}
fn ensure_link(conn:&Connection,school:&str,actor:&str,input:&AttachmentInput)->AppResult<()> {
 match input.link_kind.as_str() {
 "standalone" if input.link_id.is_none()=>Ok(()),
 "learner"=>ensure_learner(conn,school,actor,input.link_id.as_deref().ok_or(AppError::Unauthorized)?),
 "class_record"=>{let id=input.link_id.as_deref().ok_or(AppError::Unauthorized)?; let allowed:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM class_records c WHERE c.id=?1 AND c.school_id=?2 AND EXISTS(SELECT 1 FROM teaching_assignments t WHERE t.section_id=c.section_id AND t.subject_id=c.subject_id AND t.teacher_user_id=?3))",params![id,school,actor],|r|r.get(0))?; if allowed {Ok(())} else if is_head(conn,school,actor)? {let found:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM class_records WHERE id=?1 AND school_id=?2)",params![id,school],|r|r.get(0))?; if found {Ok(())}else{Err(AppError::Unauthorized)}}else{Err(AppError::Unauthorized)}},
 "form_draft"=>{let id=input.link_id.as_deref().ok_or(AppError::Unauthorized)?;let allowed:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM review_packets WHERE id=?1 AND school_id=?2 AND owner_user_id=?3 AND status IN ('draft','returned'))",params![id,school,actor],|r|r.get(0))?;if allowed{Ok(())}else{Err(invalid("Evidence can be attached only to an editable form draft."))}},
 _=>Err(invalid("Choose a supported evidence link.")) }
}
fn can_read(conn:&Connection,school:&str,actor:&str,id:&str)->AppResult<bool>{
 let allowed:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM attachment_versions WHERE id=?1 AND school_id=?2 AND (owner_user_id=?3 OR reviewer_user_id=?3))",params![id,school,actor],|r|r.get(0))?;
 Ok(allowed)
}
pub fn store(conn:&Connection,school:&str,actor:&str,input:&AttachmentInput)->AppResult<String>{
 validate_file(input)?; ensure_link(conn,school,actor,input)?;
 if input.link_kind=="form_draft" {let reviewer:Option<String>=conn.query_row("SELECT reviewer_user_id FROM review_packets WHERE id=?1 AND school_id=?2",params![input.link_id,school],|r|r.get(0))?;if input.reviewer_user_id!=reviewer{return Err(invalid("Use the form draft's designated reviewer for its evidence."));}}
 if let Some(reviewer)=&input.reviewer_user_id { let member:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM user_school_memberships WHERE school_id=?1 AND user_id=?2)",params![school,reviewer],|r|r.get(0))?; if !member {return Err(AppError::Unauthorized);} }
 if let Some(previous)=&input.previous_id {let same:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM attachment_versions WHERE id=?1 AND school_id=?2 AND owner_user_id=?3 AND link_kind=?4 AND link_id IS ?5)",params![previous,school,actor,input.link_kind,input.link_id],|r|r.get(0))?;if !same{return Err(AppError::Unauthorized);}}
 let total:i64=conn.query_row("SELECT COALESCE(SUM(length(content)),0) FROM attachment_versions",[],|r|r.get(0))?;
 if total+input.bytes.len() as i64>MAX_TOTAL {return Err(invalid("This installation has reached its 64 MiB evidence limit. Older versions are retained."));}
 let digest=Sha256::digest(&input.bytes).iter().map(|b|format!("{b:02x}")).collect::<String>(); let id=Uuid::now_v7().to_string();
 conn.execute("INSERT INTO attachment_versions(id,school_id,owner_user_id,reviewer_user_id,previous_id,link_kind,link_id,filename,mime_type,sha256,content) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",params![id,school,actor,input.reviewer_user_id,input.previous_id,input.link_kind,input.link_id,input.filename.trim(),input.mime_type,digest,input.bytes])?; Ok(id)
}
#[tauri::command]
pub fn save_attachment(db:State<'_,Mutex<Connection>>,sessions:State<'_,SessionManager>,input:AttachmentInput)->AppResult<String>{let conn=lock_db(&db);let(actor,school)=sessions.require_active_session(&conn)?;store(&conn,&school,&actor,&input)}
#[tauri::command]
pub fn list_attachments(db:State<'_,Mutex<Connection>>,sessions:State<'_,SessionManager>)->AppResult<Vec<Attachment>>{let conn=lock_db(&db);let(actor,school)=sessions.require_active_session(&conn)?;let mut stmt=conn.prepare("SELECT id,filename,mime_type,sha256,previous_id,link_kind,link_id,created_at FROM attachment_versions WHERE school_id=?1 AND (owner_user_id=?2 OR reviewer_user_id=?2) ORDER BY created_at DESC")?;let rows=stmt.query_map(params![school,actor],|r|Ok(Attachment{id:r.get(0)?,filename:r.get(1)?,mime_type:r.get(2)?,sha256:r.get(3)?,previous_id:r.get(4)?,link_kind:r.get(5)?,link_id:r.get(6)?,created_at:r.get(7)?}))?.collect::<Result<Vec<_>,_>>()?;Ok(rows)}
#[tauri::command]
pub fn read_attachment(db:State<'_,Mutex<Connection>>,sessions:State<'_,SessionManager>,id:String)->AppResult<Vec<u8>>{let conn=lock_db(&db);let(actor,school)=sessions.require_active_session(&conn)?;if !can_read(&conn,&school,&actor,&id)?{return Err(AppError::Unauthorized);}Ok(conn.query_row("SELECT content FROM attachment_versions WHERE id=?1",[id],|r|r.get(0))?)}
#[cfg(test)] mod tests {use super::*;#[test]fn rejects_mime_spoof_and_oversize(){let mut i=AttachmentInput{filename:"test.pdf".into(),mime_type:"application/pdf".into(),bytes:b"not a pdf".to_vec(),link_kind:"standalone".into(),link_id:None,previous_id:None,reviewer_user_id:None};assert!(validate_file(&i).is_err());i.bytes=b"%PDF-1.7\n".to_vec();assert!(validate_file(&i).is_ok());i.bytes=vec![0;MAX_FILE+1];assert!(validate_file(&i).is_err());}}
