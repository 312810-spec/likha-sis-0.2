# Legacy sole-account setup recovery — implementation checkpoint

Base: PR149 d78374f220ed1cb64358725952a72b445840d9a2. Separate dependent repair;
no merge/deployment, no new runtime journey. Frozen R1–R7:
`legacy-setup-recovery-contract-2026-10-20.md`.

## Verified implementation and current installer

R1–R7 technically READY FOR REVIEW within this bounded repair. Actual recovery on
the user's installation remains NOT RUN until observed. Full Scores pilot remains
INCONCLUSIVE; no merge/deployment.

Checked source52a761cc3d1368a2cc91c95c1ab59a06a07ef266,
tree1ed35b828a649b5a6bfa376acf7359e2fe7814c9. CI merge
4e5a951a2bd17816c3365442a577772613938c27 has exactly the same tree.
Quality39338547483 SUCCESS: Ubuntu118354179062 passed1,535 native tests,
Rustfmt/Clippy, both vendor provenance checks, private D-Bus and restored-source
score negative controls; Windows118354179127 passed1,544 native tests and actual
application/NSIS/MSI build. All9 new native recovery cases passed on both platforms.
Frontend1,593/UI smoke/recovery50 passed. Security39338547311 passed Gitleaks,
cargo-deny and OSV under unchanged policy. Exact jobs/steps/focused logs/artifact:
`legacy-setup-recovery-ci-2026-10-20.json`.

