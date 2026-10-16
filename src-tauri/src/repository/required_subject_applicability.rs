//! Explicit section-cohort applicability, never inferred from scheduling minutes.
//! Source declarations are traceability evidence, not certification of authority.
#[cfg(test)]
#[path = "required_subject_applicability_tests.rs"]
mod tests;

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::repository::{report_readiness, role};

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApplicabilityContext {
    pub section_id: String,
    pub grading_period_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VersionState {
    Draft,
    Confirmed,
    Withdrawn,
}

impl VersionState {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Confirmed => "confirmed",
            Self::Withdrawn => "withdrawn",
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceEvidence {
    pub citation: String,
    pub locator: String,
    pub revision: String,
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AppendVersion {
    pub context: ApplicabilityContext,
    pub expected_predecessor_id: Option<String>,
    pub curriculum_version_id: String,
    pub state: VersionState,
    pub subject_ids: Vec<String>,
    pub evidence: SourceEvidence,
    pub reason: String,
    /// Explicit review is required for confirmation and withdrawal.
    pub reviewed: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApplicabilityVersion {
    pub id: String,
    pub school_id: String,
    pub context: ApplicabilityContext,
    pub school_year: String,
    pub grade_level: String,
    pub curriculum_version_id: String,
    pub revision: i64,
    pub predecessor_id: Option<String>,
    pub state: VersionState,
    pub subject_ids: Vec<String>,
    pub evidence: SourceEvidence,
    pub reason: String,
    pub actor_user_id: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicabilitySelection {
    /// Includes drafts: callers must use this exact identity for the next append.
    pub head_id: Option<String>,
    /// Only the latest non-draft event decides current applicability.
    pub confirmed: Option<ApplicabilityVersion>,
    pub status: &'static str,
}

const SELECT: &str = "SELECT id, school_id, section_id, grading_period_id, school_year, \
    grade_level, curriculum_version_id, revision, predecessor_id, state, subject_ids_json, \
    source_citation, source_locator, source_revision, source_sha256, reason, actor_user_id, \
    created_at FROM required_subject_versions";

fn row_version(row: &rusqlite::Row) -> rusqlite::Result<ApplicabilityVersion> {
    let state: String = row.get(9)?;
    let subjects: String = row.get(10)?;
    let subject_ids = serde_json::from_str(&subjects).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(10, rusqlite::types::Type::Text, Box::new(error))
    })?;
    Ok(ApplicabilityVersion {
        id: row.get(0)?,
        school_id: row.get(1)?,
        context: ApplicabilityContext {
            section_id: row.get(2)?,
            grading_period_id: row.get(3)?,
        },
        school_year: row.get(4)?,
        grade_level: row.get(5)?,
        curriculum_version_id: row.get(6)?,
        revision: row.get(7)?,
        predecessor_id: row.get(8)?,
        state: match state.as_str() {
            "draft" => VersionState::Draft,
            "confirmed" => VersionState::Confirmed,
            "withdrawn" => VersionState::Withdrawn,
            _ => return Err(rusqlite::Error::InvalidQuery),
        },
        subject_ids,
        evidence: SourceEvidence {
            citation: row.get(11)?,
            locator: row.get(12)?,
            revision: row.get(13)?,
            sha256: row.get(14)?,
        },
        reason: row.get(15)?,
        actor_user_id: row.get(16)?,
        created_at: row.get(17)?,
    })
}

fn require_context(
    conn: &Connection,
    actor: &str,
    school: &str,
    context: &ApplicabilityContext,
    writing: bool,
) -> AppResult<(String, String)> {
    let member: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM user_school_memberships WHERE user_id=?1 AND school_id=?2)",
        params![actor, school],
        |row| row.get(0),
    )?;
    let admin = role::has_any_role(conn, actor, school, &[role::REGISTRAR, role::SCHOOL_HEAD])?;
    let assigned: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM teaching_assignments WHERE teacher_user_id=?1 \
         AND school_id=?2 AND section_id=?3) OR EXISTS(SELECT 1 FROM section_advisories \
         WHERE teacher_user_id=?1 AND school_id=?2 AND section_id=?3 AND ends_on IS NULL)",
        params![actor, school, context.section_id],
        |row| row.get(0),
    )?;
    if !member || (!admin && (writing || !assigned)) {
        return Err(AppError::Unauthorized);
    }
    conn.query_row(
        "SELECT s.school_year, s.grade_level FROM sections s JOIN grading_periods p \
         ON p.school_id=s.school_id AND p.school_year=s.school_year \
         WHERE s.id=?1 AND p.id=?2 AND s.school_id=?3",
        params![context.section_id, context.grading_period_id, school],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()?
    .ok_or(AppError::Unauthorized)
}

