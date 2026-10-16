use super::*;
use std::path::Path;
use std::sync::{Arc, Barrier};
use std::time::Duration;

const CURRICULUM: &str = "00000000-0000-7000-8000-000000005001";
const OTHER_CURRICULUM: &str = "00000000-0000-7000-8000-000000005002";

fn seed(conn: &Connection) {
    conn.execute_batch(
        "INSERT INTO schools (id,name) VALUES ('s','Synthetic School'),('foreign','Other School');
         INSERT INTO users (id,username,password_hash,display_name) VALUES
           ('admin','admin','synthetic','Synthetic Head'),
           ('teacher','teacher','synthetic','Synthetic Teacher'),
           ('unassigned','unassigned','synthetic','Synthetic Unassigned'),
           ('outsider','outsider','synthetic','Synthetic Outsider'),
           ('registrar','registrar','synthetic','Synthetic Registrar');
         INSERT INTO user_school_memberships (user_id,school_id) VALUES
           ('admin','s'),('teacher','s'),('unassigned','s'),('outsider','foreign'),('registrar','s');
         INSERT INTO user_school_roles (user_id,school_id,role) VALUES
           ('admin','s','school_head'),('teacher','s','teacher'),
           ('unassigned','s','teacher'),('outsider','foreign','school_head'),
           ('registrar','s','registrar');
         INSERT INTO sections (id,school_id,school_year,grade_level,name) VALUES
           ('section','s','2026-2027','7','Synthetic A'),
           ('other_section','s','2026-2027','7','Synthetic B'),
           ('foreign_section','foreign','2026-2027','7','Synthetic C');
         INSERT INTO subjects (id,school_id,name) VALUES
           ('subject','s','Synthetic Subject'),('subject2','s','Synthetic Subject 2'),
           ('foreign_subject','foreign','Synthetic Foreign Subject');
         INSERT INTO teaching_assignments (id,school_id,teacher_user_id,section_id,subject_id)
           VALUES ('assignment','s','teacher','section','subject');
         INSERT INTO grading_periods (id,school_id,school_year,policy_period_id,starts_on,ends_on) VALUES
           ('period','s','2026-2027','00000000-0000-7000-8000-000000000011','2026-06-08','2026-09-15'),
           ('overlap','s','2026-2027','00000000-0000-7000-8000-000000000012','2026-07-01','2026-10-01'),
           ('wrong_year','s','2027-2028','00000000-0000-7000-8000-000000000011','2027-06-08','2027-09-15');
         INSERT INTO class_records (id,school_id,section_id,subject_id,grading_period_id,curriculum_version_id)
           VALUES ('record','s','section','subject','period','00000000-0000-7000-8000-000000005001');",
    ).unwrap();
    let preview = report_readiness::preview_report_card_authorized(conn, "teacher", "s", "record")
        .unwrap()
        .unwrap();
    let snapshot = serde_json::to_string(&preview).unwrap();
    let snapshot_hash = crate::repository::report_source_lock::hash(&snapshot);
    let source = crate::repository::report_source_lock::capture_json(conn, "s", &preview).unwrap();
    let hash = crate::repository::report_source_lock::hash(&source);
    for draft in ["draft", "legacy", "later"] {
        conn.execute(
            "INSERT INTO report_card_drafts (id,school_id,class_record_id,snapshot_json,snapshot_sha256,created_by_user_id) VALUES (?1,'s','record',?2,?3,'teacher')",
            params![draft, snapshot, snapshot_hash],
        ).unwrap();
        conn.execute(
            "INSERT INTO report_card_draft_source_locks (draft_id,school_id,source_version,source_json,source_sha256) VALUES (?1,'s',?2,?3,?4)",
            params![draft, crate::repository::report_source_lock::VERSION, source, hash],
        ).unwrap();
    }
}

fn fixture() -> Connection {
    let conn = crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap();
    seed(&conn);
    conn
}

fn request() -> AppendVersion {
    AppendVersion {
        context: ApplicabilityContext {
            section_id: "section".into(),
            grading_period_id: "period".into(),
        },
        expected_predecessor_id: None,
        curriculum_version_id: CURRICULUM.into(),
        state: VersionState::Confirmed,
        subject_ids: vec!["subject".into()],
        evidence: SourceEvidence {
            citation: "Synthetic fixture, not an official requirement".into(),
            locator: "synthetic://applicability/section/period".into(),
            revision: "fixture-1".into(),
            sha256: None,
        },
        reason: "Synthetic review".into(),
        reviewed: true,
    }
}

