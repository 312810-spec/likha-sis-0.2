# Shared design-system measurement contract

22 October 2026, Asia/Manila. PM-03/04 continuation from d00278602ed843b1a841b1830de35b891013a9a3. Preserve merged Scores repairs and current CTOS/FORGE4 scope.

Outcome: make existing semantic CSS/shared controls explicit and measured. Extract actual code/provider behavior, without introducing another theme authority or overwriting DESIGN.md. KEEP_BASE when required checks pass; repair only demonstrated affected failures.

| ID  | Required outcome and coverage                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS1 | Enumerate custom-property declarations with selector/conditional scope and source hash; distinguish root-active, component-local and print                                                  |
| DS2 | Correct light/dark/system preference, host resolution and existing density scales:3 preferences ×2 host schemes ×3 densities                                                                |
| DS3 | Computed semantic text/secondary/status/action contrast >=4.5 and focus/border >=3 on tested intended surfaces; axe; inactive-control opacity recorded separately                           |
| DS4 | Actual shared component/control styles and geometry, focus/hover/pressed/disabled/error/read-only/loading samples; normal/reduced motion ×DS2 =36 configurations;390/640/1280 reflow checks |
| DS5 | Actual preference changes preserve a synthetic unsaved input and focus; System follows host changes, explicit choice wins, preferences survive reload                                       |
| DS6 | Consumer/usage/state/motion specification with explicit task-owned exceptions and limits; catalog visuals do not certify production handlers/authority                                      |
| DS7 | Reproducible source-bound evidence, JS quality, production fixture-exclusion/build, applicable CI and actual publication receipts                                                           |

Use the project's existing WCAG2.2AA floor and24px target minimum. Ratios and catalog scans do not establish complete conformance. Busy/error/empty samples describe shared visuals/semantics; production services/async guards/announcements remain task-specific checks. No school-record write. Manual AT, OS zoom, teacher comprehension, installed Windows, Android, two-device exchange and full Scores A1–A7 remain separate/pending.

Freeze pair/state thresholds before edits. Do not add variants or remove checks to hide failures. Record actual failed pair/state and recheck affected consumers after any correction. This scope does not generalize to all81 UI files or every layout, brand/logo, print or native surface.
