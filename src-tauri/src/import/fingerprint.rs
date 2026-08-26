//! Content fingerprinting for accidental re-import detection (Wave 2E) —
//! advisory only, never a security/integrity control. See
//! `docs/adr/0043-sf1-bulk-import-engine.md`'s Wave 2E addendum.
//!
//! A SHA-256 digest of the file's raw bytes is used purely as a stable
//! content-identity signal so LIKHA can tell an adviser "you appear to have
//! imported this exact file before" — it says nothing about whether the
//! file is safe, well-formed, or malicious, and comparing/logging it never
//! touches the file's parsed learner data. `std`'s `DefaultHasher` was
//! deliberately not used here: its own documentation disclaims algorithm
//! stability across Rust releases and even between processes, which would
//! silently stop matching a fingerprint already persisted in SQLite after a
//! toolchain upgrade. SHA-256 is already resolved in this workspace's
//! dependency tree (see `Cargo.toml`), so this costs no new crate.

use std::path::Path;

use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};
use crate::import::workbook::MAX_FILE_BYTES;

/// Hex-encoded SHA-256 digest of `path`'s raw bytes. Reuses
/// `workbook::MAX_FILE_BYTES` as the same size guard `read_sf1_rows`
/// already applies — this never reads more of a hostile/oversized file
/// into memory than the parser itself would tolerate.
pub fn compute(path: &Path) -> AppResult<String> {
    let metadata = std::fs::metadata(path)
        .map_err(|_| AppError::Import("workbook file could not be read".to_string()))?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err(AppError::Import(
            "workbook file exceeds the maximum supported size".to_string(),
        ));
    }

    let bytes = std::fs::read(path)
        .map_err(|_| AppError::Import("workbook file could not be read".to_string()))?;
    let digest = Sha256::digest(&bytes);
    Ok(hex_encode(&digest))
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

/// The file's own name only (never the full path, which on this project's
/// shared-computer deployment model can embed a Windows profile
/// username) — falls back to a fixed placeholder for the pathological case
/// of a path with no final component.
///
/// Deliberately does not delegate to `std::path::Path::file_name()`: that
/// method's separator handling is platform-dependent (it only treats `\`
/// as a separator when *compiled* for Windows), but this project's CI
/// runs the same test suite on an Ubuntu runner too (see ADR-0041) — a
/// path a real Windows deployment produces (backslash-separated) would
/// silently fail to split there even though the app itself is
/// Windows-only. Splitting on both `/` and `\` explicitly makes this
/// function's behavior deterministic regardless of the host compiling
/// or running the test, not just the target the real app ships for.
pub fn safe_filename(path: &Path) -> String {
    let raw = path.to_string_lossy();
    match raw.rfind(['/', '\\']) {
        Some(index) if index + 1 < raw.len() => raw[index + 1..].to_string(),
        Some(_) => "unknown-file".to_string(),
        None if raw.is_empty() => "unknown-file".to_string(),
        None => raw.into_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_temp(bytes: &[u8]) -> tempfile::NamedTempFile {
        let mut f = tempfile::NamedTempFile::new().unwrap();
        f.write_all(bytes).unwrap();
        f.flush().unwrap();
        f
    }

    #[test]
    fn identical_content_produces_the_same_fingerprint_regardless_of_filename() {
        let a = write_temp(b"same synthetic content");
        let b = write_temp(b"same synthetic content");

        assert_eq!(compute(a.path()).unwrap(), compute(b.path()).unwrap());
    }

    #[test]
    fn different_content_produces_different_fingerprints_even_with_the_same_extension() {
        let a = write_temp(b"synthetic content one");
        let b = write_temp(b"synthetic content two, different");

        assert_ne!(compute(a.path()).unwrap(), compute(b.path()).unwrap());
    }

    #[test]
    fn a_single_byte_difference_changes_the_fingerprint() {
        let a = write_temp(b"synthetic content");
        let b = write_temp(b"Synthetic content");

        assert_ne!(compute(a.path()).unwrap(), compute(b.path()).unwrap());
    }

    #[test]
    fn safe_filename_returns_only_the_final_path_component_for_a_windows_style_path() {
        let path = Path::new("C:\\Users\\some.teacher\\Downloads\\sf1_grade1.xlsx");
        assert_eq!(safe_filename(path), "sf1_grade1.xlsx");
    }

    /// This project's own toolchain is Windows-only, but its CI test
    /// suite also runs on an Ubuntu runner (see ADR-0041) -- proving a
    /// forward-slash path splits correctly too guards against this
    /// function silently regressing into `std::path::Path::file_name()`'s
    /// platform-dependent separator handling, which is exactly what broke
    /// the Windows-style-path test above the first time it ran there.
    #[test]
    fn safe_filename_returns_only_the_final_path_component_for_a_forward_slash_path() {
        let path = Path::new("/home/some-teacher/Downloads/sf1_grade1.xlsx");
        assert_eq!(safe_filename(path), "sf1_grade1.xlsx");
    }

    #[test]
    fn safe_filename_falls_back_to_a_placeholder_for_a_trailing_separator() {
        let path = Path::new("C:\\Users\\some.teacher\\Downloads\\");
        assert_eq!(safe_filename(path), "unknown-file");
    }

    #[test]
    fn compute_fails_closed_for_a_missing_file() {
        let result = compute(Path::new("this/path/does/not/exist.xlsx"));
        assert!(result.is_err());
    }
}
