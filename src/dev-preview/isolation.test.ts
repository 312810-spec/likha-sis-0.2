import { describe, expect, it } from "vitest";
import mainSource from "../main.tsx?raw";
import appSource from "../App.tsx?raw";
import compositionSource from "../composition.ts?raw";
import indexHtmlSource from "../../index.html?raw";

/**
 * Proves the production entry graph does not import the dev-only
 * fixture -- a fast, source-text-level check that runs in the normal
 * test suite (see `scripts/check-dev-preview-isolation.mjs` for the
 * complementary check that the *built* `dist/` output is also clean,
 * which needs an actual build and so isn't run on every `npm test`).
 * See `docs/adr/0032-teacher-workspace-polish.md`.
 */
describe("dev-preview isolation", () => {
  it("src/main.tsx never references src/dev-preview", () => {
    expect(mainSource).not.toMatch(/dev-preview/);
  });

  it("src/App.tsx never references src/dev-preview", () => {
    expect(appSource).not.toMatch(/dev-preview/);
  });

  it("src/composition.ts never references src/dev-preview", () => {
    expect(compositionSource).not.toMatch(/dev-preview/);
  });

  it("index.html (the production entry) never references dev-preview", () => {
    expect(indexHtmlSource).not.toMatch(/dev-preview/);
  });
});
