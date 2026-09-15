Warning: truncated output (original token count: 85172)
Total output lines: 5986

# ACTIVE PLAN

## Canonical GJ-7 continuation (2026-09-15)

Main checkpoint: PR #81, `b2d98dfc755726ed1be6781ccbb2226f44e827ec`.
PRs #79-#81 merged; #78 closed as superseded. Older entries below are historical.
One active slice: `codex/class-record-sync-status`, a read-only native command that
resolves score sync evidence only through active-session school scope plus exact
teacher ownership of the matching section/subject assignment. No UI integration is
claimed. See CURRENT-HANDOFF for acceptance criteria, verification, and exact next
slice. Do not create competing PRs or additional schedules.

## GradingPeriod sync wiring (2026-09-06)

Full detail: `docs/CURRENT-HANDOFF.md`'s matching entry (top of file).
Summary: eighth entity wired through ADR-0067/0069's sync
encrypt/decrypt pattern, after Learner, Attendance, Section,
LearnerScore, AssessmentItem, Subject, TeachingAssignment.
`repository::grading::upsert_from_sync` (new, id-keyed upsert bypassing
`create`'s own policy-period-existence/date-order/uniqueness
validation), `commands::grading::create_grading_period_with_optional_sync`
(new, mirrors `teaching_assignment`'s SAVEPOINT + unconditional
`base_version = 0` shape, wiring only the `create` verb — there is no
`update`/`remove` command on grading periods), and a new
`EntityKind::GradingPeriod` arm in `sync_client::apply_decrypted_change`.

This worktree's branch had fallen behind the shared integration branch
`claude/repo-priority-automation-8h96zx` (missing the entire
ADR-0067/0069 foundation through the TeachingAssignment slice) —
fast-forward-merged onto that tip before starting, a pure catch-up.

`SubjectAttendance` remains the one entity with no sync wiring at all;
`SectionMembership` remains deferred pending its own multi-verb design
(five temporal verbs) — recorded as the next candidates.

Verification actually run this session:

- `cargo test --lib` (from a clean `target/` after `cargo clean`): 901
  passed, 0 failed, including all new `grading`/`commands::grading`/
  `sync_client` tests.
- Every one of the 18 `src-tauri/tests/*.rs` integration binaries run
  individually via `cargo test --test <name>` (deleting each linked
  binary after it ran to stay under this container's disk quota, which a
  single unrestricted `cargo test` cannot fit): all 18 exited 0, no
  `FAILED` anywhere, including `grading` (5 tests).
- `cargo clippy --all-targets -- -D warnings`: clean on the first run.
- `cargo fmt --check`: found drift in this slice's own new code, fixed
  with plain `cargo fmt`, re-ran `--check` clean.
- `npm run quality:security`: clean (gitleaks + cargo-deny + OSV-Scanner,
  3 ok / 0 failed / 0 missing).
- `npm run quality`: TS-side steps (`typecheck`/`lint`/`format:check`/
  `check:architecture`) passed; `check:deadcode` (`knip`) fails on
  pre-existing, unrelated findings present before this slice touched
  anything (this slice changed only 3 Rust files) — not a regression.

Not pushed; commit is local only per this task's batch-mode instruction.

## TeachingAssignment sync wiring (2026-09-06)

Full detail: `docs/CURRENT-HANDOFF.md`'s matching entry (top of file).
Summary: seventh entity wired through ADR-0067/0069's sync
encrypt/decrypt pattern, after Learner, Attendance, Section,
LearnerScore, AssessmentItem, Subject. `repository::teaching_assignment::
upsert_from_sync` (new, id-keyed upsert bypassing `create`'s own
validation), `commands::teaching_assignment::
create_teaching_assignment_with_optional_sync` (new, mirrors `subject`'s
SAVEPOINT + unconditional `base_version = 0` shape, wiring only the
`create` verb), and a new `EntityKind::TeachingAssignment` arm in
`sync_client::apply_decrypted_change`.

`replace_teacher`/`remove` were deliberately NOT wired this slice — per
the task's explicit instruction to wire only the entity's existing write
command, matching the established create-only precedent
(`Section`/`AssessmentItem`/`Subject`). `GradingPeriod` and
`SubjectAttendance` remain the two entities with no sync wiring at all —
recorded as the next candidates.

Verification actually run this session:

- `cargo test --lib` (`CARGO_INCREMENTAL=0`, from a clean `target/`
  after `cargo clean`): 892 passed, 0 failed.
- Every one of the 18 `src-tauri/tests/*.rs` integration binaries run
  individually via `cargo test --test <name>` (deleting each linked
  binary after it ran to stay under this container's ~37.5 GB disk
  quota, which a single unrestricted `cargo test` cannot fit given 18+
  large Tauri/GTK-linked test binaries): all 18 exited 0, no `FAILED`
  anywhere. This is full-crate coverage achieved as N separate
  invocations rather than one, because of a disk constraint intrinsic
  to this container — disclosed here rather than silently substituted
  for the literal single-command form the task named.
- `cargo clippy --all-targets -- -D warnings`: found and fixed one
  genuine `unused_variables` warning in this slice's own new test
  (`_section_id`), then clean.
- `cargo fmt --check`: found drift in this slice's own new code, fixed
  with plain `cargo fmt`, re-ran `--check` clean.
- `npm run quality:security`: gitleaks/`cargo deny check`/OSV-Scanner —
  3 ok, 0 failed, 0 missing. No new dependency added.
- `npm run quality`/`npm run quality:ui` (TS/UI layers): not run — no
  TS/UI files touched this slice (Rust repository/command/`sync_client`
  layers only), matching the task's explicit "no UI changes" scope.

## Subject sync wiring (2026-09-06)

Full detail: `docs/CURRENT-HANDOFF.md`'s matching entry (top of file).
Summary: sixth entity wired through ADR-0067/0069's sync
encrypt/decrypt pattern, after Learner, Attendance, Section,
LearnerScore, AssessmentItem. `repository::subject::upsert_from_sync`
(new, id-keyed upsert), `commands::subject::create_subject_with_optional_sync`
(new, mirrors `section`'s/`assessment_item`'s SAVEPOINT + unconditional
`base_version = 0` create-only shape), and a new `EntityKind::Subject`
arm in `sync_client::apply_decrypted_change`.

`SectionMembership`, `TeachingAssignment`, and `SubjectAttendance` were
all considered and deliberately NOT picked this slice — each has a
multi-verb write surface (five temporal verbs, three verbs, and two
tables with three writers respectively), so each needs its own
dedicated multi-verb slice (see `docs/CURRENT-HANDOFF.md`'s entry for
the full reasoning).

Verification actually run this session:

- `cargo test` (full crate, from a clean `target/` after this session's
  own `cargo clean`): 883 lib tests passing, 0 failed; every integration
  test binary passing; 0 doctests (none exist in this crate). Run with
  `RUSTFLAGS="-C debuginfo=0"` to control this shared host's disk
  footprint — a build-only flag, not a source change.
- `cargo clippy --all-targets -- -D warnings`: clean (exit code 0, no
  warnings/errors), run with the project's normal profile.
- `cargo fmt --check`: found drift in this slice's own new code (two
  multi-arg test calls, one `use` import wrap), fixed with plain
  `cargo fmt`, re-ran `--check` clean.
- `npm run quality:security`: gitleaks/`cargo deny check`/OSV-Scanner —
  3 ok, 0 failed, 0 missing.
- `npm run quality`/`npm run quality:ui` (TS/UI layers): not run — no
  TS/UI files touched this slice (Rust repository/command/`sync_client`
  layers only), matching the task's explicit "no UI changes" scope.

Environment hazard hit and resolved: a `cargo test` retry hit the
harness's own `/tmp` task-output mount at 0 bytes free mid-run (the
documented hazard from the `AssessmentItem` slice recurred). Resolved by
`cargo clean --manifest-path src-tauri/Cargo.toml` scoped to this
worktree's own `target/` (freed 11.7GiB), then re-running from clean —
not a code defect.

Independent review: none obtained this session (no subagent-dispatch
tool available); rigorous self-review performed instead per this
project's documented reviewer-failure fallback. Debt recorded in
`docs/VERIFICATION-DEBT.md`.

## AssessmentItem sync wiring (2026-09-06)

Full detail: `docs/CURRENT-HANDOFF.md`'s matching entry (top of file).
Summary: fifth entity wired through ADR-0067/0069's sync
encrypt/decrypt pattern, after Learner, Attendance, Section,
LearnerScore. `repository::assessment_item::upsert_from_sync` (new,
id-keyed upsert), `commands::assessment_item::create_assessment_item_with_optional_sync`
(new, mirrors `section`'s SAVEPOINT + unconditional `base_version = 0`
create-only shape), and a new `EntityKind::AssessmentItem` arm in
`sync_client::apply_decrypted_change`.

`SectionMembership` was re-evaluated and deliberately NOT picked this
slice — its write surface is five separate temporal verbs, not one, so
wiring it needs its own dedicated multi-verb slice (see
`docs/CURRENT-HANDOFF.md`'s entry for the full reasoning).

Verification actually run this session:

- `cargo test` (full crate): 874 lib tests passing, 0 failed; every
  integration test binary passing; 0 doctests (none exist in this
  crate). Run with `RUSTFLAGS="-C debuginfo=0"` to control this shared
  host's disk footprint — a build-only flag, not a source change.
- `cargo clippy --all-targets -- -D warnings`: clean (exit code 0, no
  warnings/errors), run with the project's normal profile.
- `cargo fmt --check`: clean, no drift.
- `npm run quality:security`: gitleaks/`cargo deny check`/OSV-Scanner —
  3 ok, 0 failed, 0 missing.
- `npm run quality`/`npm run quality:ui` (TS/UI layers): not run — no
  TS/UI files touched this slice.

Independent review: no subagent-dispatch tool reachable this session;
rigorous self-review performed instead (see
`docs/VERIFICATION-DEBT.md`'s new entry for the exact checklist).
Independent `security-reviewer` review remains owed (alongside the
still-owed `LearnerScore` review below).

Environment note: this shared host hit disk exhaustion twice during
this session's own `cargo test`/`cargo clippy` runs (root filesystem at
100%, and separately the harness's own `/tmp` task-output mount at 0
bytes free) — not a code defect. Resolved both times by `cargo clean
--manifest-path src-tauri/Cargo.toml` scoped to this worktree's own
`target/` (freed ~12.7GiB each time).

Next candidate for the same pattern (not started): `SectionMembership`,
now scoped correctly as a multi-verb slice (`enroll`/
`enroll_membership`/`transfer_membership`/`end_membership`/
`correct_same_day_placement`, one `upsert_from_sync`, one `EntityKind`
arm) — see `docs/CURRENT-HANDOFF.md`'s top entry for the full reasoning.

## LearnerScore sync wiring (2026-09-06)

Full detail: `docs/CURRENT-HANDOFF.md`'s matching entry (top of file).
Summary: fourth entity wired through ADR-0067/0069's sync
encrypt/decrypt pattern, after Learner, Attendance, Section.
`repository::learner_score::upsert_from_sync` (new, id-keyed upsert),
`commands::learner_score::record_learner_score_with_optional_sync` (new,
mirrors `attendance`'s SAVEPOINT + `sync_version_cache`-derived
`base_version` shape), and a new `EntityKind::LearnerScore` arm in
`sync_client::apply_decrypted_change`.

Verification actually run this session:

- `cargo test` (full crate): 864 lib tests passing, 0 failed; every
  integration test binary passing; 0 doctests (none exist in this
  crate).
- `cargo clippy --all-targets -- -D warnings`: clean.
- `cargo fmt --check`: clean (after one `cargo fmt` pass on this
  slice's own new code; `cargo test` re-run afterward to confirm the
  reformat was behavior-neutral).
- `npm run quality:security`: gitleaks/`cargo deny check`/OSV-Scanner —
  3 ok, 0 failed, 0 missing.
- `npm run quality`/`npm run quality:ui` (TS/UI layers): not run — no
  TS/UI files touched this slice.

Independent review: no subagent-dispatch tool reachable this session;
rigorous self-review performed instead (see
`docs/VERIFICATION-DEBT.md`'s new entry for the exact checklist).
Independent `security-reviewer` review remains owed.

Environment note: this shared host hit disk exhaustion multiple times
from a second worktree's concurrent build (that worktree has since
removed itself); resolved each time by `cargo clean` scoped to this
worktree's own `src-tauri/target`, and twice by clearing disposable
shared caches (`npm`, `uv`, `osv-scalibr`, cargo registry download
cache) — not a code defect, see `docs/VERIFICATION-DEBT.md`.

Next candidate for the same pattern (not started): `SectionMembership`
— has a mature write path and materially affects other devices'
roster/attendance/gradebook views promptly.

## Stale outbox `base_version` after "keep local" fix (2026-09-05)

Full detail: `docs/CURRENT-HANDOFF.md`'s matching entry (top of file).
Summary: `repository::sync_outbox::correct_base_version_for_entity`
(new, school-scoped, keyed by `entity_kind`+`entity_id`) is called from
`commands::conflict_review::resolve_conflict_review`'s `KeepLocal`
branch immediately before `sync_conflict_review::mark_resolved`,
advancing a matching still-pending outbox row's `base_version` to
`current_hub_version`. No change to either state machine's general
shape; no UI change.

Verification actually run this session:

- `cargo test` (full crate, plain `cargo test`, not nextest) — 845 lib
  tests, 0 failed. New tests: `repository::sync_outbox::tests::correct_base_version_for_entity_updates_the_matching_pending_row`,
  `..._is_a_harmless_no_op_when_nothing_is_pending`, `..._is_school_scoped`;
  `commands::conflict_review::tests::keeping_local_corrects_the_pending_outbox_entry_so_the_next_push_is_accepted`,
  `..._using_incoming_leaves_a_pending_outbox_entrys_base_version_untouched`.
- `cargo clippy --all-targets -- -D warnings` — clean.
- `cargo fmt --check` — clean.
- `npm run quality:security` — gitleaks + `cargo deny check` + OSV-Scanner,
  3 ok / 0 failed / 0 missing.
- Not re-run: `npm run quality` / `quality:ui` — no TS/UI files were
  touched by this fix.

Environment note: the host disk was at 0 bytes free partway through this
session (`No space left on device` linker errors on `cargo test`).
Resolved with `cargo clean` scoped to this worktree's own
`src-tauri/target` (freed ~8.4 GiB). Not a code change; recorded so a
future session sees the known fix rather than assuming a build
regression.

## Sync-status screen (2026-09-05)

Full detail: `docs/CURRENT-HANDOFF.md`'s matching entry (top of file).
Summary: closes ADR-0067's "still required before production PII" list
item "sync status UI" — the last of the three sync-UI items on that
list. New read-only `commands::sync_status::get_sync_status` composes
enrollment (`device_sync_client_credential::get`), last-pull time (new
`sync_pull_cursor::last_pull_at`), pending outgoing change count (new
`sync_outbox::count_pending_for_school`), a derived "having trouble
reaching the sync hub" signal (new `sync_outbox::has_pending_failure_for_school`),
and open-conflict count (already-shipped
`sync_conflict_review::count_open_for_school`) — all session-scoped, no
new write path. Full domain/application/infrastructure/UI slice
(`src/ui/SyncStatusScreen.tsx`, routed as the "Sync Status" tab in the
existing "Sync" nav group, linking to `ConflictReviewScreen` rather than
duplicating conflict UI).

**Verification actually run**: `cargo fmt --check` clean (one auto-fix
applied); targeted new Rust tests — `sync_outbox::` 7/7,
`sync_pull_cursor::` 6/6, `commands::sync_status::` 3/3, all pass;
`cargo clippy --all-targets -- -D warnings` clean (zero warnings, whole
workspace including test targets); `npm run quality:security` 3/3 ok;
`npm run test` (vitest) 995/995 passed; `npm run
typecheck`/`lint`/`format:check`/`check:architecture` all clean;
`npm run check:deadcode` (`knip`) shows only the pre-existing baseline
finding, no new finding.

**Not run to completion**: whole-crate `cargo test` — this shared box's
disk was repeatedly exhausted by concurrent parallel worktree builds
this session (`df -h /` at ~99–100% used more than once, mid-compile `No
space left on device` failures observed directly). `cargo clippy
--all-targets` DID compile and pass the same test targets clean.
Disclosed as environment-resource debt, not silently claimed as
covered — see `docs/VERIFICATION-DEBT.md`'s matching entry; re-run
plain `cargo test` once the shared box has stable free space.

**Independent review**: `teacher-ux-reviewer`/`accessibility-reviewer`
subagent dispatch not attempted — no dispatch tool reachable this
session (same recurring gap as every prior UI slice). Self-review
performed per the documented fallback; no blocking issue found.
Independent-review debt recorded in `docs/VERIFICATION-DEBT.md`.

**Batch mode**: committed locally only, per this session's explicit
batch-implement instruction. Not pushed; no PR opened from this session.

**Next exact slice**: close the device-management/conflict-review
slice's own disclosed "keep local" stale-outbox-`base_version` gap (see
the "Conflict-review screen" entry below), plus the retained native
NVDA/Narrator passes and independent reviews across all three sync UI
slices.

