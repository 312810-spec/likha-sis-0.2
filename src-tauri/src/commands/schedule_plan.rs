use std::sync::Mutex;
use rusqlite::Connection;
use tauri::{AppHandle, State};
use crate::auth::{self,Capability,SessionManager};
use crate::commands::lock_db;
use crate::error::{AppError,AppResult};
use crate::repository::schedule_plan::{self,SchedulePlan,PublishedTeacherMeeting};
use crate::scheduling::{self,SchedulePlanInput};
#[tauri::command]
pub fn list_schedule_plans(db:State<'_,Mutex<Connection>>,sessions:State<'_,SessionManager>)->AppResult<Vec<SchedulePlan>> {let conn=lock_db(&db);let school=auth::authorize_capability(&conn,&sessions,Capability::ManageTeachingAssignments)?;schedule_plan::list(&conn,&school)}
#[tauri::command]
pub fn save_schedule_plan(db:State<'_,Mutex<Connection>>,sessions:State<'_,SessionManager>,input:SchedulePlanInput,id:Option<String>,expected_revision:Option<i64>)->AppResult<SchedulePlan>{let conn=lock_db(&db);let(school,actor)=auth::authorize_capability_with_actor(&conn,&sessions,Capability::ManageTeachingAssignments)?;schedule_plan::save(&conn,&school,&actor,input,id.as_deref(),expected_revision)}
#[tauri::command]
pub fn copy_schedule_plan(db:State<'_,Mutex<Connection>>,sessions:State<'_,SessionManager>,id:String)->AppResult<SchedulePlan>{let conn=lock_db(&db);let(school,actor)=auth::authorize_capability_with_actor(&conn,&sessions,Capability::ManageTeachingAssignments)?;schedule_plan::copy(&conn,&school,&actor,&id)}
#[tauri::command]
pub async fn generate_schedule_plan(db:State<'_,Mutex<Connection>>,sessions:State<'_,SessionManager>,id:String,expected_revision:i64,max_nodes:Option<u64>)->AppResult<SchedulePlan>{
 let (school,actor,input)={let conn=lock_db(&db);let (school,actor)=auth::authorize_capability_with_actor(&conn,&sessions,Capability::ManageTeachingAssignments)?;let p=schedule_plan::find(&conn,&school,&id)?.ok_or(AppError::Unauthorized)?;if p.status!="draft"||p.revision!=expected_revision{return Err(AppError::Import("Plan changed; reload".into()));}(school,actor,p.input)};
 let result=tauri::async_runtime::spawn_blocking(move||scheduling::generate(&input,max_nodes.unwrap_or(100_000))).await.map_err(|_|AppError::Import("Schedule worker stopped; retry".into()))?;
 let conn=lock_db(&db);let (active_school,active_actor)=auth::authorize_capability_with_actor(&conn,&sessions,Capability::ManageTeachingAssignments)?;if active_school!=school||active_actor!=actor{return Err(AppError::Unauthorized);}schedule_plan::store_result(&conn,&school,&id,expected_revision,result)
}
#[tauri::command]
pub fn publish_schedule_plan(app: AppHandle, db:State<'_,Mutex<Connection>>,sessions:State<'_,SessionManager>,id:String,expected_revision:i64)->AppResult<SchedulePlan>{
 let conn=lock_db(&db);let (school,actor)=auth::authorize_capability_with_actor(&conn,&sessions,Capability::ManageTeachingAssignments)?;
 let key=if crate::repository::device_credential::has_active_for_school(&conn,&school)? {Some(crate::db::load_or_mint_sspk(&app)?)}else{None};
 publish_with_sync(&conn,&school,&actor,&id,expected_revision,key.as_ref())
}

pub(crate) fn publish_with_sync(conn: &Connection, school: &str, actor: &str, id: &str, revision: i64, key: Option<&[u8; crate::crypto::payload_key::PAYLOAD_KEY_LEN]>) -> AppResult<SchedulePlan> {
 conn.execute_batch("SAVEPOINT publish_and_enqueue")?;
 let result = (|| {
   let plan = schedule_plan::publish(conn,school,id,revision)?;
   if let Some(key)=key {
     let publication=schedule_plan::publication(conn,school,actor,plan.clone())?;
     let plaintext=serde_json::to_vec(&publication).map_err(|_| AppError::Import("Cannot serialize publication".into()))?;
     let parse=|v:&str| uuid::Uuid::parse_str(v).map_err(|_|AppError::Import("Invalid synchronization identifier".into()));
     let change=crate::sync::PendingChange {
        change_id:uuid::Uuid::now_v7(), device_id:parse(&crate::repository::device_identity::current_or_create(conn)?)?, actor_user_id:parse(actor)?,
        entity_kind:crate::sync::EntityKind::SchedulePlan,entity_id:parse(id)?,base_version:0,operation:crate::sync::ChangeOperation::Upsert,
        encrypted_payload:crate::crypto::payload_key::encrypt_payload(key,&plaintext)?,
     };
     crate::sync::validate_change(&change).map_err(|_|AppError::Import("Publication exceeds synchronization capacity; reduce its scope".into()))?;
     crate::repository::sync_outbox::enqueue(conn,school,&change)?;
   }
   Ok(plan)
 })();
 match result {Ok(plan)=>{conn.execute_batch("RELEASE publish_and_enqueue")?;Ok(plan)},Err(error)=>{let _=conn.execute_batch("ROLLBACK TO publish_and_enqueue; RELEASE publish_and_enqueue");Err(error)}}
}
#[tauri::command]
pub fn list_my_published_schedule(db:State<'_,Mutex<Connection>>,sessions:State<'_,SessionManager>,date:String)->AppResult<Vec<PublishedTeacherMeeting>>{let conn=lock_db(&db);let(actor,school)=sessions.require_active_session(&conn)?;schedule_plan::mine(&conn,&school,&actor,&date)}
