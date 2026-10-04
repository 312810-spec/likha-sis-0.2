use std::sync::Mutex;
use rusqlite::Connection;
use tauri::State;
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
pub fn publish_schedule_plan(db:State<'_,Mutex<Connection>>,sessions:State<'_,SessionManager>,id:String,expected_revision:i64)->AppResult<SchedulePlan>{let conn=lock_db(&db);let school=auth::authorize_capability(&conn,&sessions,Capability::ManageTeachingAssignments)?;schedule_plan::publish(&conn,&school,&id,expected_revision)}
#[tauri::command]
pub fn list_my_published_schedule(db:State<'_,Mutex<Connection>>,sessions:State<'_,SessionManager>,date:String)->AppResult<Vec<PublishedTeacherMeeting>>{let conn=lock_db(&db);let(actor,school)=sessions.require_active_session(&conn)?;schedule_plan::mine(&conn,&school,&actor,&date)}
