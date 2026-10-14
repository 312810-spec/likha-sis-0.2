use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::repository::{role, teaching_assignment};

/// A structured lesson plan authored under the "ILAW" format --
/// Intentions, Learning Experiences, Assessment, Ways Forward -- per
/// DepEd Order No. 16, s. 2026 (researched this session; see
/// `docs/CURRENT-HANDOFF.md` for sources and confidence). Scoped to one
/// `(teaching_assignment_id, plan_date)` pair -- see migration 40's own
/// doc comment for why that FK alone is sufficient to also scope the
/// owning teacher/section/subject. This is a teacher's own authoring
/// tool, not an official DepEd form output -- no PDF export in this
/// slice.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LessonPlan {
    pub id: String,
    pub school_id: String,
    pub teaching_assignment_id: String,
    pub plan_date: String,
    pub teaching_context: Option<LessonTeachingContext>,
    pub source_reference: Option<LessonSourceReference>,
    pub external_draft_review: Option<LessonDraftReview>,
    pub learning_competency: String,
    pub learning_competency_code: String,
    pub learning_objectives: String,
    pub connection_to_previous_learning: String,
    pub learning_experiences: String,
    pub assessment: String,
    pub ways_forward: String,
    pub created_by_user_id: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Bounded teacher-pasted planning text; never competencies, records or authority.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LessonPlanningSuggestion {
    pub learning_objectives: String,
    pub connection_to_previous_learning: String,
    pub learning_experiences: String,
    pub assessment: String,
    pub ways_forward: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LessonDraftReviewInput {
    pub suggestion: LessonPlanningSuggestion,
    pub teacher_confirmed: bool,
}

/// Teacher-asserted review preserved at save; AI origin/official approval unverified.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LessonDraftReview {
    pub suggestion: LessonPlanningSuggestion,
    pub saved_by_user_id: String,
    pub saved_at: String,
}

impl LessonDraftReviewInput {
    fn snapshot(&self, conn: &Connection, user_id: &str) -> AppResult<LessonDraftReview> {
        if !self.teacher_confirmed {
            return Err(AppError::Validation(
                "External draft requires teacher confirmation".into(),
            ));
        }
        let suggestion = LessonPlanningSuggestion {
            learning_objectives: self.suggestion.learning_objectives.trim().into(),
            connection_to_previous_learning: self
                .suggestion
                .connection_to_previous_learning
                .trim()
                .into(),
            learning_experiences: self.suggestion.learning_experiences.trim().into(),
            assessment: self.suggestion.assessment.trim().into(),
            ways_forward: self.suggestion.ways_forward.trim().into(),
        };
        if [
            &suggestion.learning_objectives,
            &suggestion.learning_experiences,
            &suggestion.assessment,
        ]
        .iter()
        .any(|value| value.is_empty())
            || [
                &suggestion.learning_objectives,
                &suggestion.connection_to_previous_learning,
                &suggestion.learning_experiences,
                &suggestion.assessment,
                &suggestion.ways_forward,
            ]
            .iter()
            .any(|value| value.chars().count() > 4000)
        {
            return Err(AppError::Validation(
                "External draft fields are missing or exceed 4000 characters".into(),
            ));
        }
        Ok(LessonDraftReview {
            suggestion,
            saved_by_user_id: user_id.into(),
            saved_at: conn.query_row(
                "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
                [],
                |row| row.get(0),
            )?,
        })
    }
}

/// Canonical assignment context at creation, never re-derived for an existing plan.
/// This does not establish curriculum/BOW applicability or official provenance.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LessonTeachingContext {
    pub school_year: String,
    pub grade_level: String,
    pub section_id: String,
    pub section_name: String,
    pub subject_id: String,
    pub subject_name: String,
}

/// Teacher-provided declaration, not verified official curriculum metadata.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LessonSourceReference {
    pub title: String,
    pub version: String,
    pub citation: String,
    pub curriculum_name: String,
    pub term: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<LessonSourceScope>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artifact_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub applicable_dates: Option<LessonSourceDates>,
}

/// Teacher-declared inclusive date window, not an official term calendar.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LessonSourceDates {
    pub starts_on: String,
    pub ends_on: String,
}

/// Declared scope checked against canonical assignment context, not official approval.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LessonSourceScope {
    pub school_year: String,
    pub subject_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grade_level: Option<String>,
}

/// One append-only correction to a lesson's declared source metadata.
/// Neither the original declaration nor earlier amendments are overwritten.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LessonSourceAmendment {
    pub id: String,
    pub lesson_plan_id: String,
    pub previous_source_reference: Option<LessonSourceReference>,
    pub new_source_reference: LessonSourceReference,
    pub reason: String,
    pub amended_by_user_id: String,
    pub amended_by_name: Option<String>,
    pub created_at: String,
}

/// Exact local source bytes plus their integrity fingerprint. The fingerprint
/// verifies file identity only; it is never an official-approval assertion.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LessonSourceArtifact {
    pub id: String,
    pub file_name: String,
    pub media_type: String,
    pub byte_length: i64,
    pub sha256: String,
    pub ingested_by_user_id: String,
    pub ingested_by_name: Option<String>,
    pub created_at: String,
    pub already_imported: bool,
}

impl LessonSourceReference {
    fn normalized(&self) -> AppResult<Self> {
        let source = Self {
            title: self.title.trim().into(),
            version: self.version.trim().into(),
            citation: self.citation.trim().into(),
            curriculum_name: self.curriculum_name.trim().into(),
            term: self.term.trim().into(),
            scope: self.scope.as_ref().map(|scope| LessonSourceScope {
                school_year: scope.school_year.trim().into(),
                subject_id: scope.subject_id.trim().into(),
                grade_level: scope.grade_level.as_ref().map(|grade| grade.trim().into()),
            }),
            artifact_id: self.artifact_id.as_ref().map(|id| id.trim().into()),
            applicable_dates: self
                .applicable_dates
                .as_ref()
                .map(|dates| LessonSourceDates {
                    starts_on: dates.starts_on.trim().into(),
                    ends_on: dates.ends_on.trim().into(),
                }),
        };
        for value in [
            &source.title,
            &source.version,
            &source.citation,
            &source.curriculum_name,
            &source.term,
        ] {
            if value.is_empty() || value.chars().count() > 4000 {
                return Err(AppError::Validation(
                    "Source reference fields are required and limited to 4000 characters".into(),
                ));
            }
        }
        if let Some(scope) = &source.scope {
            if scope
                .grade_level
                .as_ref()
                .is_some_and(|grade| grade.is_empty() || grade.chars().count() > 4000)
            {
                return Err(AppError::Validation(
                    "Declared source grade must be nonblank and at most 4000 characters".into(),
                ));
            }
            if [&scope.school_year, &scope.subject_id]
                .iter()
                .any(|value| value.is_empty() || value.chars().count() > 4000)
            {
                return Err(AppError::Validation(
                    "Source subject and school year are required when scope is declared".into(),
                ));
            }
        }
        if source.artifact_id.as_ref().is_some_and(|id| id.is_empty()) {
            return Err(AppError::Validation(
                "Attached source artifact identifier is required".into(),
            ));
        }
        if let Some(dates) = &source.applicable_dates {
            if !is_calendar_date(&dates.starts_on)
                || !is_calendar_date(&dates.ends_on)
                || dates.starts_on > dates.ends_on
            {
                return Err(AppError::Validation(
                    "Source date window requires real ordered dates".into(),
                ));
            }
        }
        Ok(source)
    }
}

