# Legacy single-account setup access — frozen recovery contract

User reports: sole account on an older installation; upgraded test build signs in,
but Sections has no setup controls. Screenshot establishes absent setup access,
not actual database role contents. Source migration16 adds a roles table without
backfilling old accounts. Extracted SQL reproduction retained account/membership
and no roles (in-memory SQLite, not the user's encrypted installation).

Outcome: an authenticated sole owner can explicitly restore the same application
setup roles granted by fresh bootstrap. No automatic promotion on login/migration.
School Head is an application capability here, not an assertion of a school position.
Separate dependent repair branch from PR149; no unrelated journey or release.

All criteria required:

| ID  | Requirement                                                                                                                                                      | Verification                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| R1  | Active, unrevoked session and current membership; derive identity/school from session only                                                                       | Native denial tests, no caller-controlled identity            |
| R2  | Exactly one user, one school, one membership, claimed bootstrap slot, zero roles and no role/membership-removal audit history installation-wide                  | Positive and ambiguous/populated-state negative native tests  |
| R3  | Explicit password recheck; wrong/locked credentials retain normal lockout behavior and grant nothing                                                             | Native credential/lockout tests; command zeroization          |
| R4  | Recheck R1/R2 under immediate write transaction; all3 bootstrap roles plus real role-grant audit records commit atomically; second call denied                   | Native rollback, repeat and concurrent connection checks      |
| R5  | Records/password/key/schema unchanged; original released migrations unchanged                                                                                    | Diff and native record/hash preservation assertions           |
| R6  | Visible recovery only after trusted status; clear purpose, password field, cancel, pending/double-submit and stale-context handling; authoritative updated roles | UI and port tests, typecheck/quality, internal render         |
| R7  | Exact-source CI native/security/build evidence; actual user-device recovery remains untested until observed                                                      | Job receipts and test artifact; no false installed acceptance |

Required failures block; missing executed evidence is INCONCLUSIVE. Existing Scores
teacher/Android/exchange gates remain separate. Multi-account/multi-school/previously
role-managed installations require normal authorized administration or separate
verified recovery, never this sole-account path.