fn append(conn: &Connection, request: &AppendVersion) -> ApplicabilityVersion {
    append_authorized(conn, "admin", "s", request).unwrap()
}

#[test]
fn selection_is_read_only_and_newer_drafts_do_not_replace_confirmations_or_withdrawals() {
    let conn = fixture();
    let mut req = request();
    let changes = conn.total_changes();
    assert_eq!(
        select_authorized(&conn, "teacher", "s", &req.context)
            .unwrap()
            .status,
        "pending"
    );
    assert_eq!(conn.total_changes(), changes);
    req.state = VersionState::Draft;
    req.reviewed = false;
    let draft = append(&conn, &req);
    assert_eq!(
        select_authorized(&conn, "teacher", "s", &req.context)
            .unwrap()
            .status,
        "pending"
    );
    req.expected_predecessor_id = Some(draft.id);
    req.state = VersionState::Confirmed;
    req.reviewed = true;
    let confirmed = append(&conn, &req);
    req.expected_predecessor_id = Some(confirmed.id.clone());
    req.state = VersionState::Draft;
    req.subject_ids.push("subject2".into());
    let newer = append(&conn, &req);
    let selected = select_authorized(&conn, "teacher", "s", &req.context).unwrap();
    assert_eq!(selected.head_id, Some(newer.id.clone()));
    assert_eq!(selected.confirmed.unwrap(), confirmed);
    req.expected_predecessor_id = Some(newer.id);
    req.state = VersionState::Withdrawn;
    req.subject_ids.clear();
    let withdrawn = append(&conn, &req);
    req.expected_predecessor_id = Some(withdrawn.id);
    req.state = VersionState::Draft;
    req.subject_ids.push("subject2".into());
    let newer_draft = append(&conn, &req);
    let selected = select_authorized(&conn, "teacher", "s", &req.context).unwrap();
    assert_eq!(selected.status, "withdrawn");
    assert!(selected.confirmed.is_none());
    req.expected_predecessor_id = Some(newer_draft.id);
    req.state = VersionState::Confirmed;
    let replacement = append(&conn, &req);
    assert_eq!(
        select_authorized(&conn, "teacher", "s", &req.context)
            .unwrap()
            .confirmed
            .unwrap(),
        replacement
    );
    assert_eq!(
        history_authorized(&conn, "teacher", "s", &req.context)
            .unwrap()
            .len(),
        6
    );
}

#[test]
fn current_membership_role_and_exact_assignment_scope_are_required() {
    let conn = fixture();
    let req = request();
    for actor in ["outsider", "unassigned", "missing"] {
        assert!(matches!(
            select_authorized(&conn, actor, "s", &req.context),
            Err(AppError::Unauthorized)
        ));
        assert!(history_authorized(&conn, actor, "s", &req.context).is_err());
    }
    assert!(matches!(
        append_authorized(&conn, "teacher", "s", &req),
        Err(AppError::Unauthorized)
    ));
    assert!(append_authorized(&conn, "outsider", "foreign", &req).is_err());
    let mut other = req.context.clone();
    other.section_id = "other_section".into();
    assert!(select_authorized(&conn, "teacher", "s", &other).is_err());
    assert!(select_authorized(&conn, "registrar", "s", &other).is_ok());
    assert!(append_authorized(&conn, "registrar", "s", &req).is_ok());
    conn.execute(
        "DELETE FROM user_school_memberships WHERE user_id='teacher'",
        [],
    )
    .unwrap();
    assert!(select_authorized(&conn, "teacher", "s", &req.context).is_err());
    assert!(pin_draft_authorized(&conn, "teacher", "s", "draft", "missing").is_err());
}

#[test]
fn invalid_subjects_evidence_review_and_mismatched_years_leave_no_versions() {
    let conn = fixture();
    let base = request();
    let mut invalid = Vec::new();
    let mut req = base.clone();
    req.subject_ids.push("subject".into());
    invalid.push(req);
    let mut req = base.clone();
    req.subject_ids = vec!["foreign_subject".into()];
    invalid.push(req);
    let mut req = base.clone();
    req.subject_ids.clear();
    invalid.push(req);
    let mut req = base.clone();
    req.reviewed = false;
    invalid.push(req);
    let mut req = base.clone();
    req.evidence.citation = " ".into();
    invalid.push(req);
    let mut req = base.clone();
    req.evidence.sha256 = Some("f".repeat(63));
    invalid.push(req);
    let mut req = base.clone();
    req.curriculum_version_id = "missing".into();
    invalid.push(req);
    let mut req = base.clone();
    req.context.grading_period_id = "wrong_year".into();
    invalid.push(req);
    for req in invalid {
        assert!(append_authorized(&conn, "admin", "s", &req).is_err());
    }
    assert!(history_authorized(&conn, "admin", "s", &base.context)
        .unwrap()
        .is_empty());
}

