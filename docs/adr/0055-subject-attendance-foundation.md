# ADR-0055: Subject Attendance Foundation (Wave 2V)

Status: Accepted
Date: 2026-08-29

## Context

The user (owner) supplied a full product specification,
`docs/product/SUBJECT-ATTENDANCE-SPEC.md`, for a new feature: **Subject
Attendance** — a per-subject, session-based attendance check a subject
teacher uses to record whether their own students attended a specific
scheduled class period. It is explicitly and permanently **not** School
Form 2 (the official daily attendance record) and must never be able to
become SF2 by sharing storage, authorization, or workflow with it.

This is a genuinely new domain, the same class of decision as RBAC
(ADR-0036), Curriculum/Key-Stage Versioning (ADR-0037), and Teacher
Load/Class Schedule (ADR-0039) — it gets its own ADR rather than folding
into an existing one.

## Decision

### Schema: session-centered, not columns on `attendance_records`

`subject_attendance_sessions` (one row per class-meeting-per-day) +
`subject_attendance_entries` (one row per learner-per-session), migration 22. Two independent invariants enforced as real database constraints, not
application-level check-then-act:

- `UNIQUE (teaching_assignment_id, session_date)` — one session per class
  per day.
- `UNIQUE (session_id, membership_id)` — one entry per learner per
  session.

`session.status` is intentionally two-valued (`held`/`no_class`). The
spec's third state, "not checked," is deliberately **not stored** — it
is the absence of any row for a given `(teaching_assignment_id,
session_date)`, reusing the "no row = not yet recorded" idiom
`attendance_records` already established (see the M12b note in
`docs/PROJECT-MEMORY.md`). This means "not checked" cannot drift from
reality — there is nothing to keep in sync.

`entries.membership_id` (not a bare `learner_id`) references the exact
enrollment span, the same discipline `section_membership::current_roster`
already established for Section Roster — this is what prevents a
stale-roster mistake if a learner transfers out between when a session
opens and when it is marked.

### Domain: `repository::subject_attendance`, reusing existing queries

`open_or_get_session`/`mark_no_class` are idempotent
(`INSERT ... ON CONFLICT DO NOTHING` then a `SELECT`) — a duplicate save
or a sync retry can never create a second session, closing the spec's own
explicit requirement without a check-then-insert race. `roster_for_session`
reuses `section_membership::current_roster` unchanged — the authoritative
"who was actually enrolled that day" query Section Roster (Wave 2O)
already proved — rather than a second, competing roster query.
`mark_all_present` reuses the same "never overwrite an existing mark"
idiom `attendance::bulk_mark_present` (M18) already established.

`record_entry` returns a typed `RecordEntryOutcome`
(`Recorded`/`SessionNotFound`/`SessionIsNoClass`/`MembershipNotInSession`)
rather than a raw DB error or a silent `None` — a `NoClass` session and a
membership that doesn't belong to the session's own section are both
refused explicitly, proven by dedicated tests, not merely asserted.

### Authorization: own-assignment, not a school-wide `Capability`

A new `subject_attendance::authorize_own_assignment(conn, user_id,
school_id, teaching_assignment_id)` gate, deliberately **not** a
`Capability` match arm. Every existing `Capability` (`ManageLearners`,
`ManageSchoolMembership`, `ManageTeachingAssignments`) authorizes a fixed
role across the _whole school_; whether Subject Attendance's write is
authorized depends on _which_ assignment is targeted, not on a fixed role
set — the same reasoning `auth::authorize_view_teacher_load`'s "self"
branch already used for exactly this shape of check. Placed in
`repository::subject_attendance` itself (not `auth::mod`) since the rule
is specific to this one domain, not a general session/role primitive.

Every command in `commands::subject_attendance` calls this gate before
touching any data. Where a command also takes a `session_id`, the
resolved session's own `teaching_assignment_id` is cross-checked against
the caller-supplied one — a caller cannot pass a real assignment they own
alongside a `session_id` that actually belongs to a different one.

### Scope: domain/repository/command layer only, no UI this wave

Matches this project's established zero-UI-first precedent for a new
domain (RBAC, Curriculum, Teacher Load, Wave 2A all shipped their first
increment with full test coverage and no screen). The spec's own
"Recommended implementation order" lists domain rules and the roster
lookup as steps 1-2, before any screen; this wave delivers exactly that.
Today's Classes / Attendance Check / Subject Monitor / Adviser View are
explicitly deferred to a future wave, once this foundation is proven.

## Deliberately not built this wave

- No UI screen — see above.
- No adviser or School-Head read access to another teacher's Subject
  Attendance records — the spec's "Adviser View" is explicitly a later
  step (step 6 of the recommended order); building it now would mean
  designing a second authorization shape (an adviser viewing _someone
  else's_ subject data) without a screen to prove it against.
- No amendment/audit-trail columns beyond `created_by_user_id` /
  `updated_by_user_id` / `updated_at` — the spec's fuller "actor, device,
  time, prior value, new value, reason" audit trail is a real requirement
  for a later wave once amendment (not just record-then-amend-via-upsert)
  is itself designed.
- No sync/offline-conflict handling beyond what SQLite/the existing
  `Mutex<Connection>` serialization already provides — this schema is
  offline-write-ready (stable UUIDv7 ids, idempotent session creation),
  but no cloud sync exists anywhere in this codebase yet to test against.
- No export or Subject Monitor aggregation queries.
- Zero change to `attendance_records`, `AttendanceStatus`, SF2 export, or
  any existing attendance code path — confirmed by `git diff --stat`
  touching only new files plus three registration lines
  (`repository/mod.rs`, `commands/mod.rs`, `lib.rs`).

## Verification

`cargo test`: 564 lib tests (+18 — 14 new `repository::subject_attendance`
unit tests + 4 new migration tests), all integration binaries green
including the new `tests/subject_attendance.rs` (7/7 command-boundary
tests: own-assignment success; a different teacher denied; no session
denied; cross-teacher entry-write denied; `mark_all_present` never
overwrites; cross-school session listing denied; idempotent re-open).
`cargo fmt --check` / `cargo clippy --all-targets -- -D warnings` clean.
`npm run quality` 600/600 vitest unchanged (Rust-only wave, zero
frontend files touched). `npm run quality:security` clean, no new
dependency. `npm run harness:verify` exactly 100/100, unchanged — not
reopened. `npm run build` + `check:dev-preview-isolation` pass.

## Review

Self-review covered: the two `UNIQUE` constraints actually reject a
duplicate (proven by migration tests, not assumed); `authorize_own_assignment`
denies a different teacher at the same school (proven);
`record_entry`/`mark_all_present`/`roster_for_session` all resolve
`school_id`-scoped queries only, never leaking a different school's data
(proven — `list_sessions_for_assignment_never_leaks_a_different_schools_sessions`,
`a_second_school_never_sees_the_first_schools_sessions`); a session
marked `NoClass` refuses further entry writes (proven); a membership from
a different section, or one not yet enrolled on the session's date, is
refused (both proven with dedicated tests, not merely reasoned about). No
independent (non-self) review was dispatched for this bounded foundation
slice — retained as debt in `docs/VERIFICATION-DEBT.md`, consistent with
several recent waves' own pattern.
