# DepEd Policy Research: MATATAG Learning Areas, KS1 Descriptive Grading, DO 8 vs DO 015 Transmutation

Status: COMPLETE (best-effort; some primary-source detail unreachable — see
Section 0 and per-question confidence notes below).

Research date: 2026-09-07
Researcher: background research agent (no code changes made)
Scope: research only — nothing here authorizes implementation. This document
is meant to inform a future decision.

---

## 0. deped.gov.ph reachability (improvement over prior session)

**deped.gov.ph WAS reachable directly via WebFetch in this session**, unlike
the prior session where it was reported unreachable. Multiple pages were
fetched successfully:

- `https://www.deped.gov.ph` (homepage) — fetched successfully.
- `https://www.deped.gov.ph/k-to-12/revised-k-to-10-curriculum/` — fetched
  successfully, used for Q1.
- `https://www.deped.gov.ph/2026/06/04/june-4-2026-do-015-s-2026-revised-guidelines-on-classroom-assessment-grading-system-and-awards-and-recognition-for-the-k-to-12-basic-education-program/`
  — fetched successfully (the official DO 015, s. 2026 issuance page).
- `https://deped.gov.ph/2015/04/01/do-8-s-2015` — fetched successfully (the
  official DO 8, s. 2015 issuance page).

**However, the actual PDF attachments of both orders are scanned/image-based
documents with no extractable text layer**, and this environment has no PDF
image-rendering tool available (`pdftoppm`/poppler is not installed, no
`pdfimages`, `mutool`, `gs`, or `qpdf`), so the PDFs could not be OCR'd or
visually inspected here:

- `https://www.deped.gov.ph/wp-content/uploads/DO_s2026_015r.pdf` (23.6 MB) —
  downloaded successfully; `pdftotext -layout` extracted only a single
  stray character ("1") from the entire document, confirming it is an
  image/scan-based PDF (likely a scanned signed copy) with no real text
  layer.
- `https://www.deped.gov.ph/wp-content/uploads/2015/04/DO_s2015_08.pdf`
  (2.5 MB) — downloaded successfully; contains `CCITTFaxDecode` /
  `FlateDecode` image streams (fax-quality scanned pages), and
  `pdftotext` extracted zero lines of text.

**Net result: I reached the authoritative DepEd pages and located the exact
official PDF URLs for both DO 8 s.2015 and DO 015 s.2026, which is a genuine
improvement over the prior session (which could not reach deped.gov.ph at
all). But I could not extract the exact table text/values directly from
either PDF myself** because both are non-OCR'd scans and this sandbox lacks
a PDF-to-image renderer or OCR tool. All exact numeric transmutation-table
values and exact quoted policy text below come from secondary sources
(teacher-guide blogs, education news sites) that themselves claim to quote
or reproduce the official tables/paragraphs. Confidence is marked
accordingly per question. **If someone in a full desktop environment (or
with poppler/OCR installed) opens these two PDF URLs directly, that would
let this be upgraded from secondary- to primary-source confidence** — the
URLs are confirmed correct and live as of 2026-09-07.

---

## 1. MATATAG vs prior K to 12: did the learning areas themselves change?

**Confidence: primary source directly fetched (deped.gov.ph), corroborated
by multiple secondary sources.**

### What was found