fn is_calendar_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    if !bytes
        .iter()
        .enumerate()
        .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
    {
        return false;
    }
    let year: u32 = value[..4].parse().unwrap_or(0);
    let month: u32 = value[5..7].parse().unwrap_or(0);
    let day: u32 = value[8..].parse().unwrap_or(0);
    let leap = year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
    let days = match month {
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        _ => 0,
    };
    year > 0 && day > 0 && day <= days
}

fn validate_source_dates(source: &LessonSourceReference, plan_date: &str) -> AppResult<()> {
    if let Some(dates) = &source.applicable_dates {
        if !is_calendar_date(plan_date)
            || plan_date < dates.starts_on.as_str()
            || plan_date > dates.ends_on.as_str()
        {
            return Err(AppError::Validation(
                "Lesson date is outside the declared source date window".into(),
            ));
        }
    }
    Ok(())
}

fn validate_source_artifact(
    conn: &Connection,
    school_id: &str,
    source: &LessonSourceReference,
) -> AppResult<()> {
    let Some(artifact_id) = source.artifact_id.as_deref() else {
        return Ok(());
    };
    if find_source_artifact(conn, school_id, artifact_id)?.is_none() {
        return Err(AppError::Validation(
            "Attached source file does not belong to this school".into(),
        ));
    }
    Ok(())
}

pub fn ingest_source_artifact_authorized(
    conn: &Connection,
    user_id: &str,
    school_id: &str,
    teaching_assignment_id: &str,
    file_name: &str,
    media_type: &str,
    content: &[u8],
) -> AppResult<LessonSourceArtifact> {
    authorize_own_assignment(conn, user_id, school_id, teaching_assignment_id)?;
    let file_name = file_name.trim();
    if file_name.is_empty() || file_name.chars().count() > 255 {
        return Err(AppError::Validation(
            "Source file name is required and limited to 255 characters".into(),
        ));
    }
    if content.is_empty() || content.len() > 8 * 1024 * 1024 {
        return Err(AppError::Validation(
            "Source file must contain data and be no larger than 8 MiB".into(),
        ));
    }
    if !matches!(
        media_type,
        "application/pdf"
            | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
        return Err(AppError::Validation("Unsupported source file type".into()));
    }
    let sha256 = source_sha256(content);
    if let Some(mut existing) = find_source_artifact_by_hash(conn, school_id, &sha256)? {
        existing.already_imported = true;
        return Ok(existing);
    }
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO lesson_source_artifacts \
         (id, school_id, file_name, media_type, byte_length, sha256, content, ingested_by_user_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            &id,
            school_id,
            file_name,
            media_type,
            content.len() as i64,
            &sha256,
            content,
            user_id
        ],
    )?;
    find_source_artifact(conn, school_id, &id)?
        .ok_or_else(|| AppError::Validation("Stored source artifact could not be read back".into()))
}

pub fn find_source_artifact(
    conn: &Connection,
    school_id: &str,
    artifact_id: &str,
) -> AppResult<Option<LessonSourceArtifact>> {
    find_source_artifact_where(conn, school_id, "a.id = ?2", artifact_id)
}

fn find_source_artifact_by_hash(
    conn: &Connection,
    school_id: &str,
    sha256: &str,
) -> AppResult<Option<LessonSourceArtifact>> {
    find_source_artifact_where(conn, school_id, "a.sha256 = ?2", sha256)
}

fn find_source_artifact_where(
    conn: &Connection,
    school_id: &str,
    predicate: &str,
    value: &str,
) -> AppResult<Option<LessonSourceArtifact>> {
    let stored = conn
        .query_row(
            &format!(
                "SELECT a.id, a.file_name, a.media_type, a.byte_length, a.sha256, \
                    a.ingested_by_user_id, u.display_name, a.created_at, a.content \
             FROM lesson_source_artifacts a \
             LEFT JOIN users u ON u.id = a.ingested_by_user_id \
             WHERE a.school_id = ?1 AND {predicate}"
            ),
            (school_id, value),
            |row| {
                let artifact = LessonSourceArtifact {
                    id: row.get(0)?,
                    file_name: row.get(1)?,
                    media_type: row.get(2)?,
                    byte_length: row.get(3)?,
                    sha256: row.get(4)?,
                    ingested_by_user_id: row.get(5)?,
                    ingested_by_name: row.get(6)?,
                    created_at: row.get(7)?,
                    already_imported: false,
                };
                let content: Vec<u8> = row.get(8)?;
                Ok((artifact, content))
            },
        )
        .map(Some)
        .or_else(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(AppError::from(other)),
        })?;
    let Some((artifact, content)) = stored else {
        return Ok(None);
    };
    if artifact.byte_length != content.len() as i64 || artifact.sha256 != source_sha256(&content) {
        return Err(AppError::Validation(
            "Stored source bytes do not match their recorded integrity identity".into(),
        ));
    }
    Ok(Some(artifact))
}

fn source_sha256(content: &[u8]) -> String {
    Sha256::digest(content)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn validate_source_scope(
    source: &LessonSourceReference,
    context: Option<&LessonTeachingContext>,
) -> AppResult<()> {
    let Some(scope) = source.scope.as_ref() else {
        return Ok(());
    };
    let context = context.ok_or_else(|| {
        AppError::Validation(
            "This earlier lesson has no captured class context, so subject/year scope cannot be confirmed"
                .into(),
        )
    })?;
    if scope.school_year != context.school_year || scope.subject_id != context.subject_id {
        return Err(AppError::Validation(
            "Source scope does not match this lesson's captured subject and school year".into(),
        ));
    }
    if scope
        .grade_level
        .as_ref()
        .is_some_and(|grade| grade != &context.grade_level)
    {
        return Err(AppError::Validation(
            "Source grade does not match this lesson's captured grade".into(),
        ));
    }
    Ok(())
}

/// The exact fields a teacher supplies from the authoring screen --
/// grouped into one struct so `create`/`update` share one parameter
/// list rather than each growing an unwieldy positional arg count (this
/// entity has more free-text fields than any existing repository
/// module's create/update pair).
#[derive(Debug, Clone)]
pub struct LessonPlanFields<'a> {
    pub learning_competency: &'a str,
    pub learning_competency_code: &'a str,
    pub learning_objectives: &'a str,
    pub connection_to_previous_learning: &'a str,
    pub learning_experiences: &'a str,
    pub assessment: &'a str,
    pub ways_forward: &'a str,
}

