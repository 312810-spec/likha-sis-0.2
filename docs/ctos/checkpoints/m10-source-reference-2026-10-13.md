# M10 — declared source reference snapshot

Branch: `ctos/m10-source-reference-20261013`, stacked on PR111.
Parent CI repair: `aeb517e5985e9cc6bd7d43f6e6e9c9ce296f9998`.

## Outcome / scope

A new lesson can retain a teacher-provided source title, version/revision,
citation/location, curriculum name and applicable term with the lesson's stored
class context. Metadata is explicit, optional and declared; no curriculum default,
official verification, competency catalog or source content is inferred.

The creation UI, retained draft, application validator, Tauri adapter/command and
native repository are connected. Entirely empty references remain unknown;
partial references are rejected and drafts retained. Native validation repeats
nonblank/length checks before insertion. Migration 49 captures immutable source
JSON; legacy references remain NULL. Lesson content remains editable, while its
original source reference is read-only. Correcting a saved reference requires a
future explicit provenance amendment/version flow; it is not silently replaced.

## PR111 CI correction

Ubuntu executed 1,252 unit tests: 1,251 passed; the legacy-upgrade test failed
because its raw fixture omitted FK parents. Valid synthetic school/user/section/
subject/assignment parents were added in an isolated repair. Foreign keys remain
enabled. Repaired tree: `7f85918494da5d4a80b408c38394c8b6fa272192`.
Security rerun passed; native rerun remains pending. Original frontend/browser/
recovery passes remain evidence for unchanged PR111 UI code.

## Verification / assurance

- Focused frontend: 3 files / 30 tests PASS; declared source validation, transport,
  retained draft and immutable saved-reference inputs covered.
- Plain SQLite: actual ordered SQL blocks 47→49 executed with foreign keys ON;
  legacy context/source remain NULL, source update rejected, content editable,
  no FK violations. This is not installed SQLCipher upgrade evidence.
- Native regression added: source normalization, preservation during content
  edits, rejected raw source mutation and invalid-source creation. Local Rust
  tools unavailable; native execution/formatting require CI.
- Full frontend quality PASS: typecheck, lint, formatting, architecture, dead-code,
  four runner regressions, 149 files / 1,447 frontend tests. Production build PASS.
- Local Chromium previously crashed before launch. New UI smoke/visual and native
  checks require CI; no browser or device pass is claimed locally.

Readiness: INCONCLUSIVE until applicable native/UI/Security gates pass. No release
or deployment. M10 and batches C–G remain incomplete.

Next: source-aware subject/term/year applicability, provenance amendments and
verified source ingestion, then teacher-confirmed AI drafts and classroom linkage.
Missing approved BOW/templates remain unknown; no official source is fabricated.
