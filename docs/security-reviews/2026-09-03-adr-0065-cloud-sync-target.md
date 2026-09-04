Independent security review - ADR-0065 (Cloud Sync Target Decision)
Branch: claude/wave5-sync-target-decision
File: docs/adr/0065-cloud-sync-target-decision.md
Scope: decision-only ADR, no code ships. Read-only review.

VERDICT: CHANGES-REQUIRED (non-blocking)

Nothing here is BLOCKING. The ADR ships no code and the implementation
milestone is routed through its own ADR plus a mandatory security-reviewer
pass. The Recommended pick, Cloudflare Worker plus one D1 database, is
technically defensible: card-free at signup, SQLite-native, callable from
the Rust core over HTTPS, GA services, well-capitalised vendor, no
inactivity auto-pause. Next Best (single Durable Object) and the Turso
third fallback are sensible. But the ADR as written bakes in two bad
defaults and omits one callout this project history makes mandatory; all
are cheap doc edits:

- C2 rationale implies the whole local schema, including
  users.password_hash and sessions, syncs to the cloud.
- Cloud-copy encryption language leaves no-encryption-just-access-scoped
  on the table for learner PII.
- Nothing about the cloud device-enrollment path being a trusted-boundary
  gate; this project twice shipped an unauthenticated bootstrap self-grant
  and a bootstrap-race hole.
  Fix the three MUST-FIX items, fold in SHOULD-FIX, and it is safe to ratify.

==================== MUST-FIX BEFORE RATIFYING ====================

M1 - ADR implies auth/session tables sync to the cloud
ADR text: C2 line 114 (the 41+ existing migrations and the relational
shape transfer with minimal translation); scenario 2 note lines 155-161
(migrations and relational shape carry over almost unchanged).
Concern: taken literally this pushes users.password_hash (Argon2id PHC
strings), sessions, and local audit tables (ADR-0021) to a third-party US
cloud. Material security regression vs ADR-0003/0004, almost certainly
not intended.
Suggested edit: state that the synced data set is an explicit allowlist of
domain tables (learners, sections, attendance, scores, enrolment,
curriculum reference) and excludes all authentication, session, credential
and local-only audit tables; password hashes and session rows never leave
the device. Reword C2/scenario-2 to the domain tables and their shape.

M2 - Cloud-copy encryption is optional as written; make it a requirement
ADR text: lines 346-347 (whether payloads are application-encrypted
end-to-end so Worker/D1 sees only ciphertext, OR the cloud store is merely
access-scoped; E2E strongly preferred and should be the default
assumption). Also line 113 C1 (ciphertext or at least an access-scoped
store).
Concern: data is learner PII of minors. Local DB is SQLCipher-encrypted
and fails closed (ADR-0003); security-privacy.md ranks privacy/security
first. Merely-access-scoped means plaintext learner PII in Cloudflare D1
protected only by a bearer credential plus disk encryption, strictly
weaker than the device, plus cross-border transfer.
Suggested edit: convert to a requirement: the cloud copy MUST NOT contain
plaintext learner PII; PII-bearing payloads are encrypted application-side
before send; only non-PII sync metadata (record ids, tombstones, version
vectors, timestamps) may be cleartext. Scheme and key management stay
deferred, but no-payload-encryption is off the table.

M3 - Cloud device-enrollment must be flagged as a trusted-boundary gate
ADR text: lines 66-67 and 341-343 defer the cloud credential shape with
the never-client-supplied rule but never name the enrollment/bootstrap
step.
Concern: how a brand-new device obtains its FIRST cloud credential is the
exact analogue of the ADR-0004 first-membership bootstrap, where this
project twice shipped an unauthenticated self-grant hole (register_user /
add_user_to_school) and a SELECT-then-act singleton-guard race. A cloud
any-device-registers-itself endpoint reproduces that class in a new place.
Suggested edit: add to does-NOT-decide: the enrollment ceremony must be
gated by a trusted boundary (authenticated local session plus a
school-scoped enrolment secret held only by a legitimately provisioned
school actor); not an unauthenticated self-registration endpoint; the
guard must not be a SELECT-then-act race. Same failure class as the
bootstrap self-grant caught in ADR-0004; must not recur cloud-side.

==================== SHOULD-FIX ====================

S1 - Pin a minimum bar for the deferred credential; not an ADR-0004 mirror
ADR text: line 67 (the cloud mirror of require_active_school_scope);
decision lines 304-305.
Concern 1: a device syncs in the background / after a process restart with
no password re-entry, so the cloud credential is necessarily long-lived,
the opposite of the ADR-0004 in-memory 8-hour non-resumable session.
Calling it a mirror overstates parity and invites remember-me semantics
ADR-0004 rejected.
Concern 2: the-Worker-verifies-a-credential is satisfied by one static API
token baked into the app binary: a shared bearer secret, no per-device
binding, no individual revocation, full read/write to all school PII if
extracted from any one device.
Suggested edit: state the minimum bar now. Credential must be
(a) per-device, not one shared app secret; (b) issued server-side off an
authenticated local login / the M3 enrolment ceremony; (c) individually
revocable with an independent Worker-side revocation check on every
request (mirroring the ADR-0004 independent DB revoked_at lookup);
(d) not derivable from the shipped binary. Note it is a new longer-lived
credential class, a deliberate divergence from ADR-0004, not a mirror.

