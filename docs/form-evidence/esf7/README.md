# eSF7 Template Evidence (2026-09-02)

Narrow form-evidence record for the eSF7 "School Form 7 (SF7) School
Personnel Assignment List and Basic Profile" candidate acquired
2026-09-02. See `docs/form-evidence/sf1/README.md` for this session's
shared network-egress limitation note (applies identically here).

**Status**: the underlying SF7/eSF7 _requirement_ is
`ProvenanceState::AuthoritativeSourceConfirmed`-eligible in principle
(see below); this **specific candidate file** is
`ProvenanceState::CandidateUnverified`, `FidelityState::NotVerified`.

## Candidate

One user-supplied file, `UPDATED_eSF7RSDO_SchoolID_SchoolName_SY2025-2026_1.xlsb`
(macro-enabled binary workbook; sheets DB_USER, IMPORTANT, REFERENCE,
SCHOOL_DASHBOARD, USERFORM, VERIFICATION, VIEW). SHA-256:
`4ec0ef2b0b6a879ef45f5724bb2ace5a3fdfc776aa8c2ceea5dbfc9d0e48d064`.
Structurally a blank template (34,427 non-empty cells, but the large
majority are REFERENCE-sheet lookup lists — job-title dropdowns, ethnic
groups, region names, etc. — not filled personnel data; the VIEW sheet
where actual entries would render is entirely zero-valued) — verified
clean of PII across the whole workbook, not just a sample.

## Two distinct issuances: paper SF7 vs. electronic eSF7

- **DepEd Order No. 4, s. 2014** — founding order (same as SF1/SF2/SF4/
  SF5/SF6). Established SF7 = "School Personnel Assignment List and
  Basic Profile," replacing old Forms 12, 19, 29, and 31.
- **DepEd Memorandum No. 052, s. 2023** (September 5, 2023, signed by
  Undersecretary Gloria Jumamil-Mercado) — "Adoption of the DepEd
  Electronic School Form 7 (eSF7)." Per search-corroborated summary
  (not primary-read): adopted by all public schools effective SY
  2023-2024; the accomplishment of the electronic form is the School
  Head's responsibility, explicitly "in adherence to DO 4, s. 2014."
- **DM-OUHROD-2024-3470** — "Issuance and Adoption of the Revised
  Electronic School Form 7 (ESF7) Tool Starting School Year 2024-2025,"
  issued by the Office of the Undersecretary for Human Resource and
  Organizational Development (OUHROD) — revises the DM 052 s.2023 tool.
  Disseminated to Divisions December 2024, orientations early 2025.
- Continuing yearly Division-level submission memos (Zambales DM 254
  s.2025, DepEd Dasmariñas DM 495 s.2025/DM 338 s.2026, DepEd Lapu-Lapu
  DM 336 s.2026) confirm eSF7 continues under SY 2025-2026, now
  submitted through an "InsightED" platform, in `.xlsb` format
  specifically — matching the candidate's own format exactly.

## What "RSDO" means — unresolved

No source found (primary or secondary) explicitly defines "RSDO" in a
DepEd context. The most plausible reading, from context only, is
"Region [and] Schools Division Office" — i.e. this specific file was
relabeled by a Region/Division when redistributing the central-office
tool, not an official central-office filename component. Two documented
_official_ filename patterns were found
(`eSF7_SDO<Name>_SchoolID_SchoolName_SY25-26` and
`ESF7_[SchoolCode]_2026`), and neither contains "RSDO." Divisions have
a confirmed, documented practice of publishing their own "revised
template" of eSF7 (e.g. a named Division Memorandum No. 65, s. 2025,
"Revised Template of the Electronic School Form 7 (ESF7)") — so a
region/division-labeled variant existing alongside the central tool is
expected, not unusual, in this ecosystem.

## Classification

**(a) The base SF7 reporting requirement**: CONFIRMABLE AS
AUTHORITATIVE — DepEd Order No. 4, s. 2014, corroborated consistently
and specifically (what it replaced, who's accountable).

**(b) eSF7 as a national DepEd tool/mandate**: CONFIRMABLE AS
AUTHORITATIVE — DM No. 052, s. 2023 and its central-office revision
DM-OUHROD-2024-3470, both corroborated by multiple independent Division
re-issuances that consistently cite them.

**(c) This specific "UPDATED eSF7 RSDO" file**: **NOT CONFIRMABLE FROM
AVAILABLE SOURCES as the unmodified national central-office artifact.**
"RSDO" matches no documented official filename convention, and Division-
level customization of eSF7 is a confirmed real practice — this file
may be an accurate, faithful copy, or may carry Division-specific
modifications; neither can be established from available sources this
session.

## Next step

With working egress: (1) read DM 052 s.2023 and DM-OUHROD-2024-3470
primary text directly; (2) attempt to resolve the central `bit.ly/eSF7`
download link (found via search, not resolved this session) and diff it
against this candidate; (3) identify which specific Region/Division
"RSDO" refers to, if it is in fact a regional tag, to assess how much
local customization (if any) this candidate carries relative to the
national release.
