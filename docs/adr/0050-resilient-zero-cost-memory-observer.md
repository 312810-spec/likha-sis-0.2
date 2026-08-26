# ADR-0050: Resilient Zero-Cost Memory Observer + Project-Brain Hardening

Status: Accepted (engineering checkpoint — see "Verification debt" below)
Date: 2026-08-27
Wave: 2J ("Resilient Zero-Cost Memory Observer + Project-Brain
Hardening"). Harness/developer-infrastructure milestone — no
learner-facing functionality changed.

## Incident

`claude-mem` (an inference-backed, optional Claude Code plugin —
distinct from this project's own `docs/`-based memory) reported, for
~3 days: `"You've used your free-week inference allowance ($7)...
Your full allowance unlocks when your trial converts."` This is a
third-party plugin's own external-provider quota exhaustion, not a
LIKHA-SIS repository defect. The incident is the trigger for this
wave, not evidence of a bug in prior waves' work.

**Empirical finding, confirmed before any design work began**: across
every wave in this session (2G through 2I) — all of which ran entirely
during claude-mem's outage — `docs/PROJECT-MEMORY.md`,
`CURRENT-HANDOFF.md`, `ACTIVE-PLAN.md`, `VERIFICATION-DEBT.md`, and
every ADR were updated successfully, every time, with zero
degradation. This is because LIKHA's actual durable engineering memory
(`docs/*.md`, ADRs, git history — Layer 1, established since this
project's earliest sessions and documented in
`.claude/rules/project-state.md` and the `.claude/skills/project-memory`
skill) has never depended on claude-mem, or on any external inference
call, at any point. claude-mem's own hooks
(`~/.claude/plugins/cache/thedotmack/claude-mem/*/hooks/hooks.json`)
are wired as `async: true` `PostToolUse`/`Stop` hooks that call an
external `worker-service.cjs ... hook claude-code observation` /
`... summarize` process backed by OpenRouter inference — confirmed by
direct inspection of that file this wave. Being `async` and optional,
its failure never blocked a single tool call in this entire multi-wave
session (over 500 tool calls across Waves 2G–2I) — this is itself the
proof that ordinary Claude Code work was never gated on it, not merely
an assumption.

## Decision classification

`HARNESS_ARCHITECTURE + MEMORY + SECURITY + MAJOR_DEPENDENCY +
ZERO_BILLING` — the project's 10-scenario rule applies.

## Ten-scenario decision

(Recommended/Next Best only, per this project's own established rule
not to dump all ten.)

**Recommended (implemented): repository-brain-authoritative +
deterministic local journal; claude-mem disabled as an observer
entirely** (not merely "de-prioritized" — its global-config entry is
flipped to `false`). This is a stronger choice than "claude-mem plus a
local fallback," which was also scored: keeping a broken/optional
provider anywhere in the write path would have required building the
full five-state machine (§7 of the directing brief) and a circuit
breaker (§9) around a call this architecture simply never needs to
make. Per the brief's own §6 ("Prefer elimination over replacement"):
_"Can this workflow be eliminated... Prefer one excellent maintainable
pattern over another elaborate agent subsystem"_ — that is the
question this decision actually turns on, and the answer is that an
inference-powered continuous observer is not required for LIKHA's
current scale. **If no external inference call is ever in the
persistence path, most of the state machine describes states this
architecture cannot enter** — documenting that absence is a stronger,
more honest answer than building a working circuit breaker for a
provider that is never called.

**Next Best**: `claude-mem` retained as enabled, wrapped in a
genuinely bounded circuit breaker (open on 401/403/429/5xx/quota,
`LOCAL_ONLY` fallback). Rejected for now — building and testing a real
circuit breaker around a third-party plugin's own internal hook chain
(which this project doesn't control or vendor) is materially more
implementation and test surface than the elimination path, for a
capability (LLM-summarized "episodic" observations) this project has
never actually needed to make any of its waves succeed.

**Switch condition**: if a future session finds the local
journal/recall system (Layer 2, below) genuinely insufficient for
recovering useful engineering context — evidenced by, not assumed —
revisit claude-mem (or another observer) as bounded, circuit-breaker-
protected OPTIONAL enrichment, never as a re-introduced dependency of
the write path.

### Candidates considered and their evidence

- `d2a8k3u/claude-code-memory`: investigated per the brief's explicit
  instruction. **REJECT for adoption this wave** — introducing a new
  third-party memory dependency (with its own maintenance risk,
  embedding/model requirements, and integration surface) directly
  contradicts §6's elimination-first instruction when a
  zero-dependency deterministic journal already satisfies Layer 2's
  target capabilities (local durable storage, full-text retrieval,
  deterministic capture, dedup, typed memories, health checking,
  bounded context, export/rebuild, clean rollback — see below). No
  local embedding requirement was found to be justified for this
  project's current scale, so the comparison surface (embedding
  implementation, model downloads) that would differentiate this
  candidate from a plain grep-based recall is not currently relevant.
  Classified **REFERENCE** (worth re-reading if Layer 2 recall proves
  insufficient) rather than **REJECT** outright, since no defect was
  found in it — it was simply not needed.
- claude-mem itself: classified **PILOT** (already installed,
  disabled this wave, data preserved) rather than **REJECT**, per the
  brief's explicit "do not delete existing claude-mem data" and the
  switch condition above — it remains available to re-enable as
  optional enrichment if evidence later supports it.

## Non-negotiable memory hierarchy (implemented as specified)

**Layer 1 — canonical project brain** (unchanged by this wave, its
authority reinforced by this ADR): `docs/PROJECT-MEMORY.md`,
`CURRENT-HANDOFF.md`, `ACTIVE-PLAN.md`, `SOURCE-REGISTRY.md`,
`VERIFICATION-DEBT.md`, ADRs, `.claude/skills/project-memory`, git
history. No plugin database becomes LIKHA's source of truth — this was
already true before this wave and remains true after it.

**Layer 2 — zero-cost local observation/retrieval** (new this wave):
`scripts/memory/journal.mjs` (deterministic capture + replay-safe
dedup), `scripts/memory/recall.mjs` (grep-based, verbatim retrieval —
no embeddings, no LLM), `scripts/memory/health.mjs` (deterministic
diagnostic, no network/LLM call), wired via a project-scoped `Stop`
hook (`.claude/settings.json`) calling
`scripts/memory/capture-session-stop.mjs`.

**Layer 3 — optional enrichment**: claude-mem, now disabled via
config (`~/.claude/settings.json`'s
`enabledPlugins["claude-mem@thedotmack"] = false`), data preserved,
not uninstalled. **Disclosed limitation, per independent security
review (Wave 2J)**: this is a configuration-only change, not
empirically live-tested this session — the cached plugin's own
`hooks.json` unconditionally defines its `SessionStart`/
`UserPromptSubmit`/`PostToolUse`/`Stop` hooks with no internal check of
`enabledPlugins`; whether Claude Code's host-level plugin loader
actually suppresses them is host behavior this repository cannot
directly verify by reading files. Flipping this flag is the standard,
documented mechanism for disabling a plugin, so relying on it is
reasonable, but it is recorded here as unverified rather than
confirmed — see `docs/VERIFICATION-DEBT.md`. Regardless of whether
claude-mem's own hooks still fire, **LIKHA's own repository memory
does not depend on their outcome either way** — external inference
availability no longer determines, and per the empirical finding
above never actually did determine, whether LIKHA remembers important
engineering work.

## Required failure architecture (§7)

Mostly N/A by construction, not by omission.

The brief requires an explicit `HEALTHY / LOCAL_ONLY / DEGRADED /
DISABLED / RECOVERING` state machine recognizing allowance exhaustion,
401/403/429/5xx, DNS/timeout, daemon unavailable, malformed response,
context overflow, embedding-model unavailable, and local-DB failure.

Under the Recommended architecture: **`scripts/memory/journal.mjs`,
`recall.mjs`, and `capture-session-stop.mjs` make zero network calls
and zero inference calls.** There is no provider to time out, return
429, or exhaust a quota against, because none is ever invoked in the
write or read path. The operating mode is therefore always and only
`LOCAL_ONLY` — not as a fallback state reached after a failure, but as
the system's only state, by design. `scripts/memory/health.mjs`
reports this explicitly (`operatingMode: "LOCAL_ONLY (permanent, by
design...)"`, `circuitBreaker: "N/A -- no external inference call
exists in the write path to trip a breaker"`).

The failure modes that DO remain real and are handled:

- **Local memory database failure** (journal dir unwritable, disk
  full, permissions): `appendObservation` catches every filesystem
  error and returns `{ written: false, error }` — it never throws, and
  the calling hook (`capture-session-stop.mjs`) is itself wrapped in a
  fail-open `try/catch` that always exits `0`. Proven by
  `journal.test.mjs`'s corrupted-line and dedup tests.
- **Corrupted local index**: a malformed JSONL line in the journal is
  skipped (`try { JSON.parse } catch { /* skip */ }`), never thrown,
  and never breaks reading the rest of the file — proven by
  `journal.test.mjs`'s "a corrupted journal line is skipped" test.
- **claude-mem's own failure** (the actual incident): no code path in
  THIS repository depends on its success — its hooks are `async` and
  its plugin entry is now disabled. Whether Claude Code's host-level
  plugin loader still technically invokes its now-disabled hooks is a
  separate, disclosed, unverified question (see "Layer 3" above) —
  irrelevant either way to this repository's own memory, but not
  claimed here as "structurally irrelevant to Claude Code's operation"
  as an earlier draft of this ADR overstated, per independent security
  review.

For claude-mem specifically (kept disabled, not deleted), the original
incident's failure class — allowance/quota exhaustion — is exactly the
kind of failure §9's circuit breaker describes. This wave's answer is
not "we built a breaker for it" but "we removed it from every path
where its failure could matter to this repository's own memory,"
which is the stronger guarantee the brief's own §6 asks to be
considered first.

## Idempotency and recovery (§10)

`deterministicId({ project, sessionId, type, content })` = SHA-256 of
the normalized (whitespace-collapsed) tuple — never a timestamp.
`appendObservation` checks `existingIds()` (built from every existing
journal file, not just today's) before writing, so:

- Replay of the identical event does not duplicate (proven:
  `journal.test.mjs`, "replaying the exact same event").
- A fresh process (simulating a restart) re-importing the module and
  replaying the same event still deduplicates against the on-disk
  journal (proven: "a restart... still deduplicates").
- Distinct content is retained as distinct observations (proven:
  "distinct content produces distinct... observations").

## Memory taxonomy and noise rejection (§11)

This wave implements exactly one type (`episodic`, captured at session
`Stop`) — deliberately narrow rather than the full six-type taxonomy
the brief lists, per §6's elimination-first instruction: a
`decision`/`pattern`/`procedure`/`failure-lesson` type would need a
promotion/curation step (§13) this wave did not build a UI/workflow
for, and an unused taxonomy slot is noise, not readiness. What IS
captured is itself narrow by construction: git HEAD sha+subject
(public repo metadata) and changed file PATHS ONLY — never Bash
output, never file contents, never environment variables, never
routine command output, never raw tool output. There is structurally
nothing in the capture path capable of ingesting a greeting, a build
log, or synthetic test data, because the capture script never reads
any of those sources in the first place.

## Verification debt is memory (§12) — the highest-value test in this

wave

`scripts/memory/recall.test.mjs`'s "NOT_VERIFIED must never be
corrupted" suite runs against the REAL `docs/VERIFICATION-DEBT.md` (not
a fixture, so it can't pass while the real doc silently drifted) and
proves:

- `verificationDebtSnapshot()` returns the file byte-identical to what
  `readFileSync` returns directly — no transformation of any kind.
- `recall("NOT_VERIFIED")` returns matches that are verbatim substrings
  of their source file (asserted by re-reading the source line and
  comparing exact string equality, not merely "contains").
- SF1 fidelity, SF9 fidelity, and Windows packaging are each
  independently confirmed still recoverable as `NOT_VERIFIED` via
  direct regex against the live debt document.
- None of the canonical docs contain a specific list of fabricated
  "corrupted" phrasings (e.g. `"SF9 fidelity: PASSED"`) that a
  paraphrasing summarizer could introduce — this is the regression
  guard against ever replacing this wave's grep-only `recall.mjs` with
  something that generates text.

This is possible specifically because recall/health are grep-based,
never LLM-based — the architectural choice in the "Ten-scenario
decision" above is what makes this guarantee provable at all, not an
add-on to a summarizing design.

## Memory promotion (§13)

Not built this wave — no automatic promotion pipeline exists from the
Layer-2 journal into Layer-1 docs. This is a deliberate scope cut, not
an oversight: the brief's own §6 favors elimination, and an
unimplemented, untested "observation → candidate → curator → ADR/
PROJECT-MEMORY/etc." pipeline would be exactly the "elaborate agent
subsystem" §6 warns against building without evidence it's needed. The
existing human/Claude-driven pattern (a session ending a milestone
manually updates the four canonical docs, per
`.claude/rules/project-state.md`) continues unchanged and remains
Layer 1's actual promotion path.

## Budget protection (§14)

- `recall()`: `maxResults` defaults to 50 (bounded).
- Journal capture: exactly one `episodic` record per session `Stop`
  event (bounded to 1 write/session, not unbounded per-tool-call).
- No embedding computation anywhere (zero embedding budget by
  construction).
- No external inference call anywhere in this wave's new code (zero
  external-call budget by construction — not "defaults to zero," it
  IS zero).
- No paid API/provider is enabled by this wave; no payment method is
  required for any of Layer 1 or Layer 2 to function.

## Security requirements (§15)

Threat-modeled directly against the capture path
(`capture-session-stop.mjs`):

- **Reads**: git HEAD sha/subject (`git log`/`git rev-parse` — public
  repo metadata) and `git status --porcelain` (changed file PATHS
  only). **Never** reads file contents, Bash tool output, or
  environment variables.
- **Writes**: one gitignored JSONL file per UTC day under
  `.claude/memory/journal/`.
- **Leaves the device**: nothing. No network call exists in
  `journal.mjs`, `recall.mjs`, `health.mjs`, or
  `capture-session-stop.mjs` — confirmed by direct code review (no
  `fetch`/`http`/`https` import anywhere in `scripts/memory/`).
- **Provider receives**: nothing (no provider is called).
- **Secrets in the journal**: structurally prevented for env
  vars/file contents (never read in the first place); as defense in
  depth, any changed-file path matching `/secret|credential|\.env(\.|$)/i`
  is dropped from the recorded path list entirely before the journal
  write, not merely redacted after.
- **Git-ignored**: `.claude/memory/` added to `.gitignore` this wave —
  verified via `git status` after the hook's first real fire produces
  no untracked-file prompt for the journal.
- **Other-local-user accessibility**: unchanged from every other file
  this project already writes under the repo's own `.claude/`
  directory — inherits the same OS-level file permissions as the rest
  of the working tree; no new sensitivity class introduced.
- **Logs**: `health.mjs`'s report prints only fixed labels, counts,
  and status strings — proven never to contain a token/base64-shaped
  string by `health.test.mjs`.
- **Learner PII**: this is a harness/developer-infrastructure system;
  it never reads application data (SQLite, learner records) at all —
  there is no code path by which learner PII could enter the journal.

## Memory health UX (§16) / SessionStart guard (§17)

`scripts/memory/health.mjs` / the `/memory-health` skill
(`.claude/skills/memory-health/SKILL.md`) implements the report shape
the brief specifies, computed entirely from local filesystem state and
one static config read (never a live probe of claude-mem, which would
itself require the network/inference call this design eliminates). No
LLM call is made to determine health. A `SessionStart` hook was
considered but not added separately — `/memory-health` already
provides an on-demand, zero-cost check, and Layer 2's failure modes
are already fail-open (§7), so there is nothing for a SessionStart
probe to preemptively degrade gracefully FROM — the system has no
"external observer down, must fall back" transition to perform, since
it never depends on the external observer to begin with.

## Targeted recall (§18)

`recall(query, { maxResults })` is substring/line-based, not a bulk
dump — a caller (or the `memory-health` skill's guidance) passes a
specific query (a task keyword, an ADR number, `"NOT_VERIFIED"`) and
gets back only matching lines with their source, never entire files.

## Required failure tests (§19) — coverage against the 22-item list

Of the 22 failure scenarios listed, the ones requiring a live external
provider (quota exhausted, trial expired, 401/403/429/5xx, DNS/network
failure, timeout, daemon unavailable, malformed inference response) are
**not independently reachable in this architecture** — there is no
external-provider call for them to occur against. Documenting that
absence (with the code-review evidence above: no network import
anywhere in `scripts/memory/`) is this wave's answer for those items,
consistent with the "N/A by construction" framing throughout this ADR.
Actually implemented and passing (`scripts/memory/*.test.mjs`, 22
tests, all passing):

1. Everything healthy — `health.test.mjs`.
2. Local DB (journal) unwritable — `health.mjs`'s
   `checkLocalJournalWritable` probes with a real write+delete; a
   permissions failure is caught and reported `DEGRADED`, not thrown.
3. Corrupted local index, recoverable — `journal.test.mjs`.
4. Process restart with queued/replayed observations — `journal.test.mjs`.
5. Duplicate event replay — `journal.test.mjs` (multiple angles).
6. Observer (claude-mem) deliberately disabled — this IS the shipped
   configuration; `health.mjs`'s `checkExternalObserver` reports it
   correctly against the real global settings file.
7. Local memory conflicts with an ADR / incorrectly claims SF9/Windows
   fidelity verified — `recall.test.mjs`'s "NOT_VERIFIED must never be
   corrupted" suite (the highest-value test this wave, see above).

## Performance measurements (§20)

Measured against this repository's real `docs/` (not synthetic):

- `node scripts/memory/health.mjs`: completes in well under 500ms
  (asserted directly in `health.test.mjs`'s timing test — actual local
  run: consistently under 50ms).
- `npx vitest run scripts/memory`: 22 tests, ~0.3s test execution time
  (see `journal.test.mjs`/`recall.test.mjs`/`health.test.mjs` run
  output this wave).
- `npm run quality`'s full frontend suite grew from 438 to 460 tests
  (22 new) with no measurable change to the suite's overall wall-clock
  duration.
- Journal write: a single `appendFileSync` call per session `Stop`
  event — no batching, no queue, no async work to measure separately.
- Context injected by `recall()`: bounded to `maxResults` (default 50)
  matched LINES, not files — a query against this repository's current
  `docs/` returns well under 1KB of text for a typical query (see
  `node scripts/memory/recall.mjs "NOT_VERIFIED"` output this wave: 10
  lines for a maximally broad query).

## Rollback/rebuild (§21)

- **Disable the new Layer-2 observer**: remove the `Stop` hook entry
  from `.claude/settings.json` (or delete
  `scripts/memory/capture-session-stop.mjs`). No other file depends on
  it.
- **Disable external enrichment**: already done this wave
  (`enabledPlugins["claude-mem@thedotmack"] = false` in
  `~/.claude/settings.json`); re-enable by flipping it back to `true`.
  **claude-mem's existing data was not deleted this wave** — its
  storage under `~/.claude/plugins/data/claude-mem-*` is untouched.
- **Restore prior hooks**: this wave only ADDED a `Stop` hook entry; no
  existing hook in `.claude/settings.json` was modified or removed.
- **Export local memories**: `.claude/memory/journal/*.jsonl` is
  plain, human-readable JSON Lines — copy the files directly, no
  export tool needed.
- **Rebuild the local index from repository truth**: there is no
  separate index to rebuild — `recall()` reads `docs/*.md`/ADRs
  directly at query time, and the journal is additive/disposable; the
  system is trivially "rebuilt" by having a git checkout at all.
- **Clear disposable indexes safely**: `rm -rf .claude/memory/` is
  always safe — it is gitignored, contains no canonical facts, and
  nothing else in the repository reads from it except `recall.mjs`/
  `health.mjs`, both of which handle an absent/empty journal
  gracefully (proven: `recall.test.mjs`'s "unmatched query returns
  empty array", `health.mjs`'s existence checks).
- **Files that must remain gitignored**: `.claude/memory/` (added this
  wave).

## Independent review

Two reviews were dispatched this wave, in parallel (not sequentially,
correcting Wave 2I's own disclosed process gap): a security review
(capture-path data flow, secret-filtering correctness, gitignore
coverage, global-settings-file change blast radius) and a
failure-mode/silent-failure review (fail-open correctness, dedup
correctness under concurrent/interleaved writes, whether any code path
could silently drop or corrupt an observation). An architecture/harness
review (the third role the brief's §23 asks for, at minimum alongside
these two) was **NOT dispatched this wave** — recorded honestly as
retained verification debt below, per the brief's own explicit
instruction not to let an undispatched review role disappear from the
final report the way Wave 2I's own report under-recorded review debt.

**Both reviews' first replies came back as content-free stubs** (a
recurring reviewer-retrieval issue this project has hit before, in
Wave 3) — recovered in full via the established protocol (raw
JSONL-transcript parse, then a `SendMessage` retry demanding complete
text). Real findings, evidence-based, were recovered for both.

**Security review: no `BLOCKING` findings.** Three `NON-BLOCKING`
items, all fixed or corrected this wave:

- Commit-subject line (`git log -1 --pretty=%s`) was captured verbatim
  into the journal with no sensitive-content filtering, unlike changed-
  file paths. **Fixed**: `capture-session-stop.mjs` now redacts the
  subject if it matches the same sensitive-pattern check
  (`redactIfSensitive`).
- ADR-0050 overstated certainty that disabling claude-mem's
  `enabledPlugins` entry actually stops its cached hooks from firing —
  the plugin's own `hooks.json` doesn't itself check that flag; whether
  Claude Code's host-level loader honors it wasn't empirically
  live-tested this session. **Corrected**: this ADR's "Layer 3" section
  now states this plainly as an unverified, disclosed limitation rather
  than a settled fact (see "Remaining verification debt").
- The module doc comment's "any error here is swallowed" claim in
  `capture-session-stop.mjs` was broader than the code actually
  guarantees (a crash during the module's own top-level import isn't
  self-caught). **Fixed**: the comment now names this specific,
  low-probability exception explicitly.

**Failure-mode review: two real, concrete gaps found and fixed**
(distinct from the security review's items — see `scripts/memory/
journal.mjs`'s and `journal.test.mjs`'s current content for the fixes
in place, not merely described here):

- **Truncated mid-write JSONL could silently destroy the NEXT valid
  observation, not just the truncated one.** `appendObservation` never
  checked whether the journal file already ended in a newline before
  appending; a process killed mid-`appendFileSync` could leave a file
  without a trailing `\n`, and the next append would concatenate
  directly onto those truncated bytes, merging two records into one
  unparseable line — silently losing both. **Fixed**: `appendObservation`
  now checks the target file's last byte and prefixes a `\n` when
  needed, so a truncated prior write can never merge with a fresh one.
  Proven by a new test that reproduces the exact scenario (a file
  containing an unterminated record, followed by a normal
  `appendObservation` call) and confirms the new observation is still
  recoverable.
- **`computeHealth()` was not actually crash-safe against a
  directory-level read failure.** `existingIds()`/`readAllObservations()`
  only caught per-line `JSON.parse` errors, not the surrounding
  `readdirSync`/`readFileSync` calls — a permissions error or a TOCTOU
  race (the journal directory deleted/locked between the existence
  check and the read, plausible on Windows via antivirus locking) would
  throw uncaught through `computeHealth()` and crash the whole
  `/memory-health` report instead of degrading one field, contradicting
  this ADR's own graceful-degradation framing. **Fixed**: both functions
  now wrap their directory/file-level reads in their own try/catch,
  matching `appendObservation`'s existing per-write discipline — a read
  failure now degrades to "fewer/no observations returned," never an
  uncaught throw. Proven by a new test that puts a FILE where the
  journal directory is expected (causing `readdirSync` to throw
  `ENOTDIR` portably, including on Windows) and confirms `computeHealth()`
  still returns a report.

Also flagged (informational, not a defect, characterization only): the
review noted that `recall.test.mjs`'s "NOT_VERIFIED must never be
corrupted" suite is, given the current grep-only implementation, closer
to a regression/invariant-pinning test than a test of a presently
inducible failure — there is no code path in `recall()` capable of
corrupting text today, so the test can't currently fail short of grep
itself breaking. This is accurate and doesn't change this ADR's
characterization of the suite's _forward-looking_ value: it exists
specifically to catch a future regression if `recall()` were ever
replaced with something that summarizes or paraphrases, which remains
its real purpose.

Two additional non-blocking, informational items from the failure-mode
review, not fixed this wave (recorded as debt below): `existingIds()`
re-scanning every historical journal file on every write is unbounded
design debt (currently far under the Stop hook's 10s timeout, untested
at large scale); a cross-process double-invocation of the Stop hook
(two separate OS processes racing on `existingIds()`/`appendFileSync`
non-atomically) was identified as a theoretical, unconfirmed gap — no
evidence found that Claude Code's harness can actually double-fire a
single Stop event, but not disproven either.

## Remaining verification debt

- Architecture/harness review role (§23) not dispatched this wave —
  retained, not dropped.
- **claude-mem's disable is configuration-only, not empirically
  live-tested** — flipping `enabledPlugins["claude-mem@thedotmack"]` to
  `false` is the standard, documented mechanism, but no live smoke test
  (trigger a Stop event, confirm no fresh claude-mem worker-service
  activity) was run this session to confirm it actually suppresses the
  plugin's cached hooks. Recommended follow-up, not blocking: run that
  smoke test in a future session.
- **Unbounded journal growth** — `existingIds()`/`readAllObservations()`
  re-read every historical journal file on every access; currently
  trivial (well under the Stop hook's 10s timeout) but untested at
  large scale (thousands of accumulated lines). Revisit if journal size
  ever becomes large enough to matter (add a rotation/date-range bound).
- **Cross-process double-invocation of the Stop hook** — if Claude
  Code's harness ever fires a single Stop event as two concurrent OS
  processes (not confirmed possible, not disproven either), `journal.mjs`'s
  check-then-write dedup is not atomic across processes and could in
  principle produce two journal lines for one event. Low-priority,
  theoretical; no evidence this is reachable in practice.
- No SessionStart-specific health probe was added (see "§17" above for
  why this is a deliberate design choice, not an oversight) — if a
  future session finds this insufficient, add one.
- Memory promotion pipeline (§13) not built — Layer 1 updates remain
  manual/Claude-driven, unchanged from every prior wave.
- Local embeddings remain deliberately `DISABLED` — no evidence
  reviewed this wave justified adding one; revisit only with concrete
  evidence grep-based recall is insufficient.
- The global `~/.claude/settings.json` change (disabling claude-mem)
  affects every project on this machine, not only LIKHA-SIS — disclosed
  plainly here and in the final report; the user should be aware this
  is a machine-wide, not repository-scoped, change (though fully
  reversible).
- All Wave 2I verification debt (SF1 fidelity `NOT_VERIFIED`, SF9
  fidelity `NOT_VERIFIED`, Windows packaging `NOT_VERIFIED`, 3 of 4
  Wave 2I review roles undispatched) remains fully intact and
  unweakened by this wave — confirmed by `recall.test.mjs`'s own tests
  reading the live `docs/VERIFICATION-DEBT.md`, and by direct human
  re-read of that file during this wave's documentation step.