#[test]
fn exact_periods_do_not_infer_rules_from_overlapping_dates_or_other_cohorts() {
    let conn = fixture();
    let req = request();
    let first = append(&conn, &req);
    for (section, period) in [("other_section", "period"), ("section", "overlap")] {
        let mut other = req.clone();
        other.context.section_id = section.into();
        other.context.grading_period_id = period.into();
        assert_eq!(
            select_authorized(&conn, "admin", "s", &other.context)
                .unwrap()
                .status,
            "pending"
        );
        let separate = append(&conn, &other);
        assert_ne!(separate.id, first.id);
        assert_eq!(
            select_authorized(&conn, "admin", "s", &other.context)
                .unwrap()
                .confirmed
                .unwrap(),
            separate
        );
    }
}

#[test]
fn stale_roots_and_successors_cannot_fork_or_rewrite_history() {
    let conn = fixture();
    let mut req = request();
    let root = append(&conn, &req);
    assert!(conn
        .execute("DELETE FROM subjects WHERE id='subject'", [])
        .is_err());
    assert!(conn
        .execute(
            "UPDATE subjects SET school_id='foreign' WHERE id='subject'",
            []
        )
        .is_err());
    assert!(append_authorized(&conn, "admin", "s", &req).is_err());
    req.expected_predecessor_id = Some(root.id.clone());
    let successor = append(&conn, &req);
    assert!(append_authorized(&conn, "admin", "s", &req).is_err());
    for sql in [
        "UPDATE required_subject_versions SET reason='changed'",
        "DELETE FROM required_subject_versions",
    ] {
        assert!(conn.execute(sql, []).is_err());
    }
    // Bypass repository checks to exercise structural root, fork and scope guards.
    let columns = "school_id,section_id,grading_period_id,school_year,grade_level,curriculum_version_id,revision,predecessor_id,state,subject_ids_json,source_citation,source_locator,source_revision,source_sha256,reason,actor_user_id";
    let duplicate = format!("INSERT INTO required_subject_versions (id,{columns}) SELECT 'duplicate',{columns} FROM required_subject_versions WHERE id=?1");
    assert!(conn.execute(&duplicate, [&root.id]).is_err());
    assert!(conn.execute(&duplicate, [&successor.id]).is_err());
    let foreign_parent = format!("INSERT INTO required_subject_versions (id,{columns}) SELECT 'foreign-child',school_id,'other_section',grading_period_id,school_year,grade_level,curriculum_version_id,revision+1,id,state,subject_ids_json,source_citation,source_locator,source_revision,source_sha256,reason,actor_user_id FROM required_subject_versions WHERE id=?1");
    assert!(conn.execute(&foreign_parent, [&successor.id]).is_err());
    assert_eq!(
        history_authorized(&conn, "admin", "s", &req.context).unwrap(),
        vec![successor, root]
    );
}

#[test]
fn changed_section_grade_never_silently_reuses_old_applicability() {
    let conn = fixture();
    let req = request();
    let original = append(&conn, &req);
    conn.execute("UPDATE sections SET grade_level='8' WHERE id='section'", [])
        .unwrap();
    let selected = select_authorized(&conn, "admin", "s", &req.context).unwrap();
    assert_eq!(selected.status, "context_changed");
    assert!(selected.confirmed.is_none());
    assert_eq!(
        history_authorized(&conn, "admin", "s", &req.context).unwrap(),
        vec![original]
    );
}

fn race(path: &Path, key: &[u8; crate::crypto::KEY_LEN], req: AppendVersion) -> usize {
    let a = crate::db::open(path, key).unwrap();
    let b = crate::db::open(path, key).unwrap();
    let barrier = Arc::new(Barrier::new(2));
    let handles: Vec<_> = [a, b]
        .into_iter()
        .map(|conn| {
            conn.busy_timeout(Duration::from_secs(10)).unwrap();
            let barrier = barrier.clone();
            let request = req.clone();
            std::thread::spawn(move || {
                barrier.wait();
                append_authorized(&conn, "admin", "s", &request).is_ok()
            })
        })
        .collect();
    handles
        .into_iter()
        .map(|h| usize::from(h.join().unwrap()))
        .sum()
}

