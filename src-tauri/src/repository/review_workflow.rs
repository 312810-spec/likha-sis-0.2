//! Local draft review. Approval never constitutes official form issuance or TANAW Lock.
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Indicator {
    Count { name: String, value: u32, provenance: String },
    Percentage { name: String, numerator: u32, denominator: u32, provenance: String },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Discrepancy { pub description: String, pub resolution: String }
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftContent {
    pub kind: String, pub title: String, pub form_code: String, pub notes: String,
    pub source_cutoff: String, pub dictionary_version: String, pub sources_confirmed: bool,
    pub indicators: Vec<Indicator>, pub discrepancies: Vec<Discrepancy>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewPacket {
    pub id: String, pub school_id: String, pub owner_user_id: String,
    pub reviewer_user_id: Option<String>, pub section_id: String, pub revision: i64,
    pub status: String, pub content: DraftContent, pub content_hash: String,
    pub parent_packet_id: Option<String>, pub updated_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRequest {
    pub action: String, pub id: Option<String>, pub expected_revision: Option<i64>,
    pub section_id: Option<String>, pub content: Option<DraftContent>,
    pub reviewer_user_id: Option<String>, pub reason: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewHistory {
    pub revision: i64, pub actor_user_id: String, pub action: String, pub reason: String,
    pub content: DraftContent, pub content_hash: String, pub status: String,
    pub reviewer_user_id: Option<String>, pub recorded_at: String,
}
fn invalid(message: &str) -> AppError { AppError::FormGeneration(message.to_owned()) }
fn has_role(conn: &Connection, school: &str, actor: &str, roles: &[&str]) -> AppResult<bool> {
    for role in roles {
        let found: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM user_school_roles r JOIN user_school_memberships m USING(user_id,school_id) WHERE r.school_id=?1 AND r.user_id=?2 AND r.role=?3)", (school, actor, role), |r| r.get(0))?;
        if found { return Ok(true); }
    }
    Ok(false)
}
fn head(conn: &Connection, school: &str, actor: &str) -> AppResult<bool> { has_role(conn, school, actor, &["school_head"]) }
fn require_preparer(conn: &Connection, school: &str, actor: &str, section: &str) -> AppResult<()> {
    let exists: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM sections WHERE school_id=?1 AND id=?2)", (school,section), |r| r.get(0))?;
    if !exists { return Err(AppError::Unauthorized); }
    if head(conn, school, actor)? { return Ok(()); }
    let adviser: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM section_advisories WHERE school_id=?1 AND teacher_user_id=?2 AND section_id=?3 AND starts_on<=date('now') AND (ends_on IS NULL OR ends_on>date('now')))", (school,actor,section), |r| r.get(0))?;
    if adviser && has_role(conn, school, actor, &["teacher"])? { Ok(()) } else { Err(AppError::Unauthorized) }
}
fn read_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReviewPacket> {
    let raw: String = row.get(8)?;
    let content = serde_json::from_str(&raw).map_err(|e| rusqlite::Error::FromSqlConversionFailure(8,rusqlite::types::Type::Text,Box::new(e)))?;
    Ok(ReviewPacket { id:row.get(0)?,school_id:row.get(1)?,owner_user_id:row.get(2)?,reviewer_user_id:row.get(3)?,section_id:row.get(4)?,revision:row.get(5)?,status:row.get(6)?,content_hash:row.get(7)?,content,parent_packet_id:row.get(9)?,updated_at:row.get(10)? })
}
const COLUMNS: &str = "id,school_id,owner_user_id,reviewer_user_id,section_id,revision,status,content_hash,content_json,parent_packet_id,updated_at";
fn get(conn: &Connection, school: &str, id: &str) -> AppResult<ReviewPacket> {
    Ok(conn.query_row(&format!("SELECT {COLUMNS} FROM review_packets WHERE school_id=?1 AND id=?2"),(school,id),read_row)?)
}
// Avoid exposing whether a packet in another school exists.
fn accessible(conn: &Connection, school: &str, actor: &str, packet: &ReviewPacket) -> AppResult<()> {
    if packet.owner_user_id==actor || packet.reviewer_user_id.as_deref()==Some(actor) || head(conn,school,actor)? { Ok(()) } else { Err(AppError::Unauthorized) }
}
pub fn list(conn: &Connection, school: &str, actor: &str) -> AppResult<Vec<ReviewPacket>> {
    let is_head=head(conn,school,actor)?;
    let mut stmt=conn.prepare(&format!("SELECT {COLUMNS} FROM review_packets WHERE school_id=?1 AND (?3 OR owner_user_id=?2 OR reviewer_user_id=?2) ORDER BY updated_at DESC"))?;
    Ok(stmt.query_map(params![school,actor,is_head],read_row)?.collect::<rusqlite::Result<Vec<_>>>()?)
}
fn validate_content(c: &DraftContent, approval: bool) -> AppResult<()> {
    if !["form","tanaw"].contains(&c.kind.as_str()) || c.title.trim().is_empty() || c.title.len()>200 || c.notes.len()>20000 || c.indicators.len()>100 || c.discrepancies.len()>100 { return Err(invalid("Draft content is incomplete or too large.")); }
    if c.form_code.eq_ignore_ascii_case("SF8") { return Err(invalid("SF8 remains inactive.")); }
    if c.kind=="form" && !["SF1","SF2","SF3","SF4","SF5","SF6","SF7","SF9","SF10"].contains(&c.form_code.as_str()) { return Err(invalid("Choose a supported draft school form.")); }
    for i in &c.indicators {
        let (name,provenance)=match i { Indicator::Count{name,provenance,..}|Indicator::Percentage{name,provenance,..}=>(name,provenance) };
        if name.trim().is_empty() || name.len()>200 || provenance.len()>2000 { return Err(invalid("Each indicator needs a name and a bounded source note.")); }
        if let Indicator::Percentage{numerator,denominator,..}=i {
            if numerator>denominator { return Err(invalid("A percentage numerator cannot exceed its population denominator.")); }
            if approval && *denominator==0 { return Err(invalid("A zero population means missing percentage data; resolve it before approval.")); }
        }
        if approval && provenance.trim().is_empty() { return Err(invalid("Every indicator needs its source provenance before approval.")); }
    }
    if c.discrepancies.iter().any(|d| d.description.trim().is_empty() || d.description.len()>2000 || d.resolution.len()>4000) { return Err(invalid("Discrepancies need a description and bounded resolution notes.")); }
    if approval {
        if c.source_cutoff.len()!=10 || time::Date::parse(&c.source_cutoff,time::macros::format_description!("[year]-[month]-[day]")).is_err() || c.dictionary_version.trim().is_empty() || !c.sources_confirmed { return Err(invalid("Confirm the source cutoff and dictionary version before approval.")); }
        if c.discrepancies.iter().any(|d|d.resolution.trim().is_empty()) { return Err(invalid("Resolve all discrepancies before approval.")); }
    }
    Ok(())
}
fn encode(c: &DraftContent) -> AppResult<(String,String)> {
    let raw=serde_json::to_string(c).map_err(|_|invalid("Cannot encode draft."))?;
    let hash=format!("{:x}",Sha256::digest(raw.as_bytes())); Ok((raw,hash))
}
pub fn act(conn: &Connection, school: &str, actor: &str, req: ReviewRequest) -> AppResult<ReviewPacket> {
    if req.reason.len()>4000 { return Err(invalid("Keep the reason within 4000 characters.")); }
    let tx=conn.unchecked_transaction()?;
    let mut packet;
    if req.action=="create" {
        let section=req.section_id.as_deref().ok_or_else(||invalid("Choose your advisory section."))?;
        require_preparer(&tx,school,actor,section)?;
        let content=req.content.ok_or_else(||invalid("Draft content is required."))?;
        validate_content(&content,false)?;
        packet=ReviewPacket{id:Uuid::now_v7().to_string(),school_id:school.to_owned(),owner_user_id:actor.to_owned(),reviewer_user_id:None,section_id:section.to_owned(),revision:1,status:"draft".to_owned(),content,content_hash:String::new(),parent_packet_id:None,updated_at:String::new()};
    } else {
        let id=req.id.as_deref().ok_or_else(||invalid("Choose a draft."))?;
        packet=get(&tx,school,id)?;
        accessible(&tx,school,actor,&packet)?;
        if req.expected_revision!=Some(packet.revision) { return Err(invalid("This draft changed. Refresh before continuing.")); }
        match req.action.as_str() {
            "save"|"submit" => {
                if packet.owner_user_id!=actor { return Err(AppError::Unauthorized); }
                require_preparer(&tx,school,actor,&packet.section_id)?;
                if !["draft","returned"].contains(&packet.status.as_str()) { return Err(invalid("Only draft or returned packets can be edited or submitted.")); }
                if req.action=="save" { packet.content=req.content.ok_or_else(||invalid("Draft content is required."))?; validate_content(&packet.content,false)?; packet.status="draft".into(); }
                else {
                    let reviewer=packet.reviewer_user_id.as_deref().ok_or_else(||invalid("The School Head must designate a reviewer first."))?;
                    if !has_role(&tx,school,reviewer,&["teacher","registrar","school_head"])? { return Err(invalid("The designated reviewer is no longer eligible.")); }
                    validate_content(&packet.content,true)?; packet.status="submitted".into();
                }
            }
            "designate" => {
                if !head(&tx,school,actor)? { return Err(AppError::Unauthorized); }
                if packet.status=="approved" { return Err(invalid("Create a correction draft for an approved packet.")); }
                let reviewer=req.reviewer_user_id.as_deref().ok_or_else(||invalid("Choose a reviewer."))?;
                if reviewer==packet.owner_user_id || !has_role(&tx,school,reviewer,&["teacher","registrar","school_head"])? { return Err(invalid("Choose another eligible school member as reviewer.")); }
                packet.reviewer_user_id=Some(reviewer.into()); packet.status="draft".into(); packet.content.sources_confirmed=false;
            }
            "return"|"approve" => {
                if packet.reviewer_user_id.as_deref()!=Some(actor) || packet.owner_user_id==actor || !has_role(&tx,school,actor,&["teacher","registrar","school_head"])? { return Err(AppError::Unauthorized); }
                if packet.status!="submitted" { return Err(invalid("Only submitted packets can be reviewed.")); }
                if req.reason.trim().is_empty() { return Err(invalid("Record a review reason.")); }
                if req.action=="approve" { validate_content(&packet.content,true)?; packet.status="approved".into(); }
                else { packet.status="returned".into(); packet.content.sources_confirmed=false; }
            }
            "correct" => {
                if packet.status!="approved" { return Err(invalid("Only approved packets need a correction copy.")); }
                if req.reason.trim().is_empty() { return Err(invalid("Record why a correction is needed.")); }
                require_preparer(&tx,school,actor,&packet.section_id)?;
                packet.parent_packet_id=Some(packet.id.clone()); packet.id=Uuid::now_v7().to_string(); packet.owner_user_id=actor.into(); packet.reviewer_user_id=None; packet.status="draft".into(); packet.revision=0; packet.content.sources_confirmed=false;
            }
            _=>return Err(invalid("Unknown review action.")),
        }
        packet.revision+=1;
    }
    let (raw,hash)=encode(&packet.content)?; packet.content_hash=hash;
    let inserting=req.action=="create" || req.action=="correct";
    if inserting {
        tx.execute("INSERT INTO review_packets(id,school_id,owner_user_id,reviewer_user_id,section_id,revision,status,content_json,content_hash,parent_packet_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",params![packet.id,school,packet.owner_user_id,packet.reviewer_user_id,packet.section_id,packet.revision,packet.status,raw,packet.content_hash,packet.parent_packet_id])?;
    } else {
        let changed=tx.execute("UPDATE review_packets SET reviewer_user_id=?3,revision=?4,status=?5,content_json=?6,content_hash=?7,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE school_id=?1 AND id=?2 AND revision=?8",params![school,packet.id,packet.reviewer_user_id,packet.revision,packet.status,raw,packet.content_hash,req.expected_revision])?;
        if changed!=1 { return Err(invalid("This draft changed. Refresh before continuing.")); }
    }
    tx.execute("INSERT INTO review_packet_history(packet_id,revision,actor_user_id,action,reason,content_json,content_hash,status,reviewer_user_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",params![packet.id,packet.revision,actor,req.action,req.reason,raw,packet.content_hash,packet.status,packet.reviewer_user_id])?;
    let result=get(&tx,school,&packet.id)?; tx.commit()?; Ok(result)
}
pub fn history(conn: &Connection, school: &str, actor: &str, id: &str) -> AppResult<Vec<ReviewHistory>> {
    let p=get(conn,school,id)?; accessible(conn,school,actor,&p)?;
    let mut stmt=conn.prepare("SELECT revision,actor_user_id,action,reason,content_json,content_hash,status,reviewer_user_id,recorded_at FROM review_packet_history WHERE packet_id=?1 ORDER BY revision")?;
    Ok(stmt.query_map([id],|r| { let raw:String=r.get(4)?; let content=serde_json::from_str(&raw).map_err(|e|rusqlite::Error::FromSqlConversionFailure(4,rusqlite::types::Type::Text,Box::new(e)))?; Ok(ReviewHistory{revision:r.get(0)?,actor_user_id:r.get(1)?,action:r.get(2)?,reason:r.get(3)?,content,content_hash:r.get(5)?,status:r.get(6)?,reviewer_user_id:r.get(7)?,recorded_at:r.get(8)?}) })?.collect::<rusqlite::Result<Vec<_>>>()?)
}
