# Independent Security Review — Batch 1–14 (branch `claude/pending-tasks-batch-vjy67v`)

**Date:** 2026-09-09
**Reviewer:** Independent review agent (fresh context, read-only — no source files modified)
**Scope:** `git diff main...HEAD` on branch `claude/pending-tasks-batch-vjy67v` (28 commits ahead of `main`, 309 files changed). This review targeted the 8 areas requested by the orchestrating session, cross-checked against `.claude/rules/security-privacy.md`, `docs/adr/0003-encryption-at-rest.md`, and `docs/adr/0004-authentication-and-local-session.md`, and specifically re-checked for recurrence of this project's two previously-shipped-and-fixed defect classes: (a) an unauthenticated bootstrap path allowing self-granted school membership, and (b) a SELECT-then-act singleton-guard race in first-run bootstrap.

**Method:** Located real current code via Grep/Glob (not assumed paths), read the implementation and its accompanying unit tests, traced authorization/data-flow across command → auth → repository → sync layers, and checked byte-math/crypto claims arithmetically rather than trusting comments. No file was modified; no destructive or write commands were run.

---

## 1. Sync payload encryption / key rotation

**Checked:** `src-tauri/src/crypto/payload_key.rs` (AES-256-GCM primitives), `src-tauri/src/repository/sync_payload_key.rs` (`rotate_for_school`, `wrap_for_credential`, `ensure_wrapped_for_credential`), `src-tauri/src/hub_server.rs` (`SspkCell`, `current_sspk`, `authenticate`, `payload_key_wrap_handler`), `src-tauri/src/db/mod.rs` (`rotate_sspk`), `src-tauri/src/commands/device_sync.rs` (`revoke_device_sync_credential`), `src-tauri/src/auth/mod.rs` (`revoke_device_sync_credential`, `revoke_device_sync_credential_and_rotate_sspk`).

