use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize,Serialize};
use uuid::Uuid;
use crate::error::{AppError,AppResult};
use crate::scheduling::{self,SchedulePlanInput,GenerationResult};
use crate::repository::{section,subject,user,teaching_assignment};
#[derive(Debug,Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct SchedulePlan {pub id:String,pub revision:i64,pub status:String,pub input:SchedulePlanInput,pub result:Option<GenerationResult>,pub published_at:Option<String>}
#[derive(Debug,Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct PublishedTeacherMeeting {pub plan_id:String,pub plan_label:String,pub published_at:String,pub effective_from:String,pub effective_until:String,pub course_id:String,pub teaching_assignment_id:String,pub section_id:String,pub subject_id:String,pub weekday:u8,pub starts_at:String,pub ends_at:String,pub room_id:String}
fn issue(s:&str)->AppError {AppError::Import(s.into())}
fn decode(row:&rusqlite::Row<'_>)->rusqlite::Result<SchedulePlan> {
 let input:String=row.get(3)?;let result:Option<String>=row.get(4)?;
 let invalid=|e:serde_json::Error|rusqlite::Error::FromSqlConversionFailure(3,rusqlite::types::Type::Text,Box::new(e));
 Ok(SchedulePlan{id:row.get(0)?,revision:row.get(1)?,status:row.get(2)?,input:serde_json::from_str(&input).map_err(invalid)?,result:result.map(|r|serde_json::from_str(&r)).transpose().map_err(invalid)?,published_at:row.get(5)?})
}
pub fn find(conn:&Connection,school:&str,id:&str)->AppResult<Option<SchedulePlan>> {Ok(conn.query_row("SELECT id,revision,status,input_json,result_json,published_at FROM schedule_plans WHERE school_id=?1 AND id=?2",(school,id),decode).optional()?)}
pub fn list(conn:&Connection,school:&str)->AppResult<Vec<SchedulePlan>> {Ok(conn.prepare("SELECT id,revision,status,input_json,result_json,published_at FROM schedule_plans WHERE school_id=?1 ORDER BY updated_at DESC,id")?.query_map([school],decode)?.collect::<Result<Vec<_>,_>>()?)}
fn refs(conn:&Connection,school:&str,p:&SchedulePlanInput)->AppResult<()> {
 if !scheduling::validate_input(p).is_empty(){return Err(issue("Check plan inputs before saving"));}
 for t in &p.teachers {if !user::is_member_of_school(conn,&t.id,school)?{return Err(AppError::Unauthorized);}}
 for c in &p.courses {let s=section::find_by_id_in_school(conn,school,&c.section_id)?.ok_or(AppError::Unauthorized)?;if s.school_year!=p.school_year||subject::find_by_id_in_school(conn,school,&c.subject_id)?.is_none(){return Err(issue("Course references must belong to this school and school year"));}}
 Ok(())
}
pub fn save(conn:&Connection,school:&str,actor:&str,p:SchedulePlanInput,id:Option<&str>,expected:Option<i64>)->AppResult<SchedulePlan> {
 refs(conn,school,&p)?;let json=serde_json::to_string(&p).map_err(|_|issue("Cannot serialize plan"))?;
 let id=match id {Some(id)=>{let old=find(conn,school,id)?.ok_or(AppError::Unauthorized)?;if old.status!="draft"||Some(old.revision)!=expected{return Err(issue("Plan changed or was published; reload or copy it"));}let n=conn.execute("UPDATE schedule_plans SET input_json=?1,result_json=NULL,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE school_id=?2 AND id=?3 AND revision=?4 AND status='draft'",(&json,school,id,old.revision))?;if n!=1{return Err(issue("Plan changed; reload"));}id.to_owned()},None=>{let id=Uuid::now_v7().to_string();conn.execute("INSERT INTO schedule_plans(id,school_id,revision,status,input_json,created_by) VALUES(?1,?2,1,'draft',?3,?4)",(&id,school,&json,actor))?;id}};
 find(conn,school,&id)?.ok_or(AppError::Unauthorized)
}
pub fn copy(conn:&Connection,school:&str,actor:&str,id:&str)->AppResult<SchedulePlan>{let mut p=find(conn,school,id)?.ok_or(AppError::Unauthorized)?.input;p.label=format!("{} (copy)",p.label);p.data_confirmed=false;save(conn,school,actor,p,None,None)}
pub fn store_result(conn:&Connection,school:&str,id:&str,revision:i64,result:GenerationResult)->AppResult<SchedulePlan>{let json=serde_json::to_string(&result).map_err(|_|issue("Cannot serialize result"))?;if conn.execute("UPDATE schedule_plans SET result_json=?1,revision=revision+1 WHERE school_id=?2 AND id=?3 AND revision=?4 AND status='draft'",(json,school,id,revision))?!=1{return Err(issue("Plan changed while generating; reload"));}find(conn,school,id)?.ok_or(AppError::Unauthorized)}
pub fn publish(conn:&Connection,school:&str,id:&str,revision:i64)->AppResult<SchedulePlan>{
 let p=find(conn,school,id)?.ok_or(AppError::Unauthorized)?;
 if p.status!="draft"||p.revision!=revision||!p.input.data_confirmed{return Err(issue("Confirm school inputs and reload the latest draft"));}
 refs(conn,school,&p.input)?;let r=p.result.as_ref().ok_or_else(||issue("Generate and review the schedule first"))?;
 if r.status!="feasible"||!scheduling::validate_schedule(&p.input,&r.meetings).is_empty(){return Err(issue("Schedule has unresolved constraints"));}
 conn.execute_batch("SAVEPOINT publish_schedule_plan")?;
 let result=(||{
 for c in &p.input.courses {let teacher=&r.meetings.iter().find(|m|m.course_id==c.id).ok_or_else(||issue("Missing course meeting"))?.teacher_id;
 let existing:Option<String>=conn.query_row("SELECT teacher_user_id FROM teaching_assignments WHERE school_id=?1 AND section_id=?2 AND subject_id=?3",(school,&c.section_id,&c.subject_id),|row|row.get(0)).optional()?;
 match existing {Some(old) if &old!=teacher=>return Err(issue("Teacher change needs a handover; existing offline work was preserved")),Some(_)=>{},None=>{teaching_assignment::create(conn,school,teacher,&c.section_id,&c.subject_id)?.ok_or(AppError::Unauthorized)?;}}
 }
 if conn.execute("UPDATE schedule_plans SET status='published',revision=revision+1,published_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE school_id=?1 AND id=?2 AND revision=?3 AND status='draft'",(school,id,revision))?!=1{return Err(issue("Plan changed; reload"));}
 find(conn,school,id)?.ok_or(AppError::Unauthorized)
 })();
 match result {Ok(p)=>{conn.execute_batch("RELEASE publish_schedule_plan")?;Ok(p)},Err(e)=>{let _=conn.execute_batch("ROLLBACK TO publish_schedule_plan; RELEASE publish_schedule_plan");Err(e)}}
}
pub fn mine(conn:&Connection,school:&str,teacher:&str,date:&str)->AppResult<Vec<PublishedTeacherMeeting>> {
 if !scheduling::valid_date(date){return Err(issue("Choose a valid date"));}
 let mut plans=list(conn,school)?;plans.retain(|p|p.status=="published"&&p.input.effective_from.as_str()<=date&&p.input.effective_until.as_str()>=date);plans.sort_by(|a,b|b.published_at.cmp(&a.published_at).then(b.id.cmp(&a.id)));
 // The latest applicable immutable publication is the active school timetable.
 let Some(p)=plans.first() else{return Ok(vec![]);};let mut rows=vec![];
 if let Some(r)=&p.result {for m in &r.meetings {if m.teacher_id!=teacher{continue;}let Some(c)=p.input.courses.iter().find(|c|c.id==m.course_id) else{continue;};let assignment:Option<String>=conn.query_row("SELECT id FROM teaching_assignments WHERE school_id=?1 AND section_id=?2 AND subject_id=?3 AND teacher_user_id=?4",(school,&c.section_id,&c.subject_id,teacher),|row|row.get(0)).optional()?;rows.push(PublishedTeacherMeeting{plan_id:p.id.clone(),plan_label:p.input.label.clone(),published_at:p.published_at.clone().unwrap_or_default(),effective_from:p.input.effective_from.clone(),effective_until:p.input.effective_until.clone(),course_id:m.course_id.clone(),teaching_assignment_id:assignment.unwrap_or_default(),section_id:c.section_id.clone(),subject_id:c.subject_id.clone(),weekday:m.weekday,starts_at:m.starts_at.clone(),ends_at:m.ends_at.clone(),room_id:m.room_id.clone()});}}
 Ok(rows)
}