> > > > > > > worktree-agent-a23a8e9fd151e7d19

## Conflict-review screen (2026-09-05)

Full detail: `docs/CURRENT-HANDOFF.md`'s matching entry (top of file).
Summary: migration 35 (`resolution` column on `sync_conflict_review`),
new repository functions (`list_open_for_school`,
`find_open_by_id_in_school`, `mark_resolved`, plus
`attendance::find_by_id_in_school`), new Tauri commands
(`commands::conflict_review::list_conflict_reviews`/
`resolve_conflict_review`), and a full domain/application/infrastructure/
UI slice (`src/ui/ConflictReviewScreen.tsx`, routed as the "Review Sync
Conflicts" tab in a new "Sync" nav group). Any authenticated school
member may resolve their own school's conflicts — a deliberate departure
from the device-management screen's stricter tier, reasoned from
ADR-0067's own (role-unspecified) design notes rather than assumed.

**Verification actually run**: `cargo fmt --check` clean; `cargo clippy
--all-targets -- -D warnings` clean; `cargo test` (full crate) exit 0;
`cargo test --lib` 840/840 passed (up from 794 baseline — 46 new); `npm
run quality:security` 3/3 ok. `npm run quality` (TS side) — `tsc -b
--noEmit`, `eslint .`, `prettier --check .`, `check-architecture.mjs`,
`knip`, `vitest run` (986/986, 96 files) all passed clean.

**Independent review**: `teacher-ux-reviewer`/`accessibility-reviewer`
subagent dispatch not attempted — no dispatch tool reachable this
session (same recurring gap as the two prior UI slices). Self-review
performed per the documented fallback; found and fixed one real gap (an
`aria-disabled` button that did not actually block its click) before
considering this done. Independent-review debt recorded in
`docs/VERIFICATION-DEBT.md`.

**Next exact slice**: close the disclosed "keep local" outbox
re-conflict limitation (see handoff entry), plus the native NVDA/
Narrator pass and the two retained independent reviews.

## Device management screen (2026-09-05)

Full detail: `docs/CURRENT-HANDOFF.md`'s matching entry (top of file).
Summary: new read-only query
(`repository::device_credential::list_active_for_school`) + Tauri command
(`commands::device_sync::list_device_sync_credentials`), plus a full
domain/application/infrastructure/UI slice
(`src/ui/DeviceManagementScreen.tsx`, routed as the "Devices" tab in the
Security nav group), consuming both the new list command and the
enroll/revoke commands the previous slice added. Card-per-device list,
plain-language two-step confirmation before revoking, generic failure
message on denial-or-already-gone (enumeration-safe). Enroll/revoke
command implementations themselves untouched, per scope.

**Verification actually run**: `cargo fmt --check` clean; `cargo clippy
--all-targets -- -D warnings` clean; `cargo test` (full crate) 826/826
passed (up from 822 — 4 new Rust tests: 3 repository, 1 command); `npm
run quality:security` 3/3 ok. `npm run quality` (TS side) — `npm ci`
resolved this session's empty `node_modules`, then `tsc -b --noEmit`,
`eslint .`, `prettier --check .`, `check-architecture.mjs`, `knip`, and
`vitest run` (964/964, 94 files) all passed clean.

**Independent review**: `teacher-ux-reviewer`/`accessibility-reviewer`
subagent dispatch attempted and unreachable this session (no
subagent-dispatch tool available) — self-review performed per the
documented fallback (see handoff entry for exactly what was checked).
One accessibility gap knowingly retained as debt: the inline confirmation
panel does not move keyboard focus into itself on open. Independent-review
debt recorded in `docs/VERIFICATION-DEBT.md`.

**Next exact slice**: conflict-review UI (surfacing `pull_once`'s staged
sync conflicts to a teacher).

## Device sync enrollment/revocation Tauri command surface (2026-09-05)

Full detail: `docs/CURRENT-HANDOFF.md`'s matching entry (top of file).
Summary: `src-tauri/src/commands/device_sync.rs`
(`enroll_device_sync_credential`, `revoke_device_sync_credential`),
registered in `commands/mod.rs` and `lib.rs`'s `generate_handler!`.
Closes the "implemented but unreachable from any Tauri command" gap the
prior verification-pass entry documented for ADR-0067/0069. Enroll
mirrors `commands::auth::login`'s credential-based bootstrap shape
(`school_id` re-verified server-side, never blindly trusted); revoke
derives `school_id` only from the active session and calls the rotating
`auth::revoke_device_sync_credential_and_rotate_sspk` wrapper exclusively
— never the raw, non-rotating function.

**Verification actually run**: `cargo build --lib` clean; `cargo test
--lib` 822/822 passed (5 new tests in `commands::device_sync::tests`:
enroll wrong-school-denied, enroll wrong-password-denied, enroll
happy-path proving a usable credential, revoke happy-path proving the
SSPK genuinely rotates through the command's own call shape, revoke
cross-school-head-denied); full-crate `cargo test` (lib + integration
binaries + doctests) exit code 0, all green; `cargo fmt --check` clean;
`cargo clippy --all-targets -- -D warnings` clean, zero warnings; `npm
run quality:security` 3/3 ok (gitleaks, cargo-deny, osv-scanner). `npm
run quality` (TS side) could not run — this session's `node_modules` is
empty, an environment condition unrelated to this Rust-only change; see
`docs/VERIFICATION-DEBT.md`.

**Independent review**: `security-reviewer` subagent dispatch attempted
and unreachable this session (same known harness gap as prior ADR-0067/
0069 slices) — self-review performed per the documented fallback,
focused specifically on the authorization gate and the revoke command's
rotation path (see the handoff entry for exactly what was checked).
Independent-review debt recorded in `docs/VERIFICATION-DEBT.md`.

**Next exact slice**: device-management UI (enroll/revoke screen) or
conflict-review UI — either now unblocked, neither pre-selected.

## `db::rotate_sspk` closes ADR-0069's device-revocation key rotation (2026-09-05), commit + PR owed

Full detail: `docs/CURRENT-HANDOFF.md`'s matching entry. Summary: added
`KeyStore::rotate_key`/`DpapiKeyStore::rotate_key_file` (atomic
generate-protect-write-to-temp-then-rename overwrite of an existing
DPAPI-protected key file), `db::rotate_sspk(app: &AppHandle)` mirroring
`load_or_mint_sspk`, and `auth::revoke_device_sync_credential_and_rotate_sspk`
(closure-injected so the coordination logic stays testable without a
real Tauri runtime) composing the existing, unchanged
`revoke_device_sync_credential` with the new rotation. Run on real
Windows hardware this session — the DPAPI tests genuinely exercise
`CryptProtectData`/`CryptUnprotectData`, not a hardware-gated skip.

**Ordering**: filesystem rotation happens only after the DB-side
revoke/wrap-clear commits, never inside its `SAVEPOINT` — chosen because
a filesystem hiccup must never block the security-critical revocation
itself, and a rotation retry is always safe on its own. Proven with a
test that injects a rotation failure and confirms the revocation still
committed. This ordering alone does not close the DB/filesystem gap
between the two steps — see Independent review below for what does.

**Verification actually run**: `cargo build --lib` clean; `cargo test
--lib` 825/825 passed (816 baseline + 9 new: 4 in `crypto::dpapi`, 4 in
`auth`, net 1 in `repository::sync_payload_key`); full-crate `cargo test`
(lib + integration binaries + doctests) exit code 0; `cargo fmt --check`
clean; `cargo clippy --all-targets -- -D warnings` clean, zero warnings;
`npm run quality:security` 3/3 ok (gitleaks, cargo-deny, osv-scanner —
all genuinely present on this machine, re-run clean after the fix below;
no new dependency added). `npm run quality` (TS side) not attempted — no
TS/UI file touched.

**Independent review — real finding, fixed same session**: a
`security-reviewer` subagent found a genuine SHOULD-FIX: the original
`ensure_wrapped_for_credential` only checked whether a wrap row existed,
not whether its content matched the current SSPK, so a device
authenticating in the DB/filesystem rotation gap would get permanently
stranded on a stale key (the exists-only check would never revisit it).
Fixed: it now compares a wrap's actual decrypted content against the
SSPK it was given and self-heals a mismatch via a new, narrowly-scoped
`refresh_wrap_for_credential` upsert — closing the race regardless of
which order the DB/filesystem steps land in. One pre-existing test had
encoded the old (buggy) behavior as intentional; corrected into two
tests (matching wrap stays untouched; stale wrap self-heals). Reviewer's
three other findings were informational only, no action needed (no
Tauri command reaches this yet; key zeroization matches an existing
codebase-wide pattern; a `fsync`-before-rename inconsistency with the
older `create_new_key_file` noted for future alignment). No blocking
findings; no recurrence of this project's two previously-documented
failure classes.

**Retained debt**: no Tauri command or UI exists for device
enrollment/revocation at all (confirmed by search before starting —
not a regression from this slice); the remaining sync-entity
generalization backlog (`SectionMembership` + six other `EntityKind`
variants).

**Product-direction note**: ADR-0067's school-laptop hub is the settled
architecture, confirmed by the owner this session — the EO 119 legal
block only constrains the already-superseded offshore-Cloudflare
direction (ADR-0065), not this one.

**Exact next slice**: build the actual device-enrollment/revocation
Tauri command(s) plus the conflict-review UI (ADR-0067's named open
production gates), or continue the sync-entity generalization backlog
(`SectionMembership` next) — whichever the next session's evidence
favors per `.claude/rules/autonomous-development.md`.

## Sync payload encrypt/decrypt generalized to a third entity, Section — closes the Attendance FK gap (2026-09-05), commit + PR owed

Full detail: `docs/CURRENT-HANDOFF.md`'s matching entry. Summary: wired
`commands::section::create_section` onto the exact same
encrypt-on-enqueue pattern `create_learner`/`record_attendance` already
use, added `repository::section::upsert_from_sync`, and added an
`EntityKind::Section` arm to `sync_client::apply_decrypted_change`.
Chosen over `SectionMembership` because `attendance_records.section_id`
is the actual FK the prior slice's own recorded limitation named —
`SectionMembership` has no FK relationship to `attendance_records` at
all. Create-only like `Learner` (`base_version` always `0`) — `Section`
has no `update` command today.

**Confirms the FK gap actually closes**: a new `sync_client` test pulls
a `Section` first (never created locally, only materialized via
`upsert_from_sync`), then pulls an `Attendance` change referencing that
exact section id, and asserts it applies cleanly instead of hitting the
FK violation the prior slice's own "retained debt" entry described.

**Verification actually run**: `cargo build --lib` clean; `cargo test
--lib` 816/816 passed (803 baseline + 13 new: 2 in `repository::section`,
3 in `commands::section`, 8 in `sync_client`); full-crate `cargo test`
(lib + integration binaries + doctests) exit code 0, all green; `cargo
fmt --check` clean (after one `cargo fmt` pass fixed drift this slice
introduced); `cargo clippy --all-targets -- -D warnings` clean, zero
warnings; `npm run quality:security` 3/3 ok (gitleaks, cargo-deny,
osv-scanner — all three genuinely present and run on this machine; no
new dependency added). `npm run quality` (TS side) not attempted — no
TS/UI file touched (an `AppHandle` parameter needs no frontend change).

**Independent review**: `security-reviewer` subagent dispatched, did
real comparative work, but was terminated mid-review by this session's
own Claude usage limit before reporting findings — same practical
outcome as this project's previously-documented agent-resume failure,
different cause. Documented fallback followed: recorded honestly,
rigorous self-review performed, no blocking issue found, debt retained.
See `docs/CURRENT-HANDOFF.md`'s matching entry for the specific
self-review points.

**Retained debt**: `db::rotate_sspk`/DPAPI (needs native Windows
verification, out of scope for this slice); generalizing this
encrypt/decrypt pattern to the remaining seven `EntityKind` variants
(`SectionMembership`, `AssessmentItem`, `LearnerScore`,
`TeachingAssignment`, `Subject`, `GradingPeriod`, `SubjectAttendance`);
independent security review of this slice specifically (owed, not
dropped — the dispatched reviewer was cut off by a usage limit, not a
completed pass).

**Exact next slice**: wire `SectionMembership` next (it already has real
producing write paths via `commands::section::enroll_*`/
`transfer_learner_membership`/`end_learner_membership`), or pick up
`db::rotate_sspk`/DPAPI once native Windows verification is available —
whichever the next session's evidence favors per
`.claude/rules/autonomous-development.md`.

## Sync payload encrypt/decrypt generalized to a second entity, Attendance (2026-09-05), commit + PR owed

Full detail: `docs/CURRENT-HANDOFF.md`'s matching entry. Summary: wired
`commands::attendance::record_attendance` onto the exact same
encrypt-on-enqueue pattern `create_learner` already uses, added
`repository::attendance::upsert_from_sync`, and added an
`EntityKind::Attendance` arm to `sync_client::apply_decrypted_change`.
Chosen over the other unwired entities because it is the domain write a
teacher needs reflected promptly across a shared school-laptop hub.
Unlike learner (create-only, `base_version` always 0), attendance can be
re-recorded, so its enqueue reads `sync_version_cache`'s known version as
`base_version`.

**Verification actually run**: `cargo build --lib` clean; `cargo test
--lib` 803/803 passed (794 baseline + 9 new); full-crate `cargo test`
(lib + integration binaries + doctests) exit code 0; `cargo fmt --check`
clean; `cargo clippy --all-targets -- -D warnings` clean, zero warnings;
`npm run quality:security` 3/3 ok (gitleaks, cargo-deny, osv-scanner — no
new dependency added). `npm run quality` (TS side) not attempted — no
TS/UI file touched.

**Independent review**: no `security-reviewer` subagent reachable this
session — documented fallback followed (recorded honestly, rigorous
self-review performed, no blocking issue found, debt retained). See
`docs/CURRENT-HANDOFF.md`'s matching entry for the specific self-review
points, including the `Section` FK limitation this choice surfaced.

**Retained debt**: `db::rotate_sspk`/DPAPI (needs native Windows
verification); generalizing this encrypt/decrypt pattern to the
remaining eight `EntityKind` variants; independent security review
(owed, not dropped); a device that pulls an attendance change
referencing a section it has never independently created locally will
FK-reject it (fails closed, retried forever, never silently corrupts —
but never succeeds until `Section` is also sync-wired).

**Exact next slice**: wire `Section` (or `SectionMembership`) next — it
both unblocks real-world `Attendance` pulls and is itself reference data
worth replicating, or pick up `db::rotate_sspk`/DPAPI once native
Windows verification is available — whichever the next session's
evidence favors per `.claude/rules/autonomous-development.md`.

## Sync payload encrypt/decrypt round trip closed for the learner entity — ADR-0069 addendum (2026-09-05), commit + PR owed

Full detail: `docs/CURRENT-HANDOFF.md`'s matching entry and ADR-0069's
newest addendum. Summary: enqueue-side encryption was already complete
(`commands::learner::enqueue_learner_sync_change`); this slice added
pull-side decrypt + apply. New: `GET /sync/payload-key-wrap` hub endpoint

- `repository::sync_payload_key::get_wrap_for_credential` (serves a
  device its own stored wrap, never the plaintext SSPK);
  `sync_client::resolve_sspk` (fetches + unwraps it locally with the
  device's own secret); `repository::learner::upsert_from_sync` (the
  existing-write-path materializer); `sync_client::apply_decrypted_change`
  (decrypt, deserialize, cross-check `school_id`, upsert — fails closed on
  any step). `pull_once` now stops the batch and marks the round `failed`
  on a rejected change rather than skipping past it, so the domain table/
  version cache/cursor never advance past a bad change.

**Verification actually run**: `cargo build` (whole crate) clean; `cargo
test --lib` 794/794 passed (784 baseline + 10 new); full-crate `cargo
test` (lib + integration binaries + doctests) exit code 0; `cargo fmt
--check` clean; `cargo clippy --all-targets -- -D warnings` clean, zero
warnings; `npm run quality:security` 3/3 ok (gitleaks, cargo-deny,
osv-scanner — no new dependency added). `npm run quality` (TS side) not
attempted — no TS/UI file touched.

**Independent review**: no `security-reviewer` subagent reachable this
session — documented fallback followed (recorded honestly, rigorous
self-review performed, no blocking issue found, debt retained). See
ADR-0069's newest addendum for the specific self-review points.

**Retained debt**: `db::rotate_sspk`/DPAPI file-overwrite (needs native
Windows verification); generalizing this encrypt/decrypt pattern to the
other nine `EntityKind` variants (none has a producing write path yet);
independent security review (owed, not dropped).

**Exact next slice**: generalize the encrypt/decrypt/apply pattern to the
next domain entity with a real producing write path, or pick up
`db::rotate_sspk`/DPAPI once native Windows verification is available —
per `.claude/rules/autonomous-development.md`'s priority order.

## Payload-key rotation on device revocation — ADR-0069 addendum (2026-09-05), commit + PR owed

Full detail: `docs/CURRENT-HANDOFF.md`'s matching entry and ADR-0069's
"the 10-scenario decision on key rotation on revocation" addendum.
Summary: `auth::revoke_device_sync_credential` now atomically rotates
the school's sync-payload key by clearing every stored wrap
(`sync_payload_key::rotate_for_school`); each still-active device
transparently recovers a fresh wrap on its next authenticated contact
(`sync_payload_key::ensure_wrapped_for_credential`, called from
`hub_server::authenticate`). Lazy propagation was chosen over an
asymmetric-keypair scheme (Next Best) because the hub never retains a
device's plaintext secret past enrollment, so it cannot proactively
re-wrap for anyone but the device currently authenticating.

**Verification actually run**: `cargo build --lib` clean; `cargo test
--lib` 786/786 passed (784 first pass + 2 added by a self-review fix —
see below); `cargo fmt --check` clean; `cargo clippy
--all-targets -- -D warnings` clean, zero warnings; full-crate `cargo
test` (lib + integration binaries + doctests) exit code 0; `npm run
quality:security` 3/3 ok (gitleaks, cargo-deny, osv-scanner — no new
dependency added). `npm run quality` (TS side) could not run —
pre-existing sandbox gap (`tsc` cannot resolve `vite`/`vitest` types,
`node_modules` incomplete), unrelated to this Rust-only change; see
`docs/VERIFICATION-DEBT.md`.

**Independent review**: no `security-reviewer` subagent tool was
available this session; the `security-review` skill's scripted
`git diff origin/HEAD...` precondition failed in this sandbox
(unresolvable ref). Fallback per this project's own rule: recorded
honestly, rigorous self-review performed instead — and it found a real
gap, not just style nits: `ensure_wrapped_for_credential` had no
`revoked_at` check of its own (safety depended entirely on its one call
site's ordering), and the test meant to prove otherwise actually proved
something weaker. Both fixed in this same slice before being marked
done — see `docs/CURRENT-HANDOFF.md`'s entry and ADR-0069's newest
addendum for the full account. Independent review of the fixed version
is still retained as owed debt for a future session.

**Deliberately deferred, next exact task**: `db::rotate_sspk` (mint +
persist a genuinely NEW plaintext SSPK to the hub's local DPAPI file on
revocation, Windows-only, unverifiable in this sandbox) is not yet
wired — today's rotation is real and tested at the database/wrap layer,
but a live revocation on a real installation would still hand out the
SAME old SSPK to the next re-wrap until that function exists and is
called from the revoke command path. Needs native Windows verification
before being marked done.

## Grade 12 DO 8 weighting carryover — ADR-0068 (2026-09-04) — merged as PR #44 (main `aac0ed7`)

The six Strengthened-SHS policies were already complete in migration 12; the
actual remaining P0 grading gap was Grade 12's DO 8, s. 2015 transition rule.
Migration 30 adds all five legacy SHS applicability groups against the
existing legacy category set. Tests cover seed completeness, 100% totals,
category-set isolation, separate equal-weight track groups, and an end-to-end
35/40/25 computation using DO 015's adjusted SY 2026-2027 transmutation.

Actually merged to `main` directly (not stacked on the ADR-0067 branch as
originally planned below) — the owner chose codex-first during the 2026-09-04
non-CC repository audit, so this landed as migration 30 and the ADR-0067
branch's `device_identity` migration was renumbered 30 → 31 and rebased on
top instead. A `cargo fmt` fix (the PR's only CI failure) was applied before
merge; full CI (Quality Gate Ubuntu+Windows, Security Gate) passed green.
SF1/SF9/SF10 template verification remains with the separate Claude Code
workstream.

**Rust-toolchain verification gate CLOSED (2026-09-05)**: `cargo fmt
--check`/`cargo clippy --all-targets -- -D warnings`/`cargo test` (full
crate, 762 lib tests + all integration binaries) all genuinely run and
confirmed clean on a Rust-capable runner, closing what this ADR recorded
as owed while it was authored on a toolchain-less runner.

**Weight-transcription re-verification CLOSED (2026-09-05)**: directly
retrieved and read the ADR's own cited DepEd Caraga regional source
(an 80-page handbook PDF, readable via paginated PDF extraction though not
via a plain HTML fetch) and independently transcribed its Table 2 —
matches the ADR's Decision table and migration 30's seed data exactly,
digit for digit, across all five groups. Full record:
`docs/adr/0068-grade12-do8-weighting-carryover.md`'s 2026-09-05 addendum;
`docs/VERIFICATION-DEBT.md`.

**Still owed, not closed by the above**: the actual DepEd Central Office
PDF remains unretrieved (still 403 from this environment); an independent
check of the carryover _applicability_ logic (which learners/subjects fall
into each of the five groups) is distinct from the weight-figure
re-verification above and remains open.

## School-laptop authoritative sync hub — ADR-0067 (added 2026-09-04) — foundation in progress

The owner selected one supervised, always-on computer-lab laptop as the
complete school consolidation point, with the ICT coordinator as custodian.
ADR-0067 supersedes ADR-0065's offshore target. Recommended reachability is
school LAN plus optional Tailscale for home sync; Next Best is LAN-only with
home changes queued offline. The provider-neutral `SyncProvider` contract,
allowlist, size guard, and review-not-last-write-wins policy are implemented.

**Still required before production PII:** persistent transactional outbox and
hub log; enrolled/revocable device credentials; payload key ceremony; scoped
push/pull adapters; conflict-review UI; sync status UI; laptop hardening;
encrypted backup and witnessed restore drill; native Windows verification;
school-head/DepEd-DPO written approval. No real learner data before these gates.

**Completed next slice:** migration 25 and `repository::sync_outbox` add the
encrypted local queue, bounded batches, idempotent enqueue, fixed retry codes,
school-scoped retry/acknowledgement, and rollback proof. No domain repository
emits changes yet, so ordinary application writes are unchanged.

**Completed next slice (2026-09-04, this session):** migration 26
(`device_sync_credentials`, one active credential per device via a partial
unique index, SHA-256 digest never the plaintext secret) and migration 27
(widens `audit_log` for `device_enrolled`/`device_revoked`).
`repository::device_credential` (enroll/verify/revoke, constant-time secret
comparison, enumeration-safe `verify`) plus the trusted-boundary
`auth::enroll_device_sync_credential` (re-verifies username/password exactly
like `login`, but issues a distinct longer-lived credential instead of an
interactive session) and `auth::revoke_device_sync_credential`
(self-or-School-Head, with an explicit same-school check — a School-Head
role check alone is not enough, the same cross-school bug class this
module's other `authorize_*` gates already guard against). 29 new tests;
`cargo test` 689 lib tests, `cargo clippy -D warnings`, `cargo fmt --check`
all clean. Not yet wired to any Tauri command or network listener — this is
the persistence/authorization foundation only, matching this project's own
zero-UI-first precedent.

**Completed next slice (2026-09-04, this session):** migrations 28
(`sync_hub_log`) and 29 (`sync_conflict_review`); `repository::sync_hub`
(`push_change`/`push_batch`/`pull_since`). A push is validated
(`sync::validate_change`), cross-checked against the caller's already-verified
`device_credential::VerifiedDevice` (a change claiming a different device or
actor than the authenticated credential is rejected — the client never gets
to assert its own identity), then either accepted at a new per-entity version
with a monotonic hub cursor, replayed idempotently (same `change_id` twice
returns the same cursor, no duplicate row), or staged in
`sync_conflict_review` when `base_version` doesn't match the entity's current
hub version (never silent last-write-wins, per the ADR's protocol contract
point 6). `pull_since` returns accepted changes after a cursor, school-scoped.
As part of this slice, `EntityKind`/`ChangeOperation`'s db-string conversions
were promoted from a private duplicate in `sync_outbox` into shared,
`rusqlite`-free methods on the types themselves (`crate::sync` stays
provider/database-agnostic by design), and `sync_outbox` was updated to use
them — a small DRY cleanup enabling this slice, not a speculative refactor.
17 new tests (13 `sync_hub`, 4 migration contract). `cargo test` 704 lib
tests + all integration binaries, 0 failed. `cargo clippy -D warnings` and
`cargo fmt --check` clean. Still not wired to a network listener — this
receiver is called directly by tests today; the actual LAN/Tailscale
transport adapter is the next slice after this one.

**Completed next slice (2026-09-04, this session):** migration 31
(`device_identity`, renumbered from 30 after rebasing onto merged PR #44's
migration 30 — see the ADR-0068 entry above; same
`id INTEGER PRIMARY KEY CHECK (id = 1)` singleton pattern as
`installation_state`) and
`repository::device_identity::current_or_create` — a stable id for THIS
physical installation, generated once and race-safe the same way
`installation::claim_bootstrap_slot` already is (an `INSERT ... ON CONFLICT
DO NOTHING` as the real write, never a `SELECT`-then-act check). Needed
before either device enrollment or outbox wiring can use a real device id
instead of a caller-invented placeholder string. 4 new tests. `cargo test`
708 lib tests + all integration binaries, 0 failed; `cargo clippy -D
warnings` and `cargo fmt --check` clean.

**Completed next slice (2026-09-04/05, ADR-0069, PR #46):** the sync
payload key ceremony this section previously flagged as genuinely
blocking. The hub mints one school sync-payload key (SSPK) and wraps a
copy for each device at enrollment, deriving each device's wrap key via
HKDF-SHA256 over the same enrollment secret `device_credential::enroll`
already generates — reusing 100% of the existing enrollment trust
boundary rather than inventing a new pairing/key-exchange ceremony. Full
decision record, including the alternatives considered and why an
asymmetric per-device keypair scheme was rejected:
`docs/adr/0069-sync-payload-key-ceremony.md`. `crypto::payload_key`
(generate/derive/wrap/unwrap, 10 tests) + `repository::sync_payload_key`
(`wrap_for_credential`/`unwrap_for_credential`, 7 tests) + migration 32
(1 contract test). See `docs/CURRENT-HANDOFF.md` for the disclosed
irregularity in how this landed (a usage-limit-gap direct-to-main commit,
fixed via PR #46 through the normal branch/PR/CI flow) and full
verification counts.

**Still not decided/built** (ADR-0069's own "Not yet decided" section):
client-side local persistence of the unwrapped SSPK for offline use (the
natural answer is the same DPAPI-protected local key-file pattern
`crypto::dpapi`/`db::open_app_db` already use for the SQLCipher key, a
second separately-named file) — needed before `sync_outbox` enqueue can
actually encrypt a domain write's `PendingChange`, since that must work
offline without hub contact. Key rotation remains deferred to a
documented custodian procedure, unchanged from ADR-0067's own scope.

**Completed next slice (2026-09-05, this session):** a status-report
cross-check against the shipped code found `device_credential::enroll`
was never actually extended to call `wrap_for_credential` — ADR-0069's own
"Verification" section claimed it was, the code did not match — and a
genuine contradiction in ADR-0069's mechanism as written: it required
"never persisted in plaintext anywhere... beyond the single transaction"
for the SSPK, while also requiring every enrollment after the first to
"wrap the same underlying key," which is impossible without persisting it
_somewhere_ durable. Resolved by extending the SAME DPAPI-protected local
key-file pattern (`crypto::dpapi`/`db::open_app_db`) ADR-0069 itself named
as "the natural answer" for client-side persistence — applied first to the
hub's own local copy, a second, separately-named file
(`db::load_or_mint_sspk`, `SSPK_KEY_FILE_NAME`), never sharing a file or
value with the SQLCipher key. `auth::enroll_device_sync_credential` now
takes the resolved SSPK as a parameter and wraps it for the new credential
in the same atomic `SAVEPOINT` as `device_credential::enroll` — closing
the gap for real, not just in the ADR's prose. Also added
`crypto::payload_key::encrypt_payload`/`decrypt_payload` — general-purpose
AES-256-GCM encrypt/decrypt of arbitrary-length bytes under the SSPK
(distinct from `wrap_payload_key`/`unwrap_payload_key`, which only ever
wrap a fixed 32-byte key), the actual primitive an outbox-enqueuing domain
write will call. Full record: ADR-0069's 2026-09-05 addendum. 19 new
tests (2 `auth`, 7 `crypto::payload_key`). `cargo test`: 737 lib tests +
all integration binaries, 0 failed; `cargo clippy -D warnings` and `cargo
fmt --check` clean.

**Still not done:** no Tauri command resolves an SSPK or calls
enrollment; no domain write encrypts a payload and calls
`sync_outbox::enqueue`; per-entity "what hub version does this device
believe it's at" tracking (needed to set a correct `base_version` on an
_update_, not just a first-time create) does not exist anywhere; the
network listener/transport does not exist.

**Completed next slice (2026-09-05, this session):** migration 33
(`sync_version_cache`, `PRIMARY KEY (school_id, entity_kind, entity_id)`)
and `repository::sync_version_cache::known_version`/`record_known_version`
— this device's local record of "what hub version did I last see for this
entity," distinct from `sync_hub_log.version` (the hub's own authoritative
record). `known_version` defaults to `0` for an entity never recorded,
matching `PendingChange::base_version`'s own "nothing to conflict against
yet" convention. `record_known_version` is a monotonic upsert
(`ON CONFLICT ... DO UPDATE SET known_version = MAX(known_version,
excluded.known_version)`) — an out-of-order ack or pull carrying a stale,
lower version can never regress what this device already knows. 6 new
tests, including school-scoped and entity-kind-scoped isolation (the same
`entity_id` under a different school or a different `entity_kind` tracks
independently). `cargo test`: 744 lib tests + all integration binaries, 0
failed; `cargo clippy -D warnings` and `cargo fmt --check` clean. Not yet
called by any domain write or by the (still nonexistent) push/pull
orchestration loop that would actually update it after a real round trip
— this is the persistence primitive only, matching this project's
zero-UI-first precedent.

**Completed next slice (2026-09-05, this session):** the first real
domain write wired end-to-end — `commands::learner::create_learner` and
`create_learner_with_duplicate_check` (the command the manual Create
Learner UI actually calls). Before touching either command, hit a real
product question: `db::load_or_mint_sspk` mints a brand-new DPAPI key
file unconditionally on first call, so wiring it into an existing,
already-shipped, UI-called command would silently start creating
cryptographic material and outbox rows for every installation, including
ones that never intend to use the school-laptop sync hub. Asked the
owner rather than deciding unilaterally: **sync stays opt-in by
enrollment** — a domain write only emits a sync change if this school
already has at least one active device sync credential
(`device_credential::has_active_for_school`, new). A non-enrolled
installation behaves exactly as it did before ADR-0067 existed: no SSPK
file, no outbox row, zero new side effects.

When enrolled, the learner insert and the outbox enqueue are atomic
together in one `SAVEPOINT`. `base_version` is unconditionally `0` for
this create case (a brand-new `entity_id` has no prior hub version to
conflict against) — `sync_version_cache` is deliberately NOT written here
(only read, by a future update path): writing it optimistically before
any real hub round trip could let the cache diverge from truth with no
pull able to correct it downward, since `record_known_version` is a
monotonic-max upsert. The command layer's `AppHandle`-dependent SSPK
resolution is a thin, one-line wrapper (`resolve_sspk_if_enrolled`); all
the substantial logic is a plain `&Connection`-only function so it's
fully unit-testable without a real Tauri runtime, matching this
codebase's existing `commands::auth` precedent for command-layer unit
tests. `Learner` gained `Deserialize` (previously outbound-only) so the
test suite (and a future materializer) can round-trip the JSON payload
after decryption.

4 new tests in `commands::learner` (no-SSPK is a no-op; an enrolled
create's outbox entry round-trips through `encrypt_payload`/
`decrypt_payload` back to the identical `Learner`; the change is stamped
with this installation's own `device_identity`; a rejected
`LrnConflict` duplicate-check attempt enqueues nothing) plus 4 new
`device_credential::has_active_for_school` tests. `cargo test`: 752 lib
tests + all integration binaries, 0 failed; `cargo clippy -D warnings`
and `cargo fmt --check` clean.

**Known, disclosed limitation:** SF1 bulk import's commit path calls
`repository::learner::create` directly, bypassing this command entirely
— so bulk-imported learners are NOT yet covered by this sync wiring. Not
a regression (SF1 import never emitted sync changes before this slice
either), but worth closing before sync is considered complete for
learner data.

**Completed next slice (2026-09-05, this session):** the network
listener's HTTP surface itself. Researched the library choice first (an
in-session subagent's research report was not retrievable — a known,
already-documented harness failure mode this project has hit before, see
M7; per the established protocol, did the research directly instead of
retrying): **`axum`** (tokio-rs org, MIT, actively maintained), over
`warp` (also maintained, less ergonomic `Filter` API), `tiny_http`
(dormant since 2022-10), `actix-web` (too heavy for two JSON endpoints),
and hand-rolled raw TCP (reinvents what an audited library gives for
free). Full record: ADR-0067's 2026-09-05 network-listener addendum.

New `hub_server` module: an `axum::Router` exposing `POST /sync/push` and
`GET /sync/pull`, both authenticated via `x-likha-credential-id`/
`x-likha-device-secret` headers (never a query param) through
`device_credential::verify`'s existing enumeration-safe check, wired
straight to `sync_hub::push_batch`/`pull_since`. Errors crossing this
boundary map to a small closed set (401/400/500, fixed generic messages)
— never an internal error string, matching `AppError::Import`/
`FormGeneration`'s existing IPC-boundary discipline. Along the way, found
and fixed a real bug before it could ship: `PushOutcome`'s naive
`#[serde(tag = "...")]` derive doesn't support a tuple variant wrapping a
newtype (`Accepted(SyncCursor)`) — serde rejects it at serialization
time, not compile time — switched to `tag`+`content` (adjacently tagged).
5 new tests, including a full authenticated push-then-pull round trip
through the router as a `tower::Service` (no real TCP socket bound).
`Learner`'s (and `PendingChange`'s existing) `Serialize`+`Deserialize`
pattern extended to `sync_hub::PushOutcome`/`AcceptedChange` for the same
reason. New dependencies: `axum` 0.8.9 (`json`,`http1`,`tokio` features
only), `tower` (dev-only, `util` feature, for router testing), `tokio`
(dev-only, `macros`+`rt-multi-thread`, for `#[tokio::test]`). `cargo
test`: 759 lib tests + all integration binaries, 0 failed; `cargo clippy
-D warnings` and `cargo fmt --check` clean; `npm run quality:security`
(gitleaks + cargo-deny + osv-scanner) clean — no new advisories from any
of the three new dependencies.

**Deliberately NOT done in this slice** (see ADR-0067's addendum for the
full list): binding the router to a real TCP socket and choosing which
interface to bind (LAN/Tailscale, never `0.0.0.0`); wiring it into Tauri
app startup; TLS-or-documented-plaintext-inside-transport decision;
rate limiting; the CLIENT side of this protocol (nothing yet calls these
two endpoints from a device — the router only has a server implementation
and tests so far).

**Completed next slice (2026-09-05, this session):** wired
`hub_server::router` into real Tauri app startup —
`hub_server::maybe_spawn_listener` is called from `lib.rs`'s `setup`
hook. Gated the same way the client-side write path already was
(`commands::learner`): new `hub_server::should_listen` starts the
listener only if this installation has ever enrolled a device for some
school (`device_credential::has_active_for_school`, checked across every
school `school::list_all` returns) — a plain, never-enrolled installation's
startup is completely unaffected, no new socket, no new attack surface.
A bind failure (e.g. the port already in use) is logged, never fatal —
sync must never be able to crash app startup.

**Deliberately scoped down rather than half-verified**: the listener
binds **loopback only** (`127.0.0.1:7878`), not a real LAN or Tailscale
interface. Resolving the actual bind interface (never `0.0.0.0`, per
ADR-0067's own operations gate) needs either a new interface-enumeration
dependency or a documented manual-configuration decision, plus native
Windows network verification this sandboxed development environment
cannot perform — recorded as the honest boundary of this slice rather
than guessed at. The listener's own state (a second `Connection` to the
same encrypted database file, opened specifically because axum's `State`
extractor needs `'static`+`Clone`, which Tauri's own managed
`State<'_, Mutex<Connection>>` can't satisfy) is safe under WAL mode,
already enabled specifically for multi-connection coexistence.

3 new `should_listen` tests (false before enrollment, true after, false
again once the only credential is revoked). `cargo test`: 762 lib tests +
all integration binaries, 0 failed; `cargo clippy -D warnings` and
`cargo fmt --check` clean; `npm run quality:security` clean (promoting
`tokio` from a dev-only to a direct runtime dependency, for
`tokio::net::TcpListener`, added no new advisories).

**Completed next slice (2026-09-05, this session):** the client-side
push/pull loop this section's own "exact next implementation slice" named
below — new `sync_client` module. `push_once` drains `sync_outbox` in
bounded batches (50/round) to `POST /sync/push` and maps the hub's
per-change outcome onto `sync_outbox`'s EXISTING acknowledge/
`record_attempt` state machine: `Accepted`/`AlreadyApplied` → advance
`sync_version_cache` to `base_version + 1` and acknowledge;
`ConflictStaged` → acknowledge without touching the version cache (the
hub already durably recorded it; retrying only replays the same outcome);
any transport/HTTP/protocol failure → `record_attempt` with the matching
existing `AttemptErrorCode`, outbox row left completely untouched.
`pull_once` GETs `/sync/pull` after this device's own stored cursor (new
`repository::sync_pull_cursor`, migration 34) and, per accepted change,
either advances `sync_version_cache`'s watermark or — when this device
has its own unsynced local edit (a `sync_outbox` row) for the same entity
— stages it into the existing `sync_conflict_review` queue via new
`repository::sync_conflict_review::stage_pull_conflict` (reusing migration
29's table for a new pull-side case) instead of overwriting the live
version cache: never silent last-write-wins on the pull side either.
`sync_client::maybe_spawn_loop` wired into `lib.rs`'s `setup` hook next to
`hub_server::maybe_spawn_listener`, gated by `sync_client::should_run` on
a new `device_sync_client_credential` table (migration 34) — this
device's own retained copy of the bearer secret
`device_credential::enroll` returns exactly once, which nothing
previously stored anywhere reusable. A never-enrolled installation stays
completely unaffected.

New direct dependency: `reqwest` (`blocking`+`json`+`query` only, no TLS
feature — every request targets loopback plain HTTP). Full reasoning
(including why `cargo tree -i reqwest` was misleading) in ADR-0067's new
addendum.

**Deliberately NOT done, and why** (ADR-0067's addendum has the full
reasoning): decrypting `AcceptedChange::encrypted_payload` and writing
pulled changes into actual domain tables — needs the ADR-0069 payload-key
ceremony, which has no Tauri command exposing it yet; wiring
`auth::enroll_device_sync_credential` to auto-populate
`device_sync_client_credential` (no enrollment command is surfaced to any
caller yet, so nothing populates either credential table outside this
module's own tests); a sync-status UI.

8 new `sync_client` tests, each driven over a REAL HTTP round trip
(`hub_server::router` bound to an ephemeral loopback port via a
background-thread tokio runtime, hit with an actual
`reqwest::blocking::Client`), not just `tower::Service` calls: outbox
draining + acknowledgement, no-op on an empty outbox, push-side conflict
staging + dequeue, unauthorized-credential handling leaves the outbox row
untouched, pull appl…55172 tokens truncated… against source that `school_id` is derived
exclusively from the session everywhere in `commands::grading::*`,
`policy_period_id` is existence-checked before use with the write itself
scoped to the session-derived `school_id`, `grading_policies`/
`grading_policy_periods` genuinely carry no `school_id` column (confirmed
non-tenant reference data, not merely assumed), all queries are
parameterized, `list_by_school_year` filters by `school_id` in its literal
SQL, and the schema-level `CHECK`/`UNIQUE` constraints are real and
propagate violations through `AppResult` rather than panicking or
silently succeeding.
`architecture-reviewer`/`teacher-ux-reviewer`/`accessibility-reviewer`
were not attempted for M11 — same standing debt as M7/M8/M9/M10.

**Verification gap, disclosed**: the usual compiled-`app.exe` relaunch
check for the new migration was attempted three times and was
inconclusive (process ran without crashing, stderr stayed empty, but
stdout log capture returned 0 bytes each time — most likely a
PowerShell/pipe-buffering artifact of force-terminating a GUI process,
not a real defect). Not treated as a blocker given the six dedicated,
passing migration-6 tests running the actual migration SQL against a
real SQLite connection — see ADR-0010 for full detail.

Not implemented (deliberately out of scope, see ADR-0010): grade
computation/weighting, a gradebook, editing/deleting a saved grading
period, Senior High School's separate semester structure, any UI for
adding a third grading policy.

## M12a Gradebook/Class Record Foundation — Complete (2026-08-24)

Goal: the workspace foundation M12b's assessment items/scores will attach
to — one section + one subject + one grading period — without
committing to a schema M13's grade-computation research will likely
force a rework of. User directed the full M12/M13/M14 roadmap in one
message; per advisor consultation before implementation, M12 was split
into phases (M12a this milestone, M12b assessment items/scores, M12c
keyboard/mobile/audit polish) rather than built as one pass. Full
decision: `docs/adr/0011-gradebook-class-record-foundation.md`.

Delivered:

- `src-tauri/src/db/migrations.rs` migration 7: `subjects` (school-scoped
  reference data, `UNIQUE (school_id, name)`), `class_records` (joins
  `section_id`/`subject_id`/`grading_period_id`, `UNIQUE (section_id,
subject_id, grading_period_id)` — a structural no-duplicate-combination
  guard, not check-then-act).
- `src-tauri/src/repository/subject.rs`: mirrors `section.rs`'s
  `create`/`find_by_id_in_school`/`list_by_school` shape exactly.
- `src-tauri/src/repository/class_record.rs`: `create` verifies
  `section_id`/`subject_id`/`grading_period_id` all resolve within the
  caller's school, **and** that the section's `school_year` matches the
  grading period's `school_year` — `ClassRecord` stores no `school_year`
  of its own precisely so there's one source of truth, not two values
  that could drift. All four rejection reasons collapse into `Ok(None)`,
  matching `section_membership::enroll`'s established convention.
  `list_by_school` returns a joined `ClassRecordDetail` (section/subject/
  grading-period names) so a list screen needs no extra round trips.
  `grading::find_by_id_in_school` changed from private to `pub` so this
  module could reuse it.
- `src-tauri/src/commands/subject.rs`, `commands/class_record.rs`:
  `school_id` derived only from the session; `section_id`/`subject_id`/
  `grading_period_id` are client-supplied the same legitimate way
  `section_id` already is in `enroll_learner_in_section`.
- TS: `src/domain/subject.ts`, `src/domain/class-record.ts`, matching
  `domain/ports/*`, `infrastructure/tauri/*`, `application/*-service.ts`
  (all mirroring `Section`'s existing pattern), `src/ui/ClassRecordsScreen.tsx`
  (new "Class Records" tab: picking a section loads that section's own
  `school_year`'s grading periods, steering a teacher away from
  constructing a mismatched combination before submission; inline
  "add a subject" mini-form; lists existing class records).

Verified: `cargo test` 141 lib tests (includes this milestone's new
`repository::subject`/`repository::class_record` unit tests) + 5
new `tests/class_record.rs` integration tests (cross-school section/
subject/grading-period rejection, "requires a session" for both new
commands, own-school create-then-list round trip) — all green, plus 1
new `db::migrations::tests::migration_7_*` test proving the
no-duplicate-combination constraint against a real migration run.
`cargo clippy --all-targets -D warnings` clean. `npm run quality` clean
(34/34 test files, 189/189 tests — up from 168), `npm run build` clean,
`npm run check:architecture` clean.

**Independent review**: `architecture-reviewer` was dispatched for this
milestone (owed since M7 — the first of that standing debt actually run
this session), but its findings text was not retrievable through the
normal completion-notification/resume path on either the initial run or
one resume-retry (real work confirmed via token/tool-use counts — 17
tool uses, ~61K tokens total — but no usable output either time). Per
this session's established escalation rule (attempt once more, then
fall back to self-review), a careful self-review covering the same four
questions was performed instead — **no blocking findings**; full detail
in `docs/adr/0011-gradebook-class-record-foundation.md`. Re-run a real
`architecture-reviewer` for M12a once agent-resume behavior is confirmed
reliably working in a future session.
`security-reviewer`/`teacher-ux-reviewer`/`accessibility-reviewer`
were not attempted for M12a — same standing debt as M7-M11 for the other
three review types.

Not implemented (deliberately out of scope, see ADR-0011): assessment
components/items, learner scores, missing/not-applicable states,
keyboard-efficient entry, mobile-specific layout beyond ordinary
responsive CSS, a mutation-audit trail, editing/closing a class record,
Senior High School's separate semester structure, any multi-teacher/
co-teacher concept.

## M12b Assessment Items and Learner Scores — Complete (2026-08-24)

Goal: assessment items and learner scores on top of M12a's `ClassRecord`
workspace, continuing the user-directed M12/M13/M14 roadmap. Full
decision: `docs/adr/0012-assessment-items-and-scores.md`.

**Research finding that shaped the design**: this milestone's own inline
research (`WebSearch`/`WebFetch`) found that DepEd Order No. 8, s. 2015's
Written Work/Performance Task/Quarterly Assessment classroom-assessment
terminology has been **repealed** by DepEd Order No. 015, s. 2026, which
renames the categories to Written Works/Performance Tasks/Examinations
(the third category now comprising Summative Tests plus a Term
Examination). Triangulated across two independent secondary sources;
per-category weighting percentages were not found and are explicitly
**not** modeled here — that is M13's own research scope. Per advisor
guidance (consistent with M11's own precedent), category names are
versioned reference data, not a hardcoded enum.

Delivered:

- `src-tauri/src/db/migrations.rs` migration 8: `assessment_category_sets`
  (versioned reference data, `is_default` structurally constrained to at
  most one row — the fourth application of the one-row-per-condition
  index pattern), `assessment_categories` (a set's ordered, named
  categories — seed data: DO 015 s. 2026 default with Written
  Works/Performance Tasks/Examinations; legacy DO 8 s. 2015 explicitly
  marked repealed in its own citation), `assessment_items`
  (school+class-record scoped, `max_score REAL NOT NULL CHECK (max_score
  > 0)`), `learner_scores`(school-scoped,`status`CHECK-paired with`score`null-ness,`UNIQUE (assessment_item_id, learner_id)`, absence of
a row meaning "not yet recorded" — the same idiom
`attendance_records` already established).
- `src-tauri/src/repository/assessment_category.rs`: reference-data
  listing, no school scoping needed (matches `grading`'s policy listing).
- `src-tauri/src/repository/assessment_item.rs`: `create` verifies
  `class_record_id` resolves in-school and `category_id` exists;
  `list_by_class_record` scopes by `school_id` AND `class_record_id`.
- `src-tauri/src/repository/learner_score.rs`: `record` verifies the
  item resolves in-school, the learner held an active section membership
  at any point in the class record's grading-period date range (via
  `section_membership::roster_for_section_over_range`, reused from M8),
  and the status/score pairing including the `[0, max_score]` bound —
  the one check that can't be a SQL `CHECK` (cross-table). Every
  rejection collapses to `Ok(None)`, matching `enroll`'s convention.
  `roster_for_item` returns the scoreable roster via `LEFT JOIN`,
  matching `attendance::roster_for_section_date`'s shape.
- `src-tauri/src/repository/class_record.rs` gained
  `section_and_period_range_in_school`, a small helper shared by
  `assessment_item`/`learner_score`.
- `src-tauri/src/auth/mod.rs` gained `SessionManager::require_active_session`
  (returns `(user_id, school_id)`; `require_active_school_scope` now
  delegates to it) so a score's `recorded_by_user_id` can come from the
  session, never a client-supplied parameter.
- `src-tauri/src/commands/{assessment_category,assessment_item,
learner_score}.rs`: `school_id`/`recorded_by_user_id` derived only from
  the session; other ids client-supplied and verified downstream.
- TS: `src/domain/{assessment,learner-score}.ts`, matching
  `domain/ports/*`, `infrastructure/tauri/*`, `application/*-service.ts`
  (score-range validation duplicated here as a `ValidationError` with a
  specific message — a UX nicety, not the real security backstop, which
  is the Rust `None`), `src/ui/ClassRecordWorkspace.tsx` (opened via a
  new "Open workspace" action added to the Class Records list: item
  creation form, item list, and a per-item roster scoring table with
  status buttons and a score input revealed only for "Scored").

Verified: `cargo test` 163 lib tests (up from 141) + 6 new
`tests/assessment.rs` integration tests (cross-school rejection for both
items and scores, "requires a session" for both new commands, an
explicit test proving a recorded score is attributed to the session's
own `user_id` and not a client-supplied one) + 3 new
`db::migrations::tests::migration_8_*` tests (seed data, default-set
uniqueness, the `scored`-requires-non-null-score `CHECK`) — all green.
`cargo clippy --all-targets -D warnings` clean. `npm run quality` clean
(39/39 test files, 221/221 tests — up from 189/34), `npm run build`
clean, `npm run check:architecture` clean.

**Independent review**: `security-reviewer` dispatched for this
milestone, chosen over `architecture-reviewer` per advisor guidance —
M12b introduces the first mutable, teacher-attributed numeric data in
this schema, closer to the auth/persistence surface that has caught real
bugs before (M4, M6, M10) than to a layering concern. Outcome not yet
returned as of this writing; record it here (or supersede this note)
once available.

Not implemented (deliberately out of scope, see ADR-0012):
keyboard-efficient entry, mobile-specific layout beyond ordinary
responsive CSS, a full mutation-history/audit log beyond
`recorded_at`/`updated_at`, editing/deleting an assessment item once
created, per-category weighting/grade computation, a UI for adding a
third category set, an FK constraining which category set pairs with
which grading policy.

## M12c Score-Entry Keyboard, Mobile, and Audit Polish — Complete (2026-08-24)

Goal: turn M12b's assessment-item/score workspace
(`src/ui/ClassRecordWorkspace.tsx`) into a reusable, production-quality
pattern for high-frequency teacher data entry — not a prettier version of
the same interaction, a genuinely faster one. UI-only change: no
application-service, domain, repository, or Rust command changes were
needed or made, since `user_id`/`school_id` were already session-derived
(verified below) and `updated_at` already existed on `learner_scores`
(M12b) for the audit-surfacing requirement.

**Before starting**: per the handoff's own instruction, checked whether
M12b's dispatched `security-reviewer` had returned. It had not (same
agent-resume issue as every other episode this session) — the standing
self-review fallback finding was: `record_learner_score`
(`src-tauri/src/commands/learner_score.rs:31-42`) takes only
`assessment_item_id`/`learner_id`/`status`/`score` as parameters;
`user_id` and `school_id` come from `sessions.require_active_session(&conn)`,
never from the client. Re-verified directly against the current file this
session (not just trusted from the prior note) — confirmed accurate, no
change needed. No new `security-reviewer` dispatch was warranted for a
UI-only milestone that touches no authorization surface.

**Keyboard-efficient entry — redesigned interaction model:**

- The score `<input>` is now always visible and always the primary
  control for every roster row, instead of being hidden behind an
  explicit "Scored" button click (M12b's original gate). Typing a number
  always means "Scored" — this matches how the domain already treated a
  non-null score (`LearnerScoreApplicationService.recordScore` requires
  `status === "scored"` for any numeric value), so no new domain rule was
  invented, only surfaced earlier in the interaction.
- **Enter** or **ArrowDown** in a score field commits the value (if
  changed) and moves focus to the next learner's score field — spreadsheet-
  style column navigation, the single highest-leverage change for a
  teacher entering many scores down one column. **ArrowUp** does the same
  moving backward. **Escape** discards an in-progress, uncommitted edit
  and restores the last-saved value, without saving — the "recovery from
  a mistake" the milestone asked for. **Blur** (Tab away, or clicking
  elsewhere) also commits, so nothing is silently lost by moving on.
- **Safe commit semantics, two deliberate rules**: (1) a value identical
  to what's already saved is never re-sent — this avoids a no-op write
  bumping `updated_at` and showing a misleading "just saved" time; (2) an
  emptied score field is never committed as a change — clearing the box
  does not erase a previously recorded score, since "blank" isn't a real
  status in this domain (Excused/N/A must be chosen explicitly via their
  own buttons). This directly satisfies "prevention of accidental
  destructive changes."
- Excused/N/A remain explicit buttons (native `<button>`, already fully
  keyboard-operable via Tab+Enter/Space, needed no new code) — DepEd's
  attendance-status precedent (`AttendanceStatus`, ADR-0008) already
  established that exceptional states need deliberate marking, not
  inference from an empty field; the same reasoning applies here.
- **A real bug was found and fixed during this milestone, by its own test
  suite**: moving focus programmatically after Enter (to the next row)
  fires a synchronous native `blur` on the field being left, which
  re-entered the same commit function for that same learner _before_ the
  first call's cleanup had run — a naive React-state dirty-check does not
  reliably catch this, because the state update from the first commit may
  not have re-rendered by the time the synchronous blur fires. Caught by
  a new test (`saves on Enter and moves focus to the next learner's score
field`) that asserted exactly one `record` call, which failed with two
  identical calls on the first implementation. Fixed with an imperative
  `useRef<Set<string>>` in-flight guard (`committingRef`) that closes the
  re-entrancy window regardless of render timing — a plain state flag
  would not have been reliable here for the same reason the dirty-check
  wasn't.

**Mobile-aware responsive layout:**

- No responsive breakpoint existed anywhere in `src/ui/theme/styles.css`
  before this milestone (verified by grep) — this is the first
  deliberately mobile-specific CSS in the app, not an extension of an
  existing pattern.
- At `max-width: 640px`, the roster `<table>` re-flows from a grid to one
  stacked, full-width block per learner (each `<tr>` becomes a card-like
  block; the `<thead>` is visually hidden but stays in the accessibility
  tree via a standard clip-rect technique, not `display:none`, so the
  column semantics survive for screen readers) — chosen over shrinking
  the desktop table's cells, which the milestone brief explicitly warned
  against ("unusably tiny score cells... shrinking the Windows interface
  onto a phone"). Score inputs and Excused/N/A buttons grow to a 44px
  minimum touch target and larger font at this width. The keyboard
  interaction model (Enter/Arrow/Escape/blur) is unchanged at any width —
  same component, same handlers, only the CSS layout changes, so there is
  one reusable pattern, not a second mobile-specific implementation.
- **Verification limit, disclosed honestly**: this environment's Browser
  pane could load the app's `vite dev` bundle (confirmed it builds and
  serves — reached the login screen, which correctly reported "Could not
  load the list of schools" since a plain browser has no Tauri IPC
  bridge) but could not render/screenshot the page (`the Browser pane is
not displayed, so the page is not compositing frames` — an environment
  limitation, not a code issue) and, even if it could, cannot reach
  `ClassRecordWorkspace` without a real backend session behind a section/
  subject/grading-period/class-record/assessment-item chain. This is the
  same standing visual-verification gap recorded since M5 — the 640px
  breakpoint's actual rendered appearance is **not** visually confirmed
  this session; only the CSS itself and the jsdom-based interaction
  behavior (which does exercise real DOM focus/blur/keyboard semantics,
  and did catch the re-entrancy bug above) were verified. `.claude/launch.json`
  was added this session (`npm run dev`, port 5173/1420) so a future
  session with a working Browser pane, or a human, can pick this up
  immediately.

**Auditability polish:**

- Each row now shows a "Saved HH:MM" note derived from the roster entry's
  existing `updatedAt` field (already returned by `roster_for_item` since
  M12b — no new column, no new command). Hidden gracefully
  (`formatSavedTime` returns `null`) rather than showing "Invalid Date"
  for any value that doesn't parse as a real timestamp.
- Actor identity (`recordedByUserId`) was already trustworthy
  (session-derived, verified above) before this milestone; this milestone
  did not add a "last edited by [teacher name]" display, since
  `LearnerScoreRosterEntry` does not currently carry a resolved teacher
  display name (only `LearnerScore.recordedByUserId`, a raw id) — adding
  that would mean a join across `users`/`learner_scores` the roster query
  doesn't currently do, which is schema/repository-layer work, not UI
  polish, and wasn't requested with enough specificity to justify
  expanding scope here. Recorded as a candidate for a future
  audit-visibility milestone, not implemented now.

**Verification actually run this session**: `npm run typecheck` clean;
`npm run lint` clean; `npm run format:check` clean (after `prettier
--write` on the three touched files); `npm run check:architecture`
clean; `npm run test` — 39 files, 226 tests, all passing (up from 221 —
one M12b test was split into six more specific interaction tests, net
+5). `cargo test`/`cargo clippy` not re-run (no Rust files touched this
milestone — confirmed via `git status` before starting and again before
finishing). Real-browser check attempted and partially completed (see
above); did not reach pixel-level confirmation.

**Independent review**: not dispatched — this milestone touches no
authorization/persistence/tenant-isolation surface (the area this
session's agent-resume issue has made expensive to keep re-attempting),
and the one security-relevant fact (actor identity) was re-verified
directly against source rather than re-reviewed. A `teacher-ux-reviewer`
pass on the new interaction model would still be genuinely valuable and
is recorded as owed below, alongside the existing M7-M11 review debt.

Not implemented (deliberately out of scope): a full mutation-history/
audit log beyond the single "last saved" note, a resolved teacher display
name on the roster (see above), bulk score entry/paste-from-spreadsheet,
column-level (all-learners-one-item) vs. row-level (one-learner-all-items)
alternate grid orientations, offline-conflict UI (two devices editing the
same score — sync doesn't exist yet), any change to the Excused/N/A
button semantics.

## M13 DepEd Grade Computation — Complete (2026-08-24, continuation session)

Goal: compute an actual numeric term grade from the assessment items/
scores M12b built, replacing the M11/M12a/M12b placeholder note that this
was deferred pending real research. **Compliance-sensitive** — research
used the primary source directly, not a secondary summary.

**Research**: `WebSearch` found a citation for DepEd Order No. 015, s.
2026 with a direct link to the order's own PDF on `deped.gov.ph`. That
PDF (`DO_s2026_015r.pdf`, 60 pages, scanned/image-based — `pypdf` text
extraction returned only whitespace, no text layer) was downloaded
(`curl`) and read by rendering pages to PNG (`pymupdf`) and visually
transcribing the specific tables in Annex D — not trusted from a
blog/aggregator summary alone, though three independent secondary
sources (depedclub.com, depedtambayanph.net, tchersden.blogspot.com) were
also checked and agreed with the primary source on every figure. Full
findings, including what's DepEd-required vs. this app's own
interpretation vs. still-uncertain, are in
`docs/adr/0013-deped-grade-computation.md` — summarized:

- `IG = Σ(PS × weight%)` per category, `PS = pooled raw scores / pooled
max scores × 100` (points-pooled, not item-averaged — confirmed against
  the Order's own worked example).
- One weight group implemented: English, Filipino, Mathematics, Science,
  Araling Panlipunan, GMRC/Values Education (Grades 4-10) — Written Works
  20%, Performance Tasks 50%, Examinations 30%. Examinations is itself
  composed of Summative Test 1 (30%), Summative Test 2 (30%), and Term
  Examination (40%) — not a flat pooled bucket like the other two
  categories.
- SY 2026-2027 uses the Order's own 41-band Adjusted Transmutation Table
  (IG 0.00-100.00 → TG 60-100); SY 2027-2028 onward uses the Zero-Based
  Grading System (`TG = round(IG)` directly, no transmutation) — selected
  from the grading period's existing `school_year` field, no new table
  needed. A floor of 60 applies to the final reported grade either way
  (structural under transmutation; an explicit clamp under zero-based).
- Two of the Order's own worked examples (Science KS2 IG 85.8→TG 88,
  transmuted; Mathematics KS3 IG 83.6→TG 84, zero-based) are reproduced
  exactly end-to-end by `compute_term_grade` — the strongest available
  proof this implementation matches the Order, not just its transcribed
  numbers.

**10-scenario architecture decision** (the one genuinely new structural
question ADR-0010's existing versioned-policy pattern didn't already
settle): how to model Examinations' internal ST1/ST2/TE sub-structure.
Ten scenarios scored against the project rubric; **Recommended and
implemented**: a nullable self-referencing `parent_category_id` on the
existing `assessment_categories` table — ST1/ST2/TE become ordinary child
category rows, reusing 100% of M12b's `assessment_item`/`assessment_category`
machinery unchanged. **Next Best**: a separate `category_components` join
table (better if a future Order nests other categories too; not needed
for what DO 015 currently specifies). Full scoring in ADR-0013.

**Implementation**:

- Migration 10: `parent_category_id` column + 3 seeded child categories
  (Summative Test 1/2, Term Examination) under "Examinations";
  `grading_weight_policies`/`grading_weight_components` tables (same
  "at most one default" unique-partial-index pattern as migrations 5, 6, 9) with one seeded policy for the implemented weight group.
- `assessment_item::create` now rejects creating an item directly under a
  parent category (one that has children) — an item must go under a leaf.
- `assessment_category::list_categories_for_set` now excludes parent
  categories from its result, so a teacher's item-creation dropdown never
  offers a selection that would be rejected.
- `src-tauri/src/repository/grading_computation.rs` (new): the full
  algorithm, the 41-band transmutation table (Rust constant data, not
  DB-seeded — a disclosed simplification, see ADR-0013), and
  `compute_term_grade(conn, school_id, class_record_id, learner_id)`.
  Returns `None` — this app's own interpretation, not DepEd's — until
  every weighted category has at least one `Scored` item for that
  learner, rather than fabricating a grade from incomplete data (matches
  `AttendanceRosterEntry`/`FieldDisclosure`'s existing "disclose, don't
  fabricate" precedent).
- New command `compute_learner_term_grade`; new TS `ComputedTermGrade`
  domain type, port method, Tauri implementation, and application-service
  method; `ClassRecordWorkspace.tsx` gained a "Show term grades" section
  (on-demand — a per-learner Tauri round trip, not recomputed
  automatically on every keystroke/item-selection) with a Guided-mode
  disclosure of exactly which weighting is in use and which subjects
  aren't yet supported.

**Two real bugs found and fixed by the tests themselves during
development** (not present in the final code, recorded because the
process is worth remembering):

1. The zero-based worked-example test fixture used the wrong max scores
   for the ST1/ST2/TE items (20/20/40 instead of the Order's own 25/20/50)
   — caught immediately because the test failed with a `None` result
   instead of the expected grade (one item's score exceeded its declared
   max and was silently rejected by the existing `learner_score::record`
   validation).
2. `LearnerScoreApplicationService.computeTermGrade` was not declared
   `async`, so its validation `throw`s were synchronous instead of
   promise rejections — the exact same bug class already documented from
   M8's `monthlySummary`, caught here the same way, by a test asserting
   `.rejects.toBeInstanceOf(ValidationError)`.
3. (Rust side) The original floor test used the SY 2026-2027 transmutation
   regime, where the table's own lowest band already floors at 60
   structurally — meaning it could never actually exercise the separate
   `apply_minimum_floor` clamp. Split into two tests, one per regime, once
   this was understood.

**Verification actually run this session**: `cargo test` — 184 lib tests

- 51 integration tests across 9 test binaries, all green (re-run twice
  after one transient/flaky failure in an unrelated pre-existing test file,
  `learner_management.rs`, which passed cleanly both in isolation and on a
  full-suite re-run — not a regression from this milestone's changes,
  confirmed by `git status` showing no learner-related files touched).
  `cargo clippy --all-targets -- -D warnings` clean. `npm run quality` —
  typecheck, lint, format, architecture-boundary check, 233 TS tests, all
  green (up from 226). Real-browser check: same standing limitation as
  M12c (no Tauri IPC bridge in a plain browser); not re-attempted this
  session since M12c already established and documented the exact gap.

**Independent review**: not dispatched. This milestone's new command
(`compute_learner_term_grade`) follows the identical authorization
pattern every existing command already uses
(`require_active_school_scope`, resolve-within-school-first) with no new
pattern introduced, so a `security-reviewer` dispatch was judged
lower-value here than for M12b's genuinely new mutation surface. A
`teacher-ux-reviewer` pass on the new "Show term grades" UI is recorded
as owed, alongside M12c's standing one.

Not implemented (deliberately out of scope, see ADR-0013's Scope
section for the full reasoning): the EPP/TLE & MAPEH weight group, any
Senior High School (Key Stage 4) weight group, GMRC/VE's internal
Cognitive/Affective/Behavioral domain split, Key Stage 1 descriptive
grading, Grade 12's DO 8, s. 2015 carryover weights (that order's exact
percentages could not be confirmed from a primary source this session),
Subject-level or class-record-level weight-group selection UI, report
cards/official grade output (M14).

## M14 Report Card / Official Grade Output — Complete (2026-08-24, same continuation session as M13)

Goal: turn M13's `ComputedTermGrade` into a file a teacher can keep or
hand to a school head, reusing M10's `export::csv`/`FieldDisclosure`
architecture. Full research/decision record in
`docs/adr/0014-report-card-export.md`.

**Scope correction made during implementation** (recorded here because
the reasoning matters, not just the outcome): the M13 session's
end-of-turn scope proposal considered gating this export to only the one
DepEd weight group M13 implements. On inspection this isn't buildable
without new scope — `Subject` carries no DepEd weight-group
classification, and `compute_term_grade` already applies the single
seeded policy uniformly to every class record, so there is nothing to
gate on. Building a `Subject`-to-weight-group mapping would itself
require guessing how this app's free-text subject names correspond to
DepEd's own categories — exactly the inference the `deped-compliance`
rule warns against. Corrected to inherit M13's own already-accepted
choice instead: disclose prominently, don't silently refuse.

**Implementation**:

- `FieldDisclosure`/`OmittedField` relocated from `export::sf2` to the
  shared `export::mod` (non-breaking — `sf2.rs` re-imports them, its own
  9 tests unchanged and still passing) — the reusable "official-form
  engine" piece `sf2.rs`'s own doc comment already anticipated a second
  export would need.
- New `src-tauri/src/export/report_card.rs`: one CSV row per learner on
  the class record's section roster (composed from
  `section_membership::roster_for_section_over_range` +
  `grading_computation::compute_term_grade`, the same composition
  `learner_score::record` already uses), an explicit "Not yet available"
  row for a learner whose grade isn't computable yet rather than a
  silent drop.
- New `class_record::find_detail_by_id_in_school` (the single-record
  counterpart to the existing `list_by_school`, same join) and
  `export_class_record_report_card` command — `class_record_id`
  client-supplied the same legitimate way `section_id` already is for
  the SF2 export; `school_id` from the session only; writes to
  `<Documents>/LIKHA-SIS/ReportCard_<section>_<subject>_<period>.csv`,
  reusing `sanitize_filename_component` (same NTFS-ADS/reserved-character
  hardening the SF2 export already has, not re-implemented).
- New TS: `ReportCardExportResult`,
  `ExportRepository.exportClassRecordReportCard`,
  `ExportApplicationService.exportClassRecordReportCard`;
  `exportService` threaded through `App.tsx` → `ClassRecordsScreen` →
  `ClassRecordWorkspace` (new prop on both). `ClassRecordWorkspace.tsx`
  gained an "Export report card (CSV)" button beside "Show term grades,"
  with an **always-visible** (not Guided-mode-only) warning that the
  export assumes core K-10 weighting for every subject — deliberately
  not gated behind Guided mode since it's correctness-affecting for
  every teacher mode.
- Also newly disclosed as omitted, more conservatively than strictly
  required by this milestone's own scope: DepEd's Qualitative Descriptor
  table (Order Table 11), since M13's research only read it at low
  resolution during the initial contact-sheet scan, not the same
  full-resolution rigor as the tables actually implemented (Tables 4, 9, 10) — omitted rather than risk exporting a wrong label.

**Verification actually run this session**: `cargo test` — 192 lib tests
(up from 184; +8 new in `export::report_card` and
`class_record::find_detail_by_id_in_school`) + 51 integration tests, all
green. `cargo clippy --all-targets -- -D warnings` clean. `npm run
quality` — typecheck, lint, format, architecture-boundary check, 239 TS
tests (up from 233; +6 new), all green. `npm run build` succeeds. Visual
verification not attempted — same standing gap as M12c/M13 (no Tauri IPC
bridge in a plain browser).

**Independent review**: not dispatched. This milestone's new command
follows the identical authorization pattern every existing
export/read command already uses, with no new pattern and no new
file-write surface beyond what `export_section_monthly_sf2` already
established and was reviewed for (CSV/formula-injection and NTFS-ADS
hardening, both reused verbatim). A `teacher-ux-reviewer` pass on the
new "Export report card" button is recorded as owed, alongside M12c's
and M13's standing ones.

Not implemented (deliberately out of scope, see ADR-0014): per-subject
gating (not currently buildable without new `Subject` schema — see
Scope Correction above), Qualitative Descriptors, Grade 12 DO 8
carryover, General Average/multi-subject aggregation, an
official-template-exact `.xlsx` reproduction, printing/PDF rendering, a
user-chosen save location.

## M15 Expand DepEd Grading Policy Coverage — Complete (2026-08-24, same continuation session as M13/M14)

Goal: close the specific architectural gap M14 identified (a class record
had no way to say which DepEd weight group applies to it — every one
silently shared whichever policy was marked default) and use the newly
explicit mechanism to add a second weight group. Full record in
`docs/adr/0015-expand-grading-policy-coverage.md`. **Note this resolves
M14's "per-subject gating not currently buildable" line above**: the fix
was not a `Subject`-level classification (still not built, still would
require guessing a subject-name-to-DepEd-group mapping) but an explicit
per-_class-record_ pin, which a teacher sets when opening the class
record — the same "explicit, not inferred" pattern already used for
`grading_period_id`/`category_set`.

No new 10-scenario process — ADR-0010/0013's versioned-reference-data
pattern already settled "how to represent a policy a teacher picks from";
this milestone applies it to a field it hadn't reached yet.

**Implementation**:

- Migration 11: `class_records.weight_policy_id` (nullable — an existing
  class record predating this migration is left `NULL`, preserving its
  exact prior "use the default" behavior rather than guessing which
  policy it should retroactively have; `class_record::create`'s new
  parameter is required for every record created since, validated to
  exist, `None` on an unknown id). A second seeded policy: EPP/TLE &
  MAPEH (20%/60%/20%, DO 015 s.2026 Table 9's second row) — reuses the
  _same_ Examinations/ST1/ST2/TE category structure migration 10 already
  seeded (no new category rows, only new weight rows against existing
  categories).
- `class_record::resolved_weight_policy_id_in_school`: the
  COALESCE-to-default lookup — the class record's own pinned policy if
  it has one, the current default otherwise. `grading_computation::compute_term_grade`
  now calls this instead of unconditionally querying `is_default = 1` —
  the one behavioral change that makes the new column matter. Proven
  with two dedicated tests, not just inspection: one confirming the
  pinned (non-default) policy is actually used, and one giving
  _identical_ raw scores to both policies and asserting the computed
  grades differ (60 under K-10's 20/50/30 vs. 70 under EPP/TLE & MAPEH's
  20/60/20, for the same inputs) — the strongest available proof the
  pinned policy is genuinely applied, not silently ignored.
- New `GradingWeightPolicy` type + `list_weight_policies`/
  `list_grading_weight_policies` (repository/command), mirroring
  `grading::list_policies`'s exact shape.
- UI: `ClassRecordsScreen`'s create form gained a required "DepEd grading
  weighting" picker, always shown (never hidden or auto-submitted),
  defaulting to the current default policy but requiring the teacher to
  see and confirm it — the create button stays disabled until a policy
  is selected, same disabled-until-complete pattern the section/subject/
  grading-period fields already use. The class-records list table gained
  a "Weighting" column. `ClassRecordWorkspace` now receives the resolved
  `weightPolicyName` from `ClassRecordsScreen` (which already holds the
  joined detail) and shows it in the term-grades section and the report-
  card export warning, replacing M14's hardcoded (and, once this
  milestone shipped, inaccurate) "assumes core K-10 weighting for every
  subject" text with the actual policy in effect plus an honest note that
  SHS/Grade 12/KS1 subjects still have no correct option in the picker at
  all.

**Correction to the record, found while scoping this milestone**:
ADR-0013 and ADR-0014 both listed "GMRC/VE's internal Cognitive/
Affective/Behavioral domain split" as an unimplemented gap affecting
grade _correctness_. Re-reading Table 9: GMRC/Values Education is already
inside the K-10 core weight group (identical 20/50/30 to English/
Filipino/Math/Science/AP) — the domain split (Table 3) is a within-item
assessment-_design_ guideline for how a teacher should distribute WWs/
PTs/EXs items across Cognitive/Affective/Behavioral aspects, not a
different weighting formula. GMRC/VE grades computed by this app have
been DepEd-compliant on the weighting front since M13; only the domain-
_tagging_ feature (marking which aspect an item addresses) remains
unimplemented, and it does not affect any grade already computed. This
correction is recorded in ADR-0015, not silently absorbed — the prior
ADRs' gap lists should be read with this correction applied.

**Verification actually run this session**: `cargo test` — 201 lib tests
(up from 192; +9: 2 migration tests, `resolved_weight_policy_id_in_school`
coverage, `list_weight_policies` + the two policy-differentiation proofs)

- 51 integration tests, all green. `cargo clippy --all-targets -- -D
warnings` clean. `npm run quality` — 242 TS tests (up from 239, +3),
  typecheck/lint/format/architecture-boundary all clean. `npm run build`
  succeeds.

**Independent review**: not dispatched. The new command
(`list_grading_weight_policies`) follows the identical pattern every
existing reference-data command already uses; `class_record::create`'s
new parameter is validated the same way its existing three already are.
No new authorization surface. A `teacher-ux-reviewer` pass on the new
picker/column/display text is recorded as owed, alongside M12c's,
M13's, and M14's standing ones.

Not implemented (deliberately out of scope, unchanged from ADR-0013/
0014): all Senior High School (Key Stage 4) weight groups, Key Stage 1
descriptive grading, Grade 12's DO 8 carryover (still no primary source
located), GMRC/VE's domain-tagging UI (does not affect grade
correctness — see Correction above), a `Subject`-level default-weight-
group suggestion (would require guessing a subject-name-to-DepEd-group
mapping).

## M16 SHS + Exceptional Grading Policies — Complete (2026-08-24, same continuation session as M13-M15)

Goal: per the user's directed roadmap (M15 → M16 → M17 → M18 → Roles &
Permissions, stated in one message this session), close the SHS/Key
Stage 4 weight-group gap ADR-0015 left explicitly deferred — and, in
doing so, empirically test ADR-0015's own prediction that every further
DepEd weight group would now be purely additive. Full record in
`docs/adr/0016-shs-and-exceptional-grading-policies.md`.

**Research**: no re-fetch of the primary-source PDF — Table 10 (Key
Stage 4) and Annex D paragraphs 46-47/49 were already transcribed and
verified at full resolution during M13's original reading (recorded in
that session's context and ADR-0013), and were cross-checked once more
against this session's own record before writing migration 12.

**Six weight groups, three structural shapes**:

- Full three-part Examinations (ST1/ST2/TE 30/30/40, identical shape to
  both K-10 policies): Core Subjects & Other Academic Electives
  (20/50/30), Arts/Sports/Health and Wellness Electives (20/60/20),
  TechPro Electives (15/65/20).
- Examinations present but composed of a Term Examination only (Annex D
  paragraph 46a) — no Summative Tests: Field Exposure/Arts
  Apprenticeship/Creative Production and Innovation (15/70/15). Modeled
  as a single child weight row (Term Examination at 100% within
  Examinations) instead of three; `compute_term_grade`'s existing
  "roll up whichever children a policy actually has" logic required no
  changes.
- No Examinations component at all (Annex D paragraph 46b/46c): Research
  Electives & Design and Innovation (40/60, WWs/PTs only) and Work
  Immersion (20/80, where WWs is the learner's portfolio and PTs is the
  workplace supervisor's industry evaluation — not ordinary classwork).
  Modeled by seeding no weight row for Examinations in that policy;
  `compute_term_grade`'s top-level loop simply never visits it.

Both structurally exceptional shapes are proven correct with new
end-to-end tests
(`compute_term_grade_handles_a_policy_where_examinations_is_term_examination_only`,
`compute_term_grade_handles_a_policy_with_no_examinations_component`),
not just asserted from the migration's data.

**Zero code changes outside the migration and its own tests.** No
changes to `grading_computation.rs`'s algorithm. No TS/UI changes at
all — `ClassRecordsScreen`'s weighting picker and `ClassRecordWorkspace`'s
policy-name display are already fully data-driven from
`list_grading_weight_policies`, so all eight policies (2 from M15 + 6
from this milestone) appear automatically. This is the strongest
available confirmation of ADR-0015's "purely additive" prediction — not
just that it was theoretically true, but that implementing two genuinely
different structural shapes (TE-only, no-Examinations) still required no
algorithm changes.

**Caveats disclosed in every new policy's own citation text**: DepEd
itself defers detailed SHS item-level specifications to a separate,
not-yet-obtained "implementation guidelines of the Strengthened SHS
Curriculum" issuance (Annex D paragraph 47) — the weight percentages are
DepEd's own stated figures, not a guess, but the guidance behind
applying them item-by-item is incomplete. These six policies apply to
Grade 11 and to Grade 12 only once it adopts the Strengthened SHS
Curriculum (Annex D paragraph 49) — Grade 12 under the prior curriculum
still needs DO 8, s. 2015 weights, still unimplemented, still no primary
source located.

**Verification actually run this session**: `cargo test` — 208 lib tests
(up from 201; +7: 4 new migration tests, 3 new `grading_computation`
end-to-end tests) + 51 integration tests, all green. `cargo clippy
--all-targets -- -D warnings` clean. `npm run quality` — 242 TS tests
(unchanged from M15 — confirms zero TS/UI impact), typecheck/lint/
format/architecture-boundary all clean. `npm run build` succeeds.

**Independent review**: not dispatched. Purely additive seed data
against an already-reviewed schema and algorithm (M13/M15); no new
command, no new authorization surface, no new TS/UI code path to review.

Not implemented (deliberately out of scope, unchanged from ADR-0013/
0015): Key Stage 1 descriptive grading (a structurally different
computation — rubric evidence, not weighted numeric scores — explicitly
deferred by the user's own roadmap, not folded into M16), Grade 12's DO
8, s. 2015 carryover (still no primary source located), GMRC/VE's
domain-tagging UI (does not affect grade correctness — see ADR-0015's
correction), a `Subject`-level default-weight-group suggestion (a
teacher must still pick explicitly for SHS subjects, same as every other
policy).

## M17 Learner Profile Enrichment (LRN + Sex only) — Complete (2026-08-24, same continuation session as M13-M16)

Goal: per the user's directed roadmap, "M17 — Learner Profile Enrichment,
when required by report cards/forms." First milestone run under
Autonomous Continuous Development Mode
(`.claude/rules/autonomous-development.md`) — no fresh user pick was
requested for scope inside M17, only evidence-based judgment against the
qualifier already given. Full record in
`docs/adr/0017-learner-reference-number-and-sex.md`.

**Scoping check, done before any schema change**: this app's own
already-shipped exports were checked for what they actually disclose as
missing. `export::report_card` (M14) discloses five gaps, none of them a
learner-profile field. `export::sf2` (M10) discloses one profile-shaped
gap, bundled into dropout/transfer statistics ("does not track learner
gender... at all"). Neither export had ever named LRN, birthdate, or
guardian contact as missing before this milestone — so the "when
required" qualifier did not automatically select the original M9-era
field list, and building that full list would have been unverified PII
expansion.

**Research**: two independent secondary sources per field (the bar
already established by M10 for SF2's own field layout, since the primary
DepEd Order PDFs were not available as machine-readable text this
session): SF2's per-learner roster requires LRN and Sex (teacherph.com's
template walkthrough + ilovedeped.net's independent guide, in agreement);
the SF9-style report card header requires LRN (openeducat.org's SF9
field inventory). Birthdate and guardian contact were checked against
the same sources and found in neither — deliberately not added.

**Decision**: add exactly `learners.lrn` (12-digit, DB `CHECK`-enforced,
partial-unique per school) and `learners.sex` ('M'/'F', DB `CHECK`-
enforced) via migration 13, both nullable — no honest default exists for
either. No new architecture decision (extends the established
"add-a-nullable-column" shape, same as M15's `weight_policy_id`).
`SectionRosterMember`/`MonthlyLearnerAttendance` both carry the new
fields through the existing roster queries so both exports can populate
them without a second query. `export::sf2` now renders LRN/Sex columns
and corrected its stale "does not track gender at all" disclosure text
(Sex is now tracked; only dropout/transfer _events_ and their by-sex
breakdown remain untracked). `export::report_card` now renders an LRN
column. `LearnerApplicationService` validates LRN format
(`/^\d{12}$/`) before calling the repository — this app can verify LRN
_shape_, never real-world correctness. `LearnerListScreen`'s enrollment
form gained optional LRN/Sex fields with a Guided-mode hint.

**Verification actually run this session**: `cargo test` — 217 lib tests
(up from 208; +9: 6 new migration tests, 3 new `learner.rs` repository
tests) + 51 integration tests, all green. `cargo clippy --all-targets --
-D warnings` clean. `npm run quality` — 249 TS tests (up from 242),
typecheck/lint/format/architecture-boundary all clean. `npm run build`
succeeds.

**Independent review**: not dispatched — no new authorization surface or
command pattern (`create_learner`/`update_learner` already existed, only
their parameter lists grew). Because LRN/Sex are new PII fields, an
inline security self-check was still performed: confirmed every new
field still resolves `school_id` only from `require_active_school_scope`,
confirmed the format `CHECK` constraints are enforced by SQLite itself
(not just the TS validation layer, which a compromised or bypassed
frontend could not evade), and confirmed no LRN/Sex value is logged,
echoed in an error, or placed in a URL/query string anywhere touched.

Not implemented (deliberately out of scope, disclosed not overlooked):
birthdate and guardian contact (no shipped export names either as
missing — revisit only if a future export's own disclosure does); a
`LearnerListScreen` edit affordance for an _existing_ learner's LRN/Sex
(`updateProfile`/`updateLearnerProfile` plumbing exists and is tested,
just unused by any screen — a learner enrolled before this migration has
no way to gain the fields until such a screen exists).

## M18 Bulk Attendance / Teacher Productivity — Complete (2026-08-24, same continuation session as M13-M17)

Goal: per the user's directed roadmap, "M18 — Bulk Attendance / Teacher
Productivity." First milestone continued fully autonomously under
Autonomous Continuous Development Mode
(`.claude/rules/autonomous-development.md`) — no fresh user instruction
was given between M17's completion and M18's start. Directly closes the
concrete example `docs/PROGRESS-MAP.md`'s own Out of Scope list had
already named: "bulk attendance actions (e.g. 'mark all present')." Full
record in `docs/adr/0018-bulk-attendance-mark-all-present.md`.

**Scoping check, done before implementing**: verified whether an
unmarked attendance day already behaves like Present anywhere in this
app, since if so the feature might be purely cosmetic.
`export::sf2::status_code` renders `None` and `Some(Present)` identically
(blank), and the SF2 export only prints Absent/Tardy totals, never a
Present total — so an unmarked day is already indistinguishable from a
marked-Present day in every export this app produces. The feature's real
value is therefore auditability (a `recorded_at` timestamp proving a
day was actually checked, not silently defaulted), and raw teacher
productivity (not clicking "Present" once per learner every day) — not
a DepEd-compliance fix.

**Decision**: `repository::attendance::bulk_mark_present` marks every
roster learner who does **not** already have a status for the date as
Present, and leaves any already-marked learner (Present, Absent, or
Tardy) untouched — a safety guarantee proven by a dedicated test
(`bulk_mark_present_does_not_overwrite_an_already_marked_learner`), not
just claimed. This matters because a teacher who already flagged one
absence before clicking "Mark all present" must never have that
overwritten back to Present. Implemented by reusing `record()` (the
same isolation-checked write every individual mark already goes
through) and `roster_for_section_date` (the same read the screen already
uses) — no new query pattern, no new architecture decision.
`AttendanceScreen` gained a "Mark all present" button, disabled once
every roster row already has a mark, with a Guided-mode hint stating the
never-overwrites guarantee explicitly (a teacher should not have to
trust that silently next to a button that writes for the whole class at
once) and a confirmation banner distinguishing "marked N learners" from
"everyone already had a mark — nothing changed."

**Verification actually run this session**: `cargo test` — 220 lib tests
(up from 217; +3: `bulk_mark_present_marks_every_unmarked_learner_present`,
`bulk_mark_present_does_not_overwrite_an_already_marked_learner`,
`bulk_mark_present_does_not_mark_a_learner_outside_the_callers_school`)

- 54 integration tests (up from 51; +3, mirroring the existing
  `record_attendance`/`roster_for_date` isolation coverage pattern
  exactly), all green. One `authorize_school_membership_grant_allows_a_session_scoped_to_the_same_school`
  failure appeared under full-suite parallel execution; passed both in
  isolation and on an immediate full-suite rerun, matching the transient
  flakiness class already documented in `docs/PROJECT-MEMORY.md`'s M12b
  note — confirmed not a regression from this change, not just assumed.
  `cargo clippy --all-targets -- -D warnings` clean. `npm run quality` —
  256 TS tests (up from 249), typecheck/lint/format/architecture-boundary
  all clean. `npm run build` succeeds.

**Independent review**: not dispatched. No new authorization surface
(`bulk_mark_attendance_present` follows the identical session-derived-
scope pattern as every existing attendance command) and no new write
path (`record()` itself was already reviewed via M7's `security-reviewer`
episode).

**Visual verification**: not attempted, same standing gap as every UI
milestone since M5/M12c — this environment has no browser/screenshot
tool for the compiled native Tauri app, and a plain `vite dev` browser
preview has no Tauri IPC bridge and cannot reach an authenticated
screen. `npm run build` confirms the bundle compiles; the button's
actual rendered appearance is not visually confirmed.

Not implemented (deliberately out of scope): a bulk action for
Absent/Tardy (no teacher-workflow justification made for it the way
"assume present, flag exceptions" has — a wrong-status bulk action is a
much larger footgun without an offsetting case); full section-roster
management UI, bulk enrollment (unrelated to attendance marking itself).

## Account Lockout After Failed Logins — Complete (2026-08-24, same continuation session as M13-M18)

Goal: the first milestone selected entirely autonomously under
Autonomous Continuous Development Mode, once Roles & Permissions was
asked about directly and resolved as "deferred, not built." Selected
from `docs/product/M8-DECISION.md`'s own pre-existing 20-scenario
candidate list (scenario #12, Security-first, ~5.8) — not disqualified
from autonomous selection the way Roles & Permissions was, since a
lockout threshold/duration is a standard security-engineering default
(OWASP's Authentication Cheat Sheet), not an organizational policy only
the user can set. Full record in `docs/adr/0019-account-lockout.md`.

**Gap confirmed before implementing**: `auth::login` had zero
brute-force mitigation beyond Argon2id's own hashing cost. Given this
app's own documented deployment model (shared school computers,
multiple teacher accounts, no 1:1 Windows-account assumption —
ADR-0004), a colleague/student at the same physical machine repeatedly
guessing a coworker's password is a real local threat this schema had
no defense against.

**Decision**: migration 14 adds `users.failed_login_attempts`/
`users.locked_until`. `repository::user::verify_credentials` now checks
lockout state before password verification for a known username (never
for an unknown one — that path is completely untouched), locks after 5
wrong attempts for 15 minutes with immediate feedback on the triggering
attempt (not a delayed reveal on the next attempt), and resets the
counter on any successful login. A locked account is rejected without
running Argon2id at all. New `AppError::AccountLocked` variant,
serialized to the same generic-category-only convention as every other
variant. `LoginScreen` shows a distinct, specific message for this case
rather than folding it into the generic failure text.

**A disclosed trade-off, not an oversight**: once locked, the response
does reveal the username exists (distinguishable from
`AuthenticationFailed`) — but only after 5 wrong guesses already
targeted at that specific username, a real cost paid first. This exact
trade-off exists in effectively every real lockout system; recorded
explicitly in code comments and ADR-0019 rather than left implicit.

**Verification actually run this session**: `cargo test` — 226 lib
tests (up from 220; +6 new `repository::user` tests covering
lock-after-threshold, locked-rejects-even-correct-password,
successful-login-resets-counter, unknown-username-never-locks,
lock-expires-and-a-fresh-attempt-succeeds; +1 new migration test) + 54
integration tests, all green. `cargo clippy --all-targets -- -D
warnings` clean. `npm run quality` — 262 TS tests (up from 259; +3,
including a new `LoginScreen` test asserting the lockout message is
visibly distinct from the generic one), typecheck/lint/format/
architecture-boundary all clean. `npm run build` succeeds.

**Independent review**: dispatched, but findings not retrievable — see
"Independent-review agent-resume issue recurred" in
`docs/CURRENT-HANDOFF.md`'s Status section. A careful self-review was
performed instead (full checklist in ADR-0019's Consequences section):
confirmed lockout check precedes password verification, confirmed the
unknown-username path is byte-for-byte unchanged, confirmed lockout
state lives in the persisted `users` table (not `SessionManager`'s
in-memory state, so it survives a process restart as a lockout must
to be meaningful).

**Same-session side effect**: while self-reviewing the M12c-M18 UI
(after the same agent-resume issue affected the two reviewers
dispatched specifically for that sweep), found and fixed two real,
unrelated UX/accessibility gaps in `LearnerListScreen.tsx`'s M17/
this-session edit affordance: no focus management when entering edit
mode (focus silently fell to the document body), and clicking "Edit" on
a second learner while a first edit was in progress silently discarded
the first learner's unsaved changes. Both fixed and covered by new
tests; full detail in ADR-0019's addendum. **The broader M12c-M18 UI
sweep those two reviewers were asked to cover remains real,
undischarged review debt** — the self-review only caught what it
happened to touch while implementing something else, not a systematic
pass over the full UI surface.

Not implemented (deliberately out of scope): idle-timeout/session
hardening (a related but distinct candidate from the same
20-scenario list — a fixed-TTL session already exists per ADR-0004;
idle tracking is a separate change), an admin "unlock early"
affordance (no roles/permissions system exists yet to define who
"admin" is), a configurable threshold/duration (no evidence yet that
different schools need different policies).

## Out of Scope (current milestones)

- cloud sync
- roles/permissions beyond "session scoped to a school" — requires a
  human product decision on what roles exist (see `docs/product/M8-DECISION.md`)
- password reset, account lockout, idle-timeout, cloud authentication
- grade computation for any weight group beyond the eight M13/M15/M16
  implemented (core K-10 English/Filipino/Math/Science/AP/GMRC, EPP/TLE
  & MAPEH, and all six Senior High School groups) — Key Stage 1
  descriptive grading and Grade 12's DO 8 s. 2015 carryover are still
  unimplemented; see
  `docs/adr/0016-shs-and-exceptional-grading-policies.md`. GMRC/VE's
  Cognitive/Affective/Behavioral domain _tagging_ (not its weighting,
  which is already correct — see ADR-0015's correction) is also still
  unimplemented.
- a full mutation-history/audit log beyond "last saved HH:MM",
  editing/deleting an assessment item, Senior High School's separate
  semester structure as it applies to assessment — see
  `docs/adr/0012-assessment-items-and-scores.md`. Keyboard-efficient entry
  and mobile-aware responsive layout for score entry **are** now done —
  see M12c above.
- full section-roster management UI (removing/editing a membership,
  viewing a section's roster as its own screen), bulk enrollment. "Mark
  all present" **is** now done (M18) — see
  `docs/adr/0018-bulk-attendance-mark-all-present.md`; a bulk action for
  Absent/Tardy remains out of scope, deliberately (no teacher-workflow
  justification made for it yet).
- learner profile enrichment beyond LRN/Sex (birthdate, guardian
  contact) — M17 added exactly LRN and Sex, the two fields this app's
  shipped exports actually need (see
  `docs/adr/0017-learner-reference-number-and-sex.md`); birthdate/
  guardian remain out of scope until a shipped export discloses either
  as missing. Also out of scope: a UI affordance to add LRN/Sex to a
  learner enrolled before M17 (the repository/service plumbing exists,
  no screen calls it yet).
- Excel/PDF export, a user-chosen export save location, a generic
  form-definition framework — see `docs/adr/0009-sf2-export-and-official-form-engine.md`
- editing/deleting a saved grading period, a third grading policy beyond
  the two seeded ones, Senior High School's separate semester structure
  — see `docs/adr/0010-grading-period-foundation.md`
- Android-specific workflows