S2 - Expand does-NOT-decide with missing security/privacy items

- Credential rotation cadence plus immediate revocation path.
- Device de-provisioning when a teacher leaves / membership is revoked
  (ADR-0057 handles this locally): revoke the matching cloud credentials;
  decide whether that device local copy is rendered stale.
- Sync-event auditing: extend the ADR-0021 audit log to record push/pull,
  auth failures, credential rejections, anomalous volume.
- Replay protection / write idempotency: a bearer credential is
  replayable; changeset writes need idempotency keys or nonces so a
  replayed changeset cannot double-apply or resurrect tombstoned rows.
- Per-device rate limiting plus anomaly thresholds at the Worker: a stolen
  credential with no rate limit is unbounded PII exfiltration within
  free-tier read limits, or a deliberate quota burn that makes sync fail
  for the whole school (free-tier-specific DoS).
- Cloud-copy lifecycle on erasure: RA 10173 right to erasure, learner
  transfer-out, account deletion. Needs targeted delete from the cloud
  copy and Cloudflare backups; a pure append-only changeset log that never
  forgets conflicts with erasure - note the tension.
- Encryption-key management and recovery (separate from whether to
  encrypt): where the sync key lives, how it is shared across a school
  devices so device B can decrypt device A writes, its relation to the
  DPAPI-protected SQLCipher key (ADR-0003: never silently mint a
  replacement), what key loss means for the cloud copy.
- Sync-health visibility: surface last-successful-sync in-app so a silent
  stop (provider pause, revoked credential, network) is visible.

S3 - Expand data-residency beyond the generic DPA position
ADR text lines 71-78. The RA 10173 / NPC claim (no localization mandate;
cross-border OK with lawful basis plus comparable protection plus
disclosure) is directionally correct but understates the work and skips
the sector overlay:

- DepEd own data-governance policy (e.g. DepEd Order No. 58 s. 2017 and
  successors) may impose stricter handling / data-sharing-agreement /
  consent rules for learner data and could prohibit offshore processing
  outright; if so the entire Cloudflare pick is void.
- Learner data is minors personal data: heightened sensitivity, parental
  consent, specific NPC advisories.
- Transfer to the US: the comparable-level-of-protection test is
  non-trivial (no US adequacy); normally handled by executing the
  Cloudflare DPA / SCCs - a contract task, not a privacy-notice paragraph.
  Suggested edit: list these as implementation-gating items and flag the
  DepEd-policy check as a decision-invalidating dependency.

S4 - Acknowledge the E2E-encryption vs schema-reuse tension
D1 scores near-top on BOTH C2 schema-reuse (weight 18) AND C1 clean-story-
for-encrypting-the-cloud-copy. These partially conflict: strong E2E means
D1 is not a queryable relational mirror, it is an opaque changeset store,
and row-level merge in the Worker is impossible (no plaintext), so merge
moves into the Rust domain (which the Sync Rule and ADR-0004 want anyway).
Then the D1 C2/C4 advantage over the R2 changeset log (scenario 3, 81)
shrinks and scenario 3 C6 penalty is overstated. Keep scenario 2 as
Recommended, but state the 2-vs-3 gap is narrower than the raw scores.

==================== MINOR ====================

Mi1 - structural-per-school-isolation-already-in-hand overstates Next Best
Lines 177-183, 310-311. Scenario 1 is ONE Durable Object for ONE school,
not DO-per-school (scenario 4). That is not multi-tenant structural
isolation; it is only a shorter migration path to scenario 4. Reword
accordingly, and add: re-widening scope to multiple schools is a new ADR
plus security review, and a shared D1 with only WHERE school_id = ? as the
isolation boundary is NOT acceptable (the pattern ADR-0004 rejected
locally; the self-grant-membership bug class).

Mi2 - C3 architecture-boundary-violation is the wrong disqualifier for JS engines
Lines 115, 265-274. A JS sync engine in a separate sidecar process (not
the React renderer) would not trip scripts/check-architecture.mjs and
would not violate UI-never-reaches-infrastructure (a sidecar IS
infrastructure). The honest disqualifier: no Rust client, so a
second-language runtime/sidecar (packaging, attack surface, worse Android,
a second local store competing with the mandated SQLCipher SQLite) plus
most imply a Postgres source-of-truth. Conclusion (do not pick
PowerSync/Electric/Triplit/InstantDB/Jazz) stands; reframe the reason.
The claim none has a Rust client is accurate as of early 2026.

Mi3 - scenario 20 (GitHub repo as store, 73) score outranks its risk
Lines 135, 232-239. Using a code repo as an application data store is
against GitHub Acceptable Use; account/repo suspension is total sync
outage. C5 13/15 credits GitHub/Microsoft size, but size does not protect
against a ToS action against the use itself. Either add a gate criterion
(provider ToS permits application-data storage) that scenario 20 fails, or
cut its C5 so it does not sit above Neon 55 / Firestore 45 / Mongo 45.
Does not change the decision; matters if the ADR is a scoring template.

