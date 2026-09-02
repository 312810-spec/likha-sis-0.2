# DepEd Order No. 015, s. 2026 and DepEd Order No. 009, s. 2026 — cross-cutting research

Shared evidence record for two 2026 DepEd Orders that cut across SF5,
SF6, and SF9's provenance work (`docs/form-evidence/{sf5,sf6,sf9}/README.md`
each reference this file rather than duplicating it) and potentially
affect LIKHA-SIS's own `grading`/`grading_computation` domain modules.
First recorded 2026-09-02; updated same day after a second research
pass explicitly aimed at verifying these two orders directly.

**Status: still not primary-source-read.** This session's network
egress proxy blocks `WebFetch` to essentially every content domain
tested — `deped.gov.ph`, `depedclub.com`, `en.wikipedia.org` (control),
all failed identically as `EGRESS_BLOCKED`, confirmed as an
organization-policy 403 via the proxy's own diagnostic. `github.com`
was reachable, indicating the block is a content-domain restriction
(likely scoped for a coding assistant), not a blanket network failure —
this rules out a transient fault, so no further retry was attempted
per the proxy's own "do not route around" guidance. See
`docs/VERIFICATION-DEBT.md` for the standing debt entry. Everything
below is `WebSearch`-snippet corroboration, now from a second, more
targeted pass — stronger and more specific than the first pass, but
still not a verbatim primary-source read.

---

## DepEd Order No. 015, s. 2026 — "Revised Guidelines on Classroom

## Assessment, Grading System, and Awards and Recognition for the K to

## 12 Basic Education Program"

Corroborated by multiple independent, detailed secondary sources
(orientation slide decks, DepEdClub, TeachersClick, aptikons.com,
educlickph.com, depedtambayanph.net) that are consistent with each
other on specifics, not just the order's existence:

- **Two assessment components**: Formative Assessment (monitors
  progress, not used for grade computation) and Summative Assessment
  (evaluates achievement at defined points, recorded and reported).
- **Key Stage 1 (Grades 1-3)**: descriptive (non-numeric) grading
  focused on learner development, replacing the numeric system.
- **Key Stages 2-4 (Grades 4-12)**: numeric grading retained, with
  prescribed component weights for Written/Oral Works, Product/
  Performance Tasks, and Examinations (reported weights: 20/50/30 for
  core subjects in an earlier pass — not independently re-confirmed
  this pass).
- **Transition timeline, specific and consistent across sources**: for
  **SY 2026-2027** (the current school year), an adjusted transmutation
  table applies as a transition step; beginning **SY 2027-2028**, a
  **zero-based grading system** is implemented for Key Stages 2-4, with
  Term Grades based directly on computed Initial Grades **without
  transmutation**, and **75 as the minimum passing grade**.
- Reported (not independently re-confirmed) to supersede DepEd Order
  No. 8, s. 2015 — the order SF5/SF6's current proficiency-band and
  promotion-decision logic (and this project's own
  `grading_computation` module) is built on.

Sources (secondary, not fetched/read this session):

- https://www.slideshare.net/slideshow/comprehensive-orientation-on-deped-order-no-15-s-2026-new-assessment-and-grading-systems/288123908
- https://www.slideshare.net/slideshow/deped_do015_s2026_classroom_assessment-pptx/288107173
- https://depedclub.com/deped-classroom-assessment-guidelines-do-015-s-2026/
- https://depedclub.com/deped-grading-system-guidelines-do-015-s-2026/
- https://www.aptikons.com/education/deped-order-no-015-series-2026/
- https://www.teachersclick.com/2026/06/blog-post.html
- https://educlickph.com/deped-order-no-15-s-2026-new-summative-assessment-guidelines/
- https://www.depedtambayanph.net/2026/06/deped-order-no-015-s-2026-revised.html
- https://www.depedtambayanph.net/2026/06/deped-new-grading-system-2026-zero.html

## DepEd Order No. 009, s. 2026 — "Guidelines on the Implementation of

## the Three-Term School Calendar in Basic Education"

Also corroborated by multiple independent secondary sources, including
a Division-level dissemination memo naming the order explicitly:

- **DM No. 267, s. 2026** (DepEd Makati) — "Dissemination and
  Implementation of DepEd Order No. 009, s. 2026, Guidelines on the
  Implementation of the Three-Term School Calendar in Basic Education."
  Same pattern as this project's other Division-re-issuance findings
  (eSF7, SF9) — a Division tracking number for a central-office order,
  not itself the national issuance number.
  https://depedmakati.ph/index.php/2026/04/30/dm-no-267-s-2026-dissemination-and-implementation-of-deped-order-no-009-s-2026-guidelines-on-the-implementation-of-the-three-term-school-calendar-in-basic-education/