#[test]
fn concurrent_connections_accept_exactly_one_root_and_one_successor() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("synthetic.db");
    let key = crate::crypto::generate_key();
    let conn = crate::db::open(&path, &key).unwrap();
    seed(&conn);
    let mut req = request();
    assert_eq!(race(&path, &key, req.clone()), 1);
    req.expected_predecessor_id = select_authorized(&conn, "admin", "s", &req.context)
        .unwrap()
        .head_id;
    assert_eq!(race(&path, &key, req.clone()), 1);
    assert_eq!(
        history_authorized(&conn, "admin", "s", &req.context)
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn report_pins_preserve_exact_history_after_new_confirmations_and_withdrawals() {
    let conn = fixture();
    let mut req = request();
    let first = append(&conn, &req);
    assert_eq!(
        pin_draft_authorized(&conn, "teacher", "s", "draft", &first.id).unwrap(),
        first
    );
    assert!(pinned_draft_authorized(&conn, "teacher", "s", "legacy")
        .unwrap()
        .is_none());
    req.expected_predecessor_id = Some(first.id.clone());
    req.subject_ids.push("subject2".into());
    let newer = append(&conn, &req);
    assert!(pin_draft_authorized(&conn, "teacher", "s", "legacy", &first.id).is_err());
    assert!(pin_draft_authorized(&conn, "teacher", "s", "draft", &newer.id).is_err());
    assert_eq!(
        pin_draft_authorized(&conn, "teacher", "s", "legacy", &newer.id).unwrap(),
        newer
    );
    req.expected_predecessor_id = Some(newer.id);
    req.state = VersionState::Withdrawn;
    req.subject_ids.clear();
    let withdrawal = append(&conn, &req);
    assert!(pin_draft_authorized(&conn, "teacher", "s", "later", &first.id).is_err());
    assert!(pin_draft_authorized(&conn, "teacher", "s", "later", &withdrawal.id).is_err());
    assert_eq!(
        pinned_draft_authorized(&conn, "teacher", "s", "draft")
            .unwrap()
            .unwrap(),
        first
    );
    assert_eq!(
        pin_draft_authorized(&conn, "teacher", "s", "draft", &first.id).unwrap(),
        first
    );
    assert!(pinned_draft_authorized(&conn, "unassigned", "s", "draft").is_err());
    assert!(pinned_draft_authorized(&conn, "outsider", "foreign", "draft").is_err());
    for sql in [
        "UPDATE report_required_subject_pins SET version_id='missing'",
        "DELETE FROM report_required_subject_pins",
    ] {
        assert!(conn.execute(sql, []).is_err());
    }
    conn.execute(
        "DELETE FROM user_school_memberships WHERE user_id='teacher'",
        [],
    )
    .unwrap();
    assert!(pin_draft_authorized(&conn, "teacher", "s", "draft", &first.id).is_err());
    assert!(pinned_draft_authorized(&conn, "teacher", "s", "draft").is_err());
}

#[test]
fn report_pin_rejects_missing_policies_drafts_and_different_curricula_or_periods() {
    let conn = fixture();
    let mut req = request();
    req.state = VersionState::Draft;
    let draft = append(&conn, &req);
    assert!(pin_draft_authorized(&conn, "teacher", "s", "draft", &draft.id).is_err());
    req.expected_predecessor_id = Some(draft.id);
    req.state = VersionState::Confirmed;
    req.curriculum_version_id = OTHER_CURRICULUM.into();
    let other_curriculum = append(&conn, &req);
    assert!(pin_draft_authorized(&conn, "teacher", "s", "draft", &other_curriculum.id).is_err());
    conn.execute(
        "UPDATE class_records SET curriculum_version_id=NULL WHERE id='record'",
        [],
    )
    .unwrap();
    assert!(pin_draft_authorized(&conn, "teacher", "s", "draft", &other_curriculum.id).is_err());
    conn.execute(
        "UPDATE class_records SET curriculum_version_id=?1 WHERE id='record'",
        [OTHER_CURRICULUM],
    )
    .unwrap();
    let mut other = request();
    other.context.grading_period_id = "overlap".into();
    other.curriculum_version_id = OTHER_CURRICULUM.into();
    let different_period = append(&conn, &other);
    assert!(pin_draft_authorized(&conn, "teacher", "s", "draft", &different_period.id).is_err());
    assert!(pinned_draft_authorized(&conn, "teacher", "s", "draft")
        .unwrap()
        .is_none());
}
