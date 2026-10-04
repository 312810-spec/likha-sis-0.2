//! Local draft review. Approval never constitutes official form issuance or TANAW Lock.
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Indicator {
    Count {
        name: String,
        value: u32,
        provenance: String,
    },
    Percentage {
        name: String,
        numerator: u32,
        denominator: u32,
        provenance: String,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Discrepancy {
    pub description: String,
    pub resolution: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentEvidence {
    pub id: String,
    pub sha256: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSnapshot {
    pub cutoff: String,
    pub captured_at: String,
    pub fingerprint: String,
    pub roster_count: usize,
    pub attendance_count: usize,
    pub class_record_count: usize,
    pub complete_grade_count: usize,
    pub incomplete_grade_count: usize,
    pub discrepancies: Vec<String>,
    // Canonical source rows are retained in the frozen packet; never presented
    // as the values that existed historically on cutoff day.
    pub canonical_sources: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftContent {
    pub kind: String,
    pub title: String,
    pub form_code: String,
    pub notes: String,
    pub source_cutoff: String,
    pub dictionary_version: String,
    pub sources_confirmed: bool,
    pub indicators: Vec<Indicator>,
    pub discrepancies: Vec<Discrepancy>,
    #[serde(default)]
    pub source_snapshot: Option<SourceSnapshot>,
    #[serde(default)]
    pub attachment_manifest: Vec<AttachmentEvidence>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewPacket {
    pub id: String,
    pub school_id: String,
    pub owner_user_id: String,
    pub reviewer_user_id: Option<String>,
    pub section_id: String,
    pub revision: i64,
    pub status: String,
    pub content: DraftContent,
    pub content_hash: String,
    pub parent_packet_id: Option<String>,
    pub updated_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRequest {
    pub action: String,
    pub id: Option<String>,
    pub expected_revision: Option<i64>,
    pub section_id: Option<String>,
    pub content: Option<DraftContent>,
    pub reviewer_user_id: Option<String>,
    pub reason: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewHistory {
    pub revision: i64,
    pub actor_user_id: String,
    pub action: String,
    pub reason: String,
    pub content: DraftContent,
    pub content_hash: String,
    pub status: String,
    pub reviewer_user_id: Option<String>,
    pub recorded_at: String,
}
fn invalid(message: &str) -> AppError {
    AppError::FormGeneration(message.to_owned())
}
fn has_role(conn: &Connection, school: &str, actor: &str, roles: &[&str]) -> AppResult<bool> {
    for role in roles {
        let found: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM user_school_roles r JOIN user_school_memberships m USING(user_id,school_id) WHERE r.school_id=?1 AND r.user_id=?2 AND r.role=?3)", (school, actor, role), |r| r.get(0))?;
        if found {
            return Ok(true);
        }
    }
    Ok(false)
}
fn head(conn: &Connection, school: &str, actor: &str) -> AppResult<bool> {
    has_role(conn, school, actor, &["school_head"])
}
fn require_preparer(conn: &Connection, school: &str, actor: &str, section: &str) -> AppResult<()> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sections WHERE school_id=?1 AND id=?2)",
        (school, section),
        |r| r.get(0),
    )?;
    if !exists {
        return Err(AppError::Unauthorized);
    }
    if head(conn, school, actor)? {
        return Ok(());
    }
    let adviser: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM section_advisories WHERE school_id=?1 AND teacher_user_id=?2 AND section_id=?3 AND starts_on<=date('now') AND (ends_on IS NULL OR ends_on>date('now')))", (school,actor,section), |r| r.get(0))?;
    if adviser && has_role(conn, school, actor, &["teacher"])? {
        Ok(())
    } else {
        Err(AppError::Unauthorized)
    }
}
fn read_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReviewPacket> {
    let raw: String = row.get(8)?;
    let content = serde_json::from_str(&raw).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(8, rusqlite::types::Type::Text, Box::new(e))
    })?;
    Ok(ReviewPacket {
        id: row.get(0)?,
        school_id: row.get(1)?,
        owner_user_id: row.get(2)?,
        reviewer_user_id: row.get(3)?,
        section_id: row.get(4)?,
        revision: row.get(5)?,
        status: row.get(6)?,
        content_hash: row.get(7)?,
        content,
        parent_packet_id: row.get(9)?,
        updated_at: row.get(10)?,
    })
}
const COLUMNS: &str = "id,school_id,owner_user_id,reviewer_user_id,section_id,revision,status,content_hash,content_json,parent_packet_id,updated_at";
fn get(conn: &Connection, school: &str, id: &str) -> AppResult<ReviewPacket> {
    Ok(conn.query_row(
        &format!("SELECT {COLUMNS} FROM review_packets WHERE school_id=?1 AND id=?2"),
        (school, id),
        read_row,
    )?)
}
// Avoid exposing whether a packet in another school exists.
fn accessible(
    conn: &Connection,
    school: &str,
    actor: &str,
    packet: &ReviewPacket,
) -> AppResult<()> {
    if packet.owner_user_id == actor
        || packet.reviewer_user_id.as_deref() == Some(actor)
        || head(conn, school, actor)?
    {
        Ok(())
    } else {
        Err(AppError::Unauthorized)
    }
}
pub fn list(conn: &Connection, school: &str, actor: &str) -> AppResult<Vec<ReviewPacket>> {
    let is_head = head(conn, school, actor)?;
    let mut stmt=conn.prepare(&format!("SELECT {COLUMNS} FROM review_packets WHERE school_id=?1 AND (?3 OR owner_user_id=?2 OR reviewer_user_id=?2) ORDER BY updated_at DESC"))?;
    let rows = stmt
        .query_map(params![school, actor, is_head], read_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}
fn validate_content(c: &DraftContent, approval: bool) -> AppResult<()> {
    if !["form", "tanaw"].contains(&c.kind.as_str())
        || c.title.trim().is_empty()
        || c.title.len() > 200
        || c.source_cutoff.len() > 10
        || c.dictionary_version.len() > 200
        || c.form_code.len() > 100
        || c.notes.len() > 20000
        || c.indicators.len() > 100
        || c.discrepancies.len() > 100
    {
        return Err(invalid("Draft content is incomplete or too large."));
    }
    if c.form_code.eq_ignore_ascii_case("SF8") {
        return Err(invalid("SF8 remains inactive."));
    }
    if c.kind == "form"
        && ![
            "SF1", "SF2", "SF3", "SF4", "SF5", "SF6", "SF7", "SF9", "SF10",
        ]
        .contains(&c.form_code.as_str())
    {
        return Err(invalid("Choose a supported draft school form."));
    }
    for i in &c.indicators {
        let (name, provenance) = match i {
            Indicator::Count {
                name, provenance, ..
            }
            | Indicator::Percentage {
                name, provenance, ..
            } => (name, provenance),
        };
        if name.trim().is_empty() || name.len() > 200 || provenance.len() > 2000 {
            return Err(invalid(
                "Each indicator needs a name and a bounded source note.",
            ));
        }
        if let Indicator::Percentage {
            numerator,
            denominator,
            ..
        } = i
        {
            if numerator > denominator {
                return Err(invalid(
                    "A percentage numerator cannot exceed its population denominator.",
                ));
            }
            if approval && *denominator == 0 {
                return Err(invalid(
                    "A zero population means missing percentage data; resolve it before approval.",
                ));
            }
        }
        if approval && provenance.trim().is_empty() {
            return Err(invalid(
                "Every indicator needs its source provenance before approval.",
            ));
        }
    }
    if c.discrepancies.iter().any(|d| {
        d.description.trim().is_empty() || d.description.len() > 2000 || d.resolution.len() > 4000
    }) {
        return Err(invalid(
            "Discrepancies need a description and bounded resolution notes.",
        ));
    }
    if approval {
        if c.source_cutoff.len() != 10
            || crate::school_resources::date(&c.source_cutoff).is_err()
            || c.dictionary_version.trim().is_empty()
            || !c.sources_confirmed
        {
            return Err(invalid(
                "Confirm the source cutoff and dictionary version before approval.",
            ));
        }
        if c.discrepancies
            .iter()
            .any(|d| d.resolution.trim().is_empty())
        {
            return Err(invalid("Resolve all discrepancies before approval."));
        }
    }
    Ok(())
}
fn digest_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
fn encode(c: &DraftContent) -> AppResult<(String, String)> {
    let raw = serde_json::to_string(c).map_err(|_| invalid("Cannot encode draft."))?;
    let hash = digest_hex(raw.as_bytes());
    Ok((raw, hash))
}
pub fn act(
    conn: &Connection,
    school: &str,
    actor: &str,
    req: ReviewRequest,
) -> AppResult<ReviewPacket> {
    let tx = conn.unchecked_transaction()?;
    let result = act_in_transaction(&tx, school, actor, req)?;
    tx.commit()?;
    Ok(result)
}
fn act_in_transaction(
    conn: &Connection,
    school: &str,
    actor: &str,
    req: ReviewRequest,
) -> AppResult<ReviewPacket> {
    if req.reason.len() > 4000 {
        return Err(invalid("Keep the reason within 4000 characters."));
    }
    let tx = conn;
    let mut packet;
    if req.action == "create" {
        let section = req
            .section_id
            .as_deref()
            .ok_or_else(|| invalid("Choose your advisory section."))?;
        require_preparer(tx, school, actor, section)?;
        let mut content = req
            .content
            .ok_or_else(|| invalid("Draft content is required."))?;
        content.source_snapshot = None;
        content.attachment_manifest.clear();
        validate_content(&content, false)?;
        packet = ReviewPacket {
            id: Uuid::now_v7().to_string(),
            school_id: school.to_owned(),
            owner_user_id: actor.to_owned(),
            reviewer_user_id: None,
            section_id: section.to_owned(),
            revision: 1,
            status: "draft".to_owned(),
            content,
            content_hash: String::new(),
            parent_packet_id: None,
            updated_at: String::new(),
        };
    } else {
        let id = req
            .id
            .as_deref()
            .ok_or_else(|| invalid("Choose a draft."))?;
        packet = get(tx, school, id)?;
        accessible(tx, school, actor, &packet)?;
        if req.expected_revision != Some(packet.revision) {
            return Err(invalid("This draft changed. Refresh before continuing."));
        }
        match req.action.as_str() {
            "save" | "submit" => {
                if packet.owner_user_id != actor {
                    return Err(AppError::Unauthorized);
                }
                require_preparer(tx, school, actor, &packet.section_id)?;
                if !["draft", "returned"].contains(&packet.status.as_str()) {
                    return Err(invalid(
                        "Only draft or returned packets can be edited or submitted.",
                    ));
                }
                if req.action == "save" {
                    let mut updated = req
                        .content
                        .ok_or_else(|| invalid("Draft content is required."))?;
                    updated.source_snapshot =
                        if updated.source_cutoff == packet.content.source_cutoff {
                            packet.content.source_snapshot.clone()
                        } else {
                            None
                        };
                    updated.attachment_manifest.clear();
                    packet.content = updated;
                    validate_content(&packet.content, false)?;
                    packet.status = "draft".into();
                } else {
                    let reviewer = packet.reviewer_user_id.as_deref().ok_or_else(|| {
                        invalid("The School Head must designate a reviewer first.")
                    })?;
                    if !has_role(
                        tx,
                        school,
                        reviewer,
                        &["teacher", "registrar", "school_head"],
                    )? {
                        return Err(invalid("The designated reviewer is no longer eligible."));
                    }
                    validate_content(&packet.content, true)?;
                    require_current_snapshot(tx, school, &packet.section_id, &packet.content)?;
                    packet.content.attachment_manifest =
                        attachment_manifest(tx, school, &packet.id)?;
                    packet.status = "submitted".into();
                }
            }
            "snapshot" => {
                if packet.owner_user_id != actor
                    || !["draft", "returned"].contains(&packet.status.as_str())
                {
                    return Err(AppError::Unauthorized);
                }
                require_preparer(tx, school, actor, &packet.section_id)?;
                packet.content.source_snapshot = Some(capture_source_snapshot(
                    tx,
                    school,
                    &packet.section_id,
                    &packet.content.source_cutoff,
                )?);
                packet.content.sources_confirmed = false;
            }
            "designate" => {
                if !head(tx, school, actor)? {
                    return Err(AppError::Unauthorized);
                }
                if packet.status == "approved" {
                    return Err(invalid("Create a correction draft for an approved packet."));
                }
                let reviewer = req
                    .reviewer_user_id
                    .as_deref()
                    .ok_or_else(|| invalid("Choose a reviewer."))?;
                if reviewer == packet.owner_user_id
                    || !has_role(
                        tx,
                        school,
                        reviewer,
                        &["teacher", "registrar", "school_head"],
                    )?
                {
                    return Err(invalid(
                        "Choose another eligible school member as reviewer.",
                    ));
                }
                packet.reviewer_user_id = Some(reviewer.into());
                packet.status = "draft".into();
                packet.content.sources_confirmed = false;
            }
            "return" | "approve" => {
                if packet.reviewer_user_id.as_deref() != Some(actor)
                    || packet.owner_user_id == actor
                    || !has_role(tx, school, actor, &["teacher", "registrar", "school_head"])?
                {
                    return Err(AppError::Unauthorized);
                }
                if packet.status != "submitted" {
                    return Err(invalid("Only submitted packets can be reviewed."));
                }
                if req.reason.trim().is_empty() {
                    return Err(invalid("Record a review reason."));
                }
                if req.action == "approve" {
                    validate_content(&packet.content, true)?;
                    require_current_snapshot(tx, school, &packet.section_id, &packet.content)?;
                    if attachment_manifest(tx, school, &packet.id)?
                        != packet.content.attachment_manifest
                    {
                        return Err(invalid("Evidence attachments changed after submission. Return the packet for a fresh review."));
                    }
                    packet.status = "approved".into();
                } else {
                    packet.status = "returned".into();
                    packet.content.sources_confirmed = false;
                }
            }
            "correct" => {
                if packet.status != "approved" {
                    return Err(invalid("Only approved packets need a correction copy."));
                }
                if req.reason.trim().is_empty() {
                    return Err(invalid("Record why a correction is needed."));
                }
                require_preparer(tx, school, actor, &packet.section_id)?;
                packet.parent_packet_id = Some(packet.id.clone());
                packet.id = Uuid::now_v7().to_string();
                packet.owner_user_id = actor.into();
                packet.reviewer_user_id = None;
                packet.status = "draft".into();
                packet.revision = 0;
                packet.content.sources_confirmed = false;
                packet.content.source_snapshot = None;
                packet.content.attachment_manifest.clear();
            }
            _ => return Err(invalid("Unknown review action.")),
        }
        packet.revision += 1;
    }
    let (raw, hash) = encode(&packet.content)?;
    packet.content_hash = hash;
    let inserting = req.action == "create" || req.action == "correct";
    if inserting {
        tx.execute("INSERT INTO review_packets(id,school_id,owner_user_id,reviewer_user_id,section_id,revision,status,content_json,content_hash,parent_packet_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",params![packet.id,school,packet.owner_user_id,packet.reviewer_user_id,packet.section_id,packet.revision,packet.status,raw,packet.content_hash,packet.parent_packet_id])?;
    } else {
        let changed=tx.execute("UPDATE review_packets SET reviewer_user_id=?3,revision=?4,status=?5,content_json=?6,content_hash=?7,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE school_id=?1 AND id=?2 AND revision=?8",params![school,packet.id,packet.reviewer_user_id,packet.revision,packet.status,raw,packet.content_hash,req.expected_revision])?;
        if changed != 1 {
            return Err(invalid("This draft changed. Refresh before continuing."));
        }
    }
    tx.execute("INSERT INTO review_packet_history(packet_id,revision,actor_user_id,action,reason,content_json,content_hash,status,reviewer_user_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",params![packet.id,packet.revision,actor,req.action,req.reason,raw,packet.content_hash,packet.status,packet.reviewer_user_id])?;
    get(tx, school, &packet.id)
}
pub fn history(
    conn: &Connection,
    school: &str,
    actor: &str,
    id: &str,
) -> AppResult<Vec<ReviewHistory>> {
    let p = get(conn, school, id)?;
    accessible(conn, school, actor, &p)?;
    let mut stmt=conn.prepare("SELECT revision,actor_user_id,action,reason,content_json,content_hash,status,reviewer_user_id,recorded_at FROM review_packet_history WHERE packet_id=?1 ORDER BY revision")?;
    let rows = stmt
        .query_map([id], |r| {
            let raw: String = r.get(4)?;
            let content = serde_json::from_str(&raw).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    4,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?;
            Ok(ReviewHistory {
                revision: r.get(0)?,
                actor_user_id: r.get(1)?,
                action: r.get(2)?,
                reason: r.get(3)?,
                content,
                content_hash: r.get(5)?,
                status: r.get(6)?,
                reviewer_user_id: r.get(7)?,
                recorded_at: r.get(8)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn attachment_manifest(
    conn: &Connection,
    school: &str,
    id: &str,
) -> AppResult<Vec<AttachmentEvidence>> {
    let mut stmt=conn.prepare("SELECT id,sha256 FROM attachment_versions WHERE school_id=?1 AND link_kind='form_draft' AND link_id=?2 ORDER BY id")?;
    let rows = stmt
        .query_map((school, id), |r| {
            Ok(AttachmentEvidence {
                id: r.get(0)?,
                sha256: r.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}
fn canonical_rows(
    conn: &Connection,
    sql: &str,
    school: &str,
    section: &str,
    cutoff: &str,
) -> AppResult<Vec<Vec<serde_json::Value>>> {
    let mut stmt = conn.prepare(&format!("{sql} LIMIT 20001"))?;
    let columns = stmt.column_count();
    let rows = stmt
        .query_map((school, section, cutoff), |r| {
            (0..columns)
                .map(|n| {
                    use rusqlite::types::ValueRef;
                    Ok(match r.get_ref(n)? {
                        ValueRef::Null => serde_json::Value::Null,
                        ValueRef::Integer(v) => serde_json::json!(v),
                        ValueRef::Real(v) => serde_json::json!(v),
                        ValueRef::Text(v) => serde_json::json!(String::from_utf8_lossy(v)),
                        ValueRef::Blob(v) => serde_json::json!(digest_hex(v)),
                    })
                })
                .collect::<rusqlite::Result<Vec<_>>>()
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if rows.len() > 20000 {
        return Err(invalid(
            "The source snapshot is too large. Use a narrower scope.",
        ));
    }
    Ok(rows)
}
fn capture_source_snapshot(
    conn: &Connection,
    school: &str,
    section: &str,
    cutoff: &str,
) -> AppResult<SourceSnapshot> {
    if crate::school_resources::date(cutoff).is_err() {
        return Err(invalid("Choose a valid source cutoff date."));
    }
    let today: String = conn.query_row("SELECT date('now')", [], |r| r.get(0))?;
    if cutoff > today.as_str() {
        return Err(invalid("A source cutoff cannot be in the future."));
    }
    let roster=canonical_rows(conn,"SELECT m.id,m.learner_id,m.starts_on,m.ends_on,l.lrn,l.given_name,l.family_name,l.* FROM section_memberships m JOIN learners l ON l.id=m.learner_id WHERE m.school_id=?1 AND m.section_id=?2 AND m.starts_on<=?3 AND (m.ends_on IS NULL OR m.ends_on>?3) ORDER BY m.learner_id,m.id",school,section,cutoff)?;
    let attendance=canonical_rows(conn,"SELECT a.* FROM attendance_records a WHERE a.school_id=?1 AND a.section_id=?2 AND a.attendance_date<=?3 ORDER BY a.attendance_date,a.learner_id,a.id",school,section,cutoff)?;
    let records=canonical_rows(conn,"SELECT c.*,gp.* FROM class_records c JOIN grading_periods gp ON gp.id=c.grading_period_id WHERE c.school_id=?1 AND c.section_id=?2 AND ?3 IS NOT NULL ORDER BY c.id",school,section,cutoff)?;
    let scores=canonical_rows(conn,"SELECT c.id,a.*,s.* FROM class_records c JOIN assessment_items a ON a.class_record_id=c.id LEFT JOIN learner_scores s ON s.assessment_item_id=a.id WHERE c.school_id=?1 AND c.section_id=?2 AND ?3 IS NOT NULL ORDER BY c.id,a.id,s.learner_id",school,section,cutoff)?;
    let mut discrepancies = Vec::new();
    let unique_learners: std::collections::BTreeSet<_> =
        roster.iter().map(|r| r[1].to_string()).collect();
    if unique_learners.len() != roster.len() {
        discrepancies
            .push("Overlapping cutoff memberships duplicate a learner in the roster.".into());
    }
    let missing_lrn = roster
        .iter()
        .filter(|r| r[4].is_null() || r[4].as_str().is_none_or(|v| v.trim().is_empty()))
        .count();
    if missing_lrn > 0 {
        discrepancies.push(format!("{missing_lrn} cutoff roster learners have no LRN."));
    }
    let stranded:i64=conn.query_row("SELECT COUNT(*) FROM attendance_records a WHERE a.school_id=?1 AND a.section_id=?2 AND a.attendance_date<=?3 AND NOT EXISTS(SELECT 1 FROM section_memberships m WHERE m.school_id=a.school_id AND m.section_id=a.section_id AND m.learner_id=a.learner_id AND m.starts_on<=a.attendance_date AND (m.ends_on IS NULL OR m.ends_on>a.attendance_date))",(school,section,cutoff),|r|r.get(0))?;
    if stranded > 0 {
        discrepancies.push(format!(
            "{stranded} attendance entries fall outside their dated membership."
        ));
    }
    let mut computed = Vec::new();
    let mut complete = 0;
    let mut incomplete = 0;
    for record in &records {
        let Some((grade_section, starts, ends)) =
            crate::repository::class_record::section_and_period_range_in_school(
                conn,
                school,
                record[0].as_str().unwrap_or(""),
            )?
        else {
            continue;
        };
        let grade_roster = crate::repository::section_membership::roster_for_section_over_range(
            conn,
            school,
            &grade_section,
            &starts,
            &ends,
        )?;
        for learner in &grade_roster {
            if computed.len() >= 2000 {
                return Err(invalid(
                    "There are too many grade observations for one packet.",
                ));
            }
            let result = crate::repository::grading_computation::compute_term_grade(
                conn,
                school,
                record[0].as_str().unwrap_or(""),
                &learner.learner_id,
            );
            let value = match result {
                Ok(Some(g)) => {
                    if g.completeness.is_complete {
                        complete += 1;
                    } else {
                        incomplete += 1;
                    }
                    serde_json::json!(g)
                }
                Ok(None) => {
                    incomplete += 1;
                    serde_json::Value::Null
                }
                Err(e) => {
                    incomplete += 1;
                    serde_json::json!({"unresolved":e.to_string()})
                }
            };
            computed.push(serde_json::json!({"classRecordId":record[0],"learnerId":learner.learner_id,"periodStartsOn":starts,"periodEndsOn":ends,"currentObservation":value}));
        }
    }
    if incomplete > 0 {
        discrepancies.push(format!("{incomplete} current grade observations are incomplete or unresolved; do not issue them as final grades."));
    }
    let canonical_sources=serde_json::to_string(&serde_json::json!({"rosterAtCutoff":roster,"attendanceThroughCutoff":attendance,"classRecordsObservedNow":records,"assessmentScoresObservedNow":scores,"computedGradesObservedNow":computed})).map_err(|_|invalid("Could not freeze the sources."))?;
    let fingerprint = digest_hex(canonical_sources.as_bytes());
    let captured_at = conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| {
        r.get(0)
    })?;
    Ok(SourceSnapshot {
        cutoff: cutoff.into(),
        captured_at,
        fingerprint,
        roster_count: roster.len(),
        attendance_count: attendance.len(),
        class_record_count: records.len(),
        complete_grade_count: complete,
        incomplete_grade_count: incomplete,
        discrepancies,
        canonical_sources,
    })
}
fn require_current_snapshot(
    conn: &Connection,
    school: &str,
    section: &str,
    content: &DraftContent,
) -> AppResult<()> {
    let frozen = content
        .source_snapshot
        .as_ref()
        .ok_or_else(|| invalid("Capture the source comparison before submitting."))?;
    let fresh = capture_source_snapshot(conn, school, section, &content.source_cutoff)?;
    if frozen.cutoff != content.source_cutoff || frozen.fingerprint != fresh.fingerprint {
        return Err(invalid(
            "Source records changed. Refresh the source comparison and review again.",
        ));
    }
    let needs_complete_grades = ["SF5", "SF6", "SF9", "SF10"].contains(&content.form_code.as_str())
        || content.indicators.iter().any(|i| match i {
            Indicator::Count { name, .. } | Indicator::Percentage { name, .. } => {
                name == "Complete current grades"
            }
        });
    if needs_complete_grades && fresh.roster_count > 0 && fresh.complete_grade_count == 0 {
        return Err(invalid(
            "No complete current grades are available for this grade-dependent packet.",
        ));
    }
    if fresh
        .discrepancies
        .iter()
        .any(|d| needs_complete_grades || !d.contains("current grade observations"))
    {
        return Err(invalid(
            "Resolve native source discrepancies before submitting or approving.",
        ));
    }
    for indicator in &content.indicators {
        if let Indicator::Count { name, value, .. } = indicator {
            let expected = match name.as_str() {
                "Roster learners" => Some(fresh.roster_count),
                "Attendance entries" => Some(fresh.attendance_count),
                "Complete current grades" => Some(fresh.complete_grade_count),
                _ => None,
            };
            if expected.is_some_and(|n| n != *value as usize) {
                return Err(invalid(
                    "An indicator differs from the frozen canonical source count.",
                ));
            }
        }
    }
    Ok(())
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TanawSample {
    pub schema_version: u32,
    pub source_school_id: String,
    pub source_packet_id: String,
    pub source_revision: i64,
    pub source_content_hash: String,
    pub section_id: String,
    pub content: DraftContent,
}
pub fn export_sample(conn: &Connection, school: &str, actor: &str, id: &str) -> AppResult<String> {
    let packet = get(conn, school, id)?;
    accessible(conn, school, actor, &packet)?;
    if packet.content.kind != "tanaw" {
        return Err(invalid("Only TANAW samples use this exchange format."));
    }
    let mut content = packet.content;
    if let Some(snapshot) = content.source_snapshot.as_mut() {
        snapshot.canonical_sources.clear();
    }
    let transfer_hash = encode(&content)?.1;
    serde_json::to_string_pretty(&TanawSample {
        schema_version: 1,
        source_school_id: school.into(),
        source_packet_id: packet.id,
        source_revision: packet.revision,
        source_content_hash: transfer_hash,
        section_id: packet.section_id,
        content,
    })
    .map_err(|_| invalid("Could not encode the TANAW sample."))
}
pub fn import_sample(
    conn: &Connection,
    school: &str,
    actor: &str,
    raw: &str,
) -> AppResult<ReviewPacket> {
    if raw.len() > 2_000_000 {
        return Err(invalid("The TANAW sample exceeds 2 MB."));
    }
    let sample: TanawSample =
        serde_json::from_str(raw).map_err(|_| invalid("Choose a valid TANAW sample JSON file."))?;
    if sample.schema_version != 1
        || sample.source_school_id != school
        || sample.content.kind != "tanaw"
        || sample.source_revision < 1
    {
        return Err(invalid(
            "This sample version or school scope is not supported.",
        ));
    }
    require_preparer(conn, school, actor, &sample.section_id)?;
    let (_, content_hash) = encode(&sample.content)?;
    if content_hash != sample.source_content_hash {
        return Err(invalid("The sample content hash does not match."));
    }
    let sample_hash =
        digest_hex(&serde_json::to_vec(&sample).map_err(|_| invalid("Could not hash sample."))?);
    let duplicate: Option<String> = conn
        .query_row(
            "SELECT packet_id FROM tanaw_import_receipts WHERE school_id=?1 AND sample_hash=?2",
            (school, &sample_hash),
            |r| r.get(0),
        )
        .optional()?;
    if let Some(id) = duplicate {
        let packet = get(conn, school, &id)?;
        accessible(conn, school, actor, &packet)?;
        return Ok(packet);
    }
    let mut content = sample.content;
    content.sources_confirmed = false;
    content.source_snapshot = None;
    content.attachment_manifest.clear();
    let tx = conn.unchecked_transaction()?;
    let packet = act_in_transaction(
        &tx,
        school,
        actor,
        ReviewRequest {
            action: "create".into(),
            id: None,
            expected_revision: None,
            section_id: Some(sample.section_id),
            content: Some(content),
            reviewer_user_id: None,
            reason: format!(
                "Imported TANAW sample {} version {}; source confirmations reset.",
                sample.source_packet_id, sample.source_revision
            ),
        },
    )?;
    tx.execute("INSERT INTO tanaw_import_receipts(school_id,sample_hash,packet_id,actor_user_id,schema_version) VALUES (?1,?2,?3,?4,1)",params![school,sample_hash,packet.id,actor])?;
    tx.commit()?;
    Ok(packet)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn db() -> Connection {
        let conn = crate::db::open(
            std::path::Path::new(":memory:"),
            &crate::crypto::generate_key(),
        )
        .unwrap();
        conn.execute_batch("INSERT INTO schools(id,name) VALUES ('s','School'); INSERT INTO users(id,username,password_hash,display_name) VALUES ('owner','owner','x','Owner'),('head','head','x','Head'),('reviewer','reviewer','x','Reviewer'); INSERT INTO user_school_memberships(user_id,school_id) VALUES ('owner','s'),('head','s'),('reviewer','s'); INSERT INTO user_school_roles(user_id,school_id,role) VALUES ('owner','s','teacher'),('head','s','school_head'),('reviewer','s','teacher'); INSERT INTO sections(id,school_id,school_year,grade_level,name) VALUES ('section','s','2026-2027','7','Test'); INSERT INTO section_advisories(id,school_id,section_id,teacher_user_id,starts_on) VALUES ('advisory','s','section','owner','2020-01-01'); INSERT INTO learners(id,school_id,given_name,family_name,lrn) VALUES ('learner','s','Ana','Test','123456789012'); INSERT INTO section_memberships(id,school_id,section_id,learner_id,starts_on) VALUES ('member','s','section','learner','2020-01-01');").unwrap();
        conn
    }
    fn content(kind: &str) -> DraftContent {
        DraftContent {
            kind: kind.into(),
            title: "Test review".into(),
            form_code: "SF1".into(),
            notes: String::new(),
            source_cutoff: "2026-01-01".into(),
            dictionary_version: "local draft 1".into(),
            sources_confirmed: false,
            indicators: vec![],
            discrepancies: vec![],
            source_snapshot: None,
            attachment_manifest: vec![],
        }
    }
    fn req(action: &str, p: Option<&ReviewPacket>) -> ReviewRequest {
        ReviewRequest {
            action: action.into(),
            id: p.map(|p| p.id.clone()),
            expected_revision: p.map(|p| p.revision),
            section_id: Some("section".into()),
            content: Some(p.map_or_else(|| content("form"), |p| p.content.clone())),
            reviewer_user_id: Some("reviewer".into()),
            reason: "Checked the sources".into(),
        }
    }
    fn submitted(conn: &Connection) -> ReviewPacket {
        let p = act(conn, "s", "owner", req("create", None)).unwrap();
        let p = act(conn, "s", "head", req("designate", Some(&p))).unwrap();
        let p = act(conn, "s", "owner", req("snapshot", Some(&p))).unwrap();
        let mut r = req("save", Some(&p));
        r.content.as_mut().unwrap().sources_confirmed = true;
        let p = act(conn, "s", "owner", r).unwrap();
        act(conn, "s", "owner", req("submit", Some(&p))).unwrap()
    }
    #[test]
    fn stale_edit_and_self_review_do_not_mutate_history() {
        let conn = db();
        let p = act(&conn, "s", "owner", req("create", None)).unwrap();
        let mut self_review = req("designate", Some(&p));
        self_review.reviewer_user_id = Some("owner".into());
        assert!(act(&conn, "s", "head", self_review).is_err());
        let newer = act(&conn, "s", "owner", req("save", Some(&p))).unwrap();
        assert!(act(&conn, "s", "owner", req("save", Some(&p))).is_err());
        assert_eq!(history(&conn, "s", "owner", &p.id).unwrap().len(), 2);
        assert_eq!(get(&conn, "s", &p.id).unwrap().revision, newer.revision);
        assert!(conn
            .execute("UPDATE review_packet_history SET reason='changed'", [])
            .is_err());
    }
    #[test]
    fn source_drift_blocks_approval_and_preserves_submission() {
        let conn = db();
        let p = submitted(&conn);
        conn.execute("INSERT INTO attendance_records(id,school_id,section_id,learner_id,attendance_date,status) VALUES ('a','s','section','learner','2026-01-01','present')",[]).unwrap();
        assert!(act(&conn, "s", "reviewer", req("approve", Some(&p))).is_err());
        assert_eq!(get(&conn, "s", &p.id).unwrap().status, "submitted");
        assert_eq!(p.content.source_snapshot.unwrap().attendance_count, 0);
    }
    #[test]
    fn approved_versions_are_immutable_and_correction_is_separate() {
        let conn = db();
        let p = submitted(&conn);
        let p = act(&conn, "s", "reviewer", req("approve", Some(&p))).unwrap();
        assert!(act(&conn, "s", "owner", req("save", Some(&p))).is_err());
        let copy = act(&conn, "s", "owner", req("correct", Some(&p))).unwrap();
        assert_ne!(copy.id, p.id);
        assert_eq!(copy.parent_packet_id.as_deref(), Some(p.id.as_str()));
        assert_eq!(get(&conn, "s", &p.id).unwrap().status, "approved");
        assert!(!copy.content.sources_confirmed);
        assert!(copy.content.source_snapshot.is_none());
    }
    #[test]
    fn tanaw_import_checks_hash_scope_and_reuses_receipt() {
        let conn = db();
        let mut request = req("create", None);
        request.content = Some(content("tanaw"));
        let p = act(&conn, "s", "owner", request).unwrap();
        let raw = export_sample(&conn, "s", "owner", &p.id).unwrap();
        let imported = import_sample(&conn, "s", "owner", &raw).unwrap();
        assert_ne!(imported.id, p.id);
        assert!(!imported.content.sources_confirmed);
        assert_eq!(
            import_sample(&conn, "s", "owner", &raw).unwrap().id,
            imported.id
        );
        let mut sample: TanawSample = serde_json::from_str(&raw).unwrap();
        sample.content.title = "tampered".into();
        assert!(import_sample(
            &conn,
            "s",
            "owner",
            &serde_json::to_string(&sample).unwrap()
        )
        .is_err());
        sample.source_school_id = "other school".into();
        assert!(import_sample(
            &conn,
            "s",
            "owner",
            &serde_json::to_string(&sample).unwrap()
        )
        .is_err());
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tanaw_import_receipts", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }
    #[test]
    fn new_attachment_after_submission_cannot_be_approved() {
        let conn = db();
        let p = submitted(&conn);
        conn.execute("INSERT INTO attachment_versions(id,school_id,owner_user_id,reviewer_user_id,link_kind,link_id,filename,mime_type,sha256,content) VALUES ('file','s','owner','reviewer','form_draft',?1,'evidence.txt','text/plain','hash',X'01')",[&p.id]).unwrap();
        assert!(act(&conn, "s", "reviewer", req("approve", Some(&p))).is_err());
    }
}
