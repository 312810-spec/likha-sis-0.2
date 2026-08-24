# ADR-0009 — Local Section-Level SF2 Export & Reusable Official-Form Engine Foundation (M10)

Status: Accepted

## Context

M9 built the `Section`/`SectionMembership` foundation M8's real DepEd
source work had identified as the prerequisite for a genuine
section-level SF2 export. M10 (user-directed, not autonomously selected)
builds that export, plus a small reusable foundation so the next
official-form export doesn't start from zero.

Per `.claude/rules/testing.md`/the `deped-compliance` and `official-forms`
skills, a DepEd form's field layout is a compliance surface — it must
come from an authoritative source, not training-data assumption, and any
field that can't be verified must be omitted, never fabricated.

**Research method, and why it deviated from the usual `deped-researcher`
agent path.** This session's `security-reviewer` agent hit the same
agent-resume retrieval issue twice in a row immediately before this
milestone (confirmed real work via `ListAgents`, zero retrievable
findings both times — see `docs/ACTIVE-PLAN.md`'s M9 section). Rather
than spend another ~10 minutes on a `deped-researcher` agent very likely
to hit the identical harness bug, the research was done inline with
`WebSearch`/`WebFetch` directly in the main session — the same tools the
agent would have used, without the resume-retrieval failure point.

## Sources (triangulated, not single-sourced)

1. **DepEd Order No. 4, s. 2014** — "Adoption of the Modified School
   Forms (SFs) for Public Elementary and Secondary Schools Effective End
   of School Year 2013-2014," issued January 30, 2014 by Secretary Br.
   Armin A. Luistro FSC. The order that officially adopted SF-2 (Daily
   Attendance Report of Learners) among the seven modified school forms.
   Confirmed via [teacherph.com's summary of the order](https://www.teacherph.com/adoption-modified-school-forms-sfs-public-elementary-secondary-schools/).
2. **A real, in-use `CONSO SF v2025.xlsx` workbook**, inspected directly
   during M8 (structural facts only extracted; no real learner/school
   data was ever copied into this repo — see M8-DECISION.md "Update 2").
   Confirms: per-section-per-month sheet organization, school-day-only
   (Mon-Fri) per-day columns, and the legend blank=Present / x=Absent /
   half-shaded=Tardy (upper half=late comer, lower half=cutting classes).
3. **Two independent web sources** (depedph.com, teacherph.com's hosted
   SF2 PDF), fetched and cross-checked against each other and against
   source 2, above. Both independently corroborate the same per-day
   legend and add the header field list (School ID, School Year, School
   Name, Report for the Month of, Grade Level, Section, Learner's Name)
   and the footer/summary statistics block (enrollment counts, average
   daily attendance, drop-out/transfer-in/transfer-out by gender,
   5-consecutive-day-absence count, teacher/school-head signature block).

All three sources agree on the per-day coding and the section/month
organization — this is triangulated evidence, not a single unverifiable
claim.

## Decision

**Populate only what this schema can honestly support; disclose the rest
as a structured, machine-readable record — never fabricate.** A
`FieldDisclosure` struct (`populated_fields` + `omitted_fields`, each
omission carrying a stated reason) is computed once, in Rust, and is the
single source of truth for: (1) the trailing comment block in the CSV
file itself, and (2) the on-screen disclaimer text `MonthlySummaryScreen`
renders after an export. Both are rendered FROM the same struct returned
by the export command — they cannot silently drift from each other or
from what the file actually contains, which is exactly the failure mode
a hand-written, separately-maintained disclaimer (like M8's) is
vulnerable to.

**Omitted, explicitly, with reasons — not zero-filled:**

- **School ID (EBEIS)** — `schools` has no such column (unchanged since
  M8's finding; still only `id`/`name`/`created_at`).
- **Tardy subtype (late comer vs. cutting classes)** — M9 shipped and
  tested a single `Tardy` status; splitting it now would mean reworking
  code just verified for a distinction the data model never captured.
  Disclosed, not chased (see M9's ADR-0008 for the same reasoning
  applied there).
- **Remarks (free text per learner)** — not a field this app's
  attendance model has ever captured.
- **Enrollment/late-enrollment/registered-learner counts, Average Daily
  Attendance / Percentage of Attendance, drop-out/transfer-in/
  transfer-out by gender, 5-consecutive-day-absence count** — this is
  the single biggest reason zero-filling was rejected outright: this app
  does not track learner gender, drop-out events, or transfer events AT
  ALL. Emitting `0` for "drop outs this month" on a form a teacher might
  actually submit would be **fabricated data indistinguishable from a
  real zero**, not an honest gap — a real compliance risk, not merely an
  incomplete feature. Average Daily Attendance is technically derivable
  from data this app has, but DepEd's exact computation formula was not
  verified for this milestone, so it is omitted rather than guessed.
- **Signature of Teacher / Signature of School Head** — a physical/manual
  step, left for the teacher to complete after printing; not a data gap.

**Output format: CSV, not Excel/PDF, and zero new dependencies.** A
byte-exact `.xlsx` reproduction (merged cells, cell shading for the Tardy
half-shade, page layout) was explicitly rejected for this milestone —
this project's own sources (Update 2 above) never captured that level of
formatting detail, and attempting it would mean guessing at layout this
app cannot verify, which is exactly what the `official-forms` skill
prohibits. CSV opens in Excel/Sheets/any spreadsheet app, is trivially
diffable/testable, and needs no new Cargo/npm dependency at all.

**Save location: the user's Documents folder, not the app data
directory.** `app.path().document_dir()` (falling back to
`app_data_dir()` if unavailable) is part of Tauri's core path API — no
new plugin, no capability change. The alternative considered and
rejected — writing to `<app_data_dir>/exports/` alongside the encrypted
database under `%LOCALAPPDATA%\org.likhasis.app\` — was rejected because
a teacher cannot reasonably find or open a file there from a native
webview with no file-manager integration; `Documents\LIKHA-SIS\` is
somewhere a teacher can actually locate, open, and print from. A
user-directed "Save As" dialog (`tauri-plugin-dialog`) was considered and
deliberately deferred, not because it's undesirable, but to keep this
milestone's dependency footprint at zero; a fixed, predictable,
by-convention location is sufficient for a v1 export.

**The reusable "official-form engine" piece is the disclosure pattern
and the CSV writer, not a form-definition framework.** Two small,
genuinely reusable pieces: `export::csv` (RFC-4180-minimal escaping/row
building — no dependency, ~30 lines, fully unit tested) and the
`FieldDisclosure` pattern itself (every future official-form export —
SF1, Form 137/138 — should return one of these alongside its file
content). Deliberately NOT built: a generic form-definition/rendering
framework, a plugin system for form types, or a config-driven layout
engine — none of those are justified by exactly one form implemented so
far; building them now would be designing for a hypothetical second form
before it exists, which this project's own engineering rules explicitly
warn against.

## Consequences

- New: `src-tauri/src/export/{mod,csv,sf2}.rs`,
  `src-tauri/src/commands/export.rs`, `export_section_monthly_sf2`
  command. No new migration (pure read/format over existing `Section`/
  `MonthlyAttendanceReport` data). No new Cargo/npm dependency.
- New TS: `src/domain/export.ts`, `src/domain/ports/export-repository.ts`,
  `src/infrastructure/tauri/export-repository.ts`,
  `src/application/export-service.ts`. `MonthlySummaryScreen.tsx` gained
  an "Export SF2 (CSV)" button and a result panel rendering the saved
  path plus the full omitted-fields disclosure — no new screen, since the
  export is a natural extension of the screen that already shows exactly
  this data.
- `section_id` is client-supplied to `export_section_monthly_sf2`, the
  same legitimate pattern established in ADR-0008 for
  `attendance_roster_for_date`/`monthly_attendance_summary` — isolation
  holds because `section::find_by_id_in_school` resolves to `None` for a
  foreign section, and the command returns `Ok(None)` rather than any
  data. Verified: `tests/export.rs`'s
  `exporting_a_foreign_schools_section_returns_none_not_an_error` and
  `the_export_never_includes_another_schools_learners`.
- **Disclosed gap, not fixed**: `tests/export.rs` deliberately does not
  exercise the actual file-write side effect (`std::fs::write` to the
  resolved Documents/app-data directory) — that needs a real
  `tauri::AppHandle`, which these lighter-weight integration tests (the
  established pattern in this codebase — see `tests/attendance_management.rs`,
  `tests/learner_management.rs`) don't construct. Covered instead by
  relaunching the actual compiled `app.exe` (this project's standing
  precedent for verifying Tauri-boundary behavior beyond unit tests —
  see M5/M6/M7/M8/M9's "relaunched the compiled app.exe" verification
  steps) and by the `export::sf2` unit tests, which fully cover the CSV
  content that gets written.
- Not implemented (deliberately out of scope): a user-chosen save
  location (Save As dialog), Excel/PDF output, School ID field (schema
  gap, not an oversight), any of the omitted DepEd footer statistics,
  a form-definition framework for future forms beyond the `csv`/
  `FieldDisclosure` reusable pieces described above.

## Independent review — two should-fix findings, both fixed

A `security-reviewer` attempt (a fresh episode, not a repeat of the two
that failed under M9) hit the same agent-resume retrieval issue at
first, but a single resume-and-restate retry succeeded this time and
returned two real, actionable findings — neither blocking, both fixed
before this milestone was marked complete:

1. **CSV/formula injection** (`export::csv::escape_field`). Every field
   in this export ultimately traces back to teacher-entered data (a
   learner's family/given name, a section name) with no format
   restriction beyond "non-empty, reasonable length." A name like
   `=HYPERLINK("http://evil","click")` or `-2+3+cmd|'/c calc'!A1` would
   have been written to the CSV completely unescaped for the
   spreadsheet-formula meaning of a leading `=`/`+`/`-`/`@`/tab — the
   classic CSV-injection class (OWASP), executable the moment a teacher
   opens the exported file in Excel/Sheets/LibreOffice. Fixed:
   `escape_field` now prefixes a single quote (`'`) to any field
   starting with one of those characters — the standard mitigation,
   since every mainstream spreadsheet application renders a leading `'`
   as "treat this cell as literal text," neutralizing the formula
   without altering the field's actual content. A trigger character
   _inside_ a field (e.g. the hyphen in a surname like "Cruz-Santos") is
   correctly left alone — only a _leading_ character is dangerous.
2. **Unstripped `:` in the exported filename** (`commands::export`). The
   original filename sanitization stripped only spaces and slashes from
   `section.name` before embedding it in the output filename; `:` was
   not stripped, and on Windows/NTFS a colon is significant as a drive
   separator and, more subtly, as the alternate-data-stream separator —
   a section named e.g. `foo:bar` could have caused `std::fs::write` to
   target an ADS rather than a literal file. Fixed: replaced the
   ad hoc two-character strip with `export::sanitize_filename_component`,
   a new reusable helper (see `export/mod.rs`) that replaces the full
   Windows-reserved-character set (`< > : " / \ | ? *`) — deliberately
   placed in `export/mod.rs`, not `commands/export.rs`, so the next
   official-form export that builds a filename from teacher-entered data
   reuses it rather than re-deriving its own (possibly incomplete)
   denylist.

Re-verified after both fixes: `cargo test` 150/150 (108→115 lib tests,
7 new — 5 for the formula-injection fix, 3 for
`sanitize_filename_component`, one shared with an already-updated
existing test), `cargo clippy --all-targets -D warnings` clean.
`architecture-reviewer`/`teacher-ux-reviewer`/`accessibility-reviewer`
were not attempted for M10 — the review budget went to the one
security-reviewer episode above (which, unlike M9's two failed
episodes, did succeed on its retry) — still owed, same standing gap as
M7/M8/M9.
