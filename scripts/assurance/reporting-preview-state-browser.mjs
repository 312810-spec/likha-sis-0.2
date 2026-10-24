// Production Scores/reporting panel with isolated synthetic receipts; never native proof.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "../ui-browser.mjs";
const output = ".cache/reporting-preview-state";
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
window.__previewAudit={writes:[],reads:[],saved:null,failNext:false,deferRead:false};
export class FixtureLearnerScoreRepository extends BaseFixtureLearnerScoreRepository {
 async record(...args) {const a=window.__previewAudit;a.writes.push(args);if(a.failNext){await new Promise(r=>a.releaseWrite=r);throw Error('Synthetic uncertain correction');}const s=await super.record(...args);a.saved=s;return s;}
}
window.__previewAudit.roster=id=>new BaseFixtureLearnerScoreRepository().rosterForItem(id);
window.__previewAudit.preview=async id=>{
 const a=window.__previewAudit;a.reads.push(id);const checkedAt='synthetic-check-'+a.reads.length;
 if(a.deferRead)await new Promise(r=>a.releaseRead=r);
 return {classRecordId:id,schoolYear:'2026-2027',sectionName:'Synthetic long section name for reporting context',subjectName:'Synthetic Mathematics evidence',gradingPeriodLabel:'Synthetic full grading period',startsOn:'2026-06-08',endsOn:'2026-09-15',weightPolicyId:'wp-k10',checkedAt,learnerCount:3,completeGradeCount:1,provisionalGradeCount:1,missingGradeCount:1,missingLrnCount:1,officialFidelity:'not_verified',learners:[{learnerId:'l1',givenName:'Ana',familyName:'Santos',lrnMissing:false,grade:{complete:true},issue:null},{learnerId:'l2',givenName:'Bayani',familyName:'Cruz',lrnMissing:true,grade:null,issue:'Synthetic missing evidence'},{learnerId:'l3',givenName:'Maria Corazon',familyName:'Dela Peña-Villanueva',lrnMissing:false,grade:{complete:false},issue:'Synthetic provisional evidence'}],disclosure:{populatedFields:[],omittedFields:[{field:'Synthetic source omission',reason:'Not verified; never official approval'}]}};
};`;
            await route.fulfill({ response, body });
          });
          await page.route("**/src/dev-preview/DevPreviewApp.tsx", async (route) => {
            const response = await route.fetch();
            let body = await response.text();
            const needle = "new ExportApplicationService(new FixtureExportRepository())";
            assert(body.includes(needle));
            body = body.replace(
              needle,
              "new ExportApplicationService(new FixtureExportRepository(), {previewReportCard: id => window.__previewAudit.preview(id)})",
            );
            await route.fulfill({ response, body });
          });
          await page.goto(url, { waitUntil: "networkidle" });
          await page.getByRole("button", { name: "Mathematics · Mabini", exact: true }).click();
          await page.getByRole("tab", { name: "Scores", exact: true }).click();
          await page.getByLabel("Grading period", { exact: true }).selectOption("gp1");
          await page.getByLabel("DepEd grading weighting", { exact: true }).selectOption("wp-k10");
          await page.getByRole("button", { name: "Open class record", exact: true }).click();
          const title = "Synthetic reporting freshness";
          await page.getByLabel("Item name", { exact: true }).fill(title);
          await page.getByRole("button", { name: "Add item", exact: true }).click();
          await page.getByText(title + " added.", { exact: true }).waitFor();
          await page.getByRole("button", { name: new RegExp(title + " \\(max 20\\)") }).click();
          const input = page.getByLabel("Score for Ana Santos", { exact: true });
          await input.fill("18");
          await input.press("Enter");
          await page.waitForFunction(() => window.__previewAudit.saved?.score === 18);
          const panel = page.getByRole("region", { name: "Reporting preparation preview" });
          const check = panel.getByRole("button", {
            name: "Check reporting preparation",
            exact: true,
          });
          await check.click();
          await panel.getByText(/Checked: synthetic-check-1/).waitFor();
          await input.fill("19");
          await input.press("Enter");
          const reason = page.getByRole("textbox", {
            name: "Reason for changing Ana Santos's recorded score",
          });
          await reason.fill("Synthetic rechecked evidence");
          await page.evaluate(() => (window.__previewAudit.failNext = true));
          await page.getByRole("button", { name: "Save correction", exact: true }).click();
          await page.waitForFunction(() => window.__previewAudit.writes.length === 2);
          const unavailable = panel.getByText(/Reporting check is unavailable/);
          await unavailable.waitFor();
          assert(await check.isDisabled());
          assert.equal(await panel.getByText(/Checked:/).count(), 0);
          assert(await check.getAttribute("aria-describedby"));
          const style = async (locator) =>
            locator.evaluate((node) => {
              const s = getComputedStyle(node),
                r = node.getBoundingClientRect();
              return {
                width: r.width,
                height: r.height,
                font: s.fontFamily,
                fontSize: s.fontSize,
                lineHeight: s.lineHeight,
                color: s.color,
                background: s.backgroundColor,
                padding: s.padding,
                radius: s.borderRadius,
                outline: s.outline,
                outlineOffset: s.outlineOffset,
                transition: s.transitionDuration,
                easing: s.transitionTimingFunction,
                opacity: s.opacity,
              };
            });
          const audit = async () => {
            await page.evaluate(axe.source);
            return page.evaluate(async () => {
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
          };
          const representative =
            ((appearance === "light" && density === "comfortable" && width === 1280) ||
              (appearance === "dark" && density === "guided" && width === 390)) &&
            motion === "reduce";
          const pendingStyle = await style(unavailable),
            pendingViolations = await audit();
          assert.deepEqual(pendingViolations, []);
          if (representative)
            await page.screenshot({ path: output + `/pending-${width}.png`, fullPage: true });
          await page.evaluate(() => window.__previewAudit.releaseWrite());
          await page.getByText("Could not save this score.", { exact: true }).waitFor();
          const fresh = panel.getByText(/Run the check again to review the current saved records/);
          await fresh.waitFor();
          assert.equal(await panel.getByText(/Checked:/).count(), 0);
          assert(await page.getByText("Change to: 19 / 20", { exact: true }).isVisible());
          assert.equal(await reason.inputValue(), "Synthetic rechecked evidence");
          assert.equal(await page.evaluate(() => window.__previewAudit.reads.length), 1);
          const staleStyle = await style(fresh),
            checkStyle = await style(check),
            staleViolations = await audit();
          assert.deepEqual(staleViolations, []);
          await check.focus();
          const clearance = await check.evaluate((node) => {
            const r = node.getBoundingClientRect();
            return {
              hit: node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
              top: r.top,
              bottom: r.bottom,
              viewport: innerHeight,
            };
          });
          assert(clearance.hit && clearance.top >= 0 && clearance.bottom <= 1000);
          assert(checkStyle.width >= 24 && checkStyle.height >= 24);
          if (representative)
            await page.screenshot({ path: output + `/fresh-check-${width}.png`, fullPage: true });
          await page.evaluate(() => (window.__previewAudit.deferRead = true));
          await check.press("Enter");
          await panel.getByRole("button", { name: "Checking reporting…", exact: true }).waitFor();
          await panel
            .getByRole("button", { name: "Checking reporting…", exact: true })
            .press("Enter");
          assert.equal(await page.evaluate(() => window.__previewAudit.reads.length), 2);
          await page.evaluate(() => window.__previewAudit.releaseRead());
          await panel.getByText(/Checked: synthetic-check-2/).waitFor();
          const finalViolations = await audit();
          assert.deepEqual(finalViolations, []);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          );
          assert(!overflow);
          assert(await page.getByText("Change to: 19 / 20", { exact: true }).isVisible());
          assert.equal(await reason.inputValue(), "Synthetic rechecked evidence");
          const receipt = await page.evaluate(async () => {
            const a = window.__previewAudit;
            return {
              writes: a.writes,
              reads: a.reads,
              saved: a.saved,
              roster: await a.roster(a.writes[0][0]),
            };
          });
          assert.equal(receipt.writes.length, 2);
          assert.deepEqual(receipt.writes[1], [
            receipt.writes[0][0],
            "l1",
            "scored",
            19,
            "Synthetic rechecked evidence",
          ]);
          assert.equal(receipt.roster.find((r) => r.learnerId === "l1").score, 18);
          assert.equal(new Set(receipt.reads).size, 1);
          if (representative)
            await page.screenshot({ path: output + `/checked-${width}.png`, fullPage: true });
          cases.push({
            appearance,
            density,
            width,
            motion,
            pendingStyle,
            staleStyle,
            checkStyle,
            clearance,
            pendingViolations,
            staleViolations,
            finalViolations,
            overflow,
            receipt,
            status: "PASS",
          });
          console.log(JSON.stringify({ completed: cases.length }));
          await context.close();
        }
  const sources = {};
  for (const f of [
    "src/ui/ReportCardReadinessPanel.tsx",
    "src/ui/ReportCardReadinessPanel.test.tsx",
    "src/ui/ClassRecordWorkspace.tsx",
    "src/ui/ClassRecordWorkspace.test.tsx",
    "src/ui/theme/styles.css",
    "scripts/assurance/reporting-preview-state-browser.mjs",
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
          "Synthetic in-memory reads/writes only, not native grading or installed persistence",
          "Both resolved appearances; System provider checks separate",
          "Physical IME/manual AT/OS zoom/teacher acceptance NOT RUN",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({ configurations: cases.length, states: cases.length * 3, status: "PASS" }),
  );
} finally {
  await browser?.close();
  server.kill();
}
