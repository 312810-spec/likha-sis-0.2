# ADR-0084: Award-Eligibility Anecdotal-Record Check

Status: Accepted
Date: 2026-09-09

## Context

`src/domain/award-eligibility.ts` has carried a hardcoded-false "no
disciplinary anecdotes" leg since it was first built (see the module's
own doc comment history and `docs/product/OWNER-DECISIONS-NEEDED.md`
item 4): `AwardEligibilityResult.anecdotalRecordsChecked` was always
`false`, and callers/UI were told to surface that explicitly rather than
silently treat the unchecked leg as "passed". Batch 12 (ADR-0083) then
built the Anecdotal / Guidance Records entity (`anecdotal_records`,
generic `positive`/`negative`/`neutral` category) precisely so a future
batch could wire it in. This batch (13) does that wiring.

## Decision

### Disqualification rule: any `negative`-category record disqualifies, regardless of severity

`src/domain/anecdotal-record.ts` now exports
`DISQUALIFYING_ANECDOTAL_CATEGORIES = ["negative"]` and
`isDisqualifyingAnecdotalCategory()`. A learner with **any** anecdotal
record in the `negative` category is excluded from the Academic
Excellence Award; `positive` and `neutral` records never disqualify.

**This is this project's own conservative default, not a verified DepEd
rule.** No primary DepEd source for the actual honors-eligibility
anecdotes rule was found (same gap already disclosed for the GA/subject-
grade thresholds). Two things this rule deliberately does NOT do,
because doing them would require inventing structure that doesn't exist
in Batch 12's schema:

- **No severity threshold.** `AnecdotalCategory` has no severity field
  (unlike `child_protection::SeverityTier`, which DOES model
  Level1/2/3). Rather than inventing a severity model this project has
  no citation for, the rule treats every `negative` record as equally
  disqualifying. A school that wants "only serious negative records
  disqualify" cannot express that with today's schema — this is an open
  question, not a decision this batch made silently (see
  `docs/product/OWNER-DECISIONS-NEEDED.md` item 4, still open).
- **No date/recency window.** A `negative` record from any school year
  in the section's history disqualifies, since `has_anecdotal_category_for_learner`
  is scoped by `section_id` (as authorization requires) and queries by
  category only, not by date range. A learner who transferred sections
  triggers a fresh authorization check per section but the query itself
  has no time bound within that section's records.

### Narrow read path: reuses the section-adviser-or-School-Head gate directly, not a new weaker one

The eligibility screen (`CertificateAwardScreen`) needs to know only a
boolean per learner ("has a disqualifying record or not"), not the full
narrative content Batch 12's `list_anecdotal_records_for_section`
returns. Two questions this batch had to settle:

**1. Should this data be gated by a narrower "view" authorization than
the existing adviser-or-School-Head gate?** No. Every read command in
`commands::anecdotal_record` and its sibling `commands::child_protection`
(`list_anecdotal_records_for_section`, `list_behavioral_incidents_for_section`,
`list_incident_interventions`, `get_at_risk_flags_for_section`) already
uses the exact same `authorize_child_protection_access_for_section` gate
as every write in those modules — there is no established "read-only,
weaker-than-write" gate precedent for this sensitivity class anywhere in
this codebase. (`auth::authorize_view_teacher_load` IS a narrower
self-or-School-Head view gate, but it exists for a materially different,
non-PII concern — a teacher's own teaching load — not for a per-learner
narrative record. Reusing it here, or inventing a new weaker gate, would
be a genuine authorization regression for real guidance-record PII with
no precedent supporting it.) The new
`has_anecdotal_category_for_learner` command therefore reuses
`authorize_child_protection_access_for_section` **unchanged** — the
section's current adviser, or a School Head, in their own school. A
Teacher awarding certificates for a section they do not advise (and are
not a School Head for) is denied, same as every other anecdotal-record
operation.

**2. Should the new read path minimize what data crosses the IPC
boundary, even though the authorization gate is unchanged?** Yes. A new
narrow command, `has_anecdotal_category_for_learner`, was added rather
than reusing `list_anecdotal_records_for_section` from the eligibility
screen. It:

- Takes `learner_id`, `section_id`, `categories: Vec<String>`,
  `as_of_date`.
- Runs the same authorization gate, then delegates to a new repository
  function, `has_any_category_for_learner_in_section`, which executes a
  `SELECT 1 ... category IN (...) LIMIT 1` existence check.
- Returns a bare `bool` -- **never** the matching records' narrative
  content.

This is a data-minimization choice, not an authorization-narrowing one:
the gate is identical either way. But `CertificateAwardScreen` is not a
guidance-records screen -- it has no business reading (or holding in
React state) the narrative text of every guidance record in a section
just to compute a disqualification signal for a certificate. Reusing
`list_anecdotal_records_for_section` would have worked and been
"authorization-correct", but would have pulled full narrative PII into a
screen and its component state that only ever needs a boolean. The
narrow command avoids that unnecessary PII exposure surface without
weakening the authorization boundary security actually depends on.