[Replacement Windows test-installer ZIP](https://github.com/312810-spec/likha-sis-0.2/actions/runs/39338547483/artifacts/12228374752).
GitHub-reported archive SHA-256:
`f43f96151e69ad1dbb64b124cc9f499c173e46c01a2a54c2648b551c9efcb1bc`;
22,970,803 bytes, expires2026-11-02T23:23:52Z. This binds the original ZIP, not an
extracted installer. `prepare-scores-trial.mjs` and the Windows trial runbook now
pin this candidate; the old trial ZIP is no longer the helper's accepted candidate.
All7 helper integrity/output-protection tests and focused formatting/diff checks
passed after the metadata update. No application/native/test/workflow source was
changed after the checked implementation; later edits are receipts/helper pin only.

On the affected installation, close LIKHA-SIS and install the replacement test build
without deleting its app-data. Sign in, choose Restore setup access, review the
application permissions and confirm with the current password. Then check that
Sections offers Create section. Preserve the database/key; no manual SQL or password
reset is needed by this flow. If recovery is unavailable, leave the data intact:
its eligibility guard is authoritative and ambiguous cases require further diagnosis.

## Problem and decision

User reports this installation's only account worked on an older build, the new
installer skipped setup, and sign-in now succeeds. Screenshot shows Sections with
no creation controls and the school-head access explanation. Earlier sign-in
failure cause remains unknown; successful sign-in does not establish that a code
change fixed it. No user's encrypted database or password has been inspected.

Source migration16 creates roles without a backfill; fresh bootstrap grants roles
but existing accounts are skipped by first-run setup. Executed all57 actual extracted
production migration SQL statements (including the external final SQL file) in
in-memory SQLite with a synthetic version15 sole-owner fixture. Owner/membership
survive with zero roles. Actual recovery eligibility SQL accepts the sole-owner
fixture and rejects a second user. This is SQL mechanism evidence, not installed
SQLCipher/password verification. A new native test performs the real version15→latest
migration with a fixed historical Argon2 0.5.3 PHC fixture, then authenticates and
recovers through actual application code; execution is pending native CI.

Automatic migration/login promotion was rejected: it would assign consequential
permissions without a current explicit action. Manual SQL/role-table edits were
rejected: they bypass trusted invariants/audit. Selected: authenticated, explicit,
password-rechecked recovery only for one user/one school/one membership, a claimed
bootstrap slot, zero roles installation-wide, and no prior role-management or
membership-removal audit events. These are application setup capabilities, not an
official school designation. Ambiguous installations fail closed.

## Implementation

`auth/legacy_setup_recovery.rs` derives identity/school from the live persisted-
revocation-checked session. Availability is read-only apart from the existing idle
session activity update. The write independently rechecks eligibility, verifies the
current account's password with existing lockout behavior, obtains an immediate
write transaction, then rechecks session/eligibility and commits the three bootstrap
roles plus three actual role-grant audit records atomically. Failures roll back all
roles/audits; a second successful recovery is impossible while those roles/history
remain. Password-check failed-attempt state persists outside the role transaction.
Command-boundary password Strings are zeroized even on returned errors.

No caller-controlled user/school/role parameters, plaintext DB fallback, new key,
password reset, schema/dependency change or altered historical migration was added.
Only a new test was appended to the existing migrations source. Role changes are
shown from the command's authoritative CurrentSession DTO. The UI never grants roles.

Roleless signed-in accounts get a trusted availability check. Eligible accounts
see purpose/access disclosure, explicit password confirmation and Cancel. Password
is not stored in session drafts and the input clears on submit/Cancel. Pending and
synchronous duplicate-submit guards apply. Stale owner receipts are ignored. A
permission denial from this command is exempt from global session-expiry handling;
ineligibility is not proof that the sign-in session expired.

## Executed local checks

- `npm run quality` PASS: typecheck/lint/format/architecture/dead-code/batch checks;
  all1,593 frontend tests across160 files PASS. Initial lint caught synchronous
  effect-state resets; replaced them with identity-bound asynchronous status and
  explicit retry handlers, then reran the complete gate successfully.
- Eight focused component cases plus three repository/service cases and the
  invoke-denial regression are included in that frontend total. They verify
  no premature recovery, retry, Cancel/focus/no write, cleared password, single
  submit, explicit receipt, rejected writes and stale-owner result cancellation.
- Production `npm run build` PASS. Existing `quality:ui:recovery` PASS,50 checks.
- Existing `quality:ui` PASS; no assessed WCAG A/AA findings in its existing scope.
- `legacy-setup-recovery-browser.mjs` PASS:18 production-App/synthetic-IPC cases,
  both appearances ×3 densities ×1280/640/390. Native keyboard Tab reaches confirm,
  Cancel writes0 and restores focus, receipt clears the recovery panel through
  App's authoritative role update, one request, cleared input, hittable actions,
  no page overflow and no assessed component axe findings. Both phone renders
  inspected internally. Raw evidence: `legacy-setup-recovery-browser-2026-10-20.json`.
  This is browser/mock behavior, not native authority or installed-device recovery.
- Rustfmt PASS using stable1.99.1. Targeted native test build attempted locally;
  blocked by missing pkg-config/GLib system packages before app-test compilation.
  No local native test PASS is claimed. No production fix is inferred from this
  environment limitation. CI must execute all new native cases and existing suites.

## Remaining gates and device steps

At the original implementation checkpoint, R7/native execution was INCONCLUSIVE
pending exact-source CI; the verified result above supersedes that pending status. New native cases cover actual legacy schema/hash upgrade,
correct/wrong/locked password, absent/expired/revoked session, extra account/school,
missing membership/bootstrap, existing role or historical management, stale status,
atomic audit rollback, duplicate and concurrent-connection recovery.

After successful CI, provide its exact replacement installer, source and archive
digest. Preserve existing local database/key together; no manual SQL/deletion or
blind downgrade. On the actual installation: sign in, choose Restore setup access,
review the disclosed permissions, re-enter the current password and confirm. The
app must show setup controls from the returned roles. Verify existing identity and
records, then configure the intended section/assignment. Actual user-device recovery
remains NOT RUN until observed; never mark it complete from CI/mock screenshots.
Full Scores teacher/installed-upgrade/Android/exchange/manual acceptance stays separate.

## First candidate CI follow-up

Published source6e2f271 /tree6ba27a61; CI mergea8bb32e0 has the same tree.
Security39337985890 passed all3 unchanged-policy scanners. Quality39337985884
Ubuntu118352260331 failed in the existing pending-record test: workspace heading
was found before the assessment-loading effect called its spy (0 calls at the
immediate assertion). Local suite had passed; CI timing exposed the test race.
Source shows the heading renders independently of the loading effect. Changed
only the test synchronization to wait for the same exact `cr-2` call, retaining
no-replacement assertion. No production Scores/recovery behavior was changed.
Revised candidate must pass full CI; the failed receipt is retained as history.
