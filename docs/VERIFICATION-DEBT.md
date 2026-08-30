# Verification Debt

## Wave 5 Cloud Sync Target: live round trip blocked on external Cloudflare credentials (2026-08-29)

`docs/adr/0042-cloud-sync-target-decision.md` completed the required
10-scenario cloud-target architecture decision (Cloudflare Workers +
Durable Object per school). It did **not** attempt Wave 5's other
stated deliverable, "one real end-to-end sync round trip"
(`PRODUCT-CONTRACT.md` §15) — confirmed genuinely blocked, not merely
deferred: `env | grep -i cloudflare` found no credentials in this
session's environment, and no Cloudflare account/API token/`wrangler`
config exists anywhere in this repository. Provisioning a live
Cloudflare account under the user's identity is external material only
the user can provide (`.claude/rules/autonomous-development.md`
approval gate #2), even though the target architecture itself is
zero-cost. **Resolution**: the next session with real Cloudflare
account access should deploy a minimal Worker + one Durable Object,
implement the `SyncProvider` port's TS/Rust halves per ADR-0042's
field-scoped audited-LWW design, and prove one real record's round
trip end to end. Also still owed from the same Wave 5 objective:
`PRODUCT-CONTRACT.md` §13's offline-session/re-authentication window
needs an actual `security-reviewer` pass, not a default number — not
blocked on credentials, genuinely still open, separate from the sync
round trip.

## Integration Review + Main Fast-Forward: cross-milestone `architecture-reviewer` retrieval failure, self-review substituted (2026-08-26)

`architecture-reviewer` was dispatched for a narrow cross-milestone
question (does every command RBAC should gate, added after RBAC
landed — specifically Teacher Load's `commands::teaching_assignment.rs`
— actually route through it consistently; any accidental
curriculum/class-record/teacher-load concept duplication; migration
chain safety; leftover debug artifacts). It completed real work (30
tool uses, ~84-89K tokens across two attempts) but returned no
retrievable findings text on the initial dispatch or the one permitted
retry — the same recurring agent-resume/retrieval failure documented
since M7. A rigorous self-review was substituted:

- Read `src-tauri/src/commands/teaching_assignment.rs` directly, all 8
  commands: `create_teaching_assignment`/`replace_teacher_assignment`/
  `remove_teaching_assignment`/`create_schedule_meeting` gated via
  `auth::authorize_capability(Capability::ManageTeachingAssignments)`;
  `list_teacher_assignments`/`get_teacher_load`/
  `list_schedule_meetings_by_assignment` gated via
  `auth::authorize_view_teacher_load`; `list_teaching_assignments_by_section`
  intentionally open (reference data, matching `list_learners_by_school`'s
  established convention, documented inline). The previously-fixed
  cross-teacher schedule leak in `list_schedule_meetings_by_assignment`
  (closed by the RBAC Foundation `security-reviewer` review, see below)
  reconfirmed still present and correct — no regression.
- Read `authorize_view_teacher_load`/`authorize_capability` themselves
  (`src-tauri/src/auth/mod.rs:430-473`): both session-derived only, both
  do a fresh (non-cached) role lookup on every call, both fail closed.
- `node scripts/check-architecture.mjs` — PASS, zero restricted
  imports, across the whole delta.
- Migration chain (`src-tauri/src/db/migrations.rs`): `main` had 15
  `M::up(...)` entries, this branch has 18 — diffed and confirmed the
  3 new ones (16 RBAC, 17 Curriculum, 18 Teacher Load) are pure
  appends, no existing migration reordered or altered.
- `git diff main...HEAD -- src-tauri/Cargo.lock` — empty; zero
  dependency drift across all 30 commits.
- Curriculum/class-record/teacher-load conceptual model: `teaching_assignments`
  (who teaches what, year-long), `class_records` (term-scoped grading,
  carries `curriculum_version_id`), `curriculum_versions` (which
  curriculum content applies) — three genuinely separate concepts per
  ADR-0037/ADR-0039's own explicit "deliberately not linked" reasoning,
  re-confirmed by direct schema read, not just cited.

**No BLOCKING or SHOULD-FIX findings.** Real, non-self independent-review
debt for this specific cross-milestone integration-delta question
remains open — re-run `architecture-reviewer` once agent-resume
behavior is confirmed reliably working in a future session.

## Minimal CI Foundation: no CI configuration debt closed (2026-08-26)

The "no CI configuration exists yet" line carried in the entry below
this one (and in the Rust Formatting entry) is now **closed**. Full
decision record: `docs/adr/0041-minimal-ci-foundation.md`.
`.github/workflows/quality.yml` runs `npm run quality:full` verbatim
(the same canonical command a developer runs locally) on
`ubuntu-latest` and `windows-latest`, on `push`/`pull_request`/
`workflow_dispatch`, with `permissions: contents: read` only and no
secrets.

**Actually executed on GitHub Actions, not just written**: first real
run (32915080360) genuinely failed on the Ubuntu job — a real,
diagnosed environment gap, not a product defect: `ubuntu-latest`
doesn't ship the GTK/glib system libraries (`libwebkit2gtk-4.1-dev`
and friends) Tauri's Linux webview backend needs at compile time, so
`gobject-sys`/`glib-sys` failed their `pkg-config` build scripts. The
_same run_'s Windows job **passed** `npm run quality:full` end-to-end
on the first attempt, proving the workflow design itself was sound —
only the Ubuntu job's system-dependency list was incomplete. Fixed by
adding the exact `apt-get install` package list from Tauri's own
official prerequisites page (`v2.tauri.app/start/prerequisites/`,
fetched and quoted directly, not from memory or a blog). Re-pushed;
run 32916282825 is **green on both jobs** — Ubuntu `success` in
6m9s, Windows `success` in 17m17s, both real, both actually run, not
claimed.

**A second, genuine gate finding, caught by the same CI, not by
CI misconfiguration**: the docs-only commit recording this milestone's
own checkpoint (`ca4d40a`) itself failed `npm run quality:full` on
_both_ jobs — `prettier --check .` (part of `npm run quality`, which
`quality:full` runs first) flagged the newly-written/edited Markdown
files (this ADR, `CURRENT-HANDOFF.md`, `SOURCE-REGISTRY.md`,
`VERIFICATION-DEBT.md`) as not Prettier-formatted. This was a real gap
in this session's own process (docs edits were not run through the
local quality gate before pushing, unlike the code changes earlier in
this milestone) — not a CI configuration defect, and not weakened or
skipped: fixed with `npx prettier --write` on the four files, `npm run
quality:full` re-run clean locally before re-pushing, then reconfirmed
green on GitHub Actions (run recorded below).

