# LIKHA-SIS 0.2 — Offline Contract

Status: approved product direction for D1 strong classroom-offline guarantee

Date: 2026-09-15

## Product promise

Loss of internet must not stop ordinary authorized classroom work that the device has already been provisioned to perform.

“Offline-capable” does not mean every administrative operation works without a network. It means LIKHA clearly separates:

- work that is **local and immediately safe**;
- work that is **saved locally but waiting to synchronize**;
- work that **requires online authority**;
- work that is **blocked because the device is no longer authorized or lacks required scope**.

The user must never have to guess which of those states applies.

## Core classroom operations required offline

On an already-authorized device with the needed local scope, the following must continue without internet:

- sign in/unlock using the supported local session/credential path after initial provisioning;
- open Today from cached schedule/context;
- open assigned Class Workspaces;
- view locally authorized class rosters;
- record subject attendance;
- view/edit class-record work that is locally authorized and not administratively locked;
- create/edit assessment items and learner scores within the authorized class/term scope;
- view locally available learner information required for the teacher’s assigned work;
- open My Advisory when advisory scope is locally authorized;
- perform ordinary adviser attendance/data entry that is designed as a local-first workflow;
- save drafts/notes or equivalent local teacher work that belongs to implemented offline-first modules;
- navigate between already-cached classes and continue recent work;
- see locally available historical records within the device’s authorized scope;
- produce outputs that are explicitly supported by local data + local template/runtime availability.

Every write above saves to the local working database first. Network availability is not part of the success criterion for the local save.

## Operations allowed to require online authority in 1.0

The following may require connectivity because they change school-wide authority, identity, device trust, or shared structural state:

- first device/account provisioning;
- password reset or account recovery that requires school authority;
- inviting/creating/deactivating accounts where centralized authorization is required;
- changing roles/capabilities;
- registering/revoking trusted devices;
- receiving a newly assigned class/advisory scope not present locally;
- school-year activation/closing/rollover authority actions;
- school-wide structure changes that require synchronized conflict-safe authority;
- installing/updating authoritative form/template packs when not already present locally;
- cloud backup/restore or school export actions that inherently target remote infrastructure;
- operations whose current security design explicitly requires an online trusted boundary.

The UI must say **why** connectivity is required and what the user can still do offline.

## Save-state vocabulary

Teacher-facing state uses simple, consistent language. Suggested semantics:

### Saved on this device

The write has committed locally. The teacher may continue working.

### Waiting to sync

The local write is durable, but the latest version has not yet been acknowledged by the school synchronization boundary.

### Synced

The local write has been acknowledged by the school synchronization boundary for the relevant sync protocol state.

### Needs review

A domain-specific conflict or authorization change prevents automatic reconciliation. LIKHA explains the affected work and next action.

### Access changed

The user/device no longer has permission for this scope. LIKHA protects local data according to the deauthorization policy and does not continue accepting unauthorized writes merely because the device is offline.

Do not use vague “cloud saved” language when only local persistence has occurred.

## Offline duration

LIKHA must not invent a blanket promise such as “works offline forever.”

Ordinary work remains available while:

- the local authorization/session policy permits it;
- the device remains within its last-known authorized data scope;
- required local keys/data are available;
- no policy-controlled expiration/revalidation boundary has been reached.

Any future maximum offline authorization duration is a security decision and must be documented/tested. It may differ by device trust class but must not silently delete teacher work.

## Device-local scope

E1 permits personal Windows PCs and Android devices, but only with restricted encrypted local scope.

Default teacher device scope should be the minimum needed for current work:

- the teacher’s own active teaching assignments;
- learners needed for those assigned sections;
- the teacher’s active advisory section when applicable;
- relevant current/historical records required to perform authorized work;
- necessary reference/configuration data;
- local sync/audit metadata required for correctness.

A teacher device must not receive whole-school learner data merely because the UI hides it.

Broader administrative scopes require explicit capability and device-policy justification.

## Assignment/advisory changes while a device is offline

This is a required security scenario.

If a teacher loses an assignment/advisory while offline, the device cannot know immediately. Therefore:

1. local offline access follows the last safely provisioned authorization until the defined revalidation boundary;
2. on reconnect/revalidation, changed scope is processed before additional remote data is pulled;
3. writes created after central authorization changed are not blindly accepted;
4. the trusted boundary validates actor, school, assignment/advisory scope, record version, and payload;
5. rejected/stale work is preserved locally long enough for safe teacher/admin review where policy permits, rather than silently discarded;
6. data outside the user’s new authorized local scope is removed/cryptographically made inaccessible according to the device-deauthorization policy.

Exact retention/removal mechanics require the production security design and tests.

## Conflict behavior

There is no generic “keep mine / keep theirs” rule for sensitive records.

Each domain defines reconciliation behavior. At minimum:

- attendance conflicts explain date, class, learner/record context, and the conflicting changes without exposing unauthorized records;
- learner profile/identity corrections favor controlled authority and provenance over convenience;
- grades/scores preserve teacher work and require explicit resolution where concurrent edits cannot be safely merged;
- structural assignment/advisory changes are authority decisions, not ordinary content merges;
- closed-year records follow the historical correction workflow, not ordinary offline editing.

## Failure behavior

### App closes immediately after save

Committed local data must remain after restart.

### Network disappears during save

The local transaction determines save success. Network failure changes sync state, not the already-committed local result.

### Sync receives only part of a batch

Operations are idempotent and retryable. UI never claims the entire batch synced unless protocol evidence supports it.

### Device storage is full

LIKHA must fail the local write clearly and immediately; it must never display Saved if the transaction was not durable.

### Database cannot open/decrypt

Do not create a fresh empty database over the existing path and pretend data disappeared. Enter a recovery flow.

### Clock is wrong

Sync/order correctness must not rely on the client wall clock as the sole authority.

## Offline UX rules

- Connectivity is a small persistent status, not a blocking modal for ordinary work.
- No repeated “You are offline” interruptions after the state is already clear.
- Primary work actions remain in their usual places.
- A local-save indicator appears near the affected workflow when useful.
- Sync details are progressively disclosed; ordinary teachers see plain status, advanced/admin support can inspect diagnostics.
- Reconnect should be calm and automatic when safe.
- Conflicts surface only when action is required.
- “Needs Attention” may include unresolved offline/sync issues, but must state exactly what needs attention.

## Golden Journey acceptance tests

The reference journey is not accepted until synthetic-data testing demonstrates:

1. launch while internet is available, then lose connectivity before opening class;
2. Today still shows cached classes/schedule honestly;
3. open Filipino 8 Joy without network;
4. record subject attendance; close/reopen; attendance remains;
5. enter/edit scores offline; restart; work remains;
6. open learner context needed by the class without fetching unrelated learners;
7. switch to My Advisory offline when locally authorized;
8. connectivity returns and queued work synchronizes;
9. duplicate delivery does not duplicate attendance/scores;
10. a domain conflict becomes Needs Review with useful explanation;
11. revoked/changed assignment is rejected by trusted sync authority on reconnect;
12. unauthorized records are not newly pulled after scope change;
13. local work is not silently destroyed by a failed sync;
14. storage/database failure never results in a false Saved state;
15. UI clearly distinguishes Saved on this device, Waiting to sync, Synced, and Needs review.

## Privacy/test rule

All offline/sync development, screenshots, fixtures, conflict examples, logs, and AI prompts use synthetic learner/personnel data only until production-PII release gates are explicitly passed.