/// The caller must be exactly the teacher on `teaching_assignment_id`,
/// or a School Head in the same school (read/write parity is
/// deliberately narrower for School Head than
/// `subject_attendance::authorize_own_assignment`'s teacher-only write
/// gate below -- see `authorize_view` for the read-only, School-Head-
/// inclusive check). Mirrors
/// `subject_attendance::authorize_own_assignment` exactly for the write
/// path: only the assignment's own teacher may create/update their own
/// plan.
pub fn authorize_own_assignment(
    conn: &Connection,
    user_id: &str,
    school_id: &str,
    teaching_assignment_id: &str,
) -> AppResult<()> {
    let assignment =
        teaching_assignment::find_by_id_in_school(conn, school_id, teaching_assignment_id)?
            .ok_or(AppError::Unauthorized)?;
    if assignment.teacher_user_id != user_id {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

/// Read access: the assignment's own teacher, or a School Head in the
/// same school -- matching this codebase's general "School Head can see
/// everything in their school" precedent (e.g. `SchoolHeadHome`'s broad
/// read access, `authorize_adviser_of_section`'s self-or-School-Head
/// shape). A School Head cannot create/edit another teacher's plan
/// (`authorize_own_assignment` above stays teacher-only for writes) --
/// only view it.
pub fn authorize_view(
    conn: &Connection,
    user_id: &str,
    school_id: &str,
    teaching_assignment_id: &str,
) -> AppResult<()> {
    let assignment =
        teaching_assignment::find_by_id_in_school(conn, school_id, teaching_assignment_id)?
            .ok_or(AppError::Unauthorized)?;
    if assignment.teacher_user_id == user_id {
        return Ok(());
    }
    if role::has_any_role(conn, user_id, school_id, &[role::SCHOOL_HEAD])? {
        return Ok(());
    }
    Err(AppError::Unauthorized)
}

/// Creates a lesson plan under `teaching_assignment_id` (verified to
/// resolve within `school_id` by the caller's `authorize_own_assignment`
/// check before this is reached). Returns `Ok(None)` if the assignment
/// doesn't resolve in `school_id`, or if one already exists for this
/// exact `(teaching_assignment_id, plan_date)` pair -- callers wanting
/// to change an existing day's plan should use `update` instead, the
/// same create-vs-update split every other entity in this codebase
/// uses.
pub fn create(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    plan_date: &str,
    created_by_user_id: &str,
    fields: &LessonPlanFields<'_>,
) -> AppResult<Option<LessonPlan>> {
    create_with_source(
        conn,
        school_id,
        teaching_assignment_id,
        plan_date,
        created_by_user_id,
        fields,
        None,
    )
}

pub fn create_with_source(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    plan_date: &str,
    created_by_user_id: &str,
    fields: &LessonPlanFields<'_>,
    source_reference: Option<&LessonSourceReference>,
) -> AppResult<Option<LessonPlan>> {
    create_with_review(
        conn,
        school_id,
        teaching_assignment_id,
        plan_date,
        created_by_user_id,
        fields,
        source_reference,
        None,
    )
}

#[allow(clippy::too_many_arguments)]
pub fn create_with_review(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    plan_date: &str,
    created_by_user_id: &str,
    fields: &LessonPlanFields<'_>,
    source_reference: Option<&LessonSourceReference>,
    reviewed_draft: Option<&LessonDraftReviewInput>,
) -> AppResult<Option<LessonPlan>> {
    // Recheck at this expanded write boundary; actor is never supplied in the review payload.
    if reviewed_draft.is_some() {
        authorize_own_assignment(conn, created_by_user_id, school_id, teaching_assignment_id)?;
    }
    let review_json = reviewed_draft
        .map(|input| input.snapshot(conn, created_by_user_id))
        .transpose()?
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|_| AppError::Validation("External draft review could not be saved".into()))?;
    let source = source_reference
        .map(LessonSourceReference::normalized)
        .transpose()?;
    if teaching_assignment::find_by_id_in_school(conn, school_id, teaching_assignment_id)?.is_none()
    {
        return Ok(None);
    }
    if find_by_assignment_and_date(conn, school_id, teaching_assignment_id, plan_date)?.is_some() {
        return Ok(None);
    }

    let context = conn.query_row(
        "SELECT sec.school_year, sec.grade_level, sec.id, sec.name, sub.id, sub.name \
         FROM teaching_assignments ta \
         JOIN sections sec ON sec.id = ta.section_id AND sec.school_id = ta.school_id \
         JOIN subjects sub ON sub.id = ta.subject_id AND sub.school_id = ta.school_id \
         WHERE ta.id = ?1 AND ta.school_id = ?2",
        (teaching_assignment_id, school_id),
        |row| {
            Ok(LessonTeachingContext {
                school_year: row.get(0)?,
                grade_level: row.get(1)?,
                section_id: row.get(2)?,
                section_name: row.get(3)?,
                subject_id: row.get(4)?,
                subject_name: row.get(5)?,
            })
        },
    )?;
    if let Some(source) = source.as_ref() {
        validate_source_scope(source, Some(&context))?;
        validate_source_dates(source, plan_date)?;
        validate_source_artifact(conn, school_id, source)?;
    }
    let source_json = source
        .as_ref()
        .map(|reference| {
            serde_json::to_string(reference)
                .map_err(|_| AppError::Validation("Source reference could not be saved".into()))
        })
        .transpose()?;
    let context_json = serde_json::to_string(&context)
        .map_err(|_| AppError::Validation("Lesson teaching context could not be saved".into()))?;

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO lesson_plans \
             (id, school_id, teaching_assignment_id, plan_date, \
              learning_competency, learning_competency_code, learning_objectives, \
              connection_to_previous_learning, learning_experiences, assessment, \
              ways_forward, created_by_user_id, teaching_context_json, source_reference_json, \
              external_draft_review_json) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        (
            &id,
            school_id,
            teaching_assignment_id,
            plan_date,
            fields.learning_competency,
            fields.learning_competency_code,
            fields.learning_objectives,
            fields.connection_to_previous_learning,
            fields.learning_experiences,
            fields.assessment,
            fields.ways_forward,
            created_by_user_id,
            &context_json,
            &source_json,
            &review_json,
        ),
    )?;

    find_by_id_in_school(conn, school_id, &id)
}

/// Fully edits an existing lesson plan's ILAW fields (never its
/// `teaching_assignment_id`/`plan_date` identity -- a teacher wanting
/// a different assignment/date creates a new plan instead). Returns
/// `Ok(None)` if the plan doesn't resolve in `school_id`. Unlike
/// `assessment_item::update`, there is no "already has downstream
/// data" guard here -- a lesson plan is planning content, never read by
/// grade computation or export, so it is always safely re-editable.
pub fn update_authorized(
    conn: &Connection,
    user_id: &str,
    school_id: &str,
    id: &str,
    expected_assignment_id: &str,
    fields: &LessonPlanFields<'_>,
) -> AppResult<Option<LessonPlan>> {
    let plan = find_by_id_in_school(conn, school_id, id)?.ok_or(AppError::Unauthorized)?;
    if plan.teaching_assignment_id != expected_assignment_id {
        return Err(AppError::Unauthorized);
    }
    authorize_own_assignment(conn, user_id, school_id, &plan.teaching_assignment_id)?;
    update(conn, school_id, id, fields)
}

pub fn update(
    conn: &Connection,
    school_id: &str,
    id: &str,
    fields: &LessonPlanFields<'_>,
) -> AppResult<Option<LessonPlan>> {
    if find_by_id_in_school(conn, school_id, id)?.is_none() {
        return Ok(None);
    }
    conn.execute(
        "UPDATE lesson_plans SET \
             learning_competency = ?1, learning_competency_code = ?2, \
             learning_objectives = ?3, connection_to_previous_learning = ?4, \
             learning_experiences = ?5, assessment = ?6, ways_forward = ?7, \
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE id = ?8 AND school_id = ?9",
        (
            fields.learning_competency,
            fields.learning_competency_code,
            fields.learning_objectives,
            fields.connection_to_previous_learning,
            fields.learning_experiences,
            fields.assessment,
            fields.ways_forward,
            id,
            school_id,
        ),
    )?;
    find_by_id_in_school(conn, school_id, id)
}

