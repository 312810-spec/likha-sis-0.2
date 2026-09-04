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
}

pub const MAX_ENCRYPTED_CHANGE_BYTES: usize = 256 * 1024;

pub fn validate_change(change: &PendingChange) -> Result<(), SyncContractError> {
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
}
