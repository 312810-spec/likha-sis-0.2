---
name: playwright-cli
description: Use when you need to verify a UI change actually renders/behaves correctly in a real browser — interaction checks, accessibility snapshots, screenshots, or console/error inspection during coding.
---

# Playwright CLI

Uses `@playwright/cli` (npm) — the coding-agent-oriented CLI, distinct
from `@playwright/mcp` (persistent stateful sessions) and `@playwright/test`
(the test runner). Disk-based snapshots keep it token-efficient for
one-off verification. See `docs/SOURCE-REGISTRY.md` for the adoption
note.

**Hard limitation — read before using:** this only drives `vite dev` (or
a built bundle) in a real browser tab. It **cannot attach to the compiled
Tauri window/webview**. A clean Playwright run says nothing about the
actual native binary, the Tauri IPC bridge, or Windows-specific WebView2
behavior — see `tauri-windows` skill and `docs/VERIFICATION-DEBT.md` for
what native coverage actually requires.

Usage:

1. Start the dev server (`npm run dev`) if it isn't already running.
2. Run `playwright-cli` commands to snapshot/interact with the running
   page (exact subcommands per the installed version — check `playwright-cli
   --help` if unsure rather than guessing at syntax).
3. Use it for: confirming a screen renders without console errors,
   accessibility-tree snapshots as a supplement to (not replacement for)
   `axe-core` unit tests, and interaction smoke checks (click through a
   form, confirm expected text appears).
4. Never claim this verified "the app" — say "the browser-rendered UI"
   specifically, and note the native-binary gap in your report if
   relevant.

Version is pinned in project tooling, not tracked at `latest` — check
`package.json`/install docs for the exact pinned version before assuming
current behavior matches the newest release.