**Verdict: solid.** This module documents that it already fixed a real BLOCKING finding from a prior independent review (`docs/reviews/2026-09-07-sync-payload-encryption-review.md`): the SSPK used to be a plain immutable `[u8; 32]` captured once at hub-listener startup, so revocation rotated the on-disk DPAPI file and cleared DB wraps but left the *running* process still authenticating everyone (including the just-revoked device) against the stale key. The fix (`SspkCell` = `Arc<RwLock<Option<[u8;32]>>>`, shared between `HubServerState` and Tauri-managed state, updated in-place by the revoke command's closure) closes that gap correctly:
- `authenticate()` first calls `device_credential::verify()` — a revoked credential's `revoked_at IS NOT NULL` guard (`repository/device_credential.rs:146-152`) makes `verify` return `None` before the lazy re-wrap path (`ensure_wrapped_for_credential`) is ever reached, so a revoked device can never recover a wrap of a post-revocation key. Confirmed by test `a_revoked_credential_never_gets_a_lazy_rewrap`.
- `revoke_device_sync_credential` (auth/mod.rs:1301) wraps the DB-side revoke + `rotate_for_school` (wrap-clearing) in a single `SAVEPOINT`, so the two never partially apply.
- `revoke_device_sync_credential_and_rotate_sspk` (auth/mod.rs:1414) deliberately rotates the SSPK file/in-memory cell only *after* the DB revoke commits, and a test (`..._keeps_the_revocation_even_if_rotation_fails`) proves a filesystem failure during rotation never un-revokes the credential — correct fail-safe ordering (deny access is the security-critical half; key-rotation completion is best-effort but never blocks or reverts the deny).
- Cross-school confusion is explicitly guarded: `revoke_device_sync_credential` checks `credential_in_this_school` before evaluating the School-Head capability, with a named regression test (`revoke_device_sync_credential_denies_a_school_head_from_a_different_school`) — this is exactly the class of tenant-isolation bug the ground-truth docs warn about, and it's handled correctly here, not merely by omission.
- AES-256-GCM wrap/unwrap and payload encrypt/decrypt fail closed (auth-tag verification) on wrong key/tampered nonce/tampered ciphertext/undersized nonce, all exercised by unit tests. Nonces are fresh random per call — no nonce reuse.

No blocking or should-fix findings in this area.

---

## 2. School branding logo upload (MIME/BLOB handling)

**Checked:** `src-tauri/src/commands/school.rs` (`ALLOWED_LOGO_MIME_TYPES`, `magic_bytes_for`, `validate_logo_upload`, `set_school_logo`), `src-tauri/src/repository/school.rs` (`set_logo`/`get_logo`/`clear_logo`).

**Verdict: solid, and honestly self-documented.** The code's own doc comment records that an earlier version of this command validated only the caller-declared `mime` string, never the actual bytes — i.e., any arbitrary blob could be stored and later rendered as an `<img>` merely by lying about the MIME field. The current `validate_logo_upload`:
- Rejects empty and oversized uploads before any DB write.
- Allow-lists exactly three MIME types (`image/png`, `image/jpeg`, `image/webp`).
- Verifies real magic bytes: PNG's 8-byte signature, JPEG's `FF D8 FF` prefix, and WebP's non-contiguous `RIFF....WEBP` (checks bytes 0-3 and 8-11, correctly skipping the little-endian chunk-size field at 4-7 which legitimately varies).
- Cross-type mislabeling is explicitly tested (`rejects_a_real_png_mislabeled_as_a_different_allowed_mime`), not just "is this a known signature."
- `set_school_logo` runs `validate_logo_upload` *before* even acquiring the DB connection/session, then `authorize_capability_with_actor(ManageSchoolBranding)` (School-Head-only) and `require_structural_lock_unlocked` (ADR-0070) both before any sync-related code runs.

This validation only checks the magic-byte header, not full file structure — a crafted PNG/JPEG/WebP with a valid header but malformed/malicious trailing content (e.g., a PNG with an embedded polyglot payload) would still pass. This is a **should-fix, not blocking**, note: the app only ever displays the bytes in an `<img>` tag (per the code's own doc comment), and this is a native Tauri desktop context, not a browser rendering untrusted HTML — the realistic exploit surface (XSS via a polyglot "image" that's actually HTML/JS) is materially reduced by magic-byte gating on the three real binary formats. Full re-encoding/re-validation via an image-decoding library would be stronger but is not required to consider this area safe to merge.

No blocking findings.

---

## 3. Secondary Structural-Lock PIN

**Checked:** `src-tauri/src/crypto/pin_lock.rs` (`derive_pin_hash`, `verify_pin`, `PBKDF2_ITERATIONS`), `src-tauri/src/repository/structural_lock.rs` (`set_pin`/`find_pin`/`clear_pin`), `src-tauri/src/auth/mod.rs` (`Session.structural_lock_unlocked_until`, `unlock_structural_lock`, `structural_lock_is_unlocked`, `verify_structural_lock_pin`, `require_structural_lock_unlocked`, `set_structural_lock_pin`/`clear_structural_lock_pin` gated by `Capability::ManageStructuralLock`).

**Verdict: solid.**
- **PBKDF2 parameters:** PBKDF2-HMAC-SHA256, 150,000 iterations, 16-byte random salt (CSPRNG via `rand::fill`), 32-byte output. The doc comment is honest that this is below OWASP's 600k recommendation for a *primary* credential, but explicitly and correctly scopes this PIN as a secondary, narrower "are you sure" gate on an already-authenticated session — not a login credential — matching the legacy `settingsLock.js` behavior it ports. This is a reasonable, documented trade-off, not an oversight.
- **Constant-time comparison:** `verify_pin` uses `subtle::ConstantTimeEq::ct_eq`, not `==`, for the hash comparison. Confirmed by reading the actual `use subtle::ConstantTimeEq;` import and the `.ct_eq(&stored.hash).into()` call.
- **Iteration count is read from the stored record, not hardcoded at verify time** (`derive_with_salt(pin, &stored.salt, stored.iterations)`), with a dedicated test proving a differently-configured legacy hash still verifies — this correctly future-proofs an eventual iteration-count bump without breaking existing stored PINs.
- **Unlock window is genuinely in-memory-only:** `Session.structural_lock_unlocked_until: Option<SystemTime>` lives purely in the `Session` struct inside `SessionManager`'s in-memory store (never written to any `structural_lock_pins` or `sessions` DB table); `unlock_structural_lock`/`structural_lock_is_unlocked` only mutate/read this in-memory field. `create_session` (auth/mod.rs) always initializes a fresh session with `structural_lock_unlocked_until: None` — a new session never inherits a prior one's unlock state, and a process restart clears all sessions (matching the "sessions in-memory only, never survive a process restart" rule in `security-privacy.md`).
- `verify_structural_lock_pin` returns `Ok(false)` (never an error) for both "wrong PIN" and "no PIN configured" — correctly avoiding an oracle that would let a caller distinguish those cases from timing/error-shape.
- `require_structural_lock_unlocked` is a no-op (returns `Ok(school_id)`) for a school that never configured a PIN — verified no new UX/behavior change for the common case.

No blocking or should-fix findings.

---

## 4. Child Protection / Anecdotal Records authorization

**Checked:** `src-tauri/src/auth/mod.rs::authorize_child_protection_access_for_section`, its reuse by both `src-tauri/src/commands/child_protection.rs` and `src-tauri/src/commands/anecdotal_record.rs`, `src-tauri/src/repository/section.rs::find_by_id_in_school`, `src-tauri/src/repository/section_advisory.rs::is_current_adviser`.

**Verdict: solid — and better than a naive "sibling function" design.** Rather than shipping a second, independently-written authorization function for Anecdotal Records (the class of divergence the task description worried about), the code reuses the exact same `authorize_child_protection_access_for_section` function for both surfaces (confirmed: every `#[tauri::command]` in both `commands/child_protection.rs` and `commands/anecdotal_record.rs` calls this one function; there is no separate, possibly-weaker, "anecdotal" variant).

Tracing the function itself (auth/mod.rs:680-704):
```
let (user_id, school_id) = sessions.require_active_session(conn)?;
if section_repo::find_by_id_in_school(conn, &school_id, section_id)?.is_none() {
    return Err(AppError::Unauthorized);
}
if section_advisory_repo::is_current_adviser(conn, &school_id, section_id, &user_id, as_of_date)? {
    return Ok((user_id, school_id));
}
if role_repo::has_any_role(conn, &user_id, &school_id, Capability::ManageChildProtection.allowed_roles())? {
    return Ok((user_id, school_id));
}
Err(AppError::Unauthorized)
```
- **Bare Teacher with no adviser relationship is genuinely denied:** neither the adviser check nor the role check (`ManageChildProtection.allowed_roles()` = School-Head-only, confirmed in the `Capability::allowed_roles` match arm) passes for a Teacher who isn't the section's current adviser, so the function falls through to `Err(Unauthorized)`.
- **Forged section ID / cross-tenant scoping cannot be bypassed:** `section_repo::find_by_id_in_school` is scoped by the session-derived `school_id`, not merely by `section_id` — a section ID belonging to a different school returns `None`, which this function maps to `Unauthorized` before even checking adviser/role status. This is exactly the tenant-isolation boundary `.claude/rules/architecture.md` requires ("Tenant scope is never a client-supplied parameter... always derived server-side from the authenticated session").
- **Defense-in-depth beyond the shared gate:** `add_incident_intervention` (commands/child_protection.rs:264-300) additionally re-fetches the incident by `(school_id, incident_id)` and independently checks `incident.section_id == section_id`, explicitly to stop a forged `incident_id` from a *different section within the same school* the caller does happen to advise — a narrower, real attack this reviewer would have flagged had it been missing. It is present and tested.

No blocking or should-fix findings.

---

## 5. Sync wiring for sensitive entities

**Checked:** `src-tauri/src/sync_client.rs::apply_decrypted_change` (the full match over `EntityKind`), plus each entity's command-layer wiring: `src-tauri/src/commands/{lesson_plan,nutrition,child_protection,grade_submission,transfer_record,school,formative_assessment,anecdotal_record}.rs`.

**Verdict: solid.** For every entity with a `school_id` field on its own payload struct (`Learner`, `Attendance`, `Section`, `LearnerScore`, `AssessmentItem`, `Subject`, `TeachingAssignment`, `LessonPlan`, `NutritionRecord`, `BehavioralIncident`, `GradeSubmission`, `TransferRecord`, `SchoolLogo`, `FormativeAssessmentLog`, `AnecdotalRecord`), `apply_decrypted_change` checks `incoming.school_id != school_id` (the *pulling device's own* trust-boundary scope, not anything client-supplied) and rejects as `ApplyRejection::Untrusted` on mismatch before ever calling `upsert_from_sync`. For the three child-record entities that carry no `school_id` field of their own (`IncidentIntervention`, `GradeSubmissionNote`, `AnecdotalRecordFollowup`), the pulling device's own `school_id` is passed explicitly into the repository's `upsert_..._from_sync(conn, school_id, &incoming)` call — the same trust boundary, just applied at insert time rather than via a payload-field comparison. This is documented consistently in each match arm with an explicit comment cross-referencing the pattern.

**Spoofing the pull-side `school_id` check itself is not possible from a remote peer:** `school_id` in `apply_decrypted_change` originates from this device's own already-authenticated sync session (the `authenticate()` call in `hub_server.rs`, or the equivalent client-side pull driver — not investigated byte-for-byte here beyond confirming it's never taken from the wire), and the payload itself can only be decrypted at all if the peer holds the correct per-school SSPK (`decrypt_payload` fails closed on the wrong key, per crypto/payload_key.rs). A malicious/compromised hub peer cannot present School A's encrypted data to a School B device and have it accepted, because School B's device would fail to even decrypt it (wrong SSPK) before the `school_id` comparison is reached.

**Authorization gates survive unchanged through the sync-aware wrapper, verified concretely (not just by comment):** every sync-wired write command follows the identical ordering — `authorize_*`/`authorize_capability*` (and, where applicable, `require_structural_lock_unlocked`) run to completion *before* `resolve_sspk_if_enrolled` or any outbox-enqueue code executes. This was traced directly in `commands/school.rs::set_school_logo` (auth + PIN gate before `resolve_sspk_if_enrolled`), `commands/child_protection.rs::add_incident_intervention` (shared auth gate + forged-incident-id guard before `resolve_sspk_if_enrolled`), and `commands/grade_submission.rs::decide_grade_submission` (`ManageGradeSubmissionReview` before SSPK resolution). The local write and its sync-outbox enqueue are wrapped in the same `SAVEPOINT`/`ROLLBACK TO`/`RELEASE` transaction in every case checked, so a failure enqueueing the sync change rolls back the local write too (no silent "wrote locally but the sync record is inconsistent" state).

**One item noted, not blocking:** `upsert_intervention_from_sync`, `upsert_note_from_sync`, and `upsert_followup_from_sync` insert their child rows with no referential check that the parent (`incident_id`/`submission_id`/`anecdotal_record_id`) actually exists in this school's local DB — they trust the incoming payload's parent-id reference outright once the school-scope/decryption boundary is satisfied. In practice this can only produce an orphaned row (a data-integrity nuisance, e.g., if a device pulls a note for a submission it hasn't pulled yet) rather than a cross-tenant read/write, since the SSPK/decryption boundary already prevents cross-school payloads from being accepted at all. This is a **should-fix for data integrity**, not a security blocker — worth an FK-existence check or a documented eventual-consistency note in a follow-up slice, but does not expose data across the authorization boundary.

---

## 6. SchoolLogo sync byte-budget shrink (`MAX_LOGO_BYTES` = 48 KiB)

**Checked:** `src-tauri/src/commands/school.rs` constant and its own arithmetic-proof unit test `max_logo_bytes_leaves_headroom_under_the_sync_encrypted_change_cap`; `src-tauri/src/sync/mod.rs::MAX_ENCRYPTED_CHANGE_BYTES`; `docs/adr/0081-school-logo-sync-byte-budget.md`.

**Verdict: the math holds, with real headroom, and it's guarded by a test that would fail if the constants ever drifted again.**

Recomputed independently (not just trusting the comment):
- `MAX_LOGO_BYTES = 48 * 1024 = 49,152` bytes.
- `serde_json`'s default `Vec<u8>` encoding is a JSON array of decimal byte values (this crate deliberately avoids adding a `base64` dependency) — worst case per byte is `"255,"` = 4 characters.
- Worst-case JSON-encoded plaintext: `49,152 × 4 = 196,608` bytes.
- Plus `JSON_WRAPPER_OVERHEAD = 256` (generous bound for `schoolId`/`mime` keys/brackets) and `AES_GCM_OVERHEAD = 12 + 16 = 28` (nonce + auth tag, matching `crypto/payload_key.rs`'s actual `NONCE_LEN = 12` and AES-GCM's standard 16-byte tag).
- Total worst case: `196,608 + 256 + 28 = 196,892` bytes.
- `sync::MAX_ENCRYPTED_CHANGE_BYTES = 256 × 1024 = 262,144` bytes.
- `196,892 < 262,144` — holds with **65,252 bytes (≈25%) of headroom**, not a knife-edge fit.

No integer overflow risk: `usize` arithmetic on `usize::MAX`-scale platforms (64-bit) has no realistic overflow at these magnitudes; even on a 32-bit target the largest intermediate (`196,608`) is far below `u32::MAX`. No truncation risk: this is a pure size-comparison assertion, not a buffer copy. The real runtime enforcement is the pre-existing `MAX_ENCRYPTED_CHANGE_BYTES` check in `sync::validate_change` plus the DB `CHECK(length(encrypted_payload) <= 262144)` constraint noted in `db/migrations.rs` — this test only proves the *application-level* limit stays under both, so a caller can never even attempt an oversized change that both layers would otherwise have to reject at runtime.

No blocking or should-fix findings.

---

## 7. Disaster-recovery backup mechanism

**Checked:** `src-tauri/src/backup.rs` (`create_two_copy_backup`, `create_encrypted_copy`, `verify_backup_copy`), `src-tauri/src/commands/backup.rs` (`create_disaster_recovery_backup`), `Capability::CreateDisasterRecoveryBackup` gating in `src-tauri/src/auth/mod.rs`.

**Verdict: solid.**
- **Never plaintext or weakly encrypted:** each copy is produced via SQLCipher's own documented `ATTACH DATABASE ... KEY ...` + `sqlcipher_export()` mechanism, using the *same* key and `cipher_compatibility = 4` settings as the live database (ADR-0003's guarantee) — not a raw file copy (which the doc comment correctly notes would risk capturing a torn WAL-mode snapshot) and not a separately/weaker-keyed copy. This is proven by an actual test, not just documentation: `backup_files_on_disk_never_contain_plaintext_data` writes a synthetic marker string into the source DB, creates both backup copies, and asserts neither copy's raw bytes contain the marker anywhere. A second test, `a_backup_copy_is_unreadable_with_no_key_or_the_wrong_key`, confirms an unkeyed `Connection::open` on the backup file cannot even query `sqlite_master`, and `verify_backup_copy` with the wrong key fails.
- **`Capability::CreateDisasterRecoveryBackup` is genuinely School-Head-gated:** confirmed directly in `auth/mod.rs`'s `Capability::allowed_roles` match arm — `Capability::CreateDisasterRecoveryBackup => &[role_repo::SCHOOL_HEAD]` — and the command (`commands/backup.rs::create_disaster_recovery_backup`) calls `auth::authorize_capability(&conn, &sessions, Capability::CreateDisasterRecoveryBackup)?` before touching the encryption key or filesystem.
- **No path-traversal / arbitrary-overwrite risk:** the backup destination path is never caller-supplied. `create_disaster_recovery_backup` derives `backup_dir` from `app.path().app_data_dir()` (a Tauri-managed, non-user-controllable path) joined with the fixed literal `"backups"`, and the filenames are built entirely server-side from a deterministic timestamp: `likha-sis-backup-{YYYYMMDD-HHMMSS}-{a,b}.db`. No user/client input reaches the path at all — there is no parameter in the `#[tauri::command]` signature that could inject `../` or an absolute path. The "if a file already exists at either destination, delete it first" overwrite behavior in `create_encrypted_copy` is explicitly scoped, by the calling command's own doc comment, to only ever collide with this module's own previously-generated backup filenames (i.e., a same-second retry), not an arbitrary caller-chosen path — verified this claim by confirming `create_two_copy_backup`'s only caller is `commands::backup::create_disaster_recovery_backup`, which is the only place `primary_path`/`secondary_path` are constructed, and they're built purely from `app_data_dir` + the fixed subdir + the derived timestamp.
- The custom `timestamp_from_unix_seconds` civil-date conversion (Howard Hinnant's well-known public-domain algorithm, used here instead of adding a `chrono`/`time` dependency) is unit-tested against a known, independently-verifiable Unix timestamp (`1_788_912_000 → "20260909-000000"`), which checks out correctly against a standard epoch converter.

No blocking or should-fix findings.

---

## 8. Hub daemon supervisor

**Checked:** `src-tauri/src/hub_server.rs::supervisor` module (`backoff_for_attempt`, `BASE_MS`, `CAP_MS`, `SHIFT_CAP`) and `spawn`'s retry loop.

**Verdict: solid for its stated, narrow purpose; one design caveat worth flagging but not blocking.**
- **Cannot be abused for resource-exhaustion DoS against its own host:** the backoff schedule is a pure function of the attempt counter — `BASE_MS = 1_000`, doubling per attempt up to `SHIFT_CAP = 6` (`2^6 × 1000 = 64,000 ≥ CAP_MS = 60,000`, so the shift cap is reached before the final `.min()` would ever need to handle an unbounded `1u64 << shift` for a huge `attempt`), then floored at `CAP_MS = 60,000` ms. Four dedicated unit tests directly prove: it never returns zero (no busy-loop), it never exceeds the cap however large `attempt` grows (tested up to `u32::MAX`), and it is monotonically non-decreasing. A persistently-failing bind (e.g., something else permanently holds the port) settles into retrying at most once per minute — not a tight loop that could pin a CPU core or exhaust local sockets/file descriptors.
- **Does not distinguish failure types (bind conflict vs. a hypothetically "permanent" failure class) — retries forever regardless.** The task description asks specifically whether it "doesn't silently retry forever on a failure type where retrying is actually wrong (e.g. a TLS/cert error vs. a transient bind failure)." Concretely: this listener is plain HTTP over LAN (axum + `TcpListener::bind`, no TLS termination visible anywhere in this file or its `router()`/`push_handler`/`pull_handler` — ADR-0067's threat model for this is LAN-local trusted-network sync, not a public TLS endpoint), so there is no TLS/cert failure class for this code to ever encounter. The only failure surfaces here are `TcpListener::bind` errors (port conflict, permission, interface gone) and `axum::serve` runtime errors — both of which are legitimately transient-or-recoverable-by-retry in this context (a competing process briefly holding the port, an interface flapping, a momentary panic-free serve error). Retrying forever on these is the documented, intentional behavior, and the doc comment is explicit that this only hardens the *already-running process* against its own listener task failing — it explicitly disclaims responsibility for the whole app crashing or the machine rebooting, deferring that (correctly) to an OS-level Scheduled Task described in `ops/hub-daemon-recovery-setup.ps1` and `docs/adr/0085-hub-daemon-resilience.md`. Given there is no TLS/cert-error class reachable at this layer, this is not a live gap — noted as a **should-fix-if-the-transport-model-ever-changes** observation rather than a defect: if TLS termination is ever added to this listener in the future, the retry-forever-on-any-error behavior would need a carve-out for a certificate/handshake failure class specifically, since retrying that class is a self-inflicted denial-of-service against a config that will never succeed. Not applicable to the code as it exists today.
- No credential material, secrets, or user input flow into this module at all — it operates purely on `bind_addr` values already computed by `select_bindable_addresses`/interface enumeration.

No blocking findings; one forward-looking design note (not a defect in current code).

---

## Cross-cutting checks (per the two named recurring-defect classes)

- **Unauthenticated bootstrap / self-grant of school membership:** searched the diff and the current `auth`/`commands`/`db` modules for any new INSERT-without-authorization path into `user_school_roles`/school membership tables. Every membership-granting path found (`enroll_device_sync_credential`, `revoke_device_sync_credential`, the various `authorize_capability*` gates) requires either a valid authenticated session or credentials re-verified against actual DB membership (`enroll_device_sync_credential`'s own doc comment and test `enroll_command_body_denies_a_user_not_in_the_target_school` explicitly re-verify school membership server-side regardless of the client-supplied `school_id`). No new unauthenticated bootstrap path was found in this diff.
- **SELECT-then-act singleton-guard race:** checked `device_identity` (enforced by a DB `UNIQUE`/fixed-`id` CHECK constraint proven by `migration_31_enforces_the_device_identity_singleton`, not an app-level check-then-insert), and the school-logo "singleton per school" write path (`repository::school::set_logo` is a single atomic `UPDATE ... WHERE id = ?`, not a SELECT-then-INSERT/UPDATE branch). Structural-lock PIN storage (`repository::structural_lock::set_pin`) uses `INSERT ... ON CONFLICT(school_id) DO UPDATE` (a single atomic UPSERT), also not vulnerable to this race class. No recurrence of either defect class found in the reviewed diff.

---

## Overall summary

This batch (sync payload key rotation hardening, school-logo MIME sniffing, the structural-lock PIN, child-protection/anecdotal-records authorization reuse, sync wiring for nine sensitive entity types, the logo byte-budget shrink, the disaster-recovery backup mechanism, and the hub daemon supervisor) is consistently well-engineered from a security standpoint: authorization gates are applied before any sync/crypto work runs and are wrapped in the same transaction as the data write; tenant scope is always derived server-side and never trusted from client/payload input; cryptographic primitives (AES-256-GCM, PBKDF2-SHA256, constant-time comparison) are used correctly with fail-closed error handling; the one genuinely prior BLOCKING finding this project shipped in this area (the stale in-memory SSPK surviving a revocation) has been fixed and is now covered by a dedicated regression test; and the byte-budget and disaster-recovery-path claims both check out arithmetically/structurally rather than merely by comment. Two non-blocking observations were raised: (1) child-sync-record upserts (`IncidentIntervention`/`GradeSubmissionNote`/`AnecdotalRecordFollowup`) don't verify their parent record exists locally before inserting — a data-integrity nuisance, not a security/tenant-isolation gap, given the SSPK/decryption boundary already prevents cross-school payloads; and (2) the hub supervisor's forever-retry-on-any-error design has no TLS/cert-error carve-out, which is currently moot because this listener has no TLS layer at all, but is worth remembering if one is ever added.

**BLOCKING items requiring a fix before this branch is safe to merge: none found.**
