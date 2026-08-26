//! PSGC (PSA Philippine Standard Geographic Code) reference-data snapshot
//! parsing and validation — Wave 2G. See
//! `docs/adr/0047-psgc-reference-data-foundation.md`.
//!
//! The input file format here is this project's OWN structural
//! assumption, not a verified copy of any PSA-published schema — PSA's
//! own API site returned HTTP 403 from this development environment and
//! could not be inspected (see the ADR's disclosed limitation). This
//! module is the one place that assumption lives; nothing downstream of
//! `repository::reference_geo` knows or cares what the source file looked
//! like. Treat every field as untrusted external input: bounded parsing,
//! explicit validation, no silent coercion.

use serde::Deserialize;

use crate::error::{AppError, AppResult};

/// Hard ceiling on how many units a single snapshot file may declare.
/// PSA's full barangay-level PSGC is on the order of 42,000 rows; this
/// generously bounds well above that so a malformed/hostile file cannot
/// force an unbounded parse/allocation.
const MAX_UNITS: usize = 100_000;

/// The only `source_name` this project's PSGC import path accepts.
/// `repository::reference_geo`'s read commands look up "the current PSGC
/// snapshot" by this exact string (see `commands::reference_geo`) — an
/// import whose file declared any other spelling would previously
/// commit successfully but become permanently invisible to every read
/// (a blocking finding from Wave 2G's independent review). Constraining
/// it to one known constant here, rather than accepting arbitrary
/// caller-declared text, closes that gap at the one place untrusted
/// input enters this system.
pub const EXPECTED_SOURCE_NAME: &str = "PSA PSGC";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum GeoLevel {
    Region,
    Province,
    CityMunicipality,
    Barangay,
}

