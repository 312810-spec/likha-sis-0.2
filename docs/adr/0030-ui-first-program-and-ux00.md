# ADR-0030 — UI-First World-Class Product Program and UX-00

Status: Accepted

## Context

Explicit new user direction (2026-08-25), given as a single comprehensive
prompt naming itself the "LIKHA-SIS 0.2 — UI-First World-Class Product
Program." It supersedes the prior autonomous feature-selection default
(the post-sequence evidence-based scoring pass,
`docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md`) until an 8-item
UI tranche (UX-00 through UX-08) completes, and extends the existing
"commit and sync after every milestone" instruction to "commit and push
at both the START and COMPLETION of every milestone." The baseline
checkpoint the user named (`5b6e4d1`, "test: pilot proptest on the
account-lockout invariant") was independently verified against actual
`git log`/`git fetch` output before any action — it matched exactly,
both locally and against `origin/main`.

This ADR records the direction itself and the concrete decisions made
while starting UX-00 ("Progress Map Repair + Impeccable Pilot + Visual
Baseline").

## Decisions

### 1. Impeccable: installed, hook-free, with one real correction

The user's prompt asserted `impeccable@4.1.1` as the current npm
version. **Verified against the actual npm registry before installing
anything** (this project's own established discipline — see the
Graphify rejection precedent in `docs/SOURCE-REGISTRY.md`): the npm
package `impeccable` (maintainer `paulbakaus`, repository
`github.com/pbakaus/impeccable`, Apache-2.0) is real and legitimate, but
its published npm version is **3.6.0**, not 4.1.1 — no 4.1.1 exists on
the registry. The discrepancy resolves cleanly, not as an error: the
_skill's own internal version field_ inside its `SKILL.md` frontmatter
independently declares `version: 4.1.1` — a separate versioning scheme
from the npm package's semver. Installed via
`npx --yes impeccable@3.6.0 install` (the real, current npm version).

**A real problem was caught and fixed, not glossed over**: despite no
`--no-hooks`-equivalent flag existing in this installer version (the
user's prompt assumed one from the nonexistent 4.1.1 CLI), the installer
silently wrote a `PostToolUse` + `Stop` hook into
`.claude/settings.local.json` (machine-local, gitignored — never would
have reached the shared repo, but still an active hook in this session,
directly violating the prompt's explicit "HOOK-FREE install" /
"Do not add a ... hook" requirement). Caught immediately by inspecting
`.claude/settings.local.json` right after install (not assumed safe),
and removed by deleting that file, restoring a genuinely hook-free
state. `.claude/settings.json` (the shared, tracked LIKHA harness config)
was never touched by the installer — confirmed via `git diff`. This
matches the prompt's own fallback instruction: "If installation attempts
to overwrite existing LIKHA harness files, stop that installation path
and choose the smallest safe project-local integration" — the skill's
command/reference files remain installed and usable
(`.claude/skills/impeccable/`); only the automatic hook wiring was
removed.

Recorded in `docs/SOURCE-REGISTRY.md` (see that file for the full
entry). LIKHA's own `premium-teacher-ui` and `accessibility` skills
remain the authoritative design/accessibility source of truth throughout
the UI program — Impeccable is used as a critique lens per the user's
own framing ("Impeccable is a design partner and critique lens. LIKHA's
product rules, security requirements, teacher modes, architecture, and
DepEd correctness remain authoritative"), never a competing one.

### 2. Visual-verification path: a real bug fixed, a layered strategy formally selected

Before this session, `.claude/launch.json` declared the dev server's
port as `5173`. **This was wrong** — Vite/Tauri's actual devUrl is
`1420` (confirmed directly from `npm run dev`'s own startup log this
session: `Local: http://localhost:1420/`). This silently broke every
`preview_start`/`navigate` attempt against the Browser pane tool this
session and, per the transcript, in at least one prior session too (the
prior "navigation ... was denied or failed" note recorded as a standing
limitation was this misconfigured port, not a fundamental tool
limitation). **Fixed**: `.claude/launch.json`'s port corrected to
`1420`.

With the port fixed, the Browser pane tool genuinely works against the
real `vite dev` server: `navigate`, `get_page_text`, `read_page`, and
`read_console_messages` all returned real, useful output this session
(confirmed the login screen renders with its expected "no Tauri IPC
bridge" console errors — the same benign, already-documented behavior
noted in the M12c session, not a new bug). **Pixel-level screenshot
capture remains blocked this session** — `computer screenshot` reports
"the Browser pane is not displayed, so the page is not compositing
frames," a client-side display state in the user's own harness UI that
no tool call can toggle. This is disclosed as a genuine, current
limitation, not silently worked around.

**Formal selection for the visual-verification path** (per the user's
own instruction that UX-00 must "finish or formally select" this,
rather than let every later milestone repeat the same open question):
a **three-layer strategy**:

1. **Structural/behavioral** (React Testing Library + `axe-core`) —
   already in place, unaffected by any of the above, remains the
   primary correctness gate for every screen.
2. **Browser-rendered DOM/text/console** (Browser pane against
   `vite dev`, now actually working after the port fix) — a real,
   immediately-usable layer for confirming rendered text, structure,
   and absence of console errors on the browser-renderable subset of
   the app (screens/flows that don't require a live Tauri IPC bridge).
   Pixel screenshots depend on the user displaying the Browser pane
   panel client-side; when unavailable, disclose it plainly per
   milestone rather than claiming visual completion.
3. **Native Tauri WebView2 binary** (`@wdio/tauri-service`) — still the
   selected future path (already classified PILOT in
   `docs/SOURCE-REGISTRY.md`/`docs/VERIFICATION-DEBT.md`), still not
   built out. Not attempted in UX-00 itself — a new E2E driver
   dependency needs the project's own 10-scenario decision process
   before adoption, which is real, separate work better sequenced once
   UX-01's shared component/shell work gives it something stable to
   drive, not decided from a standing start inside UX-00's own already-
   large scope. Scheduled as an explicit UX-01/UX-02 follow-up, not
   deferred indefinitely.

## Consequences

- `.claude/launch.json`: port corrected `5173` → `1420`.
- `.claude/skills/impeccable/`: installed, project-local, hook-free
  (verified via direct file inspection after install, not assumed).
- `.claude/settings.local.json`: the auto-installed hook removed;
  file does not exist (was gitignored either way, never reached the
  shared repo).
- `.claude/settings.json`: unchanged (confirmed via `git diff`).
- `docs/SOURCE-REGISTRY.md`: new Impeccable entry.
- `docs/PROGRESS-MAP.md`: new "UI-First Tranche (UX-00 → UX-08)" table,
  UX-00 marked ◐ In Progress, UX-01 through UX-08 ○ Queued. Legend
  updated to include "— Deferred" per the user's specified format,
  without rewriting the meaning of already-completed history's
  "Candidate" label.
- Full UX-00 checklist: `docs/ACTIVE-PLAN.md`'s new "UI-First Tranche"
  section (repairs the drift the user's prompt itself flagged: the
  prior ACTIVE-PLAN content had not kept pace with ADR-0021 through
  ADR-0029).
- Immediate resumption state: `docs/CURRENT-HANDOFF.md`.
- This ADR itself is the durable decision record for adopting the
  UI-first direction and the two concrete fixes above.
