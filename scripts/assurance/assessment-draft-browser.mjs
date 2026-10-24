// Production authoring UI; controlled in-memory create acknowledgments only.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "../ui-browser.mjs";
const output = ".cache/assessment-draft";
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "",
  browser;
server.stdout.on("data", (c) => (logs += c));
server.stderr.on("data", (c) => (logs += c));
const cases = [],
  checks = [];
try {
  const url = "http://127.0.0.1:1420/dev-preview.html";
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    if (i === 79) throw Error(logs);
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ headless: true, executablePath: await uiBrowserExecutable() });
  for (const surface of ["workspace", "studio"])
    for (const appearance of ["light", "dark"])
      for (const density of ["efficient", "comfortable", "guided"])
        for (const width of [1280, 640, 390])
          for (const motion of ["no-preference", "reduce"]) {
            const context = await browser.newContext({
              viewport: { width, height: 1000 },
              colorScheme: appearance,
              reducedMotion: motion,
              hasTouch: true,
            });
            await context.addInitScript(
              ({ appearance, density }) => {
                localStorage.setItem("likha-sis:appearance", appearance);
                localStorage.setItem("likha-sis:teacher-mode", density);
              },
              { appearance, density },
            );
            const page = await context.newPage();
            await page.route("**/src/dev-preview/fixtures.ts", async (route) => {
              const response = await route.fetch();
              let body = await response.text();
              for (const name of ["FixtureAssessmentRepository", "FixtureClassRecordRepository"]) {
                assert(body.includes("export class " + name));
                body = body.replace("export class " + name, "class Base" + name);
              }
              body += `
                window.__authorAudit={mode:"delay",calls:[],release:null,created:null,record:null};
                export class FixtureClassRecordRepository extends BaseFixtureClassRecordRepository {
                  async create(...args){const r=await super.create(...args);window.__authorAudit.record=r;return r;}
                }
                export class FixtureAssessmentRepository extends BaseFixtureAssessmentRepository {
                  async createItem(...args){const a=window.__authorAudit;a.calls.push(args);
                    if(a.mode==="delay")await new Promise(resolve=>a.release=resolve);
                    if(a.mode==="reject")throw new Error("synthetic rejected creation");
                    const r=await super.createItem(...args);a.created=r;return r;
                  }
                }
              `;
              await route.fulfill({ response, body });
            });
            await page.goto(url, { waitUntil: "networkidle" });
            await page.getByRole("button", { name: "Mathematics · Mabini", exact: true }).click();
            await page.getByRole("tab", { name: "Scores", exact: true }).click();
            await page.getByLabel("Grading period", { exact: true }).selectOption("gp1");
            await page
              .getByLabel("DepEd grading weighting", { exact: true })
              .selectOption("wp-k10");
            await page.getByRole("button", { name: "Open class record", exact: true }).click();
            if (surface === "studio")
              await page.getByRole("button", { name: "Creation Studio", exact: true }).click();
            const name = page.getByLabel("Item name", { exact: true }),
              max = page.getByLabel("Max score", { exact: true });
            const submitted = "Synthetic submitted assessment — reviewed evidence";
            const next = "Synthetic next assessment draft — keep this newer work";
            await name.fill(submitted);
            if (surface === "studio") {
              await name.dispatchEvent("keydown", {
                key: "Enter",
                code: "Enter",
                isComposing: true,
                bubbles: true,
              });
              assert.equal(await page.evaluate(() => window.__authorAudit.calls.length), 0);
              await name.press("Enter");
            } else await page.getByRole("button", { name: "Add item", exact: true }).click();
            await page.waitForFunction(() => window.__authorAudit.calls.length === 1);
            const busy = page.getByRole("button", { name: "Adding…", exact: true });
            await busy.focus();
            await busy.press("Enter");
            assert.equal(await page.evaluate(() => window.__authorAudit.calls.length), 1);
            await name.fill(next);
            await max.fill("10");
            await max.focus();
            assert(await max.evaluate((el) => el === document.activeElement), "focus precondition");
            await page.evaluate(() => window.__authorAudit.release());
            await page
              .getByText(submitted + " added. Your newer item draft is retained.", { exact: true })
              .waitFor();
            assert.equal(await name.inputValue(), next);
            assert.equal(await max.inputValue(), "10");
            assert(
              await max.evaluate((el) => el === document.activeElement),
              JSON.stringify({
                surface,
                appearance,
                density,
                width,
                motion,
                active: await page.evaluate(
                  () => document.activeElement?.id || document.activeElement?.tagName,
                ),
              }),
            );
            const audit = await page.evaluate(() => window.__authorAudit);
            assert.equal(audit.calls.length, 1);
            assert.equal(audit.calls[0][0], audit.record.id);
            assert.equal(audit.calls[0][2], submitted);
            assert.equal(audit.calls[0][3], 20);
            assert.equal(audit.created.name, submitted);
            assert.equal(audit.created.maxScore, 20);
            assert.equal(audit.created.categoryId, audit.calls[0][1]);
            if (surface === "workspace")
              assert.equal(
                await page
                  .getByRole("button", { name: "Close item editor", exact: true })
                  .getAttribute("aria-expanded"),
                "true",
              );
            await page.evaluate(axe.source);
            const violations = await page.evaluate(async () =>
              (
                await window.axe.run(document, {
                  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
                })
              ).violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
            );
            const bounds = await max.evaluate((el) => {
              const s = getComputedStyle(el),
                r = el.getBoundingClientRect();
              return {
                width: r.width,
                height: r.height,
                font: s.fontFamily,
                fontSize: s.fontSize,
                color: s.color,
                background: s.backgroundColor,
                outline: s.outlineWidth,
                outlineOffset: s.outlineOffset,
                transition: s.transitionDuration,
                pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
              };
            });
            assert.deepEqual(violations, []);
            assert(
              !bounds.pageOverflow,
              JSON.stringify({ surface, appearance, density, width, motion, bounds }),
            );
            assert(bounds.width >= 24 && bounds.height >= 24);
            const controls = await page.evaluate((surface) => {
              const prefix = surface === "workspace" ? "workspace" : "authoring";
              const result = {};
              for (const field of ["item-name", "max-score", "category", "category-set"]) {
                const el = document.getElementById(prefix + "-" + field),
                  s = getComputedStyle(el),
                  r = el.getBoundingClientRect();
                result[field] = {
                  width: r.width,
                  height: r.height,
                  minHeight: s.minHeight,
                  font: s.fontFamily,
                  fontSize: s.fontSize,
                  lineHeight: s.lineHeight,
                  color: s.color,
                  background: s.backgroundColor,
                  border: s.borderColor,
                  radius: s.borderRadius,
                  padding: s.padding,
                  transition: s.transitionDuration,
                  easing: s.transitionTimingFunction,
                };
              }
              return result;
            }, surface);
            assert(Object.values(controls).every((c) => c.width >= 24 && c.height >= 24));
            cases.push({
              surface,
              appearance,
              density,
              width,
              motion,
              submitted: audit.calls[0],
              created: audit.created,
              retained: { name: next, max: 10, focus: "Max score" },
              bounds,
              controls,
              violations,
              status: "PASS",
            });
            if (
              appearance === "light" &&
              density === "comfortable" &&
              width === 1280 &&
              motion === "reduce"
            )
              await page.screenshot({
                path: output + "/" + surface + "-desktop.png",
                fullPage: true,
              });
            if (
              appearance === "dark" &&
              density === "guided" &&
              width === 390 &&
              motion === "reduce"
            )
              await page.screenshot({
                path: output + "/" + surface + "-phone.png",
                fullPage: true,
              });
            if (
              appearance === "light" &&
              density === "efficient" &&
              width === 1280 &&
              motion === "no-preference"
            ) {
              await page.evaluate(() => (window.__authorAudit.mode = "reject"));
              await page
                .getByRole("button", {
                  name: surface === "workspace" ? "Add item" : "Add item and continue",
                  exact: true,
                })
                .click();
              await page
                .getByRole("alert")
                .filter({
                  hasText:
                    surface === "workspace"
                      ? "Could not create this item."
                      : "Could not add this item.",
                })
                .waitFor();
              assert.equal(await name.inputValue(), next);
              assert.equal(await page.evaluate(() => window.__authorAudit.calls.length), 2);
              await page.evaluate(() => (window.__authorAudit.mode = "instant"));
              await page
                .getByRole("button", {
                  name: surface === "workspace" ? "Add item" : "Add item and continue",
                  exact: true,
                })
                .click();
              await page.getByText(next + " added.", { exact: true }).waitFor();
              if (surface === "workspace")
                assert(
                  await page
                    .getByRole("button", { name: "Add assessment item", exact: true })
                    .isVisible(),
                );
              else {
                assert.equal(await name.inputValue(), "");
                assert(await name.evaluate((el) => el === document.activeElement));
              }
              assert.equal(await page.evaluate(() => window.__authorAudit.calls.length), 3);
              checks.push({
                surface,
                case: "failed creation retains newer draft; explicit unchanged retry preserves normal completion; no automatic replay",
                status: "PASS",
              });
            }
            await context.close();
          }
  const sources = {};
  for (const f of [
    "src/ui/ClassRecordWorkspace.tsx",
    "src/ui/AssessmentAuthoringScreen.tsx",
    "src/ui/ClassRecordWorkspace.test.tsx",
    "src/ui/AssessmentAuthoringScreen.test.tsx",
    "src/ui/theme/styles.css",
    "scripts/assurance/assessment-draft-browser.mjs",
  ])
    sources[f] = createHash("sha256")
      .update(await readFile(f))
      .digest("hex");
  await writeFile(
    output + "/receipt.json",
    JSON.stringify(
      {
        project: "LIKHA-SIS",
        head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        node: process.version,
        browser: browser.version(),
        sources,
        cases,
        checks,
        limits: [
          "In-memory fixture writes and synthetic composition event; not native persistence or actual device IME proof",
          "Full PM-12 editing/deletion and Scores A1–A7 teacher/device/manual acceptance remain separate",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ cases: cases.length, checks: checks.length, status: "PASS" }));
} finally {
  await browser?.close();
  server.kill();
}
