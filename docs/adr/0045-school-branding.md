# ADR-0045 — School Branding (Wave 1's remaining primitive)

Status: Accepted

## Context

Wave 1 ("Foundational primitives," `docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`)
scoped three primitives: RBAC, curriculum-versioning schema, and school
branding. Direct verification this session (`grep` for `user_school_roles`/
`curriculum_versions`/`Capability` in the real source, `cargo check --lib`)
confirmed RBAC and curriculum versioning were already built (2026-08-25,
ADR-0036/0037) — `docs/product/PRODUCT-CONTRACT.md` §3 was stale, still
claiming RBAC "not yet implemented," and was corrected as a separate,
preceding commit this session. **School branding was the one genuinely
missing piece of Wave 1.** This ADR records its implementation.

## A real environment fix, worth recording

`cargo check --lib` was previously blocked in this sandbox by two
compounding, purely local gaps, neither a codebase defect: the active
Rust toolchain was 1.94.1 against a dependency requiring 1.95+ (fixed
with `rustup update stable`, landing 1.98.0), and the Linux GTK/glib
system packages Tauri's webview backend needs at compile time were not
installed (fixed with the exact `apt-get install` list already recorded
in `.github/workflows/quality.yml`/ADR-0041 — `libwebkit2gtk-4.1-dev`,
`libxdo-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, and
friends). With both fixed, `cargo check`/`cargo test`/`cargo clippy` all
ran cleanly and fast in this session — a genuine capability several
recent milestones lacked (see `docs/VERIFICATION-DEBT.md`'s history).
This is a **per-machine fact, not a durable repository change** (matches
the existing gitleaks/osv-scanner precedent) — a future session in a
fresh sandbox may need to repeat both fixes.

## What was built

**Domain logic** (`src-tauri/src/branding/theme.rs`, pure functions, no
I/O): `derive_theme(seed: Rgb) -> BrandTheme` computes a full
primary/secondary/accent/selected-surface/restrained-surface palette
from a single seed color, each paired text color chosen (white or
black, whichever needs less lightness adjustment from the seed) and the
lightness searched until real WCAG contrast is met — 4.5:1 for
text-bearing roles, 3:1 for surface tokens against the fixed default
body text. Deterministic (same seed → same output, tested directly).
**System semantic colors (success/warning/error/danger) are never
touched** — `theme.rs` has no path that can reach them.

**Logo decoding** (`src-tauri/src/branding/logo.rs`): decodes an
uploaded PNG/JPEG (`image` crate, MIT/Apache-2.0, the standard Rust
image-decoding crate — not independently dependency-researched given
how uncontroversial a choice it is, reasoning recorded here instead of
via a separate agent dispatch), rejects empty/oversized (>2MB, checked
before decode)/undecodable input without panicking, and extracts a
dominant non-background color (excludes near-white/near-black/
transparent pixels so a typical white-background logo doesn't wash out
its own mark; a pixel-sampling stride keeps large images bounded; an
all-background image falls back to a neutral grey seed rather than
erroring).

**Persistence** (`src-tauri/src/repository/school_branding.rs`,
migration in `db/migrations.rs`): one `school_branding` row per school
(`school_id` PK, `ON DELETE CASCADE`), storing the logo as a BLOB
**inside the already-SQLCipher-encrypted working database** — a
deliberate choice over a plaintext file on disk, which would need its
own encryption story `ADR-0003`'s existing guarantee doesn't cover.
Upsert via `ON CONFLICT (school_id) DO UPDATE`, not `INSERT OR
REPLACE`/`OR IGNORE` — this codebase has a documented lesson
(`repository::role::grant`'s doc comment) that the latter can silently
swallow a `CHECK` violation or cascade-delete unexpectedly; `ON
CONFLICT ... DO UPDATE` avoids both.

**Authorization**: new `Capability::ManageSchoolBranding` (School Head
only, matching `ManageSchoolMembership`/`ManageTeachingAssignments`),
gating `set`/`clear`; reads (`get_school_branding`/`get_school_logo`)
are session-scoped but ungated beyond that — every teacher needs the
theme to render the app shell, not just whoever can change it, matching
how every other read path in this codebase already works.

**Frontend**: `src/domain/school-branding.ts` + port + Tauri adapter +
`SchoolBrandingApplicationService` (client-side size/mime validation
mirroring the Rust-side limits, so a teacher gets an immediate message
rather than a round trip) + `SchoolBrandingScreen.tsx` (a new "School
Settings" nav group) + `applyBranding.ts` (applies the derived theme as
inline CSS custom-property overrides on `document.documentElement`,
`null` reverting to the stylesheet defaults). Six new tokens added to
`src/ui/theme/styles.css` (`--color-secondary`/`-text`,
`--color-accent`/`-text`, `--color-selected-surface`,
`--color-restrained-surface`), all defaulting to `var()` references to
already-contrast-verified existing tokens — an unbranded school inherits
those proven-safe defaults for free, no new hex values needed
independent verification.

**A real correctness issue found and fixed before it shipped, not
after**: LIKHA runs on shared school computers with independent
per-teacher sessions (ADR-0004). Since branding is applied as inline
style overrides that persist on the DOM element across React renders,
a naive implementation would let School A's colors keep showing after
logout — including to a School B teacher signing in next on the same
machine. Caught during design, not by a reviewer: `App.tsx` now resets
to the default theme immediately on every session change (`session ===
null`), then fetches and applies the new session's own branding (or
nothing) — never assumes a previously-applied theme is still correct.

## Verification, all actually run this session (not claimed)

- `cargo test` (workspace): **367 passed, 0 failed** (up from a 338
  baseline — 29 new: 11 `theme::`, 9 `logo::`, 9 `school_branding::`).
- `cargo clippy --all-targets -- -D warnings`: **clean**, 0 warnings
  (two real findings fixed during development: a type-complexity lint
  resolved with a type alias, `index % stride != 0` rewritten to the
  idiomatic `!index.is_multiple_of(stride)`).
- `cargo fmt --check`: clean (ran `cargo fmt` once to fix real drift
  introduced while writing the new files, reformatting only, no
  semantic change — verified by reading the diff).
- `npm run quality` (typecheck, lint, format:check, architecture-boundary
  check, vitest): **all clean**, 401 tests passed (up from 390 baseline
  — 11 new: 4 `applyBranding.test.ts`, 7
  `school-branding-service.test.ts`).
- `npx tsc -b --noEmit` (the stricter project-references build,
  distinct from the plain `tsc --noEmit` typecheck step — caught one
  real issue `npm run quality`'s own typecheck step missed: a
  `Uint8Array<ArrayBufferLike>` vs. `BlobPart` mismatch constructing the
  logo preview `Blob`, fixed with `.slice()` to force a plain
  `ArrayBuffer`-backed copy).
- `npm run build`: clean production build.
- `npm run check:dev-preview-isolation`: clean.
- `npx knip`: **zero new findings** — every new export (service, repo,
  screen, `applyBranding`) is confirmed actually wired and used, not
  dead code.
- `npm run quality:security` (gitleaks/cargo-deny/osv-scanner): **not
  run** — the three binaries are not installed in this sandbox, a
  known per-machine gap (`docs/PROJECT-MEMORY.md`'s Compounding
  Engineering entry), not attempted-and-hidden.
- Independent `security-reviewer` **dispatched but failed** — not the
  project's usual documented retrieval failure, but a session usage-limit
  rate error (HTTP 429, "hit your session limit, resets 5pm UTC") that
  would recur on immediate retry. Per
  `.claude/rules/autonomous-development.md`'s established reviewer-
  failure handling, a rigorous self-review was substituted rather than
  retried blind, covering exactly the checklist the dispatched reviewer
  was given: authorization (`ManageSchoolBranding` correctly School-Head-
  gated, `school_id` always session-derived on every command, no
  cross-school read/write path found), the cross-session branding-leak
  scenario (`App.tsx`'s reset-on-session-change traced through every
  `setSession` call site — logout, expiry, setup-complete, login — all
  covered), SQL correctness (parameterized throughout, `ON CONFLICT ...
DO UPDATE` avoiding the documented `OR IGNORE`/`OR REPLACE` pitfall),
  PII (a logo is institutional, not personal, data — no concern), and
  error-boundary leakage (`InvalidImage`'s `Serialize` impl confirmed to
  emit only the fixed category string, matching every other variant).
  **One real, non-theoretical finding from the self-review, fixed before
  this milestone was called done**: `logo.rs` checked the _compressed_
  upload size (2MB) but not the _decoded_ pixel count — a small,
  well-compressed file (a solid-color PNG compresses extremely well) can
  still claim an enormous width×height, forcing a huge allocation the
  moment `decode()` runs. Fixed with `ImageReader::into_dimensions()` (a
  header-only read, no full decode) checked against a 50-megapixel cap
  _before_ `decode()` is ever called; proven with a real 9000×9000
  solid-color PNG (well under the 2MB byte cap, confirmed by the test
  itself, yet correctly rejected on pixel count). **One minor,
  non-blocking limitation disclosed, not fixed**: a narrow race exists
  between `App.tsx`'s per-session branding fetch and a near-simultaneous
  manual upload/reset on `SchoolBrandingScreen` — a fast-enough upload
  could theoretically have its freshly-applied theme overwritten by an
  in-flight, now-stale fetch. Self-corrects on the next render/reload,
  never crosses a school boundary, and only affects a transient applied
  style, not persisted data — recorded in `docs/VERIFICATION-DEBT.md` as
  accepted low-severity debt, not blocking this milestone. **Real,
  non-self security review remains owed** — retry when the rate limit
  clears, per this project's established "retry in a later session"
  pattern for reviewer-harness failures.
- **Not run**: real browser-rendered visual verification (no
  browser/screenshot tool in this session) and native Windows/WebView2
  verification. Disclosed as a gap, not claimed — matches the pattern
  every prior UI milestone in this project has used.

## Consequences

- New dependency: `image = "0.25"` (default-features off, `png`/`jpeg`
  features only) in `src-tauri/Cargo.toml`.
- Six new CSS custom properties in `src/ui/theme/styles.css`, additive
  only — nothing existing was renamed or removed.
- `docs/product/PRODUCT-CONTRACT.md` §8 updated from HYPOTHESIS to
  BUILT.
- `docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`'s Wave 1
  row updated: **complete**.
- `docs/CURRENT-HANDOFF.md`/`docs/PROJECT-MEMORY.md` updated.
- Per Autonomous Continuous Development Mode
  (`.claude/rules/autonomous-development.md`): this is a completed
  checkpoint, not a stopping point. Wave 1 is now fully complete; Wave 2
  (Learner Core, combined UX-05 + SF1) is the next milestone in
  sequence, gated by Wave 1's now-confirmed-real RBAC.
