# Android Platform Architecture — Scoping Note (not a decision)

Date: 2026-09-08
Status: Research/scoping only. No Android code, build config, Gradle
files, or Rust Android target setup exists in this repository, and none
was added by this note. Nothing here selects an approach — it exists so
a future session can run the real 10-scenario architecture-decision
process (per `.claude/rules/autonomous-development.md`) without
re-deriving the landscape from zero.

## Why this is a scoping note, not a decision

`CLAUDE.md` states the product phasing explicitly: "Windows first;
Android later." Starting Android as a side effect of a Tier 5
verification-debt cleanup batch would violate that phasing and would
also skip the 10-scenario process autonomous-development.md requires
for a new platform target — a genuinely consequential, hard-to-reverse
architecture choice (build toolchain, secure-storage adapter, packaging,
CI surface). This note only inventories what that future decision needs
to weigh.

## What a real Android architecture decision would need to consider

1. **Secure key storage adapter, equivalent to the current DPAPI
   approach.** `docs/adr/0003-encryption-at-rest.md` ties the working
   SQLCipher database's key to Windows DPAPI, fails closed on a
   corrupted/undecryptable key file, and never silently mints a
   replacement key. Android has no DPAPI equivalent; the natural
   analogues to evaluate are the Android Keystore system (hardware-backed
   key storage on supporting devices) and Jetpack Security's
   `EncryptedSharedPreferences`/`EncryptedFile` (which themselves sit on
   top of Keystore). Whichever is chosen must preserve the same
   fail-closed guarantee `security-privacy.md` requires — no silent key
   regeneration — and needs its own recovery-scenario analysis (app
   reinstall, device factory reset, Keystore invalidation on biometric
   enrollment changes) parallel to the DPAPI recovery gaps already
   tracked in `docs/VERIFICATION-DEBT.md`'s "Recovery scenarios needing
   real hardware" entry.
2. **Touch-optimized layout implications for the existing UI work.**
   Batches 4-5 of this pass (ADR-0075, ADR-0064) built a
   pointer/keyboard-oriented shell: collapsible sidebar with hover/click
   affordances, click-to-arm/click-to-place interactions (timetable,
   seating chart) chosen specifically to avoid a drag-and-drop
   dependency, native `title`-attribute tooltips on collapsed icons (no
   touch equivalent), and a persistent two-tier desktop shell
   (`DashboardShell`/`Sidebar`/`TopBar`/`BottomNav`). None of this was
   designed against touch target sizing, hover-only affordances, or a
   phone/tablet viewport. A real Android pass would need to audit every
   shipped screen for touch-target size (WCAG 2.5.5 / Android's own 48dp
   guidance), replace hover-dependent affordances, and decide whether
   the existing `BottomNav` component (already present in the shell,
   `src/ui/shell/BottomNav.tsx`) was built with mobile in mind or needs
   rework.
3. **Build toolchain and target.** Tauri 2's Android support (via
   `cargo tauri android init`/`cargo mobile2`) is the only path
   consistent with this project's "React + TypeScript + Tauri 2, provider
   -specific code stays behind interfaces/adapters" architecture — no
   separate Kotlin/native rewrite is implied by anything decided so far.
   This still needs its own scenario analysis: minimum supported Android
   API level, whether the existing Rust `src-tauri` crate builds
   unmodified for the `aarch64-linux-android`/`armv7-linux-androideabi`
   targets used by real devices, and what CI surface (an Android
   emulator or device farm) a "Windows first" project is willing to add
   before Android is the active target.
4. **Zero-billing constraint.** Any Android distribution path (Play
   Store listing, signing key management, potential MDM/enterprise
   distribution for schools) needs the same "no paid infrastructure
   without explicit approval" review this project applies everywhere
   else.

## What this note does not do

- Does not choose Keystore vs. EncryptedSharedPreferences vs. any other
  option.
- Does not propose a schedule or milestone number for starting Android.
- Does not add any Gradle file, `tauri.conf.json` Android target,
  Rust Android toolchain configuration, or CI job.

## Next step

When Android work is actually authorized to start, run the 10-scenario
architecture-decision process (see `docs/adr/0008-*`, `0013-*` for the
established pattern in this project) covering at least the four areas
above, and record the outcome as a new ADR before any implementation
begins.
