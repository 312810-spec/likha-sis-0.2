# Scores history — component comparison contract

Base `7bea54ac4b3e26baea3f30fd02963d606ceb154e`; branch
`forge/scores-component-comparison-20261021`. Same Scores pilot, no new journey.
Read canonical state, current v4 adapter and latest verified handoff. PR150 remains
draft; its checkpoint Quality rerun is in progress and Security passed at resume.
Previous implementation receipts remain bound to80a6ebf. Preserve A1–A7.

## Observed gap and outcome

The existing history panel has no direct retry: its error asks the teacher to
close/reopen. Loading is plain text. Its data fetching belongs to LIKHA, not a
disclosure primitive. Reproduce the missing retry/focus/context cases before repair.
Improve read-only history recovery and truthful scoped loading without score writes.

## Frozen checks

| ID  | Required outcome                                                                                               | Evidence/coverage                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| H1  | No reads while collapsed; one read for open/retry/refresh; duplicate requests guarded                          | Real component tests with deferred/rejected synthetic services; browser request counts                              |
| H2  | Correct item/learner/service response only; stale/closed responses ignored; no score mutation                  | Deferred identity/service/unmount tests, real data-authority boundary unchanged                                     |
| H3  | Failed reads have one-action retry; retry retains keyboard focus across loading/success                        | Original failure reproduced; refined/candidate browser Enter/Space and focus assertions                             |
| H4  | Distinct loading/error/empty/history and snapshot wording; exact values/reason/authors; zero stays zero        | Component tests and same synthetic history/empty/error fixtures in both variants                                    |
| H5  | Accessible toggle/panel relationship, copyable content, focus, target size, contrast/reflow and reduced motion | Keyboard/touch, axe, bounds, actual internal renders across2 themes/3 densities/3 widths; manual AT NOT RUN         |
| H6  | Compare incumbent refinement and one actual Base UI candidate on identical model/content/CSS/tasks             | Pinned package/source/license, actual runtime/bundle measurements, preserved manifests; no adoption from popularity |
| H7  | Production dependency and behavior changes justified; relevant repository gates pass                           | Full JS quality/build/UI/recovery/score checks; no native source change; fresh CI where published                   |

Candidate: `@base-ui/react`1.9.0 Collapsible, npm-reported stable/MIT/React19
compatible. shadcn's documented Base UI Collapsible is the relevant composition
reference. Use the primitive with existing LIKHA tokens/CSS, not a Tailwind or
whole-app scaffold migration. Install only in the local experiment; restore/prune
unless actual evidence justifies production adoption. Inspect installed files/types
before API use. Rights and package cost are scoped to the installed candidate.

Compare the disclosure primitive with identical LIKHA-owned async model in both
variants. Separately compare the original missing-retry behavior with the repaired
model; do not attribute that improvement to a library. Report interaction counts,
errors, measured asset delta and maintenance cost; teacher comprehension remains
unmeasured. All hard checks must pass before any adoption. KEEP_BASE if benefits
are unsupported. Package unpacked size is not browser bundle cost.

No official records, native/schema/sync/permissions, deployment, main merge or
installed-device acceptance is implied. The full pilot stays INCONCLUSIVE while
required teacher/device/manual evidence is missing. Existing publication/gated
merge authorization persists; do not mass-merge prior branches.