Fetched directly: `https://www.deped.gov.ph/k-to-12/revised-k-to-10-curriculum/`
(DepEd's own "Revised K to 10 Curriculum" — i.e. MATATAG — page). Per that
page, the MATATAG K-10 learning areas are:

- **Kindergarten**: a unified Kindergarten curriculum (not split into
  separate subjects).
- **Grade 1**: Language, Reading and Literacy, Mathematics, Makabansa, GMRC
  (Good Manners and Right Conduct).
- **Grades 2–3**: English, Filipino, Mathematics, Makabansa, GMRC, plus
  Science starting in Grade 3.
- **Grades 4–10**: Araling Panlipunan, English, Filipino, Mathematics,
  Science, Music and Arts, PE and Health, GMRC/Values Education, EPP/TLE
  (Edukasyong Pantahanan at Pangkabuhayan / Technology and Livelihood
  Education).

This was cross-checked with web search results (WebSearch, not deped.gov.ph
directly) which corroborate and add detail:

- Grade 1 has five learning areas: **Language, Reading and Literacy,
  Mathematics, GMRC, and Makabansa** — confirmed by
  [matatagcurriculum.ph](https://matatagcurriculum.ph/grade-1-subjects-of-matatag-curriculum/)
  and depedclub/teachpinas curriculum-guide index pages.
- GMRC is taught as a **standalone subject Grades 1–6**, and is also
  integrated across other learning areas.
- In Grades 7–10, **Values Education replaces GMRC** as the subject name
  (per WebFetch summary of the DepEd K-10 page and corroborated by search
  results).
- Junior High School (Grades 7–10) has **eight learning areas**: Filipino,
  English, Mathematics, Science, Araling Panlipunan, MAPEH (Music & Arts and
  PE & Health), Values Education, and TLE.
- TLE in Grades 9–10 retains specialized tracks (AFA — Agriculture, FCS —
  Family and Consumer Services, IA — Industrial Arts, ICT).

### Key structural change identified: MAPEH split into two graded components

This is the most concrete, citable structural change found:

> "MAPEH will be computed as two (2) components (e.g., Music and Arts will
> have a separate grade from P.E. and Health) and not anymore as four (4)
> separate components. This will enable the teacher to focus more on
> teaching, learning, and assessment processes since they will no longer be
> computing grades for four (4) components."

(paraphrase/quote surfaced via WebSearch summarizing MATATAG PE-and-Health
and Music-and-Arts curriculum guide sources, e.g.
[academ-e.ph MATATAG PE and Health CG](https://www.academ-e.ph/the-new-matatag-curriculum-guide/pe-and-health-cg-2023/)
and
[MATATAG Curriculum Grade 4-10 Music and Arts PDF](https://matatagcurriculum.com/wp-content/uploads/2024/11/MATATAG-Curriculum-Grade-4-10-Music-and-Arts.pdf)).

MAPEH itself is **not eliminated as an umbrella label**, but for grading
purposes it is now scored as **Music & Arts** and **PE & Health** — two
components — instead of the four historically separate components (Music,
Arts, PE, Health).

### Key structural change identified: Mother Tongue is no longer a separate learning area for Grades 2–3

Per secondary-source search results (not deped.gov.ph directly):

> "Mother Tongue is no longer a separate learning area for Grades 2 and 3 in
> the MATATAG curriculum, though the new curriculum will continue using the
> mother tongue as the medium of instruction, but it will no longer be
> taught as a separate subject."

This matches the MATATAG page's own Grade 2–3 list above, which shows
English/Filipino/Mathematics/Makabansa/GMRC/(Science in G3) with **no
separate Mother Tongue line**, whereas the pre-MATATAG K to 12 curriculum
had Mother Tongue as its own learning area with its own curriculum guide
for Grades 1–3 (e.g. the DepEd "Mother Tongue CG" documents referenced in
search results).

### Key structural change identified: a new "Makabansa" learning area (Grades 1–3) replacing/absorbing Araling Panlipunan + EsP for early grades

The MATATAG Grade 1–3 list above shows **Makabansa** as a single learning
area, where the pre-MATATAG K to 12 curriculum for the same grades had
**Araling Panlipunan (Social Studies)** and **Edukasyon sa Pagpapakatao
(Values Education)** as adjacent/related early-grade content areas (per
secondary-source description of the old curriculum, not independently
verified against an official pre-MATATAG DepEd page in this session —
see below). Search-result summary states Makabansa's aim is to
"[s]trengthen students' foundations in forming their identity as
individuals and Filipinos... [e]nhance students' abilities in movement,
health, and creative expression... [s]trengthen the literacy foundations,"
i.e. Makabansa appears to be a Grade 1–3 integrative subject rather than a
direct one-to-one rename of Araling Panlipunan.

### What could NOT be confirmed against an official pre-MATATAG DepEd page

I attempted to fetch DepEd's own page for the **original** (pre-MATATAG) K
to 12 Basic Education Curriculum learning-area list
(`https://www.deped.gov.ph/k-to-12/about/`) to do a clean side-by-side
official-source comparison. That page loaded but **did not contain the
actual subject/learning-area listing** in the fetched content (it was
mostly navigation and an unrelated "Project Bukas" data-initiative
callout) — so the "before" side of this comparison rests on secondary
sources (general knowledge of the 2013 K to 12 curriculum structure:
Filipino, English, Mathematics, Science, Araling Panlipunan, Edukasyon sa
Pagpapakatao, MAPEH, EPP/TLE, and Mother Tongue for Grades 1–3), not a
directly-fetched official DepEd page in this session.

### Answer to the original question

**Yes — MATATAG changed more than the curriculum's own name.** Based on
directly-fetched DepEd content plus corroborating secondary sources, MATATAG
restructured K–10 learning areas, at minimum:

1. Introduced **"Makabansa"** as a new integrative learning area for Grades
   1–3 (replacing the role previously played by Araling Panlipunan / EsP /
   values content at that level).
2. **Removed Mother Tongue as a standalone learning area for Grades 2–3**
   (kept as medium of instruction only, no longer separately taught/graded
   as its own subject at those grades — Grade 1 still has "Reading and
   Literacy" distinct from "Language").
3. **Split MAPEH's grading from 4 components to 2** (Music & Arts; PE &
   Health) for Grades 4–10, without eliminating the MAPEH umbrella subject
   name.
4. Renamed/relabeled GMRC as **"Values Education"** for Grades 7–10 while
   keeping GMRC as the standalone name for Grades 1–6.

This means the project's database seeding two curriculum_version rows with
**identical** learning-area name sets for "K to 12 Basic Education
Curriculum" and "MATATAG Curriculum" is very likely **factually inaccurate**
relative to DepEd's actual MATATAG rollout, at least for Grades 1–3 (new
Makabansa area, removed Mother Tongue) and for the MAPEH grading structure
in Grades 4–10. This research does not recommend a specific schema fix —
that's an implementation decision for a future task — but the evidence
does not support treating the two curriculum versions as having the same
learning-area list.

---

## 2. KS1 (Grades 1–3) descriptive/non-numerical grading policy

**Confidence: primary source located and confirmed to exist and be
reachable (the official DO 015 s.2026 DepEd page + PDF URL), but the exact
descriptor text/bands below are from secondary sources, not directly read
from the PDF (see Section 0 — the PDF is an unreadable scan in this
environment). Multiple independent secondary sources agree closely with
each other, which raises confidence, but this is still secondary-source
confidence, not primary-source-verified.**

### What was found

The governing policy is **DepEd Order No. 015, s. 2026**, "Revised
Guidelines on Classroom Assessment, Grading System, and Awards and
Recognition for the K to 12 Basic Education Program," signed June 4, 2026.
Official DepEd issuance page (directly fetched, confirms the order exists
and its exact title/date):

`https://www.deped.gov.ph/2026/06/04/june-4-2026-do-015-s-2026-revised-guidelines-on-classroom-assessment-grading-system-and-awards-and-recognition-for-the-k-to-12-basic-education-program/`

Official PDF (confirmed URL, but unreadable scan in this environment):

`https://www.deped.gov.ph/wp-content/uploads/DO_s2026_015r.pdf`

Per secondary sources (multiple, independently written teacher-guide
articles), DO 015 s.2026 introduces a **Descriptive Grading System
(non-numeric)** for **Key Stage 1 (Kindergarten through Grade 3)**,
replacing the standard 75–100 numerical scale used for Key Stages 2–4
(Grades 4–10 and SHS). Two secondary sources independently gave what
appears to be the same three-level descriptor scale, with matching
abbreviations:

| Code | Descriptor (English) | Described meaning |
|------|----------------------|--------------------|
| BG | Beginning | "The learner rarely demonstrates the expected competency and needs sustained guidance." |
| DV | Developing | "The learner demonstrates the competency inconsistently and needs continued practice." (one source: "Demonstrates inconsistently; shows progress with practice") |
| CO | Consistent | "The learner consistently demonstrates the expected competency and participates actively." (one source: "may exceed expectations") |

Sources for this table:
- [tchersden.com — "The Grading System Under DepEd Order No. 015, s. 2026"](https://www.tchersden.com/2026/06/grading-system-deped-order-015-2026.html)
  (redirected from `tchersden.blogspot.com`) — gives the CO/DV/BG table
  with the descriptions quoted above, explicitly labeled a
  "school-friendly guide" that "does not replace the official DepEd
  issuance."
- Independent WebSearch aggregation citing
  [BicolDotPH — "DepEd adopts descriptive grading for Key Stage 1 learners"](https://bicoldotph.com/2026/06/12/deped-adopts-descriptive-grading-for-key-stage-1-learners/)
  and [depedtambayanph.net](https://www.depedtambayanph.net/2026/06/deped-new-grading-system-2026-zero.html)
  gave a matching BG/DV/CO scheme with slightly different wording ("Beginning
  - Nagsisimula: Rarely demonstrate", "Developing - Umuusbong", "Consistent -
  Palagiang Naipapakita"), including Filipino translations of the labels
  ("Nagsisimula", "Umuusbong", "Palagiang Naipapakita").

A third phrasing found (also via WebSearch, less corroborated, possibly a
different or paraphrased source) described the scale as "Advancing to
Emerging" rather than BG/DV/CO — **this is a discrepancy I could not
resolve**; it may be a mis-paraphrase by that particular secondary source,
an earlier draft/leaked terminology, or terminology specific to a
different report-card section (e.g. a socio-emotional-skills narrative
band vs. the academic-competency BG/DV/CO band). Given two independently
written sources agree closely on BG/Beginning, DV/Developing, CO/Consistent
(including matching Filipino equivalents), I treat that three-level
BG/DV/CO scheme as the better-supported description, but flag the
"Advancing/Emerging" phrasing as unresolved and possibly describing
something else in the same document (or a lower-quality/inaccurate
secondary source).

**No percentage-equivalent ranges for BG/DV/CO were found in any source**
— the whole point of this policy is that Key Stage 1 receives no numeric
grade at all, not a numeric range mapped to a label.

### Phased rollout

Secondary sources describe a phased implementation:

> "For Kindergarten and Grade 1, numeric grades disappear altogether
> starting SY 2026-2027 ... Grade 2 shifts to descriptive reporting in SY
> 2027-2028, and Grade 3 in SY 2028-2029."

This means for SY 2026-2027 specifically, **only Kindergarten and Grade 1**
are confirmed to be non-numeric under this rollout schedule as described by
secondary sources; Grades 2 and 3 would (per this same secondary
description) still be transitioning in later school years. This is an
important nuance for the project if it's modeling "KS1 = Grades 1-3 all
descriptive" as a single flag — the secondary sources suggest a
grade-by-grade phase-in, not an immediate blanket change for all three KS1
grades in SY 2026-2027. **I could not confirm this phasing detail against
the primary PDF** (unreadable scan), so treat the exact phase-in years as
secondary-source confidence only, and note that this project's own
CURRENT-HANDOFF record (dated 2026-09-04, referencing SY 2026-2027) should
be cross-checked against this phasing nuance before being treated as final.

### Answer to the original question

**Yes — there is a specific, named DepEd policy: DepEd Order No. 015, s.
2026**, which explicitly establishes a non-numerical, descriptive grading
system for Key Stage 1 (Kinder–Grade 3), using (per closely-corroborating
secondary sources) a three-band descriptor scale abbreviated **BG
(Beginning) / DV (Developing) / CO (Consistent)**, replacing the 75–100
numeric scale for that stage, phased in starting with Kindergarten and
Grade 1 in SY 2026-2027. The official document exists and its URL is
confirmed live, but exact wording/bands here come from secondary sources
because the official PDF could not be read in this environment (see
Section 0).

---

## 3. DO 8 s.2015 vs. DO 015 s.2026 transmutation table differences

**Confidence: primary sources located and confirmed reachable (both DO 8
s.2015 and DO 015 s.2026 official DepEd pages/PDFs), but the actual table
values and the Annex D / paragraph 49 text below are from secondary
sources, cross-corroborated across at least two independently-written
sources per key fact. The official PDFs could not be read directly in this
environment (see Section 0).**

### Governing documents (confirmed via direct fetch of DepEd issuance pages)

- **DO 8, s. 2015** — "Policy Guidelines on Classroom Assessment for the K
  to 12 Basic Education Program," issued April 1, 2015, signed by then-
  Secretary Br. Armin A. Luistro FSC.
  Page: `https://deped.gov.ph/2015/04/01/do-8-s-2015` (fetched directly).
  PDF: `https://www.deped.gov.ph/wp-content/uploads/2015/04/DO_s2015_08.pdf`
  (confirmed URL; scanned/unreadable in this environment).

- **DO 015, s. 2026** — "Revised Guidelines on Classroom Assessment,
  Grading System, and Awards and Recognition for the K to 12 Basic
  Education Program," signed June 4, 2026.
  Page: `https://www.deped.gov.ph/2026/06/04/june-4-2026-do-015-s-2026-revised-guidelines-on-classroom-assessment-grading-system-and-awards-and-recognition-for-the-k-to-12-basic-education-program/`
  (fetched directly).
  PDF: `https://www.deped.gov.ph/wp-content/uploads/DO_s2026_015r.pdf`
  (confirmed URL; scanned/unreadable in this environment).

Per secondary source (schoolfinderph.com), **DO 015 s.2026 explicitly
repeals DO 8 s.2015 (and DO 36, s. 2016) in its own Paragraph 6**:

> "Paragraph 6 of DepEd Order No. 015, s. 2026 ... states that the Order
> repeals DepEd Order No. 8, s. 2015 and DepEd Order No. 36, s. 2016."

Source: [SchoolFinderPH — "DO 8, s. 2015 Is Repealed: What Governs Grading Now"](https://www.schoolfinderph.com/blog/deped-order-8-s-2015-status)

### The DO 8 s.2015 (original) transmutation table

Per secondary sources (tsoktok.blogspot.com's explanation of the formula,
and chedscholar.org's summary), the original DO 8 table:

- Maps **raw/initial grades 60.00–100** onto **transmuted grades 75–100**
  (i.e. raw 60 was the minimum *passing* raw score, transmuting to the
  minimum passing report-card grade of 75).
- Maps **raw/initial grades 0–59.99** (the failing range) onto **transmuted
  grades 60–74** — so even a raw score of 0 could not appear on a report
  card as anything lower than 60, though it remained recorded/treated as a
  failing grade.
- The formula for the passing band divides the 60–100 raw range into 25
  units of ~1.59 points each (i.e. `(99.99-60.00)/25 ≈ 1.5996`), producing
  rows like:

  | Initial Grade Range | Transmuted Grade |
  |---|---|
  | 100 | 100 |
  | 98.40–99.99 | 99 |
  | 96.80–98.39 | 98 |
  | 95.20–96.79 | 97 |
  | 93.60–95.19 | 96 |
  | ... | ... |
  | 60.00–61.59 | 75 |

- The formula for the failing band divides the 0–59.99 raw range into 15
  units of ~4.0 points each (`(59.99-0)/15 ≈ 3.999`), producing the bottom
  of the table down to:

  | Initial Grade Range | Transmuted Grade |
  |---|---|
  | 0.00–3.99 | 60 |

- A commonly-cited spreadsheet-formula equivalent given by a secondary
  source: `=FLOOR(IF(A1<60, 60+(A1/4), 75+(A1-60)/1.6), 1)`.

I was **not able to find a single source reproducing every row** of the
original DO 8 table end-to-end in one place — the above is reconstructed
from the stated formula plus a handful of example rows given by two
different secondary sources, which are internally consistent with each
other and with the known "60→75, 100→100" anchor points repeated across
many independent Philippine teacher-resource sites. I did not independently
verify this against the DO 8 PDF because it is unreadable in this
environment.

### The DO 015 s.2026 adjusted transmutation table

A secondary source (depedtambayanph.net) reproduced what it presents as
the **complete** SY 2026-2027 adjusted table:

| Initial Grade | Transmuted | | Initial Grade | Transmuted |
|---|---|---|---|---|
| 99.50–100.00 | 100 | | 74.72–75.89 | 79 |
| 98.32–99.49 | 99 | | 73.54–74.71 | 78 |
| 97.14–98.31 | 98 | | 72.36–73.53 | 77 |
| 95.96–97.13 | 97 | | 71.18–72.35 | 76 |
| 94.78–95.95 | 96 | | 70.00–71.17 | 75 |
| 93.60–94.77 | 95 | | 65.34–69.99 | 74 |
| 92.42–93.59 | 94 | | 60.67–65.33 | 73 |
| 91.24–92.41 | 93 | | 56.01–60.66 | 72 |
| 90.06–91.23 | 92 | | 51.34–56.00 | 71 |
| 88.88–90.05 | 91 | | 46.67–51.33 | 70 |
| 87.70–88.87 | 90 | | 42.01–46.66 | 69 |
| 86.52–87.69 | 89 | | 37.34–42.00 | 68 |
| 85.34–86.51 | 88 | | 32.68–37.33 | 67 |
| 84.16–85.33 | 87 | | 28.01–32.67 | 66 |
| 82.98–84.15 | 86 | | 23.35–28.00 | 65 |
| 81.80–82.97 | 85 | | 18.68–23.34 | 64 |
| 80.62–81.79 | 84 | | 14.01–18.67 | 63 |
| 79.44–80.61 | 83 | | 9.35–14.00 | 62 |
| 78.26–79.43 | 82 | | 4.68–9.34 | 61 |
| 77.08–78.25 | 81 | | 0.00–4.67 | 60 |
| 75.90–77.07 | 80 | | | |

Source: [depedtambayanph.net — "DepEd Order No. 015, s. 2026: Revised Grading System Guidelines & Electronic Class Record Download"](https://www.depedtambayanph.net/2026/06/deped-order-no-015-s-2026-revised.html)

This is corroborated on the key anchor point by an independent source
(tchersden.com): "an Initial Grade of 70 corresponds to a transmuted grade
of 75," and by depedclub-derived search summaries: "the baseline score
required to obtain a passing grade of 75 is now 70 (compared to 60
previously)."

### Exact difference between the two tables

The core, well-corroborated (2+ independent secondary sources) difference:

- **DO 8 s.2015**: raw/initial grade **60.00** transmutes to the minimum
  passing grade of **75**. The passing band spans raw 60–100 → transmuted
  75–100 (40-point transmuted range compressed from a 40-point raw range —
  actually a 1:1-ish slope in that band, ~1.6 raw points per row above but
  the compression is between the *failing* band, not passing). Below raw
  60, the transmuted grade compresses raw 0–59.99 into transmuted 60–74.

- **DO 015 s.2026 (adjusted table)**: raw/initial grade **70.00** now
  transmutes to the minimum passing grade of **75** — i.e. the passing
  threshold on the raw scale was **raised from 60 to 70**. The failing
  band now compresses a *wider* raw range (0–69.99, not 0–59.99) into the
  same transmuted 60–74 range. Concretely: under DO 015, a raw/initial
  grade in the high-60s (e.g. 65–69.99) — which under DO 8 would have
  transmuted to a **passing** grade around 79-83 — now transmutes to a
  **failing** 74 (see the "65.34–69.99 → 74" row above). This is a
  materially stricter mapping in the middle of the scale: DO 8 treated raw
  60+ as passing; DO 015 requires raw 70+ to pass.

- Both tables keep the same **ceiling behavior** (raw 100 → transmuted 100,
  raw ~99.5+ → transmuted 100) and the same **floor behavior** (raw 0 →
  transmuted 60, still the minimum reportable grade for a failing student).
  So the floor/ceiling values themselves (60 and 100) are unchanged; what
  changed is the **raw-score breakpoint that separates the passing curve
  from the failing curve** (60 under DO 8 vs. 70 under DO 015), which
  reshapes the whole curve's slope in the middle.

- Secondary sources also report this transmutation-table change is a
  **transitional step toward eventually phasing out transmutation
  entirely** by SY 2027-2028, per a WebSearch-surfaced GMA News headline
  ("DepEd to phase out grade transmutation in public schools") and a
  Philstar headline ("How DepEd plans to phaseout grade transmutation
  policy") — I did not fetch either full article, so this is noted as an
  unverified headline-level claim, included for context only.

### Component weights: unchanged between DO 8 and DO 015 for Grade 12 (per Paragraph 49)

Per DO 8 s.2015 (as summarized by multiple secondary sources, not read
directly from the scanned PDF), component weights for Grades 1–10 were, by
subject cluster: Languages/Araling Panlipunan/EsP, Science/Math, and
MAPEH/EPP-TLE each had their own Written Work / Performance Task /
Quarterly Assessment percentage split (commonly cited as 30/50/20/for one
cluster and different splits for others; exact per-cluster numbers could
not be independently confirmed from the unreadable PDF, so are not
reproduced here as authoritative — see the "not able to fully confirm"
note below).

The key, well-corroborated finding for **this project's specific question**
(Grade 12, SY 2026-2027) is:

> "Paragraph 49 of DO 015, s. 2026 states that for Senior High School Grade
> 12, which has not yet implemented the Strengthened SHS Curriculum for SY
> 2026-2027, the weights in DepEd Order No. 8, s. 2015 shall apply
> together with the adjusted transmutation table."

Sources (two independently-written secondary sources give matching
wording, strongly suggesting they are both quoting/paraphrasing the same
official paragraph):
[SchoolFinderPH](https://www.schoolfinderph.com/blog/deped-order-8-s-2015-status),
corroborated by a WebSearch aggregation citing depedclub.com and
depedtambayanph.net.

This is an important, precise finding directly relevant to this project's
own recorded product decision (per `docs/CURRENT-HANDOFF.md`, 2026-09-04:
"Grade 12 remains on the old curriculum and uses the old grading format for
SY 2026-2027"): **that phrasing may be imprecise/incomplete**. Per this
research, Grade 12 for SY 2026-2027 keeps **DO 8's component WEIGHTS**
(Written Work / Performance Task / Quarterly Assessment percentages) but
does **NOT** keep DO 8's original transmutation table — it must use the
**DO 015 adjusted transmutation table** (raw 70 → transmuted 75, not raw
60 → transmuted 75). "Old grading format" is ambiguous and could be
misread as "use the DO 8 transmutation table too," which per Paragraph 49
(as described by secondary sources) is not correct. I recommend whoever
picks up this research explicitly re-check this against the primary PDF
text of Paragraph 49 (and "Annex D," described by one secondary source as
the annex containing the Key-Stage-2-4 grade computation steps including
the transmutation table) before finalizing Grade 12 grading logic in the
codebase, since I could not read the primary PDF myself in this
environment.

I could not find the term **"Annex D"** used explicitly in the same source
that also discussed Grade 12/Paragraph 49 together (SchoolFinderPH's
Paragraph 49 quote did not mention Annex D by name), but a separate
WebSearch aggregation (citing depedtambayanph.net) did independently state
that **"Annex D provides the steps for computing grades in Key Stages 2 to
4"** including the transmutation table — consistent with, but not a
verbatim confirmation of, this project's own reference to "Annex D
paragraph 49." This detail should be treated as **not fully confirmed** —
it's plausible paragraph 49 lives inside Annex D, but I did not find a
single source stating both facts together in one place, and could not
verify against the primary PDF.

### Answer to the original question

**The two tables differ primarily in where the passing/failing boundary
falls on the raw-score scale**: DO 8 s.2015 treats raw 60 as the minimum
passing raw score (→ transmuted 75); DO 015 s.2026's adjusted table raises
that to raw 70 (→ transmuted 75), which pushes what used to be
comfortably-passing raw scores in the 60s down into the failing (below-75)
transmuted range. Both tables share the same floor (0 → 60) and ceiling
(100 → 100) transmuted values. For Grade 12 in SY 2026-2027 specifically,
DepEd Order No. 015 s.2026 Paragraph 49 (per secondary sources) requires
using **DO 8's original component weights together with DO 015's new
adjusted transmutation table** — a hybrid, not a full reversion to DO 8.
Exact table values above are reconstructed/quoted from secondary sources
that are internally consistent and mutually corroborating on the key
anchor points (60→75 for DO 8, 70→75 for DO 015, floor 60/ceiling 100 for
both), but were not independently verified against the primary PDFs due to
the scanned-PDF/no-OCR-tool limitation described in Section 0.

---

## Summary of confidence levels

| Question | Confidence | Primary source reached? |
|---|---|---|
| Q1: MATATAG learning-area changes | **High** — primary DepEd page (Revised K to 10 Curriculum) directly fetched and used as the main source; corroborated by several secondary sources on specific structural changes (MAPEH split, Mother Tongue removal for G2-3, Makabansa). Pre-MATATAG "before" list is secondary-source only. | Yes, for the MATATAG side (`deped.gov.ph/k-to-12/revised-k-to-10-curriculum/`). No, for the pre-MATATAG "before" side. |
| Q2: KS1 descriptive grading | **Medium** — the policy's existence, exact order number, title, and date are primary-source-confirmed (DepEd issuance page). The exact descriptor bands (BG/DV/CO) and phase-in schedule are secondary-source only, though corroborated by 2+ independent sources with matching Filipino terms. One conflicting secondary-source phrasing ("Advancing/Emerging") is unresolved. | Page yes; PDF no (unreadable scan). |
| Q3: DO 8 vs DO 015 transmutation tables | **Medium** — both orders' existence, titles, dates, and the repeal relationship are primary-source-confirmed via DepEd issuance pages. The exact table values, the Grade 12/Paragraph 49 hybrid rule, and the Annex D reference are secondary-source only, though the Paragraph 49 wording is corroborated near-verbatim across 2 independently-written sources. | Pages yes; PDFs no (unreadable scans). |

## Recommended follow-up if higher confidence is needed later

Both official PDFs are confirmed at these live URLs and are the actual
authoritative documents — they just could not be read as text in this
sandboxed environment:

- DO 8, s. 2015: `https://www.deped.gov.ph/wp-content/uploads/2015/04/DO_s2015_08.pdf`
- DO 015, s. 2026: `https://www.deped.gov.ph/wp-content/uploads/DO_s2026_015r.pdf`

To upgrade this research from secondary- to primary-source confidence, open
these two PDFs in an environment with a PDF viewer/OCR (e.g. a human
reviewer, or a sandbox with `poppler-utils`/`tesseract` installed) and
verify: (1) the exact KS1 descriptor labels/bands, (2) the full
transmutation table rows for both orders, (3) the exact text of DO 015's
Paragraph 6 (repeal clause), Paragraph 49 (Grade 12 transition clause), and
whatever annex contains the KS2-4 grade-computation steps (referred to as
"Annex D" by this project and by one secondary source).