fn history(
    conn: &Connection,
    school: &str,
    context: &ApplicabilityContext,
) -> AppResult<Vec<ApplicabilityVersion>> {
    let sql = format!("{SELECT} WHERE school_id=?1 AND section_id=?2 AND grading_period_id=?3 ORDER BY revision DESC");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        params![school, context.section_id, context.grading_period_id],
        row_version,
    )?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn selection(versions: Vec<ApplicabilityVersion>) -> ApplicabilitySelection {
    let head_id = versions.first().map(|version| version.id.clone());
    let effective = versions
        .into_iter()
        .find(|version| version.state != VersionState::Draft);
    let (confirmed, status) = match effective {
        Some(version) if version.state == VersionState::Confirmed => (Some(version), "confirmed"),
        Some(_) => (None, "withdrawn"),
        None => (None, "pending"),
    };
    ApplicabilitySelection {
        head_id,
        confirmed,
        status,
    }
}

/// Actor and school must come from the active session at the command boundary.
pub fn select_authorized(
    conn: &Connection,
    actor: &str,
    school: &str,
    context: &ApplicabilityContext,
) -> AppResult<ApplicabilitySelection> {
    let tx = conn.unchecked_transaction()?;
    let (year, grade) = require_context(&tx, actor, school, context, false)?;
    let mut result = selection(history(&tx, school, context)?);
    if result
        .confirmed
        .as_ref()
        .is_some_and(|version| version.school_year != year || version.grade_level != grade)
    {
        result.confirmed = None;
        result.status = "context_changed";
    }
    tx.commit()?;
    Ok(result)
}

pub fn history_authorized(
    conn: &Connection,
    actor: &str,
    school: &str,
    context: &ApplicabilityContext,
) -> AppResult<Vec<ApplicabilityVersion>> {
    let tx = conn.unchecked_transaction()?;
    require_context(&tx, actor, school, context, false)?;
    let result = history(&tx, school, context)?;
    tx.commit()?;
    Ok(result)
}

fn bounded(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= max
}

/// Serialized writer plus schema uniqueness closes duplicate-root/successor races.
/// A stale predecessor fails; it is never silently rebased onto somebody else's work.
pub fn append_authorized(
    conn: &Connection,
    actor: &str,
    school: &str,
    request: &AppendVersion,
) -> AppResult<ApplicabilityVersion> {
    let tx = Transaction::new_unchecked(conn, TransactionBehavior::Immediate)?;
    let (year, grade) = require_context(&tx, actor, school, &request.context, true)?;
    if (request.state != VersionState::Draft && !request.reviewed)
        || !bounded(&request.reason, 1000)
        || !bounded(&request.evidence.citation, 2000)
        || !bounded(&request.evidence.locator, 2000)
        || !bounded(&request.evidence.revision, 255)
        || request.evidence.sha256.as_ref().is_some_and(|hash| {
            hash.len() != 64
                || !hash
                    .bytes()
                    .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        })
        || request.subject_ids.len() > 256
        || (request.state != VersionState::Withdrawn && request.subject_ids.is_empty())
        || (request.state == VersionState::Withdrawn && !request.subject_ids.is_empty())
    {
        return Err(AppError::validation(
            "Valid applicability evidence and explicit review are required",
        ));
    }
    let versions = history(&tx, school, &request.context)?;
    let head = versions.first();
    if head.map(|v| v.id.as_str()) != request.expected_predecessor_id.as_deref() {
        return Err(AppError::validation(
            "Applicability changed; review the current head",
        ));
    }
    let revision = head.map_or(1, |v| v.revision + 1);
    let mut subjects = request.subject_ids.clone();
    subjects.sort();
    if subjects.windows(2).any(|pair| pair[0] == pair[1]) {
        return Err(AppError::validation(
            "Required subject identities must be unique",
        ));
    }
    let subjects_json = serde_json::to_string(&subjects)
        .map_err(|_| AppError::validation("Required subject identities are invalid"))?;
    let id = Uuid::now_v7().to_string();
    tx.execute(
        "INSERT INTO required_subject_versions \
         (id, school_id, section_id, grading_period_id, school_year, grade_level, \
          curriculum_version_id, revision, predecessor_id, state, subject_ids_json, \
          source_citation, source_locator, source_revision, source_sha256, reason, actor_user_id) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
        params![
            id,
            school,
            request.context.section_id,
            request.context.grading_period_id,
            year,
            grade,
            request.curriculum_version_id,
            revision,
            request.expected_predecessor_id,
            request.state.as_str(),
            subjects_json,
            request.evidence.citation,
            request.evidence.locator,
            request.evidence.revision,
            request.evidence.sha256,
            request.reason,
            actor
        ],
    )?;
    let result = tx.query_row(&format!("{SELECT} WHERE id=?1"), [&id], row_version)?;
    tx.commit()?;
    Ok(result)
}