/// One authenticated immutable publication: timetable and exact assignment IDs travel together.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulePublication {
    pub school_id: String,
    pub created_by: String,
    pub plan: SchedulePlan,
    pub assignments: Vec<teaching_assignment::TeachingAssignment>,
}

pub fn publication(conn: &Connection, school: &str, actor: &str, plan: SchedulePlan) -> AppResult<SchedulePublication> {
    let mut assignments = Vec::new();
    for course in &plan.input.courses {
        let assignment = conn.query_row(
            "SELECT id FROM teaching_assignments WHERE school_id=?1 AND section_id=?2 AND subject_id=?3",
            (school, &course.section_id, &course.subject_id), |row| row.get::<_, String>(0),
        )?;
        assignments.push(teaching_assignment::find_by_id_in_school(conn, school, &assignment)?.ok_or(AppError::Unauthorized)?);
    }
    Ok(SchedulePublication { school_id: school.into(), created_by: actor.into(), plan, assignments })
}

/// Re-check originating authority and all constraints at the receiving trusted boundary.
pub fn apply_publication(conn: &Connection, school: &str, actor: &str, incoming: &SchedulePublication) -> AppResult<()> {
    let p = &incoming.plan;
    let authorized: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM user_school_roles WHERE school_id=?1 AND user_id=?2 AND role='school_head')", (school, actor), |row| row.get(0))?;
    if !authorized || incoming.school_id != school || incoming.created_by != actor
        || p.status != "published" || p.published_at.as_ref().is_none_or(|s| s.is_empty())
        || p.revision < 2 || !p.input.data_confirmed {
        return Err(AppError::Unauthorized);
    }
    refs(conn, school, &p.input)?;
    let result = p.result.as_ref().ok_or_else(|| issue("Publication has no schedule"))?;
    if result.status != "feasible" || !scheduling::validate_schedule(&p.input, &result.meetings).is_empty()
        || incoming.assignments.len() != p.input.courses.len() {
        return Err(issue("Publication does not match its independently validated schedule"));
    }
    let mut seen = std::collections::HashSet::new();
    for course in &p.input.courses {
        let teacher = &result.meetings.iter().find(|m| m.course_id == course.id).ok_or_else(|| issue("Missing meeting"))?.teacher_id;
        let assignment = incoming.assignments.iter().find(|a| a.section_id == course.section_id && a.subject_id == course.subject_id).ok_or_else(|| issue("Missing assignment dependency"))?;
        if assignment.school_id != school || &assignment.teacher_user_id != teacher || !seen.insert(&assignment.id) {
            return Err(AppError::Unauthorized);
        }
        let old: Option<String> = conn.query_row("SELECT id FROM teaching_assignments WHERE school_id=?1 AND section_id=?2 AND subject_id=?3", (school, &course.section_id, &course.subject_id), |row| row.get(0)).optional()?;
        if old.as_ref().is_some_and(|old| old != &assignment.id) { return Err(issue("Assignment differs; handover required")); }
        if let Some(old) = teaching_assignment::find_by_id_in_school(conn, school, &assignment.id)? {
            if old.teacher_user_id != assignment.teacher_user_id || old.section_id != assignment.section_id || old.subject_id != assignment.subject_id { return Err(issue("Existing assignment was preserved")); }
        }
    }
    if let Some(existing) = find(conn, school, &p.id)? {
        if serde_json::to_value(&existing).ok() == serde_json::to_value(p).ok() { return Ok(()); }
        return Err(issue("Immutable publication differs from the existing version"));
    }
    conn.execute_batch("SAVEPOINT receive_schedule_publication")?;
    let result = (|| {
        for assignment in &incoming.assignments { teaching_assignment::upsert_from_sync(conn, assignment)?; }
        conn.execute("INSERT INTO schedule_plans(id,school_id,revision,status,input_json,result_json,published_at,created_by) VALUES(?1,?2,?3,'published',?4,?5,?6,?7)",
            (&p.id, school, p.revision, serde_json::to_string(&p.input).map_err(|_|issue("Invalid input"))?, serde_json::to_string(&p.result).map_err(|_|issue("Invalid result"))?, &p.published_at, actor))?;
        Ok(())
    })();
    match result { Ok(()) => { conn.execute_batch("RELEASE receive_schedule_publication")?; Ok(()) }, Err(error) => { let _ = conn.execute_batch("ROLLBACK TO receive_schedule_publication; RELEASE receive_schedule_publication"); Err(error) } }
}