pub fn find_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    id: &str,
) -> AppResult<Option<LessonPlan>> {
    conn.query_row(
        &format!("{PLAN_SELECT} WHERE lp.id = ?1 AND lp.school_id = ?2"),
        (id, school_id),
        row_to_plan,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

pub fn find_by_assignment_and_date(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    plan_date: &str,
) -> AppResult<Option<LessonPlan>> {
    conn.query_row(
        &format!(
            "{PLAN_SELECT} WHERE lp.school_id = ?1 AND lp.teaching_assignment_id = ?2 AND lp.plan_date = ?3"
        ),
        (school_id, teaching_assignment_id, plan_date),
        row_to_plan,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Every lesson plan under one teaching assignment, most recent first --
/// scoped to `school_id` directly in the query, matching
/// `assessment_item::list_by_class_record`'s own isolation convention.
pub fn list_by_assignment(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
) -> AppResult<Vec<LessonPlan>> {
    let mut stmt = conn.prepare(&format!(
        "{PLAN_SELECT} WHERE lp.school_id = ?1 AND lp.teaching_assignment_id = ?2 \
         ORDER BY lp.plan_date DESC"
    ))?;
    let rows = stmt.query_map((school_id, teaching_assignment_id), row_to_plan)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

const PLAN_SELECT: &str = "SELECT lp.id, lp.school_id, lp.teaching_assignment_id, lp.plan_date, \
    lp.learning_competency, lp.learning_competency_code, lp.learning_objectives, \
    lp.connection_to_previous_learning, lp.learning_experiences, lp.assessment, \
    lp.ways_forward, lp.created_by_user_id, lp.created_at, lp.updated_at, \
    lp.teaching_context_json, \
    COALESCE((SELECT a.new_source_reference_json FROM lesson_source_amendments a \
      WHERE a.school_id = lp.school_id AND a.lesson_plan_id = lp.id \
      ORDER BY a.created_at DESC, a.id DESC LIMIT 1), lp.source_reference_json), \
    lp.external_draft_review_json \
    FROM lesson_plans lp";

/// Appends a source correction and returns the lesson with its new effective source.
/// The original declaration remains immutable and every superseded value is retained.
pub fn amend_source_authorized(
    conn: &Connection,
    user_id: &str,
    school_id: &str,
    lesson_plan_id: &str,
    expected_assignment_id: &str,
    new_source_reference: &LessonSourceReference,
    reason: &str,
) -> AppResult<Option<LessonPlan>> {
    let plan =
        find_by_id_in_school(conn, school_id, lesson_plan_id)?.ok_or(AppError::Unauthorized)?;
    if plan.teaching_assignment_id != expected_assignment_id {
        return Err(AppError::Unauthorized);
    }
    authorize_own_assignment(conn, user_id, school_id, &plan.teaching_assignment_id)?;
    let source = new_source_reference.normalized()?;
    validate_source_scope(&source, plan.teaching_context.as_ref())?;
    validate_source_dates(&source, &plan.plan_date)?;
    validate_source_artifact(conn, school_id, &source)?;
    let reason = reason.trim();
    if reason.is_empty() || reason.chars().count() > 1000 {
        return Err(AppError::Validation(
            "Source correction reason is required and limited to 1000 characters".into(),
        ));
    }
    if plan.source_reference.as_ref() == Some(&source) {
        return Err(AppError::Validation(
            "Source correction must change at least one source field".into(),
        ));
    }
    let previous_json = plan
        .source_reference
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|_| AppError::Validation("Previous source reference could not be saved".into()))?;
    let new_json = serde_json::to_string(&source)
        .map_err(|_| AppError::Validation("Source correction could not be saved".into()))?;
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO lesson_source_amendments \
         (id, school_id, lesson_plan_id, previous_source_reference_json, \
          new_source_reference_json, reason, amended_by_user_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            id,
            school_id,
            lesson_plan_id,
            previous_json,
            new_json,
            reason,
            user_id
        ],
    )?;
    find_by_id_in_school(conn, school_id, lesson_plan_id)
}

pub fn list_source_amendments(
    conn: &Connection,
    school_id: &str,
    lesson_plan_id: &str,
) -> AppResult<Vec<LessonSourceAmendment>> {
    let mut stmt = conn.prepare(
        "SELECT a.id, a.lesson_plan_id, a.previous_source_reference_json, \
                a.new_source_reference_json, a.reason, a.amended_by_user_id, \
                u.display_name, a.created_at \
         FROM lesson_source_amendments a \
         LEFT JOIN users u ON u.id = a.amended_by_user_id \
         WHERE a.school_id = ?1 AND a.lesson_plan_id = ?2 \
         ORDER BY a.created_at DESC, a.id DESC",
    )?;
    let rows = stmt.query_map((school_id, lesson_plan_id), |row| {
        let previous_json: Option<String> = row.get(2)?;
        let new_json: String = row.get(3)?;
        let parse = |index, json: String| {
            serde_json::from_str(&json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    index,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })
        };
        Ok(LessonSourceAmendment {
            id: row.get(0)?,
            lesson_plan_id: row.get(1)?,
            previous_source_reference: previous_json.map(|json| parse(2, json)).transpose()?,
            new_source_reference: parse(3, new_json)?,
            reason: row.get(4)?,
            amended_by_user_id: row.get(5)?,
            amended_by_name: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn row_to_plan(row: &rusqlite::Row) -> rusqlite::Result<LessonPlan> {
    let review_json: Option<String> = row.get(16)?;
    let external_draft_review = review_json
        .map(|json| {
            serde_json::from_str(&json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    16,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })
        })
        .transpose()?;
    let context_json: Option<String> = row.get(14)?;
    let teaching_context = context_json
        .map(|json| {
            serde_json::from_str(&json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    14,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })
        })
        .transpose()?;
    let source_json: Option<String> = row.get(15)?;
    let source_reference = source_json
        .map(|json| {
            serde_json::from_str(&json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    15,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })
        })
        .transpose()?;
    Ok(LessonPlan {
        id: row.get(0)?,
        school_id: row.get(1)?,
        teaching_assignment_id: row.get(2)?,
        plan_date: row.get(3)?,
        teaching_context,
        source_reference,
        external_draft_review,
        learning_competency: row.get(4)?,
        learning_competency_code: row.get(5)?,
        learning_objectives: row.get(6)?,
        connection_to_previous_learning: row.get(7)?,
        learning_experiences: row.get(8)?,
        assessment: row.get(9)?,
        ways_forward: row.get(10)?,
        created_by_user_id: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::repository::{school, section, subject, teaching_assignment, user};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    struct Fixture {
        school_id: String,
        teacher_id: String,
        assignment_id: String,
    }

    fn seed(conn: &Connection) -> Fixture {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let teacher = user::create_user(
            conn,
            "teacher.a",
            "correct horse battery staple",
            "Teacher A",
        )
        .unwrap();
        user::add_school_membership(conn, &teacher.id, &s.id).unwrap();
        let sec = section::create(conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let sub = subject::create(conn, &s.id, "Mathematics").unwrap();
        let assignment = teaching_assignment::create(conn, &s.id, &teacher.id, &sec.id, &sub.id)
            .unwrap()
            .unwrap();
        Fixture {
            school_id: s.id,
            teacher_id: teacher.id,
            assignment_id: assignment.id,
        }
    }

    fn sample_fields() -> LessonPlanFields<'static> {
        LessonPlanFields {
            learning_competency: "Add and subtract fractions with unlike denominators",
            learning_competency_code: "M7NS-Ig-1",
            learning_objectives: "Add fractions with unlike denominators\nSubtract fractions with unlike denominators",
            connection_to_previous_learning: "Builds on adding fractions with like denominators",
            learning_experiences: "Think-pair-share with fraction strips, then guided practice",
            assessment: "Exit ticket: 3 addition and 2 subtraction items",
            ways_forward: "Reteach denominators via LCD if exit ticket accuracy < 70%",
        }
    }

    #[test]
    fn external_draft_review_is_actor_stamped_and_preserved_after_lesson_edits() {
        let conn = open_test_db();
        let f = seed(&conn);
        let input = LessonDraftReviewInput {
            teacher_confirmed: true,
            suggestion: LessonPlanningSuggestion {
                learning_objectives: " Synthetic objective ".into(),
                connection_to_previous_learning: String::new(),
                learning_experiences: "Synthetic activity".into(),
                assessment: "Synthetic assessment".into(),
                ways_forward: String::new(),
            },
        };
        let plan = create_with_review(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
            None,
            Some(&input),
        )
        .unwrap()
        .unwrap();
        let review = plan.external_draft_review.as_ref().unwrap();
        assert_eq!(review.saved_by_user_id, f.teacher_id);
        assert!(!review.saved_at.is_empty());
        assert_eq!(review.suggestion.learning_objectives, "Synthetic objective");
        let edited = update_authorized(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &plan.id,
            &f.assignment_id,
            &LessonPlanFields {
                learning_experiences: "Teacher's final activity",
                ..sample_fields()
            },
        )
        .unwrap()
        .unwrap();
        assert_eq!(edited.learning_experiences, "Teacher's final activity");
        assert_eq!(edited.external_draft_review.as_ref(), Some(review));
        assert!(conn
            .execute(
                "UPDATE lesson_plans SET external_draft_review_json = NULL WHERE id = ?1",
                params![plan.id],
            )
            .is_err());
        assert!(create_with_review(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-08",
            "not-the-teacher",
            &sample_fields(),
            None,
            Some(&input),
        )
        .is_err());
    }

    #[test]
    fn external_draft_review_rejects_unconfirmed_or_invalid_content_without_writing() {
        let conn = open_test_db();
        let f = seed(&conn);
        let mut input = LessonDraftReviewInput {
            teacher_confirmed: false,
            suggestion: LessonPlanningSuggestion {
                learning_objectives: "Synthetic".into(),
                connection_to_previous_learning: String::new(),
                learning_experiences: "Synthetic".into(),
                assessment: "Synthetic".into(),
                ways_forward: String::new(),
            },
        };
        for index in 0..3 {
            if index == 1 {
                input.teacher_confirmed = true;
                input.suggestion.assessment = " ".into();
            } else if index == 2 {
                input.suggestion.assessment = "x".repeat(4001);
            }
            assert!(create_with_review(
                &conn,
                &f.school_id,
                &f.assignment_id,
                "2026-09-07",
                &f.teacher_id,
                &sample_fields(),
                None,
                Some(&input),
            )
            .is_err());
        }
        assert!(list_by_assignment(&conn, &f.school_id, &f.assignment_id)
            .unwrap()
            .is_empty());
        let mut value = serde_json::to_value(&input.suggestion).unwrap();
        value["learningCompetency"] = serde_json::json!("Forbidden authority");
        assert!(serde_json::from_value::<LessonPlanningSuggestion>(value).is_err());
        let legacy = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap()
        .unwrap();
        assert_eq!(legacy.external_draft_review, None);
    }

    #[test]
    fn declared_grade_scope_preserves_historical_grade_and_amendment_lineage() {
        let conn = open_test_db();
        let f = seed(&conn);
        let assignment =
            teaching_assignment::find_by_id_in_school(&conn, &f.school_id, &f.assignment_id)
                .unwrap()
                .unwrap();
        let source = LessonSourceReference {
            title: "Synthetic BOW".into(),
            version: "v1".into(),
            citation: "fixture:bow".into(),
            curriculum_name: "Synthetic".into(),
            term: "Synthetic term".into(),
            scope: Some(LessonSourceScope {
                school_year: "2026-2027".into(),
                subject_id: assignment.subject_id.clone(),
                grade_level: Some(" 7 ".into()),
            }),
            artifact_id: None,
            applicable_dates: None,
        };
        for grade in ["8".to_string(), " ".to_string(), "x".repeat(4001)] {
            let mut invalid = source.clone();
            invalid.scope.as_mut().unwrap().grade_level = Some(grade);
            assert!(create_with_source(
                &conn,
                &f.school_id,
                &f.assignment_id,
                "2026-09-07",
                &f.teacher_id,
                &sample_fields(),
                Some(&invalid)
            )
            .is_err());
        }
        assert!(list_by_assignment(&conn, &f.school_id, &f.assignment_id)
            .unwrap()
            .is_empty());
        let plan = create_with_source(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
            Some(&source),
        )
        .unwrap()
        .unwrap();
        let original = plan.source_reference.unwrap();
        assert_eq!(
            original.scope.as_ref().unwrap().grade_level.as_deref(),
            Some("7")
        );
        conn.execute(
            "UPDATE sections SET grade_level = '8' WHERE id = ?1",
            params![assignment.section_id],
        )
        .unwrap();
        let mut correction = original.clone();
        correction.version = "v2".into();
        correction.scope.as_mut().unwrap().grade_level = Some("8".into());
        assert!(amend_source_authorized(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &plan.id,
            &f.assignment_id,
            &correction,
            "Incorrect current grade"
        )
        .is_err());
        assert!(list_source_amendments(&conn, &f.school_id, &plan.id)
            .unwrap()
            .is_empty());
        correction.scope.as_mut().unwrap().grade_level = Some("7".into());
        amend_source_authorized(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &plan.id,
            &f.assignment_id,
            &correction,
            "Corrected revision for historical grade",
        )
        .unwrap();
        let history = list_source_amendments(&conn, &f.school_id, &plan.id).unwrap();
        assert_eq!(
            history[0].previous_source_reference.as_ref(),
            Some(&original)
        );
        assert_eq!(history[0].new_source_reference, correction);
        let legacy: LessonSourceScope =
            serde_json::from_str(r#"{"schoolYear":"2026-2027","subjectId":"fixture:subject"}"#)
                .unwrap();
        assert_eq!(legacy.grade_level, None);
        assert!(!serde_json::to_string(&legacy)
            .unwrap()
            .contains("gradeLevel"));
    }

    #[test]
    fn declared_source_scope_rejects_other_subjects_and_years_without_inserting() {
        let conn = open_test_db();
        let f = seed(&conn);
        let assignment =
            teaching_assignment::find_by_id_in_school(&conn, &f.school_id, &f.assignment_id)
                .unwrap()
                .unwrap();
        let source = LessonSourceReference {
            title: "Synthetic BOW".into(),
            version: "v1".into(),
            citation: "fixture:bow".into(),
            curriculum_name: "Synthetic curriculum".into(),
            term: "Term A".into(),
            scope: Some(LessonSourceScope {
                school_year: " 2026-2027 ".into(),
                subject_id: format!(" {} ", assignment.subject_id),
                grade_level: None,
            }),
            artifact_id: None,
            applicable_dates: None,
        };
        for (year, subject_id) in [
            ("2025-2026", assignment.subject_id.as_str()),
            ("2026-2027", "other-subject"),
            ("", assignment.subject_id.as_str()),
        ] {
            let invalid = LessonSourceReference {
                scope: Some(LessonSourceScope {
                    school_year: year.into(),
                    subject_id: subject_id.into(),
                    grade_level: None,
                }),
                ..source.clone()
            };
            assert!(create_with_source(
                &conn,
                &f.school_id,
                &f.assignment_id,
                "2026-09-07",
                &f.teacher_id,
                &sample_fields(),
                Some(&invalid)
            )
            .is_err());
        }
        assert!(list_by_assignment(&conn, &f.school_id, &f.assignment_id)
            .unwrap()
            .is_empty());
        let plan = create_with_source(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
            Some(&source),
        )
        .unwrap()
        .unwrap();
        let scope = plan
            .source_reference
            .as_ref()
            .unwrap()
            .scope
            .as_ref()
            .unwrap();
        assert_eq!(scope.school_year, "2026-2027");
        assert_eq!(scope.subject_id, assignment.subject_id);
        conn.execute(
            "UPDATE sections SET school_year = '2027-2028' WHERE id = ?1",
            [&assignment.section_id],
        )
        .unwrap();
        assert!(create_with_source(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2027-09-07",
            &f.teacher_id,
            &sample_fields(),
            Some(&source)
        )
        .is_err());
        let edited = update_authorized(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &plan.id,
            &f.assignment_id,
            &sample_fields(),
        )
        .unwrap()
        .unwrap();
        assert_eq!(edited.source_reference, plan.source_reference);
        assert_eq!(edited.teaching_context, plan.teaching_context);
    }

    #[test]
    fn earlier_source_json_deserializes_with_unknown_scope() {
        let source: LessonSourceReference = serde_json::from_str(
            r#"{"title":"Synthetic BOW","version":"v1","citation":"fixture:bow","curriculumName":"Synthetic","term":"Term A"}"#,
        ).unwrap();
        assert_eq!(source.scope, None);
        assert_eq!(source.artifact_id, None);
        assert_eq!(source.applicable_dates, None);
    }

    #[test]
    fn declared_source_dates_are_real_inclusive_and_historical() {
        let conn = open_test_db();
        let f = seed(&conn);
        let source = LessonSourceReference {
            title: "Synthetic BOW".into(),
            version: "v1".into(),
            citation: "fixture:bow".into(),
            curriculum_name: "Synthetic curriculum".into(),
            term: "Synthetic term".into(),
            scope: None,
            artifact_id: None,
            applicable_dates: Some(LessonSourceDates {
                starts_on: "2026-09-07".into(),
                ends_on: "2026-09-08".into(),
            }),
        };
        for date in ["2026-09-06", "2026-09-09", "2026-02-30"] {
            assert!(create_with_source(
                &conn,
                &f.school_id,
                &f.assignment_id,
                date,
                &f.teacher_id,
                &sample_fields(),
                Some(&source),
            )
            .is_err());
        }
        let plan = create_with_source(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
            Some(&source),
        )
        .unwrap()
        .unwrap();
        assert!(create_with_source(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-08",
            &f.teacher_id,
            &sample_fields(),
            Some(&source),
        )
        .unwrap()
        .is_some());
        let wrong_dates = LessonSourceReference {
            applicable_dates: Some(LessonSourceDates {
                starts_on: "2027-09-07".into(),
                ends_on: "2027-09-08".into(),
            }),
            ..source.clone()
        };
        assert!(amend_source_authorized(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &plan.id,
            &f.assignment_id,
            &wrong_dates,
            "Synthetic later term",
        )
        .is_err());
        assert!(list_source_amendments(&conn, &f.school_id, &plan.id)
            .unwrap()
            .is_empty());
        assert_eq!(
            find_by_id_in_school(&conn, &f.school_id, &plan.id)
                .unwrap()
                .unwrap()
                .source_reference,
            Some(source)
        );
        for value in ["2026-02-29", "1900-02-29", "2026-04-31", "0000-01-01"] {
            assert!(!is_calendar_date(value));
        }
        for value in ["2024-02-29", "2000-02-29"] {
            assert!(is_calendar_date(value));
        }
    }

    #[test]
    fn source_artifacts_are_school_scoped_deduplicated_and_append_only() {
        let conn = open_test_db();
        let f = seed(&conn);
        let content = b"%PDF-1.7\nsynthetic curriculum fixture";
        let stored = ingest_source_artifact_authorized(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &f.assignment_id,
            "synthetic-source.pdf",
            "application/pdf",
            content,
        )
        .unwrap();
        assert!(!stored.already_imported);
        assert_eq!(stored.byte_length, content.len() as i64);
        assert_eq!(
            stored.sha256,
            "19e2e459ae79d77420876537b91d6a2cf5ab527d7a7e654087da96db64c04708"
        );
        assert_eq!(stored.ingested_by_name.as_deref(), Some("Teacher A"));

        let duplicate = ingest_source_artifact_authorized(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &f.assignment_id,
            "renamed.pdf",
            "application/pdf",
            content,
        )
        .unwrap();
        assert_eq!(duplicate.id, stored.id);
        assert!(duplicate.already_imported);
        let bytes: Vec<u8> = conn
            .query_row(
                "SELECT content FROM lesson_source_artifacts WHERE id = ?1",
                [&stored.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(bytes, content);
        assert!(conn
            .execute(
                "UPDATE lesson_source_artifacts SET file_name = 'changed.pdf' WHERE id = ?1",
                [&stored.id],
            )
            .is_err());
        assert!(conn
            .execute(
                "DELETE FROM lesson_source_artifacts WHERE id = ?1",
                [&stored.id]
            )
            .is_err());
        let other = user::create_user(&conn, "teacher.b", "password", "Teacher B").unwrap();
        user::add_school_membership(&conn, &other.id, &f.school_id).unwrap();
        assert!(matches!(
            ingest_source_artifact_authorized(
                &conn,
                &other.id,
                &f.school_id,
                &f.assignment_id,
                "other.pdf",
                "application/pdf",
                b"%PDF-1.7\nother"
            ),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn source_reference_accepts_only_an_existing_same_school_artifact() {
        let conn = open_test_db();
        let f = seed(&conn);
        let artifact = ingest_source_artifact_authorized(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &f.assignment_id,
            "source.pdf",
            "application/pdf",
            b"%PDF-1.7\nfixture",
        )
        .unwrap();
        let source = LessonSourceReference {
            title: "Synthetic BOW".into(),
            version: "v1".into(),
            citation: "fixture:bow".into(),
            curriculum_name: "Synthetic curriculum".into(),
            term: "Term A".into(),
            scope: None,
            artifact_id: Some(artifact.id.clone()),
            applicable_dates: None,
        };
        let plan = create_with_source(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
            Some(&source),
        )
        .unwrap()
        .unwrap();
        assert_eq!(
            plan.source_reference.unwrap().artifact_id.as_deref(),
            Some(artifact.id.as_str())
        );
        let invalid = LessonSourceReference {
            artifact_id: Some("missing-artifact".into()),
            ..source
        };
        assert!(create_with_source(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-08",
            &f.teacher_id,
            &sample_fields(),
            Some(&invalid),
        )
        .is_err());
    }

    #[test]
    fn corrupt_source_identity_is_rejected_on_read_and_link() {
        let conn = open_test_db();
        let f = seed(&conn);
        // Synthetic corruption fixture: valid FK parents and schema constraints,
        // but metadata hash differs from content. No triggers or FKs are disabled.
        conn.execute(
            "INSERT INTO lesson_source_artifacts \
             (id, school_id, file_name, media_type, byte_length, sha256, content, ingested_by_user_id) \
             VALUES ('corrupt', ?1, 'synthetic.pdf', 'application/pdf', ?2, ?3, ?4, ?5)",
            params![
                &f.school_id,
                8,
                "0".repeat(64),
                b"%PDF-1.7".as_slice(),
                &f.teacher_id
            ],
        )
        .unwrap();
        assert!(find_source_artifact(&conn, &f.school_id, "corrupt").is_err());
        let source = LessonSourceReference {
            title: "Synthetic BOW".into(),
            version: "v1".into(),
            citation: "fixture:bow".into(),
            curriculum_name: "Synthetic curriculum".into(),
            term: "Term A".into(),
            scope: None,
            artifact_id: Some("corrupt".into()),
            applicable_dates: None,
        };
        assert!(create_with_source(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
            Some(&source),
        )
        .is_err());
        let other_school = school::create(&conn, "Synthetic Other School").unwrap();
        assert!(find_source_artifact(&conn, &other_school.id, "corrupt")
            .unwrap()
            .is_none());
        assert!(list_by_assignment(&conn, &f.school_id, &f.assignment_id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn source_reference_is_normalized_and_preserved_during_content_updates() {
        let conn = open_test_db();
        let f = seed(&conn);
        let source = LessonSourceReference {
            title: " Synthetic BOW ".into(),
            version: " v1 ".into(),
            citation: " fixture:bow ".into(),
            curriculum_name: " Synthetic curriculum ".into(),
            term: " Term A ".into(),
            scope: None,
            artifact_id: None,
            applicable_dates: None,
        };
        let created = create_with_source(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
            Some(&source),
        )
        .unwrap()
        .unwrap();
        let captured = created.source_reference.clone().unwrap();
        assert_eq!(captured.title, "Synthetic BOW");
        assert_eq!(captured.version, "v1");
        assert_eq!(captured.term, "Term A");
        let edited = update_authorized(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &created.id,
            &f.assignment_id,
            &sample_fields(),
        )
        .unwrap()
        .unwrap();
        assert_eq!(edited.source_reference, created.source_reference);
        assert!(conn
            .execute(
                "UPDATE lesson_plans SET source_reference_json = NULL WHERE id = ?1",
                [&created.id]
            )
            .is_err());
        let invalid = LessonSourceReference {
            version: "".into(),
            ..source
        };
        assert!(create_with_source(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-08",
            &f.teacher_id,
            &sample_fields(),
            Some(&invalid),
        )
        .is_err());
        assert_eq!(
            list_by_assignment(&conn, &f.school_id, &f.assignment_id)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn saved_context_survives_assignment_changes_and_content_edits() {
        let conn = open_test_db();
        let f = seed(&conn);
        let first = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap()
        .unwrap();
        let captured = first.teaching_context.clone().unwrap();
        assert_eq!(captured.school_year, "2026-2027");
        assert_eq!(captured.grade_level, "7");
        assert_eq!(captured.section_name, "Mabini");
        assert_eq!(captured.subject_name, "Mathematics");
        conn.execute(
            "UPDATE sections SET school_year = '2027-2028', grade_level = '8', name = 'New section' WHERE id = ?1",
            [&captured.section_id],
        )
        .unwrap();
        conn.execute(
            "UPDATE subjects SET name = 'Renamed subject' WHERE id = ?1",
            [&captured.subject_id],
        )
        .unwrap();
        let edited = update_authorized(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &first.id,
            &f.assignment_id,
            &sample_fields(),
        )
        .unwrap()
        .unwrap();
        assert_eq!(edited.teaching_context, first.teaching_context);
        assert_eq!(
            list_by_assignment(&conn, &f.school_id, &f.assignment_id).unwrap()[0].teaching_context,
            first.teaching_context
        );
        let next = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2027-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap()
        .unwrap();
        let current = next.teaching_context.unwrap();
        assert_eq!(current.school_year, "2027-2028");
        assert_eq!(current.grade_level, "8");
        assert_eq!(current.subject_name, "Renamed subject");
        assert!(conn
            .execute(
                "UPDATE lesson_plans SET teaching_context_json = NULL WHERE id = ?1",
                [&first.id]
            )
            .is_err());
    }

    #[test]
    fn create_then_find_round_trips_all_ilaw_fields() {
        let conn = open_test_db();
        let f = seed(&conn);
        let fields = sample_fields();

        let created = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &fields,
        )
        .unwrap()
        .unwrap();

        let found = find_by_id_in_school(&conn, &f.school_id, &created.id).unwrap();

        assert_eq!(found, Some(created.clone()));
        assert_eq!(created.learning_competency, fields.learning_competency);
        assert_eq!(
            created.learning_competency_code,
            fields.learning_competency_code
        );
        assert_eq!(created.learning_objectives, fields.learning_objectives);
        assert_eq!(
            created.connection_to_previous_learning,
            fields.connection_to_previous_learning
        );
        assert_eq!(created.learning_experiences, fields.learning_experiences);
        assert_eq!(created.assessment, fields.assessment);
        assert_eq!(created.ways_forward, fields.ways_forward);
        assert_eq!(created.plan_date, "2026-09-07");
    }

    #[test]
    fn create_rejects_a_teaching_assignment_from_a_different_school() {
        let conn = open_test_db();
        let f = seed(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();

        let result = create(
            &conn,
            &other_school.id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn create_rejects_a_second_plan_for_the_same_assignment_and_date() {
        let conn = open_test_db();
        let f = seed(&conn);
        create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap()
        .unwrap();

        let second = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap();

        assert_eq!(
            second, None,
            "one plan per (teaching_assignment_id, plan_date) -- use update instead"
        );
    }

    #[test]
    fn update_edits_every_ilaw_field_and_leaves_identity_untouched() {
        let conn = open_test_db();
        let f = seed(&conn);
        let created = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap()
        .unwrap();

        let revised = LessonPlanFields {
            learning_competency: "Revised competency",
            learning_competency_code: "M7NS-Ig-2",
            learning_objectives: "Objective A\nObjective B\nObjective C",
            connection_to_previous_learning: "Revised connection",
            learning_experiences: "Revised experiences",
            assessment: "Revised assessment",
            ways_forward: "Revised ways forward",
        };

        let updated = update(&conn, &f.school_id, &created.id, &revised)
            .unwrap()
            .unwrap();

        assert_eq!(updated.id, created.id);
        assert_eq!(
            updated.teaching_assignment_id,
            created.teaching_assignment_id
        );
        assert_eq!(updated.plan_date, created.plan_date);
        assert_eq!(updated.learning_competency, "Revised competency");
        assert_eq!(updated.learning_competency_code, "M7NS-Ig-2");
        assert_eq!(
            updated.learning_objectives,
            "Objective A\nObjective B\nObjective C"
        );
        assert_eq!(
            updated.connection_to_previous_learning,
            "Revised connection"
        );
        assert_eq!(updated.learning_experiences, "Revised experiences");
        assert_eq!(updated.assessment, "Revised assessment");
        assert_eq!(updated.ways_forward, "Revised ways forward");
    }

    #[test]
    fn update_rejects_a_plan_from_a_different_school() {
        let conn = open_test_db();
        let f = seed(&conn);
        let created = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap()
        .unwrap();
        let other_school = school::create(&conn, "Other School").unwrap();

        let result = update(&conn, &other_school.id, &created.id, &sample_fields()).unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn list_by_assignment_only_returns_that_assignments_plans_ordered_by_date_desc() {
        let conn = open_test_db();
        let f = seed(&conn);
        create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap();
        create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-08",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap();

        let plans = list_by_assignment(&conn, &f.school_id, &f.assignment_id).unwrap();

        assert_eq!(plans.len(), 2);
        assert_eq!(plans[0].plan_date, "2026-09-08");
        assert_eq!(plans[1].plan_date, "2026-09-07");
    }

    #[test]
    fn authorize_own_assignment_allows_the_assignments_own_teacher() {
        let conn = open_test_db();
        let f = seed(&conn);

        let result = authorize_own_assignment(&conn, &f.teacher_id, &f.school_id, &f.assignment_id);

        assert!(result.is_ok());
    }

    #[test]
    fn authorize_own_assignment_denies_a_different_teacher() {
        let conn = open_test_db();
        let f = seed(&conn);
        let other_teacher = user::create_user(
            &conn,
            "teacher.b",
            "correct horse battery staple",
            "Teacher B",
        )
        .unwrap();
        user::add_school_membership(&conn, &other_teacher.id, &f.school_id).unwrap();

        let result =
            authorize_own_assignment(&conn, &other_teacher.id, &f.school_id, &f.assignment_id);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_own_assignment_denies_an_unresolvable_assignment() {
        let conn = open_test_db();
        let f = seed(&conn);

        let result = authorize_own_assignment(&conn, &f.teacher_id, &f.school_id, "does-not-exist");

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_view_allows_a_school_head_who_does_not_own_the_assignment() {
        let conn = open_test_db();
        let f = seed(&conn);
        let head =
            user::create_user(&conn, "head.a", "correct horse battery staple", "Head A").unwrap();
        user::add_school_membership(&conn, &head.id, &f.school_id).unwrap();
        role::grant(&conn, &head.id, &f.school_id, role::SCHOOL_HEAD).unwrap();

        let result = authorize_view(&conn, &head.id, &f.school_id, &f.assignment_id);

        assert!(result.is_ok());
    }

    #[test]
    fn authorize_view_denies_a_teacher_who_neither_owns_the_assignment_nor_is_school_head() {
        let conn = open_test_db();
        let f = seed(&conn);
        let other_teacher = user::create_user(
            &conn,
            "teacher.b",
            "correct horse battery staple",
            "Teacher B",
        )
        .unwrap();
        user::add_school_membership(&conn, &other_teacher.id, &f.school_id).unwrap();

        let result = authorize_view(&conn, &other_teacher.id, &f.school_id, &f.assignment_id);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_view_denies_a_school_head_from_a_different_school() {
        let conn = open_test_db();
        let f = seed(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let head =
            user::create_user(&conn, "head.a", "correct horse battery staple", "Head A").unwrap();
        user::add_school_membership(&conn, &head.id, &other_school.id).unwrap();
        role::grant(&conn, &head.id, &other_school.id, role::SCHOOL_HEAD).unwrap();

        let result = authorize_view(&conn, &head.id, &other_school.id, &f.assignment_id);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn source_amendments_preserve_lineage_and_resolve_the_latest_reference() {
        let conn = open_test_db();
        let f = seed(&conn);
        let assignment =
            teaching_assignment::find_by_id_in_school(&conn, &f.school_id, &f.assignment_id)
                .unwrap()
                .unwrap();
        let original = LessonSourceReference {
            title: "Synthetic BOW".into(),
            version: "v1".into(),
            citation: "fixture:one".into(),
            curriculum_name: "Synthetic curriculum".into(),
            term: "Term A".into(),
            scope: Some(LessonSourceScope {
                school_year: "2026-2027".into(),
                subject_id: assignment.subject_id.clone(),
                grade_level: None,
            }),
            artifact_id: None,
            applicable_dates: None,
        };
        let plan = create_with_source(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
            Some(&original),
        )
        .unwrap()
        .unwrap();
        let second = LessonSourceReference {
            version: "v2".into(),
            citation: "fixture:two".into(),
            ..original.clone()
        };
        let amended = amend_source_authorized(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &plan.id,
            &f.assignment_id,
            &second,
            " Corrected the revision and location. ",
        )
        .unwrap()
        .unwrap();
        assert_eq!(amended.source_reference.as_ref(), Some(&second));

        let third = LessonSourceReference {
            version: "v3".into(),
            ..second.clone()
        };
        amend_source_authorized(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &plan.id,
            &f.assignment_id,
            &third,
            "Publisher issued a newer revision.",
        )
        .unwrap();
        let history = list_source_amendments(&conn, &f.school_id, &plan.id).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].previous_source_reference.as_ref(), Some(&second));
        assert_eq!(history[0].new_source_reference, third);
        assert_eq!(
            history[1].previous_source_reference.as_ref(),
            Some(&original)
        );
        assert_eq!(history[1].new_source_reference, second);
        assert_eq!(history[1].reason, "Corrected the revision and location.");
        assert_eq!(history[1].amended_by_name.as_deref(), Some("Teacher A"));

        let original_json: String = conn
            .query_row(
                "SELECT source_reference_json FROM lesson_plans WHERE id = ?1",
                [&plan.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            serde_json::from_str::<LessonSourceReference>(&original_json).unwrap(),
            original
        );
        assert!(conn
            .execute(
                "UPDATE lesson_source_amendments SET reason = 'rewritten' WHERE id = ?1",
                [&history[0].id]
            )
            .is_err());
        assert!(conn
            .execute(
                "DELETE FROM lesson_source_amendments WHERE id = ?1",
                [&history[0].id]
            )
            .is_err());
    }

    #[test]
    fn source_amendment_rejects_wrong_owner_noop_reason_and_historical_scope_mismatch() {
        let conn = open_test_db();
        let f = seed(&conn);
        let plan = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap()
        .unwrap();
        let context = plan.teaching_context.as_ref().unwrap();
        let source = LessonSourceReference {
            title: "Synthetic BOW".into(),
            version: "v1".into(),
            citation: "fixture:one".into(),
            curriculum_name: "Synthetic curriculum".into(),
            term: "Term A".into(),
            scope: Some(LessonSourceScope {
                school_year: context.school_year.clone(),
                subject_id: context.subject_id.clone(),
                grade_level: None,
            }),
            artifact_id: None,
            applicable_dates: None,
        };
        let other = user::create_user(&conn, "teacher.b", "password", "Teacher B").unwrap();
        user::add_school_membership(&conn, &other.id, &f.school_id).unwrap();
        assert!(matches!(
            amend_source_authorized(
                &conn,
                &other.id,
                &f.school_id,
                &plan.id,
                &f.assignment_id,
                &source,
                "Correction"
            ),
            Err(AppError::Unauthorized)
        ));
        assert!(amend_source_authorized(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &plan.id,
            &f.assignment_id,
            &source,
            " "
        )
        .is_err());
        amend_source_authorized(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &plan.id,
            &f.assignment_id,
            &source,
            "Added the missing source declaration",
        )
        .unwrap();
        assert!(amend_source_authorized(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &plan.id,
            &f.assignment_id,
            &source,
            "No actual change"
        )
        .is_err());
        let wrong_scope = LessonSourceReference {
            scope: Some(LessonSourceScope {
                school_year: "2027-2028".into(),
                subject_id: context.subject_id.clone(),
                grade_level: None,
            }),
            ..source
        };
        assert!(amend_source_authorized(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &plan.id,
            &f.assignment_id,
            &wrong_scope,
            "Wrong year"
        )
        .is_err());
        assert_eq!(
            list_source_amendments(&conn, &f.school_id, &plan.id)
                .unwrap()
                .len(),
            1
        );
    }
}
