# SF6 Template Evidence (2026-09-02)

Narrow form-evidence record for the School Form 6 (SF6) "Summarized
Report on Promotion and Learning Progress & Achievement" template
candidate acquired 2026-09-02. See `docs/form-evidence/sf1/README.md`
for this session's shared network-egress limitation note, and
`docs/form-evidence/sf5/README.md` for the governing-issuance detail
shared with SF5 (SF6 is SF5's school-wide consolidation, same governing
orders, same SCC/DCC checking process).

**Status**: `ProvenanceState::CandidateUnverified`, `FidelityState::StructureVerified`
(updated 2026-09-02 — both governing orders now primary-source
confirmed; see the structural comparison below).

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

## Governing issuances — DO 4 and DO 11 now primary-source confirmed (2026-09-02)

Same as SF5 — **DepEd Order No. 4, s. 2014** (founding,
`docs/form-evidence/do4-s2014/README.md`) and **DepEd Order No. 11,
s. 2018** (checking process, SCC/DCC,
`docs/form-evidence/do11-s2018/README.md`) were both read directly this
session — both `ProvenanceState::AuthoritativeSourceConfirmed`. **DepEd
Order No. 8, s. 2015** (proficiency bands SF6 aggregates from SF5) was
not itself primary-source-read. No SF6-specific issuance distinct from
SF5's was found.

## Structural comparison against DO 4 s.2014's Enclosure No. 2 (2026-09-02)

- **Matches**: School ID/Name/Division/District/School Year header
  block, Promoted/Retained summary split, Name/Signature of School
  Head.
- **Terminology drift, same pattern as SF5's candidate**: the
  candidate's summary categories read **"PROMOTED / CONDITIONAL /
  RETAINED"** — DO 4's Enclosure 2 reads "Promoted / Irregular /
  Retained." Same "Conditional" ← "Irregular" shift as SF5.
- **Grading-band scale — a genuine, more significant divergence from
  DO 4's original than SF5 shows**: the candidate's own Level-of-
  Proficiency section reads **"Did Not Meet Expectations (74% and
  below), Fairly Satisfactory (75%-79%), Satisfactory (80%-84%), Very
  Satisfactory (85%-89%), Outstanding (90%-100%)"** — again the DO 8,
  s. 2015 descriptor scale, not DO 4 s.2014's original Beginning/
  Developing/Approaching/Proficient/Advanced bands. Both SF5 and SF6
  candidates independently show this exact same drift, which is
  internally consistent (a summarized report naturally mirrors the
  report it summarizes) and strengthens confidence this is a genuine,
  deliberate DepEd terminology update the candidates both correctly
  incorporated, not a one-off error in either file alone.
- **Additional signature/reviewer fields beyond DO 4's original SF6
  Enclosure 2 list**: the candidate's own preparation block reads
  "(Signature of School Head/SCC Chair)," "SCC-Vice Chair (Curriculum),"
  "SCC Member," "SCC-Vice Chair (Generated thru LIS)" — this is **DO 11
  s.2018's SCC structure** (School Head as Chair, two Vice Chairs)
  layered directly onto SF6's signature block, which DO 4 s.2014's own
  2014-era field list (Name/Signature of School Head, DPO/EPS, Schools
  Division Superintendent) does not itself describe. Confirms this
  candidate post-dates DO 11 s.2018 (March 2018), not just DO 8 s.2015.

## ⚠️ Same DO 015, s. 2026 caveat as SF5

SF6 aggregates SF5's proficiency/promotion data with no separate
grading logic of its own — the same unread, newly-discovered **DepEd
Order No. 015, s. 2026** grading-system revision flagged in
`docs/form-evidence/sf5/README.md` applies here identically. See that
file and `docs/CURRENT-HANDOFF.md` for the full flag.

## Official downloadability

Same as SF5, now with an exact citation rather than search-summarized
guidance — see `docs/form-evidence/do11-s2018/README.md`'s "Only
LIS-generated forms are recognized" section (DO 58, s. 2017 §VII,
enforced via DO 11 s.2018's LIS/ICT-Coordinator sign-off requirement).

## Classification

**Governing orders: `ProvenanceState::AuthoritativeSourceConfirmed`**
for DO 4 s.2014 and DO 11 s.2018 (both read this session). **The
candidate template file itself: still `ProvenanceState::CandidateUnverified`**
— real, disclosed structural drift from the 2014 baseline (see above),
now dated more precisely than SF5's own drift: this candidate's
signature block alone confirms it post-dates DO 11 s.2018 (2018), not
just DO 8 s.2015 (2015). `FidelityState::StructureVerified`. The DO 015
s.2026 grading-supersession caveat (unchanged from before) still
applies identically to SF5.

## Next step

Same open item as SF5: identify the specific issuance that shifted
"Irregular" to "Conditionally Promoted" (narrowed to the 2014-2018
window, since DO 11 s.2018 already uses the newer term).