impl GeoLevel {
    pub fn as_db_str(self) -> &'static str {
        match self {
            GeoLevel::Region => "region",
            GeoLevel::Province => "province",
            GeoLevel::CityMunicipality => "city_municipality",
            GeoLevel::Barangay => "barangay",
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PsgcUnitInput {
    code: String,
    name: String,
    level: GeoLevel,
    #[serde(default)]
    parent_code: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PsgcSnapshotFile {
    source_name: String,
    version: String,
    #[serde(default)]
    published_at: Option<String>,
    units: Vec<PsgcUnitInput>,
}

/// One validated reference-geography unit, ready to insert. `level`-sorted
/// order within `PsgcSnapshot::units` is what lets the repository insert
/// every row's parent before the row itself, satisfying the self-referencing
/// `(snapshot_id, parent_code) -> (snapshot_id, code)` foreign key without a
/// full topological sort — PSGC is a strict 4-level tree, so sorting by
/// level alone is sufficient (a unit's parent is always exactly one level
/// above it, never a sibling).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PsgcUnit {
    pub code: String,
    pub name: String,
    pub level: &'static str,
    pub parent_code: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PsgcSnapshot {
    pub source_name: String,
    pub authoritative_version: String,
    pub authoritative_published_at: Option<String>,
    pub units: Vec<PsgcUnit>,
}

/// Parses and validates a PSGC snapshot file's raw bytes. Rejects the
/// whole file (no partial/best-effort result) on any structural problem —
/// malformed JSON, missing version/source, an empty unit list, an
/// out-of-range unit count, a duplicate code, or a `parent_code` that
/// does not match any declared unit's `code`. Never guesses a fallback
/// value for a missing/invalid field.
pub fn parse_and_validate(bytes: &[u8]) -> AppResult<PsgcSnapshot> {
    // The underlying parser's error text is never surfaced to the caller
    // — matching this project's established convention (see
    // `AppError::Import`'s own doc comment) of never exposing a
    // third-party library's raw error/detail text through this variant.
    let file: PsgcSnapshotFile = serde_json::from_slice(bytes).map_err(|e| {
        log::warn!("PSGC snapshot file failed to parse: {e}");
        AppError::Import(
            "this file is not a recognized PSGC snapshot file (it may be malformed, or use a \
             geographic level LIKHA doesn't recognize yet)"
                .to_string(),
        )
    })?;

    let source_name = file.source_name.trim().to_string();
    if source_name != EXPECTED_SOURCE_NAME {
        return Err(AppError::Import(format!(
            "this file's source name is not recognized (expected \"{EXPECTED_SOURCE_NAME}\")"
        )));
    }

    let authoritative_version = file.version.trim().to_string();
    if authoritative_version.is_empty() {
        return Err(AppError::Import(
            "the snapshot file declares no authoritative version".to_string(),
        ));
    }

    let authoritative_published_at = file
        .published_at
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    if file.units.is_empty() {
        return Err(AppError::Import(
            "the snapshot file has no geographic units".to_string(),
        ));
    }
    if file.units.len() > MAX_UNITS {
        return Err(AppError::Import(format!(
            "the snapshot file declares {} units, exceeding the {MAX_UNITS} limit",
            file.units.len()
        )));
    }

    let mut units: Vec<PsgcUnit> = Vec::with_capacity(file.units.len());
    let mut seen_codes = std::collections::HashSet::with_capacity(file.units.len());

    for raw in &file.units {
        let code = raw.code.trim().to_string();
        let name = raw.name.trim().to_string();
        if code.is_empty() || name.is_empty() {
            return Err(AppError::Import(
                "a unit is missing a code or name".to_string(),
            ));
        }
        if !seen_codes.insert(code.clone()) {
            return Err(AppError::Import(format!(
                "duplicate geographic code in snapshot: {code}"
            )));
        }
        let parent_code = raw
            .parent_code
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        units.push(PsgcUnit {
            code,
            name,
            level: raw.level.as_db_str(),
            parent_code,
        });
    }

    // Every declared parent_code must resolve to a code that actually
    // exists in this same file. A region's `parent_code` is expected to
    // be absent (top of the hierarchy); anything else with a dangling
    // parent is rejected here rather than deferred to the database's own
    // foreign key, so the caller gets one clear message instead of a raw
    // constraint-violation error.
    let levels_by_code: std::collections::HashMap<&str, u8> = units
        .iter()
        .map(|u| (u.code.as_str(), level_rank(u.level)))
        .collect();
    for unit in &units {
        if let Some(parent) = &unit.parent_code {
            match levels_by_code.get(parent.as_str()) {
                None => {
                    return Err(AppError::Import(format!(
                        "unit {} declares parent code {parent}, which does not exist in this snapshot",
                        unit.code
                    )));
                }
                // A parent must be exactly one level above its child.
                // Without this check, a malformed file with a same-level
                // (or otherwise wrong-level) parent/child pair would be
                // accepted or rejected depending only on incidental row
                // order in the source file (whether the "child" happens
                // to appear before or after its same-level "parent"),
                // since the level-sort below is a stable sort and the
                // self-referencing database foreign key only checks that
                // SOME row with that code exists in the snapshot, not
                // that it's the right level. Checked here, deterministic
                // rejection regardless of file order — a Wave 2G
                // independent-review finding.
                Some(&parent_rank) if parent_rank + 1 != level_rank(unit.level) => {
                    return Err(AppError::Import(format!(
                        "unit {} (level {}) declares parent code {parent}, which is not exactly \
                         one level above it",
                        unit.code, unit.level
                    )));
                }
                Some(_) => {}
            }
        }
    }

    units.sort_by_key(|u| level_rank(u.level));

    Ok(PsgcSnapshot {
        source_name,
        authoritative_version,
        authoritative_published_at,
        units,
    })
}

fn level_rank(level: &str) -> u8 {
    match level {
        "region" => 0,
        "province" => 1,
        "city_municipality" => 2,
        "barangay" => 3,
        _ => 4,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(units_json: &str) -> Vec<u8> {
        format!(
            r#"{{"sourceName":"PSA PSGC","version":"2026Q2-fixture","publishedAt":"2026-04-01","units":[{units_json}]}}"#
        )
        .into_bytes()
    }

    #[test]
    fn parses_a_minimal_valid_snapshot() {
        let bytes = fixture(
            r#"{"code":"01","name":"Region I","level":"region"},
               {"code":"0101","name":"Ilocos Norte","level":"province","parentCode":"01"}"#,
        );
        let snapshot = parse_and_validate(&bytes).unwrap();
        assert_eq!(snapshot.source_name, "PSA PSGC");
        assert_eq!(snapshot.authoritative_version, "2026Q2-fixture");
        assert_eq!(
            snapshot.authoritative_published_at.as_deref(),
            Some("2026-04-01")
        );
        assert_eq!(snapshot.units.len(), 2);
        // Region must sort before its province (level-sorted for
        // parent-before-child insert order).
        assert_eq!(snapshot.units[0].level, "region");
        assert_eq!(snapshot.units[1].level, "province");
    }

    #[test]
    fn sorts_units_by_level_regardless_of_input_order() {
        let bytes = fixture(
            r#"{"code":"01010101","name":"A Barangay","level":"barangay","parentCode":"010101"},
               {"code":"010101","name":"Laoag City","level":"city_municipality","parentCode":"0101"},
               {"code":"0101","name":"Ilocos Norte","level":"province","parentCode":"01"},
               {"code":"01","name":"Region I","level":"region"}"#,
        );
        let snapshot = parse_and_validate(&bytes).unwrap();
        let levels: Vec<&str> = snapshot.units.iter().map(|u| u.level).collect();
        assert_eq!(
            levels,
            vec!["region", "province", "city_municipality", "barangay"]
        );
    }

    #[test]
    fn rejects_malformed_json() {
        let result = parse_and_validate(b"not json at all");
        assert!(result.is_err());
    }

    #[test]
    fn rejects_a_missing_version() {
        let bytes =
            br#"{"sourceName":"PSA PSGC","version":"","units":[{"code":"01","name":"Region I","level":"region"}]}"#;
        let result = parse_and_validate(bytes);
        assert!(result.is_err());
    }

    #[test]
    fn rejects_an_empty_unit_list() {
        let bytes = br#"{"sourceName":"PSA PSGC","version":"2026Q2","units":[]}"#;
        let result = parse_and_validate(bytes);
        assert!(result.is_err());
    }

    #[test]
    fn rejects_a_duplicate_code() {
        let bytes = fixture(
            r#"{"code":"01","name":"Region I","level":"region"},
               {"code":"01","name":"Region I Duplicate","level":"region"}"#,
        );
        let result = parse_and_validate(&bytes);
        assert!(result.is_err());
    }

    #[test]
    fn rejects_a_dangling_parent_code() {
        let bytes = fixture(
            r#"{"code":"0101","name":"Ilocos Norte","level":"province","parentCode":"99"}"#,
        );
        let result = parse_and_validate(&bytes);
        assert!(result.is_err());
    }

    #[test]
    fn rejects_an_unrecognized_source_name() {
        let bytes = br#"{"sourceName":"PSA PSGC 2026Q2","version":"2026Q2","units":[{"code":"01","name":"Region I","level":"region"}]}"#;
        let result = parse_and_validate(bytes);
        assert!(
            result.is_err(),
            "a source name other than the exact expected constant must be rejected, not \
             silently accepted and later made invisible to reads"
        );
    }

    #[test]
    fn rejects_a_parent_that_is_not_exactly_one_level_above_its_child() {
        // Two regions, one incorrectly declared as the other's parent —
        // same level, not the required one-level-above relationship.
        // Must be rejected regardless of which one appears first in the
        // file (this ordering is the child-appears-after-parent case,
        // which the self-referencing DB foreign key alone would NOT
        // catch, since both codes already exist by insert time).
        let bytes = fixture(
            r#"{"code":"01","name":"Region I","level":"region"},
               {"code":"02","name":"Region II","level":"region","parentCode":"01"}"#,
        );
        let result = parse_and_validate(&bytes);
        assert!(
            result.is_err(),
            "a same-level parent/child pair must be rejected deterministically, \
             not only when file order happens to place the child first"
        );
    }

    #[test]
    fn rejects_a_unit_with_a_blank_code_or_name() {
        let bytes = fixture(r#"{"code":"  ","name":"Region I","level":"region"}"#);
        let result = parse_and_validate(&bytes);
        assert!(result.is_err());
    }
}
