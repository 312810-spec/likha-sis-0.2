// Production Scores interface; deferred synthetic device receipts, never native proof.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "../ui-browser.mjs";
const output = ".cache/scores-grade-readiness";
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "",
  browser;
server.stdout.on("data", (c) => (logs += c));
server.stderr.on("data", (c) => (logs += c));
const cases = [];
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
            assert(body.includes("export class FixtureLearnerScoreRepository"));
            body = body.replace(
              "export class FixtureLearnerScoreRepository",
              "class BaseFixtureLearnerScoreRepository",
            );
            body += `
   window.__gradeAudit={writes:[],reads:[],release:null,saved:null};
   export class FixtureLearnerScoreRepository extends BaseFixtureLearnerScoreRepository{
    async record(...args){const a=window.__gradeAudit;a.writes.push(args);await new Promise(r=>a.release=r);const s=await super.record(...args);a.saved=s;return s;}
    async computeTermGrade(...args){window.__gradeAudit.reads.push(args);return super.computeTermGrade(...args);}
   }
   window.__gradeAudit.roster=id=>new BaseFixtureLearnerScoreRepository().rosterForItem(id);
   `;
            await route.fulfill({ response, body });
          });
          await page.goto(url, { waitUntil: "networkidle" });
          await page.getByRole("button", { name: "Mathematics · Mabini", exact: true }).click();
          await page.getByRole("tab", { name: "Scores", exact: true }).click();
          await page.getByLabel("Grading period", { exact: true }).selectOption("gp1");
          await page.getByLabel("DepEd grading weighting", { exact: true }).selectOption("wp-k10");
          await page.getByRole("button", { name: "Open class record", exact: true }).click();
          const title = "Synthetic grade evidence — saved work and newer drafts";
          await page.getByLabel("Item name", { exact: true }).fill(title);
          await page.getByRole("button", { name: "Add item", exact: true }).click();
          await page.getByText(title + " added.", { exact: true }).waitFor();
          await page.getByRole("button", { name: new RegExp(title) }).click();
          const input = page.getByLabel("Score for Ana Santos", { exact: true });
          await input.waitFor();
          const button = page.getByRole("button", { name: "Show term grades", exact: true });
          await button.click();
          const table = page.getByRole("table", { name: "Computed term grades", exact: true });
          await table.waitFor();
          await page
            .getByRole("button", { name: "Computing…", exact: true })
            .waitFor({ state: "detached" });
          const initialReads = await page.evaluate(() => window.__gradeAudit.reads.length);
          assert.equal(initialReads, 3);
          await input.fill("18");
          await input.press("Enter");
          await page.waitForFunction(() => window.__gradeAudit.writes.length === 1);
          await input.fill("0");
          await table.getByText(/Score save pending/).waitFor();
          assert.equal(await button.getAttribute("aria-disabled"), "true");
          assert((await button.getAttribute("aria-describedby")).includes("term-grade-check-wait"));
          // Keep the unavailable control keyboard reachable so its explanation can be inspected.
          await button.focus();
          await button.press("Enter");
          await button.press("Space");
          assert.equal(await page.evaluate(() => window.__gradeAudit.reads.length), initialReads);
          assert.equal(await page.evaluate(() => window.__gradeAudit.writes.length), 1);
          assert.equal(await input.inputValue(), "0");
          const style = async (locator) =>
            locator.evaluate((node) => {
              const s = getComputedStyle(node),
                r = node.getBoundingClientRect();
              return {
                width: r.width,
                height: r.height,
                color: s.color,
                background: s.backgroundColor,
                font: s.fontFamily,
                fontSize: s.fontSize,
                lineHeight: s.lineHeight,
                padding: s.padding,
                radius: s.borderRadius,
                outline: s.outline,
                outlineOffset: s.outlineOffset,
                transition: s.transitionDuration,
                easing: s.transitionTimingFunction,
                opacity: s.opacity,
              };
            });
          const buttonStyle = await style(button),
            waitStyle = await style(page.locator("#term-grade-check-wait")),
            savedStyle = await style(page.locator("#term-grade-saved-evidence"));
          assert(buttonStyle.width >= 24 && buttonStyle.height >= 24);
          const clearance = await button.evaluate((node) => {
            const r = node.getBoundingClientRect(),
              nav = document.querySelector(".app-bottomnav"),
              bottom =
                nav && getComputedStyle(nav).position === "fixed"
                  ? nav.getBoundingClientRect().top
                  : innerHeight;
            return {
              top: r.top,
              bottom: r.bottom,
              limit: bottom,
              hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === node,
              focused: document.activeElement === node,
            };
          });
          assert(
            clearance.top >= 0 &&
              clearance.bottom <= clearance.limit &&
              clearance.hit &&
              clearance.focused,
            JSON.stringify(clearance),
          );
          await page.evaluate(axe.source);
          const audit = () =>
            page.evaluate(async () => {
              const r = await window.axe.run(document, {
                runOnly: {
                  type: "tag",
                  values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
                },
              });
              return r.violations.map((v) => ({
                id: v.id,
                impact: v.impact,
                nodes: v.nodes.map((n) => n.target),
              }));
            });
          const pendingViolations = await audit();
          assert.deepEqual(pendingViolations, []);
          const representative =
            ((appearance === "light" && density === "comfortable" && width === 1280) ||
              (appearance === "dark" && density === "guided" && width === 390)) &&
            motion === "reduce";
          if (representative)
            await page.screenshot({ path: output + `/pending-${width}.png`, fullPage: true });
          await page.evaluate(() => window.__gradeAudit.release());
          await table.getByText(/Score save pending/).waitFor({ state: "detached" });
          const ana = table
            .getByRole("row")
            .filter({ has: page.getByRole("rowheader", { name: "Ana Santos", exact: true }) });
          await ana.getByText("90", { exact: true }).waitFor();
          assert.equal(await input.inputValue(), "0");
          assert(await page.getByText(/This item has unsaved score work/).isVisible());
          assert(
            (await page.locator("#term-grade-saved-evidence").textContent()).includes(
              "Unsaved input is excluded",
            ),
          );
          assert.equal(
            await page.evaluate(() => window.__gradeAudit.reads.length),
            initialReads + 1,
          );
          assert.equal(await button.getAttribute("aria-disabled"), "false");
          const newDraftViolations = await audit();
          assert.deepEqual(newDraftViolations, []);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          );
          assert(!overflow);
          if (representative)
            await page.screenshot({
              path: output + `/saved-newer-draft-${width}.png`,
              fullPage: true,
            });
          await input.focus();
          await input.press("Enter");
          const reason = page.getByLabel("Reason for changing Ana Santos's recorded score", {
            exact: true,
          });
          await reason.waitFor();
          await reason.fill("Synthetic corrected-paper review");
          assert(await page.getByText(/This item has unsaved score work/).isVisible());
          await reason.press("Escape");
          assert.equal(await input.inputValue(), "18");
          await page.getByText(/This item has unsaved score work/).waitFor({ state: "detached" });
          const receipt = await page.evaluate(async () => {
            const a = window.__gradeAudit;
            return {
              writes: a.writes,
              reads: a.reads,
              saved: a.saved,
              roster: await a.roster(a.writes[0][0]),
            };
          });
          assert.equal(receipt.writes.length, 1);
          assert.deepEqual(receipt.writes[0].slice(1), ["l1", "scored", 18, null]);
          assert.equal(receipt.saved.score, 18);
          assert.equal(receipt.saved.assessmentItemId, receipt.writes[0][0]);
          assert.equal(receipt.roster.find((r) => r.learnerId === "l1").score, 18);
          cases.push({
            appearance,
            density,
            width,
            motion,
            receipt,
            buttonStyle,
            waitStyle,
            savedStyle,
            clearance,
            pendingViolations,
            newDraftViolations,
            overflow,
            status: "PASS",
          });
          console.log(JSON.stringify({ completed: cases.length }));
          await context.close();
        }
  const sources = {};
  for (const f of [
    "src/ui/ClassRecordWorkspace.tsx",
    "src/ui/ClassRecordWorkspace.test.tsx",
    "src/ui/theme/styles.css",
    "scripts/assurance/scores-grade-readiness-browser.mjs",
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
        limits: [
          "Synthetic in-memory fixture persistence/computation; not native grading, installed device or teacher proof",
          "Both resolved appearances; System provider evidence separate",
          "Full PM-13/A1–A7 partial; manual AT, OS zoom and physical IME not run",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({ configurations: cases.length, states: cases.length * 2, status: "PASS" }),
  );
} finally {
  await browser?.close();
  server.kill();
}
