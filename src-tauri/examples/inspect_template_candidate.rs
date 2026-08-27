//! Template-intake evidence tool — Wave 2K. See
//! `docs/adr/0051-official-form-template-evidence-registry.md`.
//!
//! Prints a structural-evidence manifest for one candidate spreadsheet
//! file. The suggested classification it prints uses the real
//! `formgen::evidence::{ProvenanceState, FidelityState}` enum values
//! (not hardcoded strings), so a renamed/removed variant fails to
//! compile here instead of silently drifting — the rest of the manifest
//! (hash, size, sheet names) describes the candidate FILE itself, which
//! has no `TemplateEvidence` yet to format. This tool GATHERS EVIDENCE
//! ONLY —
//! per the Wave 2K directive, it never writes to the source tree, never
//! registers a `TemplateDescriptor`/`TemplateEvidence`, and never assigns
//! a `ProvenanceState` beyond a suggested starting point a human must
//! review. No arbitrary downloaded spreadsheet becomes a production
//! template merely by being placed in a folder and run through this.
//!
//! Usage:
//!
//! ```text
//! cargo run --example inspect_template_candidate -- <path-to-candidate.xlsx>
//! ```
//!
//! Safety posture (see the module doc comment on why): this tool never
//! fetches a URL itself — the candidate file must already exist locally,
//! placed there by a human who obtained it directly from a trusted
//! source. It refuses a file above a fixed size cap before attempting to
//! parse it (zip-bomb/oversized-file defense-in-depth; `umya-spreadsheet`
//! itself is not hardened against adversarial input), and reports a
//! parse failure as a plain evidence gap rather than panicking.

use std::env;
use std::fs;
use std::path::Path;
use std::process::ExitCode;

use app_lib::formgen::evidence::{FidelityState, ProvenanceState};
use sha2::{Digest, Sha256};

/// Refuse to even attempt parsing a candidate above this size. Real
/// DepEd School Form workbooks (SF1/SF9/SF10) are simple tabular
/// spreadsheets, not multi-hundred-sheet workbooks — a legitimate
/// candidate has no reason to approach this. Chosen generously above the
/// largest real template this project has ever handled while still
/// ruling out an obvious zip-bomb-style upload.
const MAX_CANDIDATE_BYTES: u64 = 25 * 1024 * 1024;

fn main() -> ExitCode {
    let mut args = env::args();
    let _bin = args.next();
    let Some(path_arg) = args.next() else {
        eprintln!("usage: inspect_template_candidate <path-to-candidate.xlsx>");
        return ExitCode::FAILURE;
    };
    let path = Path::new(&path_arg);

    // Only the filename (not the full absolute path) is echoed into the
    // report below -- an absolute path is machine-specific and, per
    // `TemplateEvidence`'s doc comment, never durable identity.
    let original_filename = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();

    let metadata = match fs::metadata(path) {
        Ok(m) => m,
        Err(err) => {
            eprintln!("cannot read candidate file metadata: {err}");
            return ExitCode::FAILURE;
        }
    };

    if metadata.len() > MAX_CANDIDATE_BYTES {
        eprintln!(
            "REFUSED: candidate is {} bytes, over the {} byte intake cap; a real DepEd School \
             Form template has no reason to be this large — refusing to parse it \
             (zip-bomb/oversized-file defense)",
            metadata.len(),
            MAX_CANDIDATE_BYTES
        );
        return ExitCode::FAILURE;
    }

    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(err) => {
            eprintln!("cannot read candidate file: {err}");
            return ExitCode::FAILURE;
        }
    };

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let sha256: String = hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();

    println!("Template candidate evidence manifest");
    println!("  Original filename: {original_filename}");
    println!("  Size (bytes):      {}", metadata.len());
    println!("  SHA-256:           {sha256}");

    match umya_spreadsheet::reader::xlsx::read(path) {
        Ok(book) => {
            let sheet_names: Vec<String> = book
                .sheet_collection()
                .iter()
                .map(|s| s.name().to_string())
                .collect();
            println!("  Workbook format:   Xlsx (parsed successfully)");
            println!("  Sheet names:       {}", sheet_names.join(", "));
            for name in &sheet_names {
                if let Ok(sheet) = book.sheet_by_name(name) {
                    let merges = sheet.merge_cells().len();
                    println!("    [{name}] merged-cell ranges: {merges}");
                }
            }
        }
        Err(err) => {
            println!("  Workbook format:   UNKNOWN — parse failed: {err}");
            println!(
                "  Note: a parse failure is recorded as an evidence gap, not treated as proof \
                 the file is a legacy .xls or otherwise unsupported format."
            );
        }
    }

    // Printed via the real enum values (not hardcoded strings) so this
    // tool cannot silently drift from `formgen::evidence`'s actual
    // variant names — a stale/renamed variant here would be a compile
    // error, not a silent text mismatch (independent review, Wave 2K).
    let suggested_provenance = ProvenanceState::CandidateUnverified;
    let suggested_fidelity = FidelityState::NotVerified;

    println!();
    println!("Suggested starting classification (a human must review and confirm this, this");
    println!("tool never registers a TemplateDescriptor/TemplateEvidence on its own):");
    println!("  ProvenanceState::{suggested_provenance:?}");
    println!("  FidelityState::{suggested_fidelity:?}");
    println!();
    println!(
        "Next step: if this candidate is confirmed to originate from an official DepEd \
         source, record its source organization, URL, retrieval date, and the specific DepEd \
         Order/Memorandum that establishes it, then call \
         formgen::evidence::confirm_authoritative_source with that citation before promoting \
         its ProvenanceState."
    );

    ExitCode::SUCCESS
}