/// Pins are optional preparation evidence, separate from existing source-lock v2.
/// No old draft is backfilled; a pin neither approves nor issues a report.
pub fn pin_draft_authorized(
    conn: &Connection,
    actor: &str,
    school: &str,
    draft_id: &str,
    expected_version_id: &str,
) -> AppResult<ApplicabilityVersion> {
    let tx = Transaction::new_unchecked(conn, TransactionBehavior::Immediate)?;
    let member: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM user_school_memberships WHERE user_id=?1 AND school_id=?2)",
        params![actor, school],
        |row| row.get(0),
    )?;
    if !member {
        return Err(AppError::Unauthorized);
    }
    let record: Option<String> = tx
        .query_row(
            "SELECT class_record_id FROM report_card_drafts WHERE id=?1 AND school_id=?2",
            params![draft_id, school],
            |row| row.get(0),
        )
        .optional()?;
    let record = record.ok_or(AppError::Unauthorized)?;
    if report_readiness::authorized_record(&tx, actor, school, &record)?.is_none() {
        return Err(AppError::Unauthorized);
    }
    let existing: Option<String> = tx
        .query_row(
            "SELECT version_id FROM report_required_subject_pins WHERE draft_id=?1",
            [draft_id],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(existing) = existing {
        if existing != expected_version_id {
            return Err(AppError::validation(
                "A reporting applicability pin cannot be replaced",
            ));
        }
    } else {
        let check = report_readiness::check_report_card_draft_source_in_snapshot(
            &tx, actor, school, &record, draft_id,
        )?
        .ok_or(AppError::Unauthorized)?;
        if check.source_status != "matches" {
            return Err(AppError::validation(
                "Capture current report evidence before pinning applicability",
            ));
        }
        tx.execute(
            "INSERT INTO report_required_subject_pins (draft_id,version_id,pinned_by_user_id) VALUES (?1,?2,?3)",
            params![draft_id, expected_version_id, actor],
        )?;
    }
    let result = tx.query_row(
        &format!("{SELECT} WHERE id=?1 AND school_id=?2"),
        params![expected_version_id, school],
        row_version,
    )?;
    tx.commit()?;
    Ok(result)
}

/// Historical reads never resolve today's confirmed head in place of a saved pin.
pub fn pinned_draft_authorized(
    conn: &Connection,
    actor: &str,
    school: &str,
    draft_id: &str,
) -> AppResult<Option<ApplicabilityVersion>> {
    let tx = conn.unchecked_transaction()?;
    let record: Option<String> = tx
        .query_row(
            "SELECT class_record_id FROM report_card_drafts WHERE id=?1 AND school_id=?2",
            params![draft_id, school],
            |row| row.get(0),
        )
        .optional()?;
    let record = record.ok_or(AppError::Unauthorized)?;
    if report_readiness::authorized_record(&tx, actor, school, &record)?.is_none() {
        return Err(AppError::Unauthorized);
    }
    let member: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM user_school_memberships WHERE user_id=?1 AND school_id=?2)",
        params![actor, school],
        |row| row.get(0),
    )?;
    if !member {
        return Err(AppError::Unauthorized);
    }
    let result = tx.query_row(
        &format!("{SELECT} WHERE school_id=?1 AND id=(SELECT version_id FROM report_required_subject_pins WHERE draft_id=?2)"),
        params![school, draft_id], row_version,
    ).optional()?;
    tx.commit()?;
    Ok(result)
}