Final confirmation run (32917911205, after the formatting fix) is also
**green on both jobs** — Ubuntu `success` in 7m18s, Windows `success`
in 17m41s.

**Debt closed**: no CI configuration existed → now exists and is
proven green on both target platforms with real evidence, including
two genuine findings caught and fixed by the CI itself (the Ubuntu
system-dependency gap, and this session's own docs-formatting gap) —
exactly the kind of finding a verification foundation exists to
surface, not something to be embarrassed by. **New, disclosed
limitations, not blocking this milestone's completion**: no caching
configured yet (deliberately deferred — first workflow kept simple per
this milestone's own scope discipline; revisit if runtime grows);
Android CI remains out of scope (a future extension, not a gap at this
milestone); a full `tauri build` installer/bundle step was evaluated
and deferred to a future release-workflow milestone, not this
verification-foundation one.

## Teacher Load `security-reviewer` re-run record: STALE, CORRECTED (2026-08-26)

The "Teacher Load's own `security-reviewer` re-run" line carried at the
bottom of the entry immediately below this one (and repeated in the
"Native Rust Verification Recovery" entry further down) is **stale
documentation, not genuine open debt**. Reconciled by inspecting Git
history and the current code, not re-dispatching a reviewer:

The line originally meant "the dedicated adversarial `security-reviewer`
pass scoped to the Teacher Load / Class Schedule Foundation milestone
itself failed to return retrievable findings (self-review substituted),
and no non-self review of that exact scope has re-run since." That was
accurate on 2026-08-25. It stopped being accurate once two later,
**successfully retrieved** independent reviews each touched and fixed
real issues in Teacher Load's actual security-sensitive surface:

1. **Native Rust Verification Recovery's `security-reviewer`**
   (2026-08-25, later the same day) — adversarial pass covering, among
   other things, `schedule_meeting.rs`'s `has_exact_duplicate` helper
   (introduced by this same recovery to fix the dead-code
   `CreateMeetingOutcome::Duplicate` bug). Found and the session fixed a
   real should-fix: the helper queried without a `school_id` predicate.
   Re-verified with `cargo test --lib schedule_meeting` (13/13) and
   `cargo clippy --all-targets -- -D warnings`. This is genuinely
   Teacher Load code (the conflict/duplicate-detection data-integrity
   half of the milestone), independently reviewed and fixed.
2. **RBAC Foundation `security-reviewer` closure review** (2026-08-26)
   — found and fixed a real cross-teacher schedule leak directly in
   `commands::teaching_assignment::list_schedule_meetings_by_assignment`:
   any Teacher-only session could reconstruct a colleague's full weekly
   schedule without ever passing `auth::authorize_view_teacher_load`,
   contradicting ADR-0039's own stated rule. This is the authorization
   half of Teacher Load, independently reviewed and fixed.

Between these two, both halves of Teacher Load's actual risk surface —
the authorization gate (`authorize_view_teacher_load` and every command
that must route through it) and the data-integrity/conflict-detection
SQL (`has_exact_duplicate` and its siblings) — have each been covered
by a real, non-self, successfully-retrieved independent review that
found and fixed a genuine issue. No single dispatch re-ran the
_original_ milestone's full adversarial checklist end-to-end in one
pass, so this is not "identical to redispatching the original review"
— but the practical exposure the debt entry existed to track is closed,
not merely time-passed-without-incident. **Per the CI milestone's own
instruction not to duplicate a completed review**: no new
`security-reviewer` dispatch was performed to produce this
reconciliation.

**Correction applied**: the stale "Teacher Load's own `security-reviewer`
re-run" line in the entry immediately below is struck through and
replaced with a pointer to this entry, rather than left to keep
resurfacing as apparently-open debt in future sessions.

## Rust Formatting + Quality Gate Normalization: `cargo fmt` debt closed, gate added (2026-08-26)

The ~265-diff pre-existing `cargo fmt` debt (recorded throughout this
file, e.g. the "Native Rust Verification Recovery" entry below) is
**closed**. Baseline re-measured, not assumed: `cargo fmt --check`
(rustfmt 1.9.0-stable, no `rustfmt.toml` — default config) showed 265
diff hunks across 35 first-party files (`src-tauri/src/**`,
`src-tauri/tests/**`; zero vendor/generated/`Cargo.lock` files
involved). Ran plain `cargo fmt` (mechanical, no manual edits) —
committed in isolation as `139c36d` (`style(rust): normalize rustfmt
formatting`), separate from the quality-gate wiring change (`8ee1187`,
`chore(quality): enforce rustfmt check`, which added `cargo fmt --check`
as the first Rust step in `npm run quality:full` and updated
`.claude/rules/testing.md`'s command reference to match).

**Semantic-free, rigorously proven, not merely asserted**: beyond
identical `cargo test`/`nextest`/`clippy`/`npm run quality` results
(below), every one of the 35 changed files was diffed with all
whitespace and rustfmt-inserted trailing commas stripped — 31 files
were then byte-for-byte identical; the remaining 4
(`db/migrations.rs`, `db/mod.rs`, `repository/mod.rs`,
`repository/assessment_item.rs`) were confirmed to differ only by
either a character-multiset-preserving `use` statement reordering
(import order is not semantic in Rust) or rustfmt's standard
brace-add/-remove around a single-expression closure/match arm body
(e.g. `\|r\| r.get(0)` vs `\|r\| { r.get(0) }` — a block containing one
expression is semantically identical to that expression alone). No
identifier, operator, string literal, or SQL text changed anywhere.
The security-sensitive `#[cfg(windows)]` DPAPI import gating in
`db/mod.rs` was spot-checked directly — the attribute stayed attached
to the correct `use` statement, only import order changed.

**Verification, all actually run this session** (identical results to
the pre-format baseline): `cargo fmt --check` PASS (was FAIL); `cargo
check --lib` PASS; `cargo test` PASS (342 lib tests + all integration
binaries, same counts as baseline); `cargo nextest run` PASS, 403/403;
`cargo clippy --all-targets -- -D warnings` PASS, 0 warnings; `cargo
build` (native) succeeds, only the pre-existing harmless OpenSSL
`LNK4099` PDB linker warnings; `npm run quality` PASS, 390/390; `npm run
quality:full` PASS end-to-end (confirms the new gate wiring — a
formatting failure would have stopped the chain before `cargo test`);
`git diff --check` clean; secret scan (`gitleaks`) **NOT RUN** — binary
still unavailable on `PATH`, not installed per project policy (same
limitation recorded throughout this file).

**Debt closed**: `cargo fmt` normalization (~265 diffs, all prior
entries below referencing this as open are now stale — see each
milestone's own record for what it covered); `cargo fmt --check` is now
part of `npm run quality:full`, closing the gap that let the debt
accumulate silently in the first place. **Debt still open, unrelated to
this milestone**: no CI configuration exists yet (the next recommended
milestone); `gitleaks` secret scan remains unavailable in this
environment; Teacher Load's own `security-reviewer` re-run (its code
has not changed since its self-review).

## Curriculum Foundation `architecture-reviewer` + RBAC Foundation `security-reviewer`: independent reviews actually completed and retrieved (2026-08-26)

Both previously-owed independent reviews (see the two "retrieval
failure, self-review substituted" entries below, 2026-08-25) were
re-dispatched against current code at HEAD `096dcfc` on branch
`claude/likha-sis-ux03-plan-plv80c`. Both completed and, this time,
their findings were successfully retrieved in full (the recurring
agent-resume/retrieval failure documented since M7 did not recur) by
resuming each agent via `SendMessage` and asking it to restate its
report as plain text rather than through `ReportFindings` (which
renders to a UI channel the orchestrating session can't read back).

**Curriculum Foundation `architecture-reviewer` — CLOSED.** No BLOCKING
findings. One SHOULD-FIX: `repository::curriculum.rs`'s
`default_version_id` doc comment overclaimed a guarantee
(`idx_one_default_curriculum_version` enforces _at most one_ default
row, not _at least one_ — a zero-default state is schema-reachable,
just not reached by any current production code path). Fixed by
correcting the doc comment to state the actual guarantee and the
`QueryReturnedNoRows` failure mode. Two items independently checked and
ruled FALSE-POSITIVE (subject identity via display string; a suspected
column-position drift in `row_to_class_record` after the new column was
added — indices re-verified correct by direct read). Four
NON-BLOCKING-FUTURE observations recorded for later milestones (no
`effective_from`/`effective_to` period columns yet; `key_stages`'
integer grade levels vs. `sections.grade_level`'s free-text type; the
same zero-default latent shape already exists for the pre-existing
`weight_policy_id` pattern this milestone mirrors). The reviewer also
flagged that `docs/VERIFICATION-DEBT.md`'s two prior "Rust unverified by
compiler" entries for this milestone (below) are now stale — `cargo
check --lib`/`cargo test` were confirmed clean and re-run live during
this review, not merely cited from the `caf850b` fix that resolved them.

**RBAC Foundation `security-reviewer` — CLOSED, one SHOULD-FIX applied.**
No BLOCKING findings. Both previously-fixed regressions were confirmed
still intact by direct code read: `add_user_to_school`'s self-grant gap
(`authorize_school_membership_grant`, `auth/mod.rs:351-361`) and the
Teacher Load cross-school view leak (`authorize_view_teacher_load`,
`auth/mod.rs:423-442`), each with its regression test still present.
One SHOULD-FIX, confirmed exploitable via exposed Tauri commands
bypassing the UI entirely: `commands::teaching_assignment::list_teaching_assignments_by_section`
(intentionally open, school-scoped reference data — unchanged) combined
with `list_schedule_meetings_by_assignment` (previously gated only by
`require_active_school_scope`, no teacher-identity check) let any
Teacher-only session reconstruct any colleague's full weekly schedule
(weekday/time/room) without ever passing `auth::authorize_view_teacher_load`,
contradicting the rule `docs/adr/0039-teacher-load-class-schedule-foundation.md:120-124`
states. Fixed by resolving the assignment's `teacher_user_id` via
`teaching_assignment::find_by_id_in_school` and gating on
`authorize_view_teacher_load` before returning meetings — the same
pattern the sibling commands `list_teacher_assignments`/`get_teacher_load`
already used (`src-tauri/src/commands/teaching_assignment.rs`). No new
command-layer regression test was added — this codebase has no
command-layer test infrastructure at all (confirmed: zero `#[test]`
functions exist under `src-tauri/src/commands/`); all authorization
logic in this codebase is tested at the `auth::mod`/repository layer,
where `authorize_view_teacher_load`'s existing tests (including the
cross-school-denial case) already cover the gate this fix now wires in.
Two NON-BLOCKING-FUTURE observations recorded (SELECT-then-act schedule
overlap checks have no backing DB constraint, theoretically racy only
across two separate OS processes writing the same SQLite file
concurrently — the single in-process `Mutex<Connection>` already
prevents in-process interleaving; `register_user` remains callable by
any authenticated session regardless of role, the surviving harmless
half of the historical two-command self-grant chain now that
`add_user_to_school` is closed). One FALSE-POSITIVE ruled out
(`create_school`/`list_schools` being unauthenticated — confirmed
structurally unreachable for privilege escalation, per
`docs/adr/0004-authentication-and-local-session.md:89-99`).

**Verification after both fixes** (all actually run this session):
`cargo check --lib` PASS; targeted tests (`auth::`, `curriculum::`,
`teaching_assignment::`, `schedule_meeting::`, 81 tests) PASS; full
`cargo test` PASS (342 lib tests + all integration binaries, 0 failed);
`cargo clippy --all-targets -- -D warnings` PASS, 0 warnings; `npm run
quality` PASS, 390/390; `cargo fmt --check` — 265 pre-existing diffs
across the crate (consistent with the ~264 baseline already recorded
below; neither touched file's newly-added lines are among the diffs —
confirmed by cross-referencing line numbers), not corrected in this
milestone per explicit instruction to leave formatting cleanup for its
own follow-up milestone; `git diff --check` clean; secret scan (`gitleaks`)
**NOT RUN** — binary unavailable on `PATH` in this environment, per
project policy not installed solely to complete this review milestone
(same limitation previously recorded for `quality:security`).

**Debt closed**: Curriculum Foundation `architecture-reviewer` review,
RBAC Foundation `security-reviewer` review (both entries below remain as
historical record of the earlier retrieval-failure attempts, marked
superseded rather than deleted). **Debt still open, unrelated to this
milestone**: Teacher Load's own `security-reviewer` re-run (see the
entry immediately below — that milestone's code did not change since
its self-review, so re-running it was correctly out of this milestone's
scope per the directing instruction); `cargo fmt` normalization (~265
diffs); no CI configuration exists yet; `gitleaks` secret scan remains
unavailable in this environment.

## Teacher Load / Class Schedule Foundation: Rust unverified by compiler, `security-reviewer` retrieval failure, two self-caught bugs (2026-08-25)

`cargo check --lib` was attempted once against this milestone's new
code (migration 18, `repository::teaching_assignment`,
`repository::schedule_meeting`, `auth::Capability::ManageTeachingAssignments`/
`authorize_view_teacher_load`, `commands::teaching_assignment`) and
failed identically to every prior reproduction — `windows-future`
0.3.2 vs. `windows-core` 0.62.2, unchanged root cause. Per this
milestone's own instruction, not retried further. Notably, this failure
occurs while compiling a transitive dependency, **before this crate's
own source is type-checked at all** — meaning there is zero compiler
signal on this milestone's new Rust, not even partial. All of it is
written and manually reviewed, not compiler-verified.

`security-reviewer` was dispatched for an adversarial pass on the new
authorization (`authorize_view_teacher_load`) and data-integrity logic
(conflict detection, `INSERT OR IGNORE` review). It completed real work
(19 tool uses, ~80K tokens across two attempts) but returned no
retrievable findings text on the initial attempt or one retry — the
same recurring agent-resume/retrieval failure documented since M7, now
hit for the fourth time this session alone (Curriculum Foundation's
`architecture-reviewer`, RBAC's and this milestone's `security-reviewer`).
Per the established protocol, a rigorous self-review was substituted.

**Two real, non-theoretical bugs were caught and fixed during this
milestone's own TDD/self-review, before the (failed) independent review
was even dispatched**:

1. `authorize_view_teacher_load`'s first draft authorized a School Head
   to view any `target_teacher_user_id` based solely on holding the
   `ManageTeachingAssignments` role in their own school — never checking
   that the _target_ teacher actually belongs to that school. Caught by
   the test `authorize_view_teacher_load_denies_a_school_head_from_a_different_school`
   before it was ever committed. Fixed by adding
   `user_repo::is_member_of_school(conn, target_teacher_user_id, &school_id)?`
   to the check.
2. `schedule_meeting::create`'s first draft used `INSERT OR IGNORE` for
   its final insert with no Rust-side `weekday` range validation — the
   same class of bug as the RBAC milestone's `role::grant()` mistake,
   which this project's own `local-database` skill already documented
   as a lesson. An out-of-range `weekday` would have silently reported
   `CreateMeetingOutcome::Duplicate` instead of the real error, since
   `OR IGNORE` swallows any constraint violation on the statement, not
   just the intended `UNIQUE` conflict. Fixed: explicit `(0..=6)` range
   check in Rust, `INSERT ... ON CONFLICT (...) DO NOTHING` instead of
   `OR IGNORE`. A third, related gap found in the same self-review pass
   (a time missing its leading zero, e.g. "8:00", would pass numeric
   parsing but fail the schema's `GLOB` shape check, surfacing as a raw
   database error instead of a clean `InvalidTime` outcome) was also
   fixed, with a regression test for each.

Self-review beyond the two fixes above also traced: tenant isolation
(`school_id` is session-derived only throughout; `section_id`/
`subject_id`/`teacher_user_id` are validated against it before any
write); conflict-detection SQL correctness (the half-open-interval
overlap condition and lexicographic "HH:MM" string comparison were
verified correct by hand, including the adjacent-non-overlapping edge
case); absence of a TOCTOU window (every command holds one
`Mutex<Connection>` guard for its full duration, serializing all
DB-touching commands globally, the same guarantee every other command
in this codebase already relies on); derived-load correctness (no
stored total exists anywhere in the schema); and command-layer
architecture (every `commands::teaching_assignment` handler is a thin
lock+authorize+single-repository-call wrapper, no business logic in the
Tauri layer).

**No further blocking findings.** Real, non-self independent-review
debt remains open for this milestone — re-run `security-reviewer` once
agent-resume behavior is confirmed reliably working in a future
session.

## RBAC Authorization Corrective Gate: `security-reviewer` retrieval failure, self-review substituted (2026-08-25)

`security-reviewer` was dispatched for an adversarial pass on the
`add_user_to_school` fix (see the entry below). It completed real work
(7 tool uses, ~61K tokens) but returned no retrievable findings text —
the same recurring agent-resume/retrieval failure documented since M7,
hit twice already this session (Curriculum Foundation's
`architecture-reviewer`, Codex-plugin-cc research's `deped-researcher`).
One retry via `SendMessage` was sent per this project's established
protocol; per the same protocol, a rigorous self-review was performed
rather than waiting further.

Self-review traced exactly the 10 adversarial questions the dispatched
review was asked: (1) `add_user_to_school` never reads or writes the
caller's own roles, only the target `user_id`'s — no self-escalation
path. (2) `role::grant(&conn, &user_id, &school_id, role::TEACHER)`
passes the literal `TEACHER` constant, not a parameter — no path to
grant a different role via this command. (3) The cross-school
`current_school != school_id` check is unchanged, downstream of the new
capability check. (4) The whole command holds one `Mutex<Connection>`
guard for its full duration (`lock_db(&db)` at the top, held to the end
of the function) — no TOCTOU window, consistent with every other command
in this codebase. (5) `school_id` is checked against the trusted
session, never blindly accepted; `user_id`'s lack of restriction is
unchanged, pre-existing, intentional design (an FK-enforced existence
check only), not part of this defect. (6) Grepped every production
caller of `user::add_school_membership`/`role::grant` in
`src-tauri/src` — only `bootstrap_installation` (already correct) and
`add_user_to_school` (the fixed defect) — no bypass path exists
elsewhere. (7) The `Capability::ManageLearners` match arm is untouched;
only a new arm was added. (8) Re-read the new/updated test bodies:
`..._blocks_a_session_scoped_to_a_different_school` now grants the
caller School Head in their own school before attempting the
cross-school call, correctly isolating that check from the role check;
`..._denies_a_registrar_only_session` correctly isolates the role check
alone. (9) No other membership/role-mutating command exists in this
codebase at all (confirmed via a full grep of `src-tauri/src/commands/`).
(10) The legitimate School Head case is explicitly tested and asserted
`.is_ok()`.

**No blocking findings.** Real, non-self independent-review debt for
this specific fix remains open — re-run `security-reviewer` once
agent-resume behavior is confirmed reliably working in a future session.

**SUPERSEDED (2026-08-26)** — see this file's top entry: an independent
`security-reviewer` review was successfully dispatched and retrieved
against current code, covering this fix among others. Debt closed.

## Curriculum / Key-Stage Versioning Foundation: `architecture-reviewer` retrieval failure, self-review substituted (2026-08-25)

`architecture-reviewer` was dispatched to review the new curriculum
schema/repository code for architecture leakage and data-integrity
correctness. It completed real work (33 tool uses, ~67K tokens) but
returned no retrievable findings text — the same recurring agent-resume/
retrieval failure documented since M7 (also hit this session by
`deped-researcher`, see below). One retry via `SendMessage` was sent per
this project's established protocol; per the same protocol, a rigorous
self-review was performed rather than waiting further or retrying again.

Self-review covered exactly what the dispatched review was asked to
check: (1) confirmed via `git diff --stat` that zero files under `src/`
(TS/UI) were touched this milestone — no curriculum/key-stage hardcoding
is possible in the frontend because there is no frontend code touching
this concept at all yet. (2) Re-read `resolved_curriculum_version_id_in_school`
directly: a single generic `COALESCE(cr.curriculum_version_id, dcv.id)`
lookup with no branching on curriculum name/id anywhere — the same shape
`resolved_weight_policy_id_in_school` already uses. (3) Confirmed
`key_stages` has no foreign key to `curriculum_versions` at all (deliberate,
per the ADR's reasoning that Key Stage banding is curriculum-independent).
(4) Re-read the migration SQL literally: `CHECK (min_grade_level <=
max_grade_level)` on `key_stages`, `curriculum_learning_areas.curriculum_version_id`
is `NOT NULL REFERENCES curriculum_versions(id)`, `idx_one_default_curriculum_version`
is a `UNIQUE INDEX ... WHERE is_default = 1` (the same structural pattern
already proven for `grading_policies`/`grading_weight_policies`, not a
new mechanism). (5) Traced historical-stability directly: `create()`
always resolves `curriculum_version_id` to a concrete, non-null value
before insert (explicit-and-validated, or auto-resolved-then-stored) —
so `COALESCE` never falls through to `dcv.id` (today's default) for any
row created via `create()`, only for a genuinely pre-existing/legacy row
with a literal `NULL` column value; confirmed no code path can rewrite an
already-stored `curriculum_version_id` after creation. (6) Grepped for
`OR IGNORE` in the new migration/repository code — zero occurrences (the
RBAC-milestone lesson was not repeated). (7) Confirmed `curriculum_versions`/
`key_stages`/`curriculum_learning_areas` carry no `school_id` column at
all (global reference data, matching `grading_weight_policies`), and that
`class_record::create`'s new parameter follows the exact same "not
tenant data, existence-check only" pattern already established for
`weight_policy_id` — no cross-school leak path exists.

**No blocking findings.** Real, non-self independent-review debt for this
milestone remains open — re-run `architecture-reviewer` once agent-resume
behavior is confirmed reliably working in a future session.

**SUPERSEDED (2026-08-26)** — see this file's top entry: an independent
`architecture-reviewer` review was successfully dispatched and retrieved
against current code. Debt closed.

## Curriculum / Key-Stage Versioning Foundation: Rust unverified by compiler, `deped-researcher` failure (2026-08-25)

`cargo check --lib` was re-run against this milestone's new migration/
repository code and failed identically to every prior session's
reproduction (`windows-future` 0.3.2 vs. `windows-core` 0.62.2 — see the
entry below, unchanged root cause). This milestone's new Rust
(`key_stages`/`curriculum_versions`/`curriculum_learning_areas` migration
and tests, `repository/curriculum.rs`, `class_record.rs`'s
`curriculum_version_id` plumbing) is therefore **written and manually
reviewed, not compiler-verified or test-run**. `npm run quality`
(390/390), `check:architecture`, `check:dev-preview-isolation`, and
`knip` were all actually re-run and are clean — this milestone's changes
are Rust-only, so TS-side verification is a real, if partial, signal.

`deped-researcher` was dispatched to verify MATATAG curriculum
rollout/Key-Stage facts and returned no retrievable findings on the
initial attempt; one retry via `SendMessage` (this project's established
protocol) also returned "No new content" — the same recurring
agent-resume/retrieval failure documented since M7, now confirmed on
this agent type too. Direct `WebSearch`/`WebFetch` was substituted
instead of a third attempt, and produced usable, triangulated (though not
fully primary-source-verified — `deped.gov.ph` itself is blocked by this
environment's network egress policy) findings — see
`docs/SOURCE-REGISTRY.md`'s new entry for exactly what was and wasn't
confirmed. Periodically retry `deped-researcher` in a future session once
the harness appears healthy, per the project's standing reviewer-failure
rule.

**STALE (2026-08-26)** — the "Rust unverified by compiler" half of this
entry no longer reflects repository state: `caf850b` (2026-08-25, later
the same day) fixed the `windows`-crate target-gating root cause. `cargo
check --lib`/`cargo test` were confirmed clean and re-run live during
this session's `architecture-reviewer` closure review (see this file's
top entry). The `deped-researcher` retrieval-failure record above stays
accurate and open.

## Wave 1A RBAC Foundation: `security-reviewer` findings — one fixed, one pre-existing gap recorded (2026-08-25)

Independent `security-reviewer` review of the new RBAC gate was dispatched
and returned real, substantive findings before hitting a session-limit API
error partway through a follow-up exchange (not the usual agent-resume
retrieval failure documented elsewhere in this file — the review itself
completed and reported). Two findings:

1. **Fixed.** `repository::role::grant()` used `INSERT OR IGNORE`, which
   silently swallows a `CHECK` constraint violation (not just the intended
   primary-key conflict) — an unrecognized role would have been a silent
   no-op instead of the error the function's own doc comment and the
   `grant_rejects_an_unrecognized_role` test require. Independently
   reproduced against real SQLite before trusting the reviewer's claim
   (`INSERT OR IGNORE` on a `CHECK`-violating row: 0 rows affected, no
   exception; `INSERT ... ON CONFLICT(...) DO NOTHING` on the same row:
   raises `CHECK constraint failed` as expected — conflict resolution only
   suppresses the named conflict target, not an unrelated `CHECK` failure).
   Fixed by switching to `ON CONFLICT (user_id, school_id, role) DO
NOTHING`. Not yet re-verified by an actual `cargo test` run — `cargo`
   still cannot compile in this environment (see the `windows-future`
   entry below) — verified instead by reproducing the exact SQLite
   semantics in isolation, and the fix is a one-line, easily-inspectable
   change.
2. **Fixed (2026-08-25, RBAC authorization corrective gate)** —
   originally: `commands::user::add_user_to_school`
   only checked that the caller has an active session scoped to the same
   `school_id` being granted into (`auth::authorize_school_membership_grant`)
   — it did not check the caller's _role_ at all, so any
   authenticated member of a school (Teacher included) could add a new
   colleague. **Confirmed exploitable end-to-end**, not merely
   theoretical: any authenticated session could call `register_user`
   (itself only requires an active session, any role — returns the new
   account's `user_id`) then `add_user_to_school` (same school, any
   role) to self-grant that fresh account membership. Grepped every
   production caller of `user::add_school_membership`/`role::grant`
   (`src-tauri/src/auth/mod.rs`'s `bootstrap_installation` and
   `src-tauri/src/commands/user.rs`'s `add_user_to_school` — the only
   two; `bootstrap_installation` was already correctly gated, reviewed
   under ADR-0036) — no other vulnerable path existed. Fixed by adding
   `Capability::ManageSchoolMembership` (School Head only, deliberately
   excluding Registrar as the conservative choice — onboarding a new
   school member is treated as a School Head personnel responsibility,
   not bundled into Registrar's enrollment/records scope) and routing
   `authorize_school_membership_grant` through the existing
   `authorize_capability` gate, the same pattern every other
   capability-checked command already uses. Six regression tests added/
   updated in `src-tauri/src/auth/mod.rs` proving: School Head succeeds;
   Teacher-only denied (the exact defect); no-role-at-all denied;
   Registrar-only denied; cross-school denied (fixture corrected to
   grant the caller School Head first, isolating the cross-school check
   from the role check); role revoked mid-session denied on the very
   next call. Not yet re-verified by `cargo test` — blocked by the
   unrelated pre-existing `windows-future` conflict below; independent
   `security-reviewer` dispatched for an adversarial pass. Still not
   reachable from any UI (unchanged).

## UX-04 teacher-ux-reviewer / accessibility-reviewer independent review not retrievable (open)

Both `teacher-ux-reviewer` and `accessibility-reviewer` were dispatched
against UX-04's `ClassRecordWorkspace.tsx`/`ClassRecordsScreen.tsx`
changes (2026-08-25) and hit the same recurring agent-resume/retrieval
failure documented since M7 (see `docs/adr/0027-audit-timestamp-readability-fix.md`,
and the identical UX-02/UX-03 entries below): each did real work
(teacher-ux: 31 tool calls across two attempts; accessibility: 31 tool
calls across two attempts) but returned no retrievable findings text,
on both the initial dispatch and one permitted retry. A rigorous
self-review was substituted and found and fixed one real, must-fix
accessibility gap: every assessment item's "Edit"/"Delete" buttons
shared the same accessible name across the whole list, with nothing
distinguishing which item a given pair belonged to for a screen-reader
user (fixed with a named `role="group"`, matching the pattern this
file's own Excused/N/A buttons already used correctly) — recorded in
`docs/adr/0034-class-records-assessments-score-entry-grade-output.md`.
This did not block completing UX-04, but the owed independent reviews
themselves are still open debt. Retry both in a future session once
there's reason to believe the agent-resume harness issue is fixed;
remove this entry once real (non-self) reviews actually complete and
their findings are recorded.

## Rust toolchain cannot compile in this environment: `windows-future`/`windows-core` version conflict (RESOLVED 2026-08-25 — Native Rust Verification Recovery)

**Closed.** Root cause was not a lockfile/version-mismatch (the two
`windows` package instances in `Cargo.lock` were each internally
self-consistent, per `cargo tree` reverse-dependency evidence gathered
this session) — it was that LIKHA's own `src-tauri/Cargo.toml` declared
`windows = { version = "0.62.2", ... }` **unconditionally**, forcing
`windows-future`'s Windows-only COM/async code to compile on every host
including this Linux dev container, exactly as the "deeper structural
cause" paragraph below had already predicted. Fixed by moving `windows`
to `[target.'cfg(windows)'.dependencies]` and `#[cfg(windows)]`-gating
`mod dpapi;`/`DpapiKeyStore` in `crypto/mod.rs`, with `db::open_app_db`
split so the `#[cfg(not(windows))]` path fails closed rather than
opening an unprotected database. Zero `Cargo.lock` changes were needed.
See `docs/adr/0040-windows-only-dependency-target-gating.md` for full
detail, evidence, and the 10-scenario decision record.

**Verified this session, actually run (not claimed):** `cargo check
--lib` (clean, 0 warnings/errors), `cargo test` (338 lib tests + all
integration test binaries, 0 failures), `cargo clippy --all-targets --
-D warnings` (0 warnings), `npm run quality` (typecheck/lint/format/
architecture/vitest all green, 390 TS tests). Restoring real compiler
signal exposed and fixed three genuine pre-existing bugs, none of which
had ever been caught because no Rust compile/test had ever actually
succeeded on this branch:

1. A type-inference ambiguity in
   `class_record::find_detail_by_id_in_school` (`Err(e.into())` — three
   competing `From<rusqlite::Error>` impls in scope made `?`'s target
   type unresolvable). Fixed: `Err(AppError::from(e))`. No behavior
   change.
2. `schedule_meeting::create`'s `CreateMeetingOutcome::Duplicate` was
   dead code — an exact-duplicate meeting submission always shares its
   teacher with itself, so `has_teacher_conflict` always fired first
   and `Duplicate` could never actually be returned, despite a
   dedicated regression test (`create_rejects_an_exact_duplicate_meeting`)
   asserting it should. Fixed by adding a `has_exact_duplicate` check
   that runs before the conflict checks.
3. Four `assessment_item` tests (`delete_refuses_an_item_that_already_
has_a_recorded_score`, `list_by_class_record_reports_recorded_and_
total_eligible_counts`, `rename_changes_the_name_even_when_the_item_
already_has_a_recorded_score`, `update_rejects_a_category_or_max_
score_change_once_the_item_has_a_recorded_score`) called
   `learner_score::record(..., "teacher-1")` with a literal string that
   was never a real row — always violating `learner_scores.recorded_by_
user_id REFERENCES users(id)` once FK enforcement actually ran.
   These four tests had never passed under real execution. Fixed by
   creating a real `user::create_user(...)` row first, matching the
   pattern `learner_score.rs`'s own tests already use correctly.

**New debt discovered by this recovery, not yet closed:** `cargo fmt
--check` was run for the first time this session (it was never wired
into `npm run quality:full`, only `cargo test` + `cargo clippy` are) and
found ~264 pre-existing formatting diff hunks across most of the crate,
entirely unrelated to this fix. Not corrected here — a whole-crate
reformat is out of this recovery milestone's scope (risk of unrelated
diff noise across every Rust file). Recommend a dedicated, low-risk
follow-up: run `cargo fmt` once crate-wide in its own commit, then add
`cargo fmt --check` to `quality:full` so it can't silently drift again.

**Independent review: COMPLETE, no recurring retrieval failure this
time.** `security-reviewer` was dispatched for an adversarial pass on
the crypto/key-store boundary change (`Cargo.toml` target-gating,
`crypto/mod.rs`, `db/mod.rs`'s fail-closed non-Windows path) plus the
three bug fixes above, and returned real, retrievable findings on the
first attempt (16 tool uses, ~63K tokens) — breaking this session's
recurring agent-resume/retrieval-failure streak (hit 4 times previously:
Curriculum Foundation's `architecture-reviewer`, RBAC's and Teacher
Load's `security-reviewer`).

**Verdict: no blocking issues.** Confirmed independently (not merely
re-asserted from this session's own claims): `dpapi.rs` has zero diff
lines and the Windows `open_app_db` body is byte-identical to before —
purely a compilation-gating change, no Windows-path behavior change;
the sole production call site of `open_app_db` is `src-tauri/src/lib.rs`'s
`setup()`, called with `?` so startup aborts on `Err` — no path lets a
non-Windows host run commands against an unprotected key store;
`AppError::key_store(...)` serializes only to the generic
`"key_store_error"` string, no detail leak across IPC; `windows::` usage
is confined to `dpapi.rs`; the unrelated bug fixes
(`class_record.rs`/`schedule_meeting.rs`/`assessment_item.rs`) were
independently checked and confirmed correct; neither of this project's
two previously-shipped failure classes (unauthenticated bootstrap self-
grant; check-then-act singleton race) recurs, since `auth::
bootstrap_installation` is untouched by this diff.

**One should-fix (non-blocking), applied same session**: the new
`has_exact_duplicate` helper in `schedule_meeting.rs` queried without a
`school_id` predicate — not exploitable given `create()` already
resolves `teaching_assignment_id` through a school-scoped lookup first
and assignment ids are UUIDv7 (not cross-tenant guessable), but
recommended as defense-in-depth. Fixed immediately: `school_id` is now
threaded through `has_exact_duplicate`'s query, matching every other
conflict-check helper in this file. Re-verified after the fix:
`cargo test --lib schedule_meeting` (13/13 pass) and
`cargo clippy --all-targets -- -D warnings` (0 warnings).

**Closed.** No independent-review debt remains from this milestone.

No repository history below this point is deleted — kept for the full
diagnostic trail that led to the correct root cause:

### Original open-debt record (pre-resolution, kept for trail)

`cargo check --lib` (and therefore `cargo test`/`cargo build`/`cargo
clippy`) fails in this session's Linux dev environment on a pre-existing,
unrelated dependency conflict: `Cargo.lock` locks both `windows-core`
0.61.2 and 0.62.2, and both `windows-future` 0.2.1 and 0.3.2,
simultaneously. Building `windows-future` 0.3.2 then fails with several
`cannot find function/type ... in module windows_core::imp` errors (a
transitive Windows-target crate expecting symbols only the other locked
version provides). Confirmed via `cargo update -p windows-future`, which
refuses ("specification is ambiguous") without a version qualifier this
session deliberately did not supply, since forcing a Cargo.lock/Cargo.toml
change is outside any single UI milestone's scope and risks
side effects on an unrelated dependency tree. Not caused by, and not
fixable from, any `.rs` source file changed in UX-04 (only source files
were touched, never the manifest/lockfile). All UX-04 Rust changes
(`assessment_item.rs`'s `rename`/`update`/`delete`, `class_record.rs`'s
`item_count`/`recorded_count`/`total_eligible`) were verified instead by
careful manual review — signatures, SQL correctness, fail-closed-on-
`None` conventions, and the logic of each new test — not by an actual
compile/test run. Resolve by pinning a single consistent
`windows-future`/`windows-core` pair (a deliberate dependency decision,
not a drive-by fix) in a session where that's the explicit task, then
re-run `cargo test`/`cargo clippy --all-targets -- -D warnings` for every
milestone whose Rust changes accumulated while this was broken.

**Root cause actually reproduced and diagnosed, Wave 1A RBAC Foundation
(2026-08-25)** — this milestone's own task explicitly required reproducing
this blocker rather than continuing to cite it secondhand. `cargo check
--lib` and `cargo test --lib` were both actually run and both fail at the
identical point: `windows-future` 0.3.2 cannot compile — it references
`windows_core::imp::IMarshal`, `windows_core::imp::marshaler`, and
`windows_threading::submit`, none of which exist in the `windows-core`
0.62.2 / `windows-threading` 0.2.1 versions the lockfile actually pairs it
with. `git log -p -- Cargo.lock` confirms this dual-version lock existed
since the very first Cargo.lock commit (`e237e00`, M0) — nothing this
project has done introduced it. The deeper structural cause: `Cargo.toml`
declares `windows = { version = "0.62.2", ... }` **unconditionally** (no
`[target.'cfg(windows)'.dependencies]` section exists in this manifest at
all), and `src-tauri/src/crypto/dpapi.rs` (`mod dpapi;` in `crypto/mod.rs`,
used unconditionally by `db::mod.rs`'s `DpapiKeyStore`) is not gated behind
`#[cfg(windows)]` either — so this crate is structured to require a
functioning Windows API binding on every platform it's built on, including
this Linux dev container, regardless of whether the specific
windows-future/windows-core version pair matches. Even a corrected,
mutually-compatible `windows`/`windows-future`/`windows-core` version set
would still only fix the _compile_ error — DPAPI's actual Win32 calls
(`CryptProtectData`/`CryptUnprotectData`) have no Linux implementation to
link against, so a real fix likely also needs `#[cfg(windows)]` gating on
`dpapi.rs` and a target-specific `windows` dependency, which is a genuine
architecture change (how the crate is structured per-platform, and what a
non-Windows dev/CI build does for `KeyStore` — a stub, a different
`KeyStore` impl, or simply "this crate cannot build outside Windows,
accept that and provision only Windows CI/dev machines"). Per this
milestone's explicit instruction, this is **not** decided or implemented
here — recorded as the reproduced blocker, its exact chain, and evidence;
the corrective action (a real architecture decision, not a drive-by fix)
is deferred to a session where that's the explicit task.

## `playwright-cli` browser mismatch in this environment — workaround exists (open, session-specific)

`playwright-cli open` (any browser argument) failed in this session with
either "Chromium distribution 'chrome' is not found" or "Browser
'chrome-for-testing' is not installed... expected executable at
/opt/pw-browsers/chromium-1237/..." — the pinned `@playwright/cli`
version's expected browser build does not match what's actually
pre-installed at `/opt/pw-browsers` (chromium-1194) in this environment.
Workaround used successfully this session: bypass `playwright-cli`
entirely and drive the `playwright` npm package directly from a small
script, launching with `chromium.launch({ executablePath:
"/opt/pw-browsers/chromium" })` — this produced real, correct browser
screenshots (see `docs/adr/0034-class-records-assessments-score-entry-grade-output.md`'s
Verification section) and caught two genuine layout bugs jsdom-based
tests could not. Future sessions hitting the same `playwright-cli`
failure should use this workaround rather than concluding no
browser-rendered verification is possible.

## UX-03 teacher-ux-reviewer / accessibility-reviewer independent review not retrievable (open)

Both `teacher-ux-reviewer` and `accessibility-reviewer` were dispatched
against UX-03's `AttendanceScreen`/`MonthlySummaryScreen` changes
(2026-08-25) and hit the same recurring agent-resume/retrieval failure
documented since M7 (see `docs/adr/0027-audit-timestamp-readability-fix.md`,
UX-02's identical entry below): each did real work (teacher-ux: 31 tool
calls across two attempts; accessibility: 21 tool calls across two
attempts) but returned no retrievable findings text, on both the
initial dispatch and one permitted retry. A rigorous self-review was
substituted (recorded in `docs/adr/0033-daily-attendance-and-monthly-summary-polish.md`'s
"Independent review" section) and found and fixed one real teacher-UX
gap (the "Mark all present preserves existing marks" reassurance was
Guided-mode-only; now shown in every mode) — so this did not block
completing UX-03, but the owed independent reviews themselves are still
open debt. Retry both in a future session once there's reason to
believe the agent-resume harness issue is fixed; remove this entry once
real (non-self) reviews actually complete and their findings are
recorded.

Things that are believed correct but not yet verified by the specific
means listed — because this environment/session lacked the tool, device,
or hardware. This is **not** a bug backlog; move an item here only when
the underlying work is otherwise done and reviewed, and remove it once
the missing verification actually happens (record what ran and when).

## UX-02 accessibility-reviewer independent review not retrievable (open)

`accessibility-reviewer` was dispatched against UX-02's rewritten
`TeacherWorkspaceScreen.tsx` (2026-08-25) and hit the same recurring
agent-resume/retrieval failure first documented in
`docs/adr/0027-audit-timestamp-readability-fix.md`: both the initial
dispatch and one permitted retry (asking it directly to resend its
findings) returned only an empty completion notice, never any actual
findings content. A rigorous self-review was substituted (recorded in
`docs/adr/0032-teacher-workspace-polish.md`'s "Independent review"
section) and found no blocking issue, so this did not block completing
UX-02, but the owed independent accessibility review itself is still
open debt. Retry in a future session once there's reason to believe the
harness issue is fixed; remove this entry once a real review actually
completes and its findings are recorded.

## Native visual / screen-reader inspection (open)

No browser/screenshot/rendering tool was available in the sessions that
built M0–M6. Structural/accessibility correctness was verified via React
Testing Library + `axe-core` (see `src/test/a11y.ts`) and computed WCAG
contrast ratios from actual hex values — not by looking at the rendered
UI. A human visual pass (does it look premium/comfortable, not just
structurally valid?) and a real screen-reader pass (NVDA/Narrator) on the
compiled app are still owed for every screen shipped so far
(`LoginScreen`, `LearnerListScreen`, `FirstRunSetupScreen`, `AppShell`).

## Browser-pane dev-server port was misconfigured — fixed 2026-08-25 (closed)

`.claude/launch.json` declared the dev server's port as `5173`, but
Vite/Tauri's actual `devUrl` is `1420`. This silently broke every
Browser-pane `navigate` attempt against the running dev server across
at least two sessions (the "navigation ... was denied or failed" note
recorded in earlier handoffs was this misconfigured port, not a tool
limitation). Fixed in `docs/adr/0030-ui-first-program-and-ux00.md`.
With the fix, Browser-pane DOM/text/console verification against
`vite dev` genuinely works, and — once the user displays the Browser
pane panel client-side — pixel-level screenshot capture works too
(confirmed in `docs/adr/0031-design-system-and-app-shell.md`: `LoginScreen`
screenshotted at three viewports, two color schemes, three teacher
modes).

## Authenticated (post-login) screens are pixel-verified via a dev-only fixture — closed 2026-08-25 (closed)

The browser-only `vite dev` server has no live Tauri IPC bridge, so
nothing past `LoginScreen` could be reached through a real login. UX-01
(`docs/adr/0031-design-system-and-app-shell.md`) ran a 10-scenario
decision on how to close this and selected a dev-only synthetic
fixture, deferring its construction to whichever milestone first
genuinely needed it. UX-02
(`docs/adr/0032-teacher-workspace-polish.md`) built it as its first
implementation slice: `src/dev-preview/` — a fully separate Vite entry
never registered in the production build input, a production
throw-guard in its `main.tsx`, and fixture repositories whose
auth-related methods throw unconditionally, with two independent
automated isolation proofs (a fast source-text test plus a built-`dist`
scan). `TeacherWorkspaceScreen` and `AttendanceScreen` were genuinely
screenshotted and interacted with through it at three viewports, two
color schemes, and all three teacher modes this session — the first
real pixel evidence of an authenticated LIKHA-SIS screen in this
program. This closes the gap for the screens the fixture wires
(Workspace, Attendance, Sign-in Activity); each remaining UX milestone
(UX-03 through UX-06) should extend the same fixture to wire its own
screens rather than rebuilding the safety architecture, and should
still consider the native `@wdio/tauri-service` pilot below for the
Tauri-IPC-specific behavior no browser-only fixture can prove.

## Playwright CLI coverage is browser-only, not native-binary (open)

`@playwright/cli` (adopted per `docs/SOURCE-REGISTRY.md`) can only drive
`vite dev`/browser-rendered UI. It cannot attach to the compiled Tauri
webview, so it never exercises the actual native binary, the Tauri IPC
bridge, or Windows-specific WebView2 behavior. Do not treat a green
Playwright run as native-binary verification.

## Native Tauri WebDriver E2E (planned, not yet built out)

`@wdio/tauri-service` was identified as the current official path for
real native-binary E2E on Windows (embedded WebView2 provider, no paid
CrabNebula dependency required on Windows). Only a single pilot smoke
test (launch app → confirm bootstrap/login screen renders → close
cleanly) was scoped for the harness upgrade, not a full E2E suite. Expand
coverage only as UI stabilizes — building it out while screens are still
moving quickly would create ongoing maintenance drag disproportionate to
the milestone stage.

## Android verification (deferred, out of current scope)

LIKHA-SIS targets Windows first, Android later. Nothing Android-specific
has been built or verified. This is expected at the current milestone,
not a gap to close yet — revisit when Android work actually starts.

## Recovery scenarios needing real hardware (open)

The DPAPI-protected key store (`docs/adr/0003-encryption-at-rest.md`) has
unit-test coverage for wrong-key/no-key rejection, but recovery behavior
across a real Windows user-profile change, a different physical machine,
or DPAPI key rotation has not been exercised on real hardware/accounts —
only within a single test process on one machine.
