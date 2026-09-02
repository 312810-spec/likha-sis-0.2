# SF10 Template Evidence (Wave 2M → Wave 2N)

Narrow form-evidence record for the SF10 (Learner's Permanent Academic
Record, formerly Form 137) template candidates acquired 2026-08-27.
Kept out of `docs/PROJECT-MEMORY.md` deliberately (no large workbook
reverse-engineering in project memory — citations/provenance only).

**Status after Wave 2N:**

| Candidate                                | Provenance                                   | Fidelity      |
| ---------------------------------------- | -------------------------------------------- | ------------- |
| `SSHS SF 10 v2026.xlsx`                  | **`AuthoritativeSourceConfirmed`** (Wave 2N) | `NotVerified` |
| JHS MATATAG SF10 (×3, community-touched) | `CandidateUnverified` — **EVIDENCE BLOCKED** | `NotVerified` |

Provenance promotion for the SSHS file does **not** touch fidelity —
the two axes are independent and no SF10 generator exists, so nothing
has established render fidelity for any SF10.

## Wave 2N — DM 020, s. 2026: primary-source text read

The DM 020 PDF at `https://www.deped.gov.ph/wp-content/uploads/DM_s2026_020r-1.pdf`
IS partly text-extractable — **page 2** was transcribed verbatim via
`pdftotext -layout` (a tool bundled with Git for Windows, not new
harness tooling). Pages 1, 3, 4 are scanned images with no text layer
(no OCR in the frozen harness).

**Verbatim, DM 020 s. 2026 page 2:**

- Para 3(b), "School Form 10 for Strengthened Senior High School":
  "A Summary of Final Grades per Grade Level section is provided as the
  official reference for learner academic performance." · "The general
  average per semester is removed across all grade levels." · "For Core
  subjects, the tool automatically computes the Final Grade based on the
  results of the four quarters." · "Ten additional slots are allocated
  to Electives and Special Curricular Programs/Institutional subjects."
- Para 4: "The modified ECR and SF 10 templates shall be used
  **exclusively, until further notice, by Strengthened SHS teachers in
  SSHS Pilot Schools.** Senior High School teachers who are not teaching
  subjects under the Strengthened SHS curriculum **shall continue using
  the existing ECR and SF 10 (formerly Form 137)** for their SHS
  classes."
- Para 5: "Strengthened SHS teachers may download the modified ECR and
  SF 10 templates from the Learner Information System Support Page at
  https://support.lis.deped.gov.ph/support. ... the official filenames
  of the modified templates are as follows: a. SSHS E-Class Record
  v2026.xlsx ... and **b. SSHS SF 10 v2026.xlsx for the Modified SF 10
  for SSHS.**"
- Para 6(a): RO-CLMD and SDO-CID (PSDS) "responsible for providing
  consistent guidance on the Strengthened SHS curriculum and grade
  computation".

**Findings against the Wave 2M questions:**

1. Scope: Strengthened SHS teachers in SSHS Pilot Schools.
2. School year: SY 2025-2026 onward ("until further notice"), title +
   para 4.
3. Pilot vs non-pilot: **explicit** — pilot uses the modified SF10;
   non-Strengthened-SHS SHS teachers keep the DO 69 s. 2016 SF10.
   4-6. Academic/TechPro: **not mentioned on the readable page**; para 3(b)
   describes ONE "School Form 10 for Strengthened Senior High School"
   and para 5 lists a **single** SF10 filename. **No evidence of a
   template-level track split.** If track matters it is workbook
   content/data-validation, not template identity.
4. Existing/historical records: non-Strengthened classes keep the old
   SF10; nothing on the readable page about redoing completed records
   (that is the MATATAG Joint-Memorandum question, below).
5. Download: LIS Support Page; user guides `bit.ly/SSHSGuide-ModifiedECRSF10`;
   **official filename `SSHS SF 10 v2026.xlsx`**.
