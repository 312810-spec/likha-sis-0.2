# Post-Sequence Reassessment — Evidence-Based Scoring Pass (2026-08-25)

## Why this exists

The user directed an explicit four-item sequence (Audit Log → Global
Session Expiry Handling → Learner Search → Teacher Workspace), ending in
an explicit "reassess" checkpoint rather than an automatic fifth pick.
`docs/CURRENT-HANDOFF.md`'s "Next Action" section laid out the real
candidate landscape at that point without picking a winner. The user
then confirmed: **"run a fresh evidence-based scoring pass now rather
than choosing a fifth item ad hoc."** This document is that pass,
following the same method and weighted criteria `docs/product/M8-DECISION.md`
established (Teacher Value 20%, DepEd Alignment 15%, Dependency
Readiness 10%, Reuse 10%, Architectural Fit 10%, Security Safety 10%,
Implementation Risk 10%, Testing Confidence 5%, Future Leverage 5%,
Time-to-Value 5% — all 0-10 per criterion, weighted sum out of 10).

## Disqualified before scoring (per established convention)

- **Key Stage 1 descriptive grading** and **Grade 12 DO 8, s. 2015
  carryover** — both still lack a usable primary source after multiple
  research attempts (see `docs/CURRENT-HANDOFF.md`'s "Remaining DepEd
  weight-group work" note). Per `.claude/rules/autonomous-development.md`
  gate #6, not re-attempted from a web search; not scored competitively
  against ready-to-build items.
- **Admin "unlock account early" affordance** — needs a real admin/role
  concept, which is the already-deferred Roles & Permissions decision
  (`docs/product/M8-DECISION.md`'s follow-up section). Blocked on the
  same human product decision, not on evidence.
- **Beads** — Compounding Engineering pass already classified REJECT, no
  demonstrated gap this session.
- **Configurable lockout/idle thresholds per school** — no demonstrated
  need; would be speculative configuration surface (YAGNI), not a
  response to any observed teacher pain point.
- **General data-mutation audit trail** (beyond auth events) — ADR-0021
  already scoped this out deliberately as its own future milestone; it's
  a large, multi-repository undertaking with no urgent driver right now.

## Scored candidates

| #   | Candidate                                                                      | Teacher Value (20%) | DepEd (15%) | Dep. Readiness (10%) | Reuse (10%) | Arch. Fit (10%) | Security (10%) | Impl. Risk (10%) | Testing Conf. (5%) | Future Leverage (5%) | Time-to-Value (5%) | **Weighted Score** |
| --- | ------------------------------------------------------------------------------ | ------------------- | ----------- | -------------------- | ----------- | --------------- | -------------- | ---------------- | ------------------ | -------------------- | ------------------ | ------------------ |
| 1   | **Data export/backup** — CSV learner roster export                             | 8                   | 4           | 10                   | 10          | 10              | 8              | 9                | 9                  | 6                    | 9                  | **8.10**           |
| 2   | Idle-timeout warning before logout (UX polish for ADR-0020)                    | 6                   | 1           | 9                    | 8           | 9               | 6              | 8                | 8                  | 3                    | 8                  | 6.30               |
| 3   | Grading-period-aware Teacher Workspace enhancement (ADR-0024's deliberate gap) | 6                   | 3           | 6                    | 6           | 7               | 7              | 6                | 7                  | 4                    | 6                  | 5.70               |
| 4   | teacher-ux-reviewer / accessibility-reviewer dispatch (M12c-M24 review debt)   | 6                   | 1           | 6                    | 10          | 10              | 5              | 6                | 3                  | 4                    | 7                  | 5.75               |
| 5   | Proptest pilot on auth/lockout invariants (Compounding Eng. Phase B)           | 2                   | 0           | 8                    | 5           | 7               | 7              | 7                | 8                  | 7                    | 6                  | 4.85               |
| 6   | Password reset / account recovery                                              | 7                   | 2           | 3                    | 3           | 5               | 4              | 3                | 6                  | 5                    | 3                  | 4.20               |
| 7   | Trail of Bits second-opinion review pilot (Compounding Eng. Phase F)           | 1                   | 0           | 4                    | 2           | 5               | 8              | 5                | 4                  | 6                    | 3                  | 3.25               |

## Winner: Data export / backup (#15 from the original 20-scenario list)

**Recommended and selected, per the user's own standing preference
("just select the recommended automatically, will adjust after all
milestone has achieved") — implemented directly following this pass,
no further pause.**

### Scope decision (made explicit here, not left implicit)

"Data export/backup" is ambiguous on its face and could mean either of
two very different things:

1. **A raw encrypted-database file backup.** Rejected for this pass.
   The working database is SQLCipher-encrypted with the key itself
   DPAPI-protected (`docs/adr/0003-encryption-at-rest.md`) — DPAPI keys
   are bound to the Windows user/machine. Copying the raw `.db` file
   alone produces a backup that is only restorable on the _same_
   Windows account on the _same_ machine; it is useless against the
   disaster scenario (machine loss/theft) a backup is normally for,
   unless the key material is _also_ exported — and exporting decryption
   key material safely (re-encrypting under a user passphrase, secure
   transport, etc.) is itself a real, unresolved security design
   question that deserves its own dedicated decision process, not a
   rushed answer bundled into this pass. This is exactly the class of
   "Production PII Security Track" item `docs/VERIFICATION-DEBT.md` and
   the Compounding Engineering decision already flag as real but
   deferred.
2. **A CSV export of the learner roster the teacher already owns and
   can already see on screen.** Selected. This reuses the exact,
   already-reviewed `export::csv` / `FieldDisclosure` architecture from
   M10/M14 (SF2 and report-card exports) with zero new authorization
   surface, zero new PII exposure (every field exported is already
   readable by that session in `LearnerListScreen`), and delivers real,
   immediate teacher value: a portable copy of the learner list for a
   teacher's own records, a spreadsheet import, or a manual backup
   workflow — without touching encryption-key export at all.

This mirrors the same discipline M17 used when scoping learner-profile
fields ("don't add PII surface speculatively — check what's actually
needed") and M13/M14's own habit of disclosing a deliberately narrowed
scope rather than silently picking the harder interpretation.

### Rationale

- Highest score by a wide margin (8.10 vs. next-best 6.30) — driven by
  perfect or near-perfect Dependency Readiness, Reuse, and Architectural
  Fit (this is the fourth export command built against the same
  pattern; no new pattern is being introduced) plus strong, immediate
  Teacher Value.
- Zero new Rust dependencies, zero new migration, zero new command
  pattern — the lowest-risk, fastest-to-verify item on the list.
- Genuinely closes a real, previously-open item from the original
  20-scenario candidate list (#15), rather than inventing new scope.

### Runners-up, not selected this round but not rejected

- **Idle-timeout warning** (6.30) and **grading-period-aware Workspace
  enhancement** (5.70) are both small, low-risk UX polish items on
  already-shipped features — good next candidates for a future pass,
  not disqualified.
- **teacher-ux-reviewer/accessibility-reviewer dispatch** (5.75) remains
  real, valuable review debt — its score is held down by low Testing
  Confidence (repeated agent-resume failures this session mean the
  _expected value_ of another attempt is genuinely uncertain, not that
  the underlying need isn't real). Worth another attempt on a future
  session where agent-resume behavior can first be spot-checked.
- **Proptest pilot** (4.85) is the Compounding Engineering pass's own
  already-identified "next best" Phase B pilot target — good candidate
  once product-feature momentum settles.
- **Password reset/account recovery** (4.20) scores low specifically
  because this is a local-only, no-email/SMS, single-machine app with
  no out-of-band recovery channel — a _safe_ self-service reset isn't
  really buildable without either (a) an admin-reset flow, which needs
  the deferred Roles & Permissions decision, or (b) a weak
  security-question-style mechanism this project's security posture
  should not adopt. Needs a genuine product/security decision before
  it's actionable, not just implementation effort.
- **Trail of Bits pilot** (3.25) scores lowest — real potential upside
  (a structural alternative to the repeatedly-failing in-house reviewer
  agents) but too much unresearched external-tool uncertainty
  (Dependency Readiness, Reuse) to justify over a ready-to-ship product
  feature this pass.
