# PR #55 Salvage Inventory

Source: archived PR #55 head `fdcdabf1ec65f214444a294cd50770dc6f6162cf`.

This inventory classifies the major work visible in PR #55. It is a recovery index, not proof that any archived implementation is production-ready.

## Recover first if the gap still exists

| Area | Class | Required proof before adoption |
| --- | --- | --- |
| School-logo content validation | P0 security/correctness | Confirm current `main` still lacks real byte-signature validation; add focused tests |
| Trusted-boundary authorization fixes | P0 security/correctness | Compare current commands/capabilities; fresh negative authorization tests |
| Migration/data-loss protections | P0 correctness | Migration path/idempotency/recovery tests against current schema |
| Backup / DR | P1 core reliability | Encrypted-data handling, backup exposure, restore drill, failure recovery |
| Sync correctness / resilience | P1 core reliability | Offline writes, replay/idempotency, authorization scope, recovery |
| Master Teacher RBAC + two-tier grade review | P1 core SIS | Fresh independent auth/security review; self-approval denial; role/scope tests |
| Transfers registry | P1 learner lifecycle | Required workflow, school/section scope, history correctness |
| SF8 / nutrition | P1 compliance-sensitive | Current DepEd evidence, domain tests, authoritative form/data mapping |
| Child-protection authorization | P1 security-sensitive | Strict least privilege, local-data protection, audit/recovery expectations |
| Configurable sync hub address | P1/P2 infrastructure | Current topology need, secure transport/credential handling, safe defaults |

## Gated optional recovery

| Area | Class | Gate |
| --- | --- | --- |
| Microsoft 365 / SharePoint school repository | P2 optional adapter | Fresh OAuth/token-custody/egress security review; school tenant availability; offline independence |
| Grade-review UI / oversight | P2 | Core RBAC/domain accepted first |
| Anecdotal / guidance records | P2 | Release-scope admission + privacy/authorization review |
| Award eligibility using anecdotal data | P2 | Verified policy source and conservative business-rule review |
| Scholastic workbook importer | P2 | Real workflow need + import validation/rollback tests |

## Archive unless later admitted

Weather/hazard UI, ID card/QR, seating chart, visual timetable extras, palette/theme experiments, certificates/awards extras, and other peripheral productivity modules remain reference-only until they satisfy the current Focused 1.0 feature-admission rule.

## Never restore

Claude-specific control-plane files, obsolete `.claude` hooks/settings/skills, stale model-routing assumptions, conflicting old memory/plans, duplicate implementations already superseded on `main`, or features justified only by sunk cost.

## Recovery mechanic

Use `archive/pr55-pending-tasks-batch` as read-only source material. Implement each accepted item as a small branch from current `main`. Prefer reconstructing intent into the current architecture over mechanically merging the archived branch.