### Domain layer stays pure -- the caller supplies the real lookup result

`award-eligibility.ts`'s `evaluateAcademicExcellenceEligibility` gained a
required `hasDisqualifyingAnecdotalRecord: boolean` input field and an
echoing output field of the same name; `anecdotalRecordsChecked` is now
always `true` (the leg genuinely runs) instead of always `false`. The
function does no I/O of its own -- per
`.claude/rules/architecture.md`, `src/domain/**` must never import an
application service or reach into infrastructure. The real lookup
happens in `AnecdotalRecordApplicationService.hasDisqualifyingRecordForLearner`
(new method, application layer), and `CertificateAwardScreen` calls it
once per roster member before calling the pure eligibility function,
passing the real result in as plain data. This mirrors how the screen
already treats `generalAverage`/`subjectGrades` -- computed above the
domain function, never fetched by it.

### Certificate and UI disclosures updated, not silently dropped

`certificate.ts`'s `ELIGIBILITY_DISCLOSURE` and
`CertificateAwardScreen`'s top-of-screen `Alert` both previously said
"does not check disciplinary/anecdotal records (no such feature exists
yet)". That is no longer true and would now be a false claim on a
printed certificate. Both were rewritten to disclose the check that
_does_ run, and to flag that its specific rule (any `negative`-category
record, any severity) is this project's own placeholder, not a verified
DepEd standard -- the same honesty standard already applied to the GA
threshold disclosure, not a new one.

## Consequences

- A learner with a `negative`-category anecdotal record in the relevant
  section is now correctly excluded from the Academic Excellence Award
  computation, with a `reasons` entry naming why.
- A learner with only `positive`/`neutral` records, or no records at
  all, is unaffected -- `hasDisqualifyingAnecdotalRecord` resolves to
  `false` and the eligibility computation behaves exactly as before this
  batch.
- `docs/product/OWNER-DECISIONS-NEEDED.md` item 4 is updated: the "check
  runs at all" question is now resolved (yes, via this ADR); "is any-
  negative-any-severity the right bar" remains open, since no DepEd
  citation was found either way.
- If a Guidance Counselor role or a genuinely divergent read need for
  this data is ever added, `authorize_child_protection_access_for_section`
  is still the fork point per ADR-0083 -- this batch introduces no new
  authorization function and does not change that decision.
- No new dependency. No schema change (migrations 57-58 from ADR-0083
  already cover everything this batch's query needs).

## Verification

- `src/domain/anecdotal-record.test.ts`: `isDisqualifyingAnecdotalCategory`
  treats `negative` as disqualifying, `positive`/`neutral` as not.
- `src/domain/award-eligibility.test.ts`: eligible-with-no-anecdotes,
  excluded-with-a-disqualifying-category-anecdote, eligible-with-only-
  positive/neutral-anecdotes, `anecdotalRecordsChecked` always `true`,
  combined-failure-reasons case.
- `src/domain/certificate.test.ts`: certificate build still refuses an
  ineligible learner, including one excluded solely by the anecdote
  check; disclosure text assertions updated to the new copy.
- `src/application/anecdotal-record-service.test.ts`: new
  `hasDisqualifyingRecordForLearner` tests (queries only the
  disqualifying category set, trims/validates section id, learner id,
  and date).
- `src/infrastructure/tauri/anecdotal-record-repository.test.ts`: new
  `hasCategoryForLearner` invokes `has_anecdotal_category_for_learner`
  with every field.
- `src/ui/CertificateAwardScreen.test.tsx`: updated disclosure-text
  assertions; new tests for the excluded-by-anecdote case and the
  still-eligible-with-no-anecdote case.
- `cargo test --lib anecdotal_record` (repository::anecdotal_record +
  commands::anecdotal_record, including sync_tests and
  conflict_review's typed-preview test): new
  `has_any_category_for_learner_in_section` repository tests (true on a
  matching record, false with only positive/neutral, false with no
  records, empty-category-list short-circuit, section/learner scoping);
  new `check_anecdotal_category_for_learner` command-layer tests
  (authorized adviser true/false, empty-category-list rejected). All
  pass -- see `docs/CURRENT-HANDOFF.md`'s Batch 13 entry for the exact
  counts and commit.
- `cargo clippy --all-targets -- -D warnings`: clean. `cargo fmt
--check`: clean.
- `npm run quality` (typecheck, lint, format:check, check:architecture,
  check:deadcode, test): see `docs/CURRENT-HANDOFF.md`'s Batch 13 entry
  for the exact pass/fail counts run this session.
- `npm run check:architecture`: confirms `src/domain/award-eligibility.ts`
  still imports nothing from `src/application/**` or
  `src/infrastructure/**`.