Mi4 - Time-sensitive claims need re-verify-at-implementation notes

- Cloudflare no-card-at-signup: accurate as of Sept 2026; Zero Trust
  carve-out correct. If Cloudflare adds a card requirement that is a GATE
  FAILURE (G2), not a minor - say so in the ADR.
- Free-tier limits: storage headroom (tens of MB) is fine, but the ADR
  never checks the 100k-writes/day cap against a realistic initial
  backfill (whole-school learners plus historical attendance plus grades)
  or an end-of-quarter grade-sync spike, nor 5M-reads/day against a
  weeks-offline catch-up. Implementation must model peak-day volume and
  batch/coalesce changesets.

Mi5 - D1 GA claim correct (GA since April 2024); DO SQLite storage
correctly described as newer / less battle-tested. No change needed.

==================== INFORMATIONAL ====================

I1 - Stray empty file in the review branch working tree:
E:\LIKHA-SIS 0.2\interconnected - 0 bytes, untracked. Looks like an
accidental shell redirect from the owner-quote text (not interconnected).
Not part of the ADR commit. Remove so it is not accidentally committed.

I2 - ADR numbering hygiene: checked, clean. docs/adr/0065-* is unique;
docs/adr/0042-learner-core-* is untouched by this commit (shows in git
diff main...HEAD only due to merge-base age). The narrative account of the
old 0042 filename collision on the superseded draft branch is accurate.

==================== ANSWERS TO THE SPECIFIC QUESTIONS ====================

1. Authorization boundary: the recommended shape CAN deliver the ADR-0004
   property (Worker verifies a per-device credential, derives school scope
   server-side, never trusts a client-supplied school_id), but the reasoning
   has two latent holes: (a) verify-a-credential is satisfied by one static
   app-embedded token = a shared bearer secret with no per-device binding or
   revocation; (b) the enrollment step that mints the first credential is the
   ADR-0004 bootstrap-hole analogue and is unmentioned. Deferring the exact
   shape is fine; deferring with no minimum bar and no enrollment callout is
   not. See M3, S1.

2. Isolation at single-school scope: the argument is SOUND for a literal
   one-school one-DB scope - no second tenant data to partition, residual
   isolation is entirely device-authN. The Next-Best-keeps-isolation-in-hand
   mitigation is overstated (scenario 1 is one DO for one school, a shorter
   path to scenario 4, not present isolation). Add a guard that re-widening
   is a new ADR plus security review and a shared DB with only WHERE
   school_id=? is not acceptable isolation. See Mi1.

3. Confidentiality of the cloud copy: deferring the encryption MECHANISM
   is acceptable for a decision-only ADR; leaving or-merely-access-scoped as
   a live option for learner PII is not - harden to a requirement now (M2).
   The ADR over-promises: strong E2E does NOT compose with
   D1-as-queryable-schema-mirror or server-side row merge; it forces an
   opaque changeset store plus domain-side merge, shrinking D1 advantage over
   the R2 option (S4). Neither point changes the pick.

4. Disqualification soundness:

- JS-only engines: correct that none has a Rust client; the
  architecture-boundary-violation framing is imprecise (a sidecar would
  not trip the check) - reframe as second-runtime cost plus Postgres
  source-of-truth plus Android. Conclusion stands. (Mi2)
- Supabase 7-day auto-pause / no Supabase: correct and well-supported
  (verified Sept 2026; Postgres translation burden; standing
  PROJECT-MEMORY exclusion). Good call.
- GitHub-repo-as-store (73): prose buries it correctly, but the score
  outranks its ToS-suspension risk and sits above legit options (Mi3).
- scenario 16 cr-sqlite FAIL G1 and scenario 12 ElectricSQL FAIL not-GA:
  both correct and appropriately conservative.
- Nothing appears wrongly kept in a way that changes the top pick.

5. Missing implementation-milestone flags (security/privacy): credential
   rotation/revocation; device de-provisioning on staff exit; sync-event
   auditing (extend ADR-0021); replay protection / write idempotency;
   per-device rate limiting plus anomaly thresholds; cloud-copy lifecycle on
   erasure / transfer-out / account deletion; encryption-key management and
   recovery; sync-health visibility in-app; and the data-minimisation
   allowlist that keeps auth/session tables off the cloud. See M1, S2, S3.

Claims sanity-check: (a) PH data-residency claim directionally correct but
missing the DepEd-sector overlay and the US comparable-protection / DPA
step (S3). (b) Cloudflare no-card-at-signup accurate as of Sept 2026
including the Zero Trust carve-out, but it is a GATE claim, so a future
change is a disqualifier not a footnote (Mi4). (c) The free-tier daily
WRITE cap (100k rows/day) is the stale-risk claim most likely to bite;
untested against initial backfill / grade-sync spikes (Mi4).
