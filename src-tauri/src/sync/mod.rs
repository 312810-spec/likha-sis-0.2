//! Provider-neutral synchronization contracts.
//!
//! These types deliberately contain no networking or database code. The
//! desktop and future Android adapters may use different transports while
//! sharing the same validation and conflict semantics.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
pub struct SyncCursor(pub u64);

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct PendingChange {
    pub change_id: Uuid,
    pub device_id: Uuid,
    pub actor_user_id: Uuid,
    pub entity_kind: EntityKind,
    pub entity_id: Uuid,
    pub base_version: u64,
    pub operation: ChangeOperation,
    /// Encrypted, authenticated application payload. Plaintext learner data
    /// must never cross the provider boundary.
    pub encrypted_payload: Vec<u8>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChangeOperation {
    Upsert,
    Delete,
}

impl ChangeOperation {
    /// The stored/wire string form -- also the exact `CHECK (operation IN
    /// (...))` allowlist in migrations 25/28. Pure string mapping, no
    /// `rusqlite` dependency: this module deliberately contains no
    /// database code (see the module doc comment), so a caller wraps this
    /// into its own storage-layer error type.
    pub fn as_db_str(self) -> &'static str {
        match self {
            ChangeOperation::Upsert => "upsert",
            ChangeOperation::Delete => "delete",
        }
    }

    pub fn from_db_str(value: &str) -> Option<ChangeOperation> {
        match value {
            "upsert" => Some(ChangeOperation::Upsert),
            "delete" => Some(ChangeOperation::Delete),
            _ => None,
        }
    }
}

/// Explicit allowlist. Authentication, sessions, credentials, local audit
/// material, and encryption keys are intentionally absent.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityKind {
    Learner,
    Section,
    SectionMembership,
    Attendance,
    SubjectAttendance,
    AssessmentItem,
    LearnerScore,
    GradingPeriod,
    Subject,
    TeachingAssignment,
}

impl EntityKind {
    /// The stored/wire string form -- also the exact `CHECK (entity_kind
    /// IN (...))` allowlist in migrations 25/28. Pure string mapping, see
    /// `ChangeOperation::as_db_str`'s doc comment for why this has no
    /// `rusqlite` dependency.
    pub fn as_db_str(self) -> &'static str {
        match self {
            EntityKind::Learner => "learner",
            EntityKind::Section => "section",
            EntityKind::SectionMembership => "section_membership",
            EntityKind::Attendance => "attendance",
            EntityKind::SubjectAttendance => "subject_attendance",
            EntityKind::AssessmentItem => "assessment_item",
            EntityKind::LearnerScore => "learner_score",
            EntityKind::GradingPeriod => "grading_period",
            EntityKind::Subject => "subject",
            EntityKind::TeachingAssignment => "teaching_assignment",
        }
    }

    pub fn from_db_str(value: &str) -> Option<EntityKind> {
        match value {
            "learner" => Some(EntityKind::Learner),
            "section" => Some(EntityKind::Section),
            "section_membership" => Some(EntityKind::SectionMembership),
            "attendance" => Some(EntityKind::Attendance),
            "subject_attendance" => Some(EntityKind::SubjectAttendance),
            "assessment_item" => Some(EntityKind::AssessmentItem),
            "learner_score" => Some(EntityKind::LearnerScore),
            "grading_period" => Some(EntityKind::GradingPeriod),
            "subject" => Some(EntityKind::Subject),
            "teaching_assignment" => Some(EntityKind::TeachingAssignment),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConflictDisposition {
    Accept,
    ReviewRequired,
}

/// The hub orders accepted changes, but never silently chooses between two
/// divergent edits to learner, attendance, or grading records.
pub fn classify_conflict(base_version: u64, hub_version: u64) -> ConflictDisposition {
    if base_version == hub_version {
        ConflictDisposition::Accept
    } else {
        ConflictDisposition::ReviewRequired
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SyncContractError {
    EmptyPayload,
    PayloadTooLarge,
    BaseVersionTooLarge,
}

pub const MAX_ENCRYPTED_CHANGE_BYTES: usize = 256 * 1024;

pub fn validate_change(change: &PendingChange) -> Result<(), SyncContractError> {
    if change.base_version > i64::MAX as u64 {
        return Err(SyncContractError::BaseVersionTooLarge);
    }
    if change.encrypted_payload.is_empty() {
        return Err(SyncContractError::EmptyPayload);
    }
    if change.encrypted_payload.len() > MAX_ENCRYPTED_CHANGE_BYTES {
        return Err(SyncContractError::PayloadTooLarge);
    }
    Ok(())
}

/// Port implemented by a school-LAN or optional remote-transport adapter.
/// Implementations must derive school and permissions from the authenticated
/// device credential; callers cannot supply a school identifier.
pub trait SyncProvider {
    type Error;

    fn push(&self, changes: &[PendingChange]) -> Result<SyncCursor, Self::Error>;
    fn pull(&self, after: SyncCursor, limit: u16) -> Result<Vec<PendingChange>, Self::Error>;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn change_with_payload(payload: Vec<u8>) -> PendingChange {
        PendingChange {
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: Uuid::now_v7(),
            entity_kind: EntityKind::Learner,
            entity_id: Uuid::now_v7(),
            base_version: 4,
            operation: ChangeOperation::Upsert,
            encrypted_payload: payload,
        }
    }

    #[test]
    fn unchanged_base_is_accepted() {
        assert_eq!(classify_conflict(4, 4), ConflictDisposition::Accept);
    }

    #[test]
    fn divergent_edit_requires_review_instead_of_last_write_wins() {
        assert_eq!(classify_conflict(4, 5), ConflictDisposition::ReviewRequired);
    }

    #[test]
    fn empty_and_oversized_payloads_are_rejected() {
        assert_eq!(
            validate_change(&change_with_payload(vec![])),
            Err(SyncContractError::EmptyPayload)
        );
        assert_eq!(
            validate_change(&change_with_payload(vec![
                0;
                MAX_ENCRYPTED_CHANGE_BYTES + 1
            ])),
            Err(SyncContractError::PayloadTooLarge)
        );
    }

    #[test]
    fn base_version_must_fit_the_sqlite_integer_domain() {
        let mut change = change_with_payload(vec![1]);
        change.base_version = i64::MAX as u64 + 1;
        assert_eq!(
            validate_change(&change),
            Err(SyncContractError::BaseVersionTooLarge)
        );
    }
}