6. Implementation: RO/SDO curriculum divisions provide guidance (para 6).
7. Effect on the model: confirms `curriculum: "Strengthened SHS"`,
   grades 11-12, `effective_from "2025-2026"`, `track: None`, and that
   DM 020 **coexists with** (does not supersede) the DO 69 s. 2016
   SF10.

### SSHS workbook-to-issuance binding

**CONFIRMED (explicit, not temporal).** DM 020 para 5(b) names the exact
filename `SSHS SF 10 v2026.xlsx` and the exact portal
(`support.lis.deped.gov.ph/support`) from which Wave 2M downloaded it.
Residual gap: pages 1/3/4 (full legal scope, effectivity clause) unread.

## Wave 2N — MATATAG JHS transition evidence

Sources found (secondary / division-level; the underlying national PDF
was NOT obtained):

- **Joint Memorandum ref. STR-250331-0910-PS** (28 Mar 2025), DepEd
  Central Office — "Guidance and Clarifications on the School Form 10
  for End of School Year 2024-2025 and Reiteration of Senior High
  School Status Tagging". Consistent with **DepEd Order No. 010,
  s. 2024** ("Policy Guidelines on the Implementation of the MATATAG
  Curriculum" — **primary-source page confirmed on deped.gov.ph**,
  23 Jul 2024, K-Grade 10, phased from SY 2024-2025 for K/G1/G4/G7).
- Per converging secondary sources (DepEd-Click, teacher-forum
  republications) and the user-supplied **Schools Division of Quezon
  Province DM No. 306, s. 2025**: the revised SF10 is attached as
  **Annexes I (Grade 1), II (Grade 4), III (Grade 7)**; a school that
  **had already completed a learner's old SF10 was NOT required to
  redo it** on the revised version — the **old SF10 is attached to the
  revised SF10**; the revised SF10 is used from SY 2025-2026 onward.

