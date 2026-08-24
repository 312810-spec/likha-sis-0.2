//! Builds a school-wide learner roster export as CSV — one row per learner
//! currently enrolled at the caller's school, for a teacher's own records,
//! spreadsheet import, or manual backup. Reuses the exact `FieldDisclosure`
//! pattern `sf2.rs`/`report_card.rs` established.
//!
//! **Deliberately scoped to already-visible data only.** This is not a
//! database/encryption-key backup — see
//! `docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md` for why that's a
//! separate, unresolved security design question (SQLCipher's key is
//! DPAPI-protected, machine/user-bound — exporting it safely needs its own
//! decision process). Every field here is already readable by this
//! session in `LearnerListScreen`; no new PII exposure, no new
//! authorization surface.

use crate::export::csv;
use crate::export::{FieldDisclosure, OmittedField};
use crate::repository::learner::Learner;
use crate::repository::school::School;

pub struct LearnerRosterExport {
    pub csv: String,
    pub disclosure: FieldDisclosure,
}

fn disclosure() -> FieldDisclosure {
    FieldDisclosure {
        populated_fields: vec![
            "Given Name".to_string(),
            "Family Name".to_string(),
            "LRN".to_string(),
            "Sex".to_string(),
            "Enrolled On".to_string(),
        ],
        omitted_fields: vec![
            OmittedField {
                field: "LRN or Sex for a learner who does not yet have one recorded".to_string(),
                reason: "Both fields are optional per learner (docs/adr/0017-learner-reference-number-and-sex.md) -- a learner without one renders blank rather than a fabricated placeholder.".to_string(),
            },
            OmittedField {
                field: "Birthdate, guardian contact, and any other profile field".to_string(),
                reason: "This app does not collect these fields at all -- see docs/adr/0017-learner-reference-number-and-sex.md for why collection is scoped strictly to what this app's own shipped exports actually need.".to_string(),
            },
            OmittedField {
                field: "Section enrollment / class record / grade history".to_string(),
                reason: "This is a learner-roster export only, not a full data backup. Section rosters and grades already have their own exports (SF2, report card).".to_string(),
            },
        ],
    }
}

/// Assembles the learner roster export for one school. `school`/`learners`
/// must already be resolved from the caller's own session-derived school
/// scope -- this function does no isolation checking itself, matching
/// `sf2.rs`'s and `report_card.rs`'s own `build_*_export` functions.
pub fn build_learner_roster_export(school: &School, learners: &[Learner]) -> LearnerRosterExport {
    let disclosure = disclosure();

    let mut lines: Vec<String> = vec![
        csv::row(&["School Name".to_string(), school.name.clone()]),
        String::new(),
        csv::row(&[
            "Given Name".to_string(),
            "Family Name".to_string(),
            "LRN".to_string(),
            "Sex".to_string(),
            "Enrolled On".to_string(),
        ]),
    ];

    for learner in learners {
        lines.push(csv::row(&[
            learner.given_name.clone(),
            learner.family_name.clone(),
            learner.lrn.clone().unwrap_or_default(),
            learner.sex.clone().unwrap_or_default(),
            learner.created_at.clone(),
        ]));
    }

    lines.push(String::new());
    lines.push("# This is a learner-roster export for your own records, not an official".to_string());
    lines.push("# DepEd form. Fields NOT included, and important limitations:".to_string());
    for omitted in &disclosure.omitted_fields {
        lines.push(format!("# - {}: {}", omitted.field, omitted.reason));
    }

    LearnerRosterExport {
        csv: lines.join("\n"),
        disclosure,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn a_school() -> School {
        School {
            id: "s1".to_string(),
            name: "Rizal Elementary".to_string(),
            created_at: "now".to_string(),
        }
    }

    fn a_learner() -> Learner {
        Learner {
            id: "l1".to_string(),
            school_id: "s1".to_string(),
            given_name: "Ana".to_string(),
            family_name: "Cruz".to_string(),
            lrn: Some("123456789012".to_string()),
            sex: Some("F".to_string()),
            created_at: "2026-08-25T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn header_row_carries_the_school_name() {
        let export = build_learner_roster_export(&a_school(), &[]);
        assert!(export.csv.contains("School Name,Rizal Elementary"));
    }

    #[test]
    fn a_learner_with_lrn_and_sex_renders_both() {
        let export = build_learner_roster_export(&a_school(), &[a_learner()]);
        assert!(export.csv.contains("Ana,Cruz,123456789012,F,2026-08-25T00:00:00Z"));
    }

    #[test]
    fn a_learner_missing_lrn_and_sex_renders_blank_not_a_placeholder() {
        let learner = Learner { lrn: None, sex: None, ..a_learner() };
        let export = build_learner_roster_export(&a_school(), &[learner]);
        assert!(export.csv.contains("Ana,Cruz,,,2026-08-25T00:00:00Z"));
    }

    #[test]
    fn multiple_learners_each_get_their_own_row() {
        let second = Learner {
            id: "l2".to_string(),
            given_name: "Mabini".to_string(),
            family_name: "Torres".to_string(),
            lrn: None,
            sex: None,
            ..a_learner()
        };
        let export = build_learner_roster_export(&a_school(), &[a_learner(), second]);
        assert!(export.csv.contains("Ana,Cruz"));
        assert!(export.csv.contains("Mabini,Torres"));
    }

    #[test]
    fn the_disclosure_lists_every_field_actually_referenced_in_the_comment_block() {
        let export = build_learner_roster_export(&a_school(), &[]);
        assert!(!export.disclosure.omitted_fields.is_empty());
        for omitted in &export.disclosure.omitted_fields {
            assert!(export.csv.contains(&omitted.field));
        }
    }

    #[test]
    fn no_data_appears_outside_the_header_and_disclosure_block_for_an_empty_roster() {
        let export = build_learner_roster_export(&a_school(), &[]);
        assert!(!export.csv.lines().any(|line| !line.starts_with('#') && line.contains("Ana")));
    }
}
