//! Exact local readiness inputs. Not official-source verification or approval.
use rusqlite::{Connection, ToSql};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};
use crate::repository::report_readiness::ReportCardReadiness;

pub(crate) const VERSION: &str = "report-card-readiness-source-v2";

pub(crate) fn hash(content: &str) -> String {
    Sha256::digest(content.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn rows(conn: &Connection, sql: &str, parameters: &[&dyn ToSql]) -> AppResult<Vec<Value>> {
    let mut stmt = conn.prepare(sql)?;
    let columns = stmt.column_count();
    let rows = stmt.query_map(parameters, |row| {
        let mut values = Vec::with_capacity(columns);
        for column in 0..columns {
            let value: rusqlite::types::Value = row.get(column)?;
            values.push(match value {
                rusqlite::types::Value::Null => Value::Null,
                rusqlite::types::Value::Integer(value) => serde_json::json!({"integer": value}),
                rusqlite::types::Value::Real(value) => {
                    serde_json::json!({"realBits": format!("{:016x}", value.to_bits())})
                }
                rusqlite::types::Value::Text(value) => serde_json::json!({"text": value}),
                rusqlite::types::Value::Blob(value) => serde_json::json!({"blob": value}),
            });
        }
        Ok(Value::Array(values))
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Exact implementation identity, conservatively including tests/comments.
/// A code-only change cannot silently keep an old draft's source fingerprint valid.
fn implementation_hash() -> String {
    let mut digest = Sha256::new();
    for (name, content) in [
        ("grading", include_str!("grading_computation.rs")),
        ("readiness", include_str!("report_readiness.rs")),
        ("class_record", include_str!("class_record.rs")),
        ("roster", include_str!("section_membership.rs")),
        ("disclosure", include_str!("../export/report_card.rs")),
        ("source_collector", include_str!("report_source_lock.rs")),
        ("schema", include_str!("../db/migrations.rs")),
        ("native_dependencies", include_str!("../../Cargo.lock")),
    ] {
        digest.update(name.as_bytes());
        digest.update([0u8]);
        digest.update(content.as_bytes());
        digest.update([0u8]);
    }
    digest
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// Caller must authorize and read this inside the same database transaction as
/// the projection. Raw values remain encrypted locally, never returned over IPC.
pub(crate) fn capture_json(
    conn: &Connection,
    school_id: &str,
    preview: &ReportCardReadiness,
) -> AppResult<String> {
    let record_id = preview.class_record_id.as_str();
    let context = rows(
        conn,
        "SELECT cr.id, cr.school_id, s.name, sec.id, sec.name, sec.grade_level, sec.school_year, \
         sub.id, sub.name, gp.id, gp.school_year, gp.starts_on, gp.ends_on, \
         pp.id, pp.label, pp.sequence, cr.weight_policy_id, cr.curriculum_version_id \
         FROM class_records cr JOIN schools s ON s.id = cr.school_id \
         JOIN sections sec ON sec.id = cr.section_id AND sec.school_id = cr.school_id \
         JOIN subjects sub ON sub.id = cr.subject_id AND sub.school_id = cr.school_id \
         JOIN grading_periods gp ON gp.id = cr.grading_period_id AND gp.school_id = cr.school_id \
         JOIN grading_policy_periods pp ON pp.id = gp.policy_period_id \
         WHERE cr.school_id = ?1 AND cr.id = ?2 ORDER BY cr.id",
        &[&school_id, &record_id],
    )?;
    let memberships = rows(
        conn,
        "SELECT sm.id, l.id, sm.starts_on, sm.ends_on, l.given_name, l.family_name, l.lrn, l.sex \
         FROM class_records cr JOIN grading_periods gp \
         ON gp.id = cr.grading_period_id AND gp.school_id = cr.school_id \
         JOIN section_memberships sm ON sm.section_id = cr.section_id AND sm.school_id = cr.school_id \
         JOIN learners l ON l.id = sm.learner_id AND l.school_id = cr.school_id \
         WHERE cr.school_id = ?1 AND cr.id = ?2 AND sm.starts_on <= gp.ends_on \
         AND (sm.ends_on IS NULL OR gp.starts_on < sm.ends_on) ORDER BY sm.id",
        &[&school_id, &record_id],
    )?;
    let items = rows(
        conn,
        "SELECT id, category_id, name, max_score FROM assessment_items \
         WHERE school_id = ?1 AND class_record_id = ?2 ORDER BY id",
        &[&school_id, &record_id],
    )?;
    let scores = rows(
        conn,
        "SELECT ls.id, ls.assessment_item_id, ls.learner_id, ls.status, ls.score, \
         ls.recorded_by_user_id, ls.recorded_at, ls.updated_at \
         FROM learner_scores ls JOIN assessment_items ai ON ai.id = ls.assessment_item_id \
         JOIN learners l ON l.id = ls.learner_id AND l.school_id = ls.school_id \
         WHERE ls.school_id = ?1 AND ai.school_id = ?1 AND ai.class_record_id = ?2 ORDER BY ls.id",
        &[&school_id, &record_id],
    )?;
    let policy = rows(
        conn,
        "SELECT id, name, source_citation, is_default \
         FROM grading_weight_policies WHERE id = ?1 ORDER BY id",
        &[&preview.weight_policy_id],
    )?;
    // Pin only the applicable reference. A default change must not invalidate
    // a record that already pins its own version; legacy NULL records resolve
    // the current default explicitly rather than omitting curriculum evidence.
    let curriculum = rows(
        conn,
        "SELECT cv.id, cv.name, cv.source_citation FROM class_records cr \
         JOIN curriculum_versions cv ON cv.id = COALESCE(cr.curriculum_version_id, \
         (SELECT id FROM curriculum_versions WHERE is_default = 1)) \
         WHERE cr.school_id = ?1 AND cr.id = ?2 ORDER BY cv.id",
        &[&school_id, &record_id],
    )?;
    let weights = rows(
        conn,
        "SELECT wc.id, ac.id, wc.weight_percent, ac.parent_category_id, ac.name, \
         ac.sequence, ac.set_id, cs.name, cs.source_citation \
         FROM grading_weight_components wc JOIN assessment_categories ac ON ac.id = wc.category_id \
         JOIN assessment_category_sets cs ON cs.id = ac.set_id \
         WHERE wc.policy_id = ?1 ORDER BY wc.id",
        &[&preview.weight_policy_id],
    )?;
    let mut projection = serde_json::to_value(preview)
        .map_err(|_| AppError::Validation("Reporting projection could not be serialized".into()))?;
    if let Some(object) = projection.as_object_mut() {
        object.remove("checkedAt");
    }
    serde_json::to_string(&serde_json::json!({
        "version": VERSION, "implementationSha256": implementation_hash(),
        "schoolId": school_id, "classRecordId": record_id, "context": context,
        "memberships": memberships, "items": items, "scores": scores,
        "policy": policy, "curriculum": curriculum,
        "weights": weights, "projection": projection
    }))
    .map_err(|_| AppError::Validation("Reporting source input could not be serialized".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_values_preserve_sql_types_and_every_float_bit() {
        let conn = Connection::open_in_memory().unwrap();
        let first = 1.0f64;
        let next = f64::from_bits(first.to_bits() + 1);
        let first = rows(&conn, "SELECT ?1", &[&first]).unwrap();
        let next = rows(&conn, "SELECT ?1", &[&next]).unwrap();
        assert_ne!(first, next);
        assert_ne!(
            rows(&conn, "SELECT 1", &[]).unwrap(),
            rows(&conn, "SELECT '1'", &[]).unwrap()
        );
        assert_eq!(
            rows(&conn, "SELECT NULL", &[]).unwrap(),
            vec![serde_json::json!([null])]
        );
        assert_eq!(implementation_hash(), implementation_hash());
        assert_eq!(implementation_hash().len(), 64);
    }
}