- **SDM No. 136, s. 2026** — a second, independent Division
  dissemination of the same national order, corroborating the exact
  same title and number.
  https://www.depedscm.com/sdm-no-136-s-2026-dissemination-of-deped-order-no-009-s-2026-titled-guidelines-on-the-implementation-of-the-three-term-school-calendar-in-basic-education/
- **Purpose (per secondary summary)**: institutionalizes a three-term
  school calendar beginning **SY 2026-2027**, replacing the prior
  four-quarter calendar, in response to "persistent learning gaps,
  frequent class disruptions, and increasing teacher workload."
  Applies to **all public elementary and secondary schools and
  Community Learning Centers (CLCs)**.
- **Specific term dates for SY 2026-2027** (consistently reported
  across sources — teachpinas.com, edureaper.com): school year runs
  June 8, 2026 to April 8, 2027, **201 class days total**, split:
  - **Term 1**: June 8 – September 15, 2026 (69 class days)
  - **Term 2**: September 16 – December 18, 2026 (65 class days)
  - **Term 3**: January 4 – April 8, 2027 (67 class days)

Sources (secondary, not fetched/read this session):

- https://depedmakati.ph/index.php/2026/04/30/dm-no-267-s-2026-dissemination-and-implementation-of-deped-order-no-009-s-2026-guidelines-on-the-implementation-of-the-three-term-school-calendar-in-basic-education/
- https://www.depedscm.com/sdm-no-136-s-2026-dissemination-of-deped-order-no-009-s-2026-titled-guidelines-on-the-implementation-of-the-three-term-school-calendar-in-basic-education/
- https://www.slideshare.net/slideshow/comprehensive-guidelines-for-implementing-the-3-term-school-calendar-in-basic-education/287755550
- https://www.slideshare.net/slideshow/comprehensive-guidelines-on-implementing-the-three-term-school-calendar-in-basic-education/287094592
- https://www.slideshare.net/slideshow/comprehensive-orientation-on-do-no-009-s-2026-implementing-the-three-term-school-calendar-for-sy-2026-2027/287968278
- https://www.teachpinas.com/deped-three-term-school-calendar-trimester-sy-2026-2027/
- https://www.edureaper.com/2026/06/do-009-s-2026-three-term-school.html
- https://www.aptikons.com/education/deped-guidelines-implementation-three-term-school-calendar-basic-education-do-009s-2026/
- https://tchersden.blogspot.com/2026/04/deped-order-009-2026-three-term-school-calendar-guide.html

## Classification

**Both orders: CONFIRMED TO EXIST, real, and currently in effect** — no
longer just "reported" leads. Multiple independent sources (including
two separate Division dissemination memos for DO 009, naming it
explicitly by number and title) converge on consistent, specific
details (exact term dates, exact class-day counts, a two-year
transition plan with concrete milestones). This is materially stronger
corroboration than a single vague mention.

**However, per this project's own evidence-gate discipline, this still
does not clear the bar for treating either order's text as verified**
— no primary `deped.gov.ph` page or PDF was directly read this session
(network egress blocked). The **existence, number, title, and headline
effect** of both orders is now about as well-established as
`WebSearch`-only research can make it; the **exact legal text** (repeal
language, full scope, any exceptions) is not.

## Practical implication for LIKHA-SIS — action needed independent of

## the SF5/SF6/SF9 template work

This is no longer a hedge — it is now reasonably certain that:

1. **The school-year structure this project's `grading`/
   `grading_computation` domain assumes (quarters/semesters) has
   changed to three terms, effective the current school year (SY
   2026-2027), for all public elementary and secondary schools.**
2. **The grading computation itself is mid-transition**: SY 2026-2027
   uses an adjusted transmutation table as a bridge step; SY 2027-2028
   moves to zero-based grading (no transmutation, Term Grade = Initial
   Grade, 75 minimum passing) for Key Stages 2-4. Key Stage 1 already
   moved to non-numeric/descriptive grading.

**Recommended next step, separate from and higher-priority than the
SF5/SF6/SF9 template provenance work**: review
`src-tauri/src/repository/grading.rs` and
`src-tauri/src/repository/grading_computation.rs` against this
three-term / two-phase-transmutation model, and decide (with the
project owner, since this is exactly the kind of DepEd-compliance
change that needs verification before touching shipped grading logic)
whether/how to model it. Do not silently assume the existing
quarterly/semestral model still matches current DepEd requirements
for SY 2026-2027.
