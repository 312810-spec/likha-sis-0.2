use rusqlite::Connection;

use crate::error::AppResult;

/// Reference data, not school-scoped — every school sees the same
/// DepEd-sourced set. See `docs/adr/0037-curriculum-key-stage-versioning.md`
/// for why this is a separate versioned axis from `grading_weight_policies`
/// rather than reusing it: which curriculum's content/competencies apply is
/// independent of how a subject's grade is weighted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CurriculumVersion {
    pub id: String,
    pub name: String,
    pub source_citation: String,
    pub is_default: bool,
}

/// Ordered `is_default DESC` so the current default is always first — same
/// convention as `grading::list_policies`/`grading_computation::list_weight_policies`.
pub fn list_versions(conn: &Connection) -> AppResult<Vec<CurriculumVersion>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, source_citation, is_default \
         FROM curriculum_versions ORDER BY is_default DESC, name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(CurriculumVersion {
            id: row.get(0)?,
            name: row.get(1)?,
            source_citation: row.get(2)?,
            is_default: row.get::<_, i64>(3)? != 0,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// The id of the current default curriculum version. `idx_one_default_curriculum_version`
/// structurally enforces at most one default row, but not at least one — a
/// zero-default state is schema-reachable (no production code path unsets
/// `is_default` today; only test fixtures do) and would surface here as
/// `QueryReturnedNoRows`, propagated as an error rather than silently
/// returning a wrong id.
pub fn default_version_id(conn: &Connection) -> AppResult<String> {
    conn.query_row(
        "SELECT id FROM curriculum_versions WHERE is_default = 1",
        [],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

/// Whether `id` resolves to a real curriculum version — curriculum versions
/// are global reference data, not tenant data, so there is nothing to leak
/// by checking existence alone (same reasoning `grading_policy_periods`/
/// `grading_weight_policies` ids already rely on in `grading::create`/
/// `class_record::create`).
pub fn version_exists(conn: &Connection, id: &str) -> AppResult<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM curriculum_versions WHERE id = ?1)",
        [id],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    #[test]
    fn list_versions_returns_both_seeded_versions_with_k_to_12_default_first() {
        let conn = open_test_db();

        let versions = list_versions(&conn).unwrap();

        assert_eq!(versions.len(), 2);
        assert!(versions[0].is_default);
        assert_eq!(versions[0].name, "K to 12 Basic Education Curriculum");
        assert!(versions.iter().any(|v| v.name == "MATATAG Curriculum" && !v.is_default));
    }

    #[test]
    fn default_version_id_resolves_to_the_k_to_12_curriculum() {
        let conn = open_test_db();

        let id = default_version_id(&conn).unwrap();

        let name: String = conn
            .query_row("SELECT name FROM curriculum_versions WHERE id = ?1", [&id], |r| r.get(0))
            .unwrap();
        assert_eq!(name, "K to 12 Basic Education Curriculum");
    }

    #[test]
    fn version_exists_is_true_for_a_seeded_version_and_false_for_an_unknown_id() {
        let conn = open_test_db();
        let matatag_id = list_versions(&conn)
            .unwrap()
            .into_iter()
            .find(|v| v.name == "MATATAG Curriculum")
            .unwrap()
            .id;

        assert!(version_exists(&conn, &matatag_id).unwrap());
        assert!(!version_exists(&conn, "does-not-exist").unwrap());
    }
}
