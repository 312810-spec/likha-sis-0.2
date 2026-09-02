# SF6 Template Evidence (2026-09-02)

Narrow form-evidence record for the School Form 6 (SF6) "Summarized
Report on Promotion and Learning Progress & Achievement" template
candidate acquired 2026-09-02. See `docs/form-evidence/sf1/README.md`
for this session's shared network-egress limitation note, and
`docs/form-evidence/sf5/README.md` for the governing-issuance detail
shared with SF5 (SF6 is SF5's school-wide consolidation, same governing
orders, same SCC/DCC checking process).

**Status**: `ProvenanceState::CandidateUnverified`, `FidelityState::NotVerified`.

Note: separate from and does not affect the already-shipped
`export::sf6` CSV export (ADR-0058).

## Candidate

One user-supplied file, `SF6.xls` (legacy `.xls`, sheet `report1`).
SHA-256: `fcdbfd2ae6a5bc433d7857f2438e7386cb9a39bc8f85f87b671b637dcc13031f`.
Structurally a blank template (72 non-empty cells, all header/label
text, no learner data) — verified clean of PII. Breaks down by Grade 7
through Grade 12 — this candidate is the secondary-level variant;
whether a separate elementary-level (K-6) SF6 variant exists was not
resolved by search alone.

## Governing issuances

Same as SF5 — **DepEd Order No. 4, s. 2014** (founding), **DepEd Order
No. 11, s. 2018** (checking process, SCC/DCC), **DepEd Order No. 8, s.
2015** (proficiency bands SF6 aggregates from SF5). No SF6-specific
issuance distinct from SF5's was found.

## ⚠️ Same DO 015, s. 2026 caveat as SF5

SF6 aggregates SF5's proficiency/promotion data with no separate
grading logic of its own — the same unread, newly-discovered **DepEd
Order No. 015, s. 2026** grading-system revision flagged in
`docs/form-evidence/sf5/README.md` applies here identically. See that
file and `docs/CURRENT-HANDOFF.md` for the full flag.

## Official downloadability

Same as SF5 — a `support.lis.deped.gov.ph` download link is reported
(not fetch-verified), and the same DepEd guidance that an authoritative
SF6 is LIS-generated, not a standalone template, applies.

## Classification

**NOT CONFIRMABLE FROM AVAILABLE SOURCES**, for the same reasons as
SF5.

## Next step

Same as SF5.
