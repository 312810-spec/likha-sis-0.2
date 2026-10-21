# FORGE 4 startup slice — security/CI amendment

This amends the execution scope without changing the frozen T1–T6 outcomes or
weakening A1–A7. Base published source `9775b22ad7385ff381578d494adb49da1ae306c7`,
tree `21bb3ce7056ed5436a53b79a39abb8177c87c045`, draft PR151 targeting PR150.
Explicit user approval on21 October includes verification/sync/merge/push.

## Trigger and independent evidence

Security run39604170717, OSV job119236001290 failed on exactly three Vite8.3.2
advisories: GHSA-587h-7wmj-h5pm, GHSA-698v-4r3x-3vcv and GHSA-r825-w8mm-5pxw.
GitHub's public advisory API confirms publication on20 October and first patch
8.3.3. The current npm registry `latest` is8.3.5. Select the supported current
stable8.3.5 per AGENTS rather than stopping at the minimum security patch.
No claim of exploitation or school-record exposure is made from a scan.

Source links:

- https://api.github.com/advisories/GHSA-587h-7wmj-h5pm
- https://api.github.com/advisories/GHSA-698v-4r3x-3vcv
- https://api.github.com/advisories/GHSA-r825-w8mm-5pxw
- https://github.com/312810-spec/likha-sis-0.2/actions/runs/39604170717

## Required additions

| ID  | Outcome                                                                                  | Required evidence                                                                            |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| T7  | Current stable Vite patch resolves the reported dependency findings without suppressions | Registry/lockfile agreement; fresh exact-source Security jobs pass; no scanner-policy change |
| T8  | Pre-React regression runs in future affected-UI CI for dev and built output              | Workflow executes both13-case probes after build; fresh CI step and receipt artifact succeed |

Use npm-generated exact pin/lockfile and preserve native source, existing security
policy, teacher data and upstream dependency PR chain. Transitive Vite build-tool
updates require fresh JS quality/build and relevant UI/startup/recovery/score checks.
Original8.3.2 results stay historical; rebind affected output hashes to8.3.5.

Do not merge while a required Security/Quality gate is failed or pending.
Teacher/device/manual full-pilot gates remain open independently of this maintenance.
