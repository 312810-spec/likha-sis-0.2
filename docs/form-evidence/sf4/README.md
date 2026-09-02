# SF4 Template Evidence (2026-09-02)

Narrow form-evidence record for the School Form 4 (SF4) "Monthly
Learner's Movement and Attendance" template candidate acquired
2026-09-02. See `docs/form-evidence/sf1/README.md` for this session's
shared network-egress limitation note (applies identically here).

**Status**: `ProvenanceState::CandidateUnverified`, `FidelityState::StructureVerified`
(updated 2026-09-02 — see the structural comparison below, which also
**corrects an earlier mistaken claim in this same file**, see the
Governing issuance section).

## Candidate

One user-supplied file, `SF4.xls` (legacy `.xls`, sheet
`school_form_4_ver2014.2.1.1`). SHA-256:
`276f3d8043b2672bfa99c4e3d8f62095b7ac09eda20a1af28e765a643af09b77`.
Structurally a blank template (76 non-empty cells, all header/label
text, no learner/personnel data) — verified clean of PII.

## Governing issuance — now primary-source confirmed (2026-09-02)

Same founding order as SF1/SF2: **DepEd Order No. 4, s. 2014**, read
directly this session — full detail:
`docs/form-evidence/do4-s2014/README.md`
(`ProvenanceState::AuthoritativeSourceConfirmed` for the order itself).
SF4 = "Monthly Learner's Movement and Attendance," replacing old Form 3
and STS Form 4 (Absenteeism and Dropout Profile) — matches the
candidate's own subtitle exactly.

**Confirmed later revision (search-corroborated, not primary-read)**:
**DepEd Memorandum No. 014, s. 2021** (March 26, 2021) — changed SF4's
submission frequency from monthly to quarterly and replaced the
"Dropout" column with "NLPA," explicitly scoped as an SY 2020-2021
interim measure. No later issuance was found confirming whether this
reverted post-pandemic.

**Correction (2026-09-02)**: this file previously claimed "the
candidate's `ver2014.2.1.1` string carries no 2021/NLPA marker,
consistent with being the pre-pandemic baseline shape" — **this was
wrong**, and was never actually checked against the candidate's real
header cells, only inferred from the version string alone. Direct
structural inspection (below, done while comparing against DO 4
s.2014's primary text) found the candidate's own row-4 header **does**
contain a literal **"NLPA"** column, between "ATTENDANCE" and
"TRANSFERRED OUT." The candidate is consistent with reflecting the
DM 014 s.2021 interim naming, not the pre-pandemic baseline — the
opposite of what this file said before.

## Structural comparison against DO 4 s.2014's Enclosure No. 2 (2026-09-02)

Candidate header (Grade/Year Level, Section, Name of Adviser,
Registered Learners, Attendance [Daily Average, Percentage for the
Month], **NLPA**, Transferred Out, Transferred In, each with the same
Cumulative-Previous-Month / For-the-Month / Cumulative-End-of-Month
three-way M/F/Total split DO 4's Enclosure 2 describes) matches the
order's SF4 field list structurally, **except** the order's own field
name is plainly "Drop Out" (three numbered fields, #12-14) — not
"NLPA." This is exactly the DM 014 s.2021 substitution described above,
now directly confirmed present in the candidate rather than just
inferred.

## Classification

**Governing order: `ProvenanceState::AuthoritativeSourceConfirmed`**
(see the shared record). **This candidate file: still
`ProvenanceState::CandidateUnverified`**, but now with concrete,
directly-observed evidence that it reflects the **2021 pandemic-era
NLPA naming**, not the pure 2014 baseline — a real fidelity finding,
not a guess. `FidelityState::StructureVerified`.

## Next step

Confirm whether "NLPA" has since reverted to "Drop Out" or "NLS" (a
2026-era secondary source mentioned in SF2's evidence file suggested a
possible further rename) — if DepEd has moved on from "NLPA," this
candidate would then read as carrying a superseded pandemic-era label
rather than the current one. DepEd Order No. 11, s. 2018 remains
unread in primary form.