**Transition rule established (matches ADR-0053's principle):**

```text
previously-completed old SF10  →  preserved, attached to the new record (not rewritten)
new / current applicable records  →  the revised SF10 for that grade's MATATAG phase-in year
```

The MATATAG SF10 phases in **per grade** (G7 first, SY 2024-2025), NOT
as a "Grade 8-10" block — the Wave 2M applicability entry was corrected
to Grade 7 only, pending the per-grade Annexes.

**Evidence strength:** the division memo is authoritative for what that
division was instructed to do; the underlying national Joint Memorandum
is the stronger evidence still desired and was not retrieved.

## Wave 2N — JHS clean-master investigation (Part E)

- LIS directory listing (`.../schoolforms/`): **HTTP 403** on every
  attempt (curl and WebFetch) — cannot enumerate for a pristine
  master or a checksum.
- The `SirWedz Guides` worksheet is present in 3 of 4 JHS candidates.
  Not investigated to the point of proving it is "merely an appended
  guide" vs. a structural modification — and per Part E, removing the
  sheet and calling the result authoritative is not permitted.
- **Conclusion: no clean DepEd JHS SF10 master proven. JHS candidates
  stay `CandidateUnverified`; debt retained.**

## SF10 readiness classification (Wave 2N, Part F)

**PARTIALLY READY.**

- **SSHS SF10**: provenance `AuthoritativeSourceConfirmed`,
  applicability confirmed and centrally modeled (`sf10-sshs-v2026`).
  Fidelity `NotVerified` — a generator/fidelity slice is possible but
  is framework work, deferred per Part G/H.
- **JHS MATATAG SF10**: EVIDENCE BLOCKED — no clean master, national
  Joint Memorandum PDF not obtained. `resolve()` fails closed for
  Grades 8-10; Grade 7 returns a `CandidateUnverified` version (any
  fidelity-gated caller gets `FidelityInsufficient`).
- **Pre-MATATAG SF10** (DO 69 s. 2016, DO 4 s. 2014): templates not
  acquired; `resolve()` correctly returns `NoApplicableTemplate`.

Per Part H: SF10 research stops here. Remaining debt is recorded; the
fail-closed resolver is preserved; development proceeds on an unrelated
production slice.

---

## Original Wave 2M record (below, unchanged)

## Acquisition

- Acquired by: `curl -sSL` from
  `https://support.lis.deped.gov.ph/support/downloads/schoolforms/`
  (DepEd Learner Information System support portal — a verified
  `*.deped.gov.ph` subdomain), 2026-08-27.
- Server: `nginx/1.20.1`. All four returned `HTTP 200`,
  `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- Immutable copies kept in the session scratchpad **outside** the repo
  and outside `src-tauri/resources/` (Wave 2M step 3 / ADR-0051 "what
  belongs in Git" — the workbook bytes are a separate redistribution
  judgment, not made; only hashes + structure are committed).
- The originals were not altered.

## Candidate manifest

| #   | File (original name)                                                                    | Size (bytes) | SHA-256                                                            | Last-Modified (HTTP)                                  | Sheets                              |
| --- | --------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------- |
| 1   | `SSHS SF 10 v2026.xlsx`                                                                 | 227334       | `a08ae34ba7f8e54d19389ba45c61d0ce18b347d877bcd8dd796d66c372ce6774` | Tue, 17 Mar 2026 03:45:55 GMT (ETag `69b8ce73-37806`) | FRONT, BACK, ANNEX, HELPER_SUBJECTS |
| 2   | `School-Form-10-JHS-Learners-Academic Permanent-Record_26March2025.xlsx`                | 96335        | `1c7a9430cb2e967f0d6b9fca003205568c7d84b67ce5048a655385f22ab9676e` | Sat, 05 Apr 2025 05:43:17 GMT (ETag `67f0c2f5-1784f`) | Front, "SirWedz Guides", Back       |
| 3   | `School Form 10 SF10 Learner's Permanent Academic Record for Junior High School_3.xlsx` | 66371        | `a0af662f6dc671e0bf0c7d06e444458492317040e925fafc52dbb42c485ee583` | (not captured)                                        | front, back, Sheet3                 |
| 4   | `School-Form-10-SF10-Learners-Permanent-Academic-Record-for-Junior-High-School.xlsx`    | 96785        | `cbed9d14d80b3e32c4b4f5e8a909a31c360d709bdddaed1ca56b37f86a086e1d` | (not captured)                                        | Front, "SirWedz Guides", Back       |

## Structural findings (`cargo run --example inspect_template_candidate`)

### #1 — `SSHS SF 10 v2026.xlsx` (Strengthened SHS)

- Workbook-level named ranges: 0. Macro project: none (plain `.xlsx`).
- `FRONT`: used 33×132, merges 298, **formulas 344**, sheet defined
  names 2 (`_xlnm._FilterDatabase` FRONT!$C$22:$L$23, `_xlnm.Print_Area`
  FRONT!$A$1:$Y$124), **data validations 4**, hidden cols 16356,
  hidden rows 7, portrait, page scale 68.
- `BACK`: used 32×130, merges 244, formulas 339, `_xlnm.Print_Area`
  BACK!$A$1:$Y$118, data validations 2, portrait, scale 70.
- `ANNEX`: used 10×62, merges 37, formulas 94, `_xlnm.Print_Area`
  ANNEX!$A$1:$H$61, data validations 3, portrait.
- `HELPER_SUBJECTS`: used 35×138, merges 0, formulas 539, no defined
  names, hidden rows 1, hidden cols 29 — a computation helper sheet.
- Cleanest of the four: no community-annotation sheet; consistent with
  a March-2026 DepEd release.

### #2 / #4 — JHS `_26March2025` and base JHS

- Both: sheets `Front` / **`SirWedz Guides`** / `Back`; **zero
  formulas**; `_xlnm.Print_Area` on Front and Back; used ~56 cols ×
  84-95 rows; merges 386-482; hidden cols 16328; portrait, scale
  70-77; no data validation; no workbook named ranges.
- **`SirWedz Guides` is a non-DepEd worksheet** (a known Filipino
  teacher-blogger's annotation). These are community-touched copies
  redistributed via the official portal, not confirmed pristine DepEd
  masters.

### #3 — JHS `_3`

- Sheets `front` / `back` / `Sheet3` (empty leftover). Zero formulas,
  no print areas, no data validation. Looks like a stripped re-save.

## Governing-issuance research

Primary-source (deped.gov.ph) confirmations:

- **DepEd Memorandum No. 020, s. 2026** — "Modified Electronic Class
  Record and School Form 10 for Strengthened Senior High School Pilot
  Implementers in School Year 2025-2026", issued **13 March 2026**.
  Official page:
  `https://www.deped.gov.ph/2026/03/13/march-13-2026-dm-020-s-2026-modified-electronic-class-record-and-school-form-10-for-strengthened-senior-high-school-pilot-implementers-in-school-year-2025-2026/`
  ; PDF `https://www.deped.gov.ph/wp-content/uploads/DM_s2026_020r-1.pdf`.
  **The memo body could not be read** — the PDF is a scanned image with
  no text layer and the frozen harness has no OCR. So: the issuance
  _exists_ and its scope (SHS, Strengthened SHS pilot, SY 2025-2026) is
  confirmed from the official page, but the file-to-issuance binding
  (are these exact bytes the "corrected copy" it distributes?), the
  exact field prescriptions, and any Academic-vs-TechPro template split
  are **unconfirmed**. This is a strong LEAD, not a promotion basis.
- **DepEd Order No. 69, s. 2016** — "Provision of the DepEd Electronic
  Class Record and Form 137 for Senior High School" (22 Nov 2016).
  Official page + PDF on deped.gov.ph. The standing pre-Strengthened
  SHS SF10/Form 137 for SHS.
- **DepEd Order No. 4, s. 2014** — "Adoption of Modified School Forms"
  — the foundational SF1-SF10 issuance (already cited in this project's
  ADR-0009 for SF2).

Secondary-source only (NOT authority-confirmed):

- Strengthened SHS Curriculum: DepEd Order No. 03, s. 2025 + DM No.
  048, s. 2025 — two pathways, Academic Track and Technical-Professional
  (TechPro) Track, from SY 2025-2026.
- The JHS SF10 candidates are described by third parties as the
  "revised SF10 for EOSY 2024-2025 / 2025-2026 under the MATATAG
  Curriculum", distributed via the LIS Support page. **No single
  governing DepEd Order/Memorandum was pinned** for the JHS revision
  this wave.

## Unresolved authority gaps (carried to `docs/VERIFICATION-DEBT.md`)

1. DM 020, s. 2026 body unread (scanned PDF, no OCR) — file↔issuance
   binding, exact fields, track split, non-pilot fallback all
   unconfirmed.
2. No governing issuance pinned for the JHS MATATAG SF10 revision.
3. JHS candidates are community-annotated ("SirWedz Guides") — a
   pristine DepEd JHS SF10 master has not been located.
4. Pre-MATATAG / DO 69 s. 2016 / DO 4 s. 2014 era SF10 templates: not
   acquired this wave (no candidate file, only the issuance citations).
5. Internal cell/title text of every candidate: not transcribed
   (Wave 2M did structural inspection only; no field-level mapping).
6. Render fidelity of any SF10 output: `NotVerified` — no SF10
   generator exists and none was built (Wave 2M step 12).

---

## 2026-09-02 — two new candidate files, JHS re-verification, no change

User supplied two new candidate files this session:

- **`SchoolForm10SF10SSHSSF10v2026.xlsx`** — SHA-256:
  `40e0c08c2eeafb6e28536be5d11e5d7ef39210d25a67102a1ed4f6c7d5ee9587`.
  Sheets FRONT/BACK/ANNEX/HELPER_SUBJECTS — same shape as the
  already-`AuthoritativeSourceConfirmed` SSHS candidate above. Hash not
  cross-checked byte-for-byte against the original Wave 2M/2N candidate
  in this session (that file was never committed to the repo, per this
  project's own no-binary-workbook-in-repo convention — see the top of
  this file); treated as the same confirmed provenance record given the
  identical filename, sheet shape, and prior confirmed citation (DM 020,
  s. 2026 §5(b)), not re-derived from scratch.
- **`SchoolForm10SF10JHS2026.xlsx`** — SHA-256:
  `3f9707f953279a2b0736b3823a2de6aa19813acf0cce3aaaaf757b356239b9e5`.
  Sheets Front/SirWedz Guides/Back — same community-touched shape as
  the already-recorded JHS candidate above (the `SirWedz Guides` sheet
  is the same non-DepEd annotation marker). Both structurally blank,
  clean of PII in cell content. **Cross-check, 2026-09-02**: this
  file's `docProps` metadata (`cp:category`) independently self-credits
  "Wedzmer B. Munjilul" ("Sir Wedz") as the 2017 redesigner — the same
  identity the `SirWedz Guides` sheet name already implied, now
  corroborated from a second, independent part of the file. Reads as
  voluntary template-authorship attribution, not a live-record PII
  leak (see `docs/form-evidence/{sf9,esf7}/README.md` for the fuller
  metadata-scope note and the one genuine third-party-name finding,
  in eSF7, that _was_ redacted).

**Environment limitation this session** (see
`docs/form-evidence/sf1/README.md` for full detail): this session's
network egress proxy blocked `WebFetch`/direct HTTP access to
`deped.gov.ph`, `support.lis.deped.gov.ph`, and every division/regional
mirror tested — a harder block than Wave 2M/2N hit (those got a clean
`curl` 200 from `deped.gov.ph` itself; this session got 403 from
everything). Only `WebSearch` (a separate, non-proxied backend) was
reachable, so nothing below is a primary-source re-read — it is
search-snippet corroboration only.

**JHS re-verification result: no change, still EVIDENCE BLOCKED.**

- No new clean/pristine DepEd-hosted JHS SF10 master was found — search
  results still surface only the same `SirWedz Guides`-marked file
  family already on record.
- **STR-250331-0910-PS's primary PDF still not obtained.** New facts
  from this session's search: issuing office is the Office of the
  Undersecretary for Strategic Management; technical-office contact is
  identified as **PPS-EMISD** (`ps.emisd@deped.gov.ph`,
  (02) 8635-3958/8637-6204) — a concrete channel for a future session
  (or the project owner) to request the primary document directly
  rather than continuing to search for a public posting that may not
  exist. The memo's content (Annexes I/II/III = Grades 1/4/7 only; old
  SF10 preserved/attached, not redone; effective SY 2025-2026) is now
  corroborated by more independent re-publications than before, but
  none is `deped.gov.ph` itself, so this remains secondary corroboration
  only.
- No 2025/2026 DepEd Memorandum was found naming an exact JHS SF10
  filename the way DM 020 §5(b) named the SSHS file — this remains the
  single most decisive gap versus the SSHS confirmation.
- Grade-level scope unchanged: **Grade 7 only**, fail-closed for 8-10.
  A MATATAG curriculum phase-in schedule was found (Grade 8 for SY
  2025-2026, Grades 6/9/10 for SY 2026-2027 per one secondary source)
  but nothing ties any SF10 annex/filename to those grades — this is a
  forward-looking lead only, not evidence, and does **not** justify
  extending the `["7"]` modeling in `formgen::template_version`.

**No change to `docs/adr/0053-sf10-template-applicability-and-versioning.md`
or this file's classifications.** The one actionable new fact: PPS-EMISD
is now an identified direct-request channel for the still-missing
STR-250331-0910-PS primary text.
