// Real Scores UI with synthetic deferred score, deletion and item-list receipts.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "../ui-browser.mjs";
const output = ".cache/scores-roster-refresh";
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
            for (const name of ["FixtureAssessmentRepository", "FixtureLearnerScoreRepository"]) {
              assert(body.includes("export class " + name));
              body = body.replace("export class " + name, "class Base" + name);
            }
            body += `
    window.__rosterAudit={created:[],calls:[],reads:[],releaseScore:null,releaseDelete:{},releaseList:null,holdList:false,rosters:[],saved:null};
    export class FixtureAssessmentRepository extends BaseFixtureAssessmentRepository{
     async createItem(...args){const r=await super.createItem(...args);window.__rosterAudit.created.push(r);return r;}
     async deleteItem(id){await new Promise(r=>window.__rosterAudit.releaseDelete[id]=r);return super.deleteItem(id);}
     async listItemsByClassRecord(...args){const a=window.__rosterAudit;const snapshot=await super.listItemsByClassRecord(...args);a.reads.push(snapshot);if(a.holdList)await new Promise(r=>a.releaseList=r);return snapshot;}
    }
    export class FixtureLearnerScoreRepository extends BaseFixtureLearnerScoreRepository{
     async rosterForItem(id){window.__rosterAudit.rosters.push(id);return super.rosterForItem(id);}
     async record(...args){const a=window.__rosterAudit;a.calls.push(args);await new Promise(r=>a.releaseScore=r);const r=await super.record(...args);a.saved=r;return r;}
    }
    window.__rosterAudit.readScores=id=>new BaseFixtureLearnerScoreRepository().rosterForItem(id);
   `;
            await route.fulfill({ response, body });
          });
          await page.goto(url, { waitUntil: "networkidle" });
          await page.getByRole("button", { name: "Mathematics · Mabini", exact: true }).click();
          await page.getByRole("tab", { name: "Scores", exact: true }).click();
          await page.getByLabel("Grading period", { exact: true }).selectOption("gp1");
          await page.getByLabel("DepEd grading weighting", { exact: true }).selectOption("wp-k10");
          await page.getByRole("button", { name: "Open class record", exact: true }).click();
          const titles = [
            "Synthetic score contract — preserve the teacher’s active learner draft",
            "Synthetic other assessment",
            "Synthetic third assessment",
          ];
          for (const title of titles) {
            const toggle = page.getByRole("button", { name: "Add assessment item", exact: true });
            if (await toggle.isVisible()) await toggle.click();
            await page.getByLabel("Item name", { exact: true }).fill(title);
            await page.getByRole("button", { name: "Add item", exact: true }).click();
            await page.getByText(title + " added.", { exact: true }).waitFor();
          }
          const ids = await page.evaluate(() => window.__rosterAudit.created.map((i) => i.id));
          await page.getByRole("button", { name: new RegExp(titles[0]) }).click();
          const input = page.getByLabel("Score for Ana Santos", { exact: true });
          await input.waitFor();
          await input.evaluate((el) => (window.__retainedScoreNode = el));
          const row = input.locator("xpath=ancestor::tr");
          const submitDelete = async (i) => {
            const g = page.getByRole("group", { name: "Actions for " + titles[i], exact: true });
            await g.getByRole("button", { name: "Delete", exact: true }).click();
            await g.getByRole("button", { name: "Confirm delete", exact: true }).click();
            await page.waitForFunction(
              (id) => Boolean(window.__rosterAudit.releaseDelete[id]),
              ids[i],
            );
          };
          await submitDelete(1);
          await input.fill("18");
          await input.press("Enter");
          await page.waitForFunction(() => window.__rosterAudit.calls.length === 1);
          await input.fill("19");
          await input.focus();
          await page.evaluate((id) => {
            window.__rosterAudit.holdList = true;
            window.__rosterAudit.releaseList = null;
            window.__rosterAudit.releaseDelete[id]();
          }, ids[1]);
          await page.getByText(/Checking assessment items/).waitFor();
          await page.waitForFunction(() => Boolean(window.__rosterAudit.releaseList));
          assert(
            await input.evaluate(
              (el) => el === window.__retainedScoreNode && el === document.activeElement,
            ),
          );
          assert.equal(await input.inputValue(), "19");
          await input.press("Enter");
          assert.equal(await page.evaluate(() => window.__rosterAudit.calls.length), 1);
          await page.evaluate(() => window.__rosterAudit.releaseScore());
          await row.getByText(/On this device: 18 \/ 20/).waitFor();
          assert.equal(await input.inputValue(), "19");
          assert(await input.evaluate((el) => el === document.activeElement));
          assert.equal(await page.evaluate(() => window.__rosterAudit.rosters.length), 1);
          await page.evaluate(axe.source);
          const axeCheck = () =>
            page.evaluate(async () =>
              (
                await window.axe.run(document, {
                  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
                })
              ).violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
            );
          const normalViolations = await axeCheck();
          assert.deepEqual(normalViolations, []);
          const style = (locator) =>
            locator.evaluate((el) => {
              const s = getComputedStyle(el),
                r = el.getBoundingClientRect();
              return {
                width: r.width,
                height: r.height,
                minHeight: s.minHeight,
                color: s.color,
                background: s.backgroundColor,
                border: s.borderColor,
                padding: s.padding,
                font: s.fontFamily,
                fontSize: s.fontSize,
                lineHeight: s.lineHeight,
                radius: s.borderRadius,
                outline: s.outlineWidth,
                outlineOffset: s.outlineOffset,
                transition: s.transitionDuration,
                easing: s.transitionTimingFunction,
              };
            });
          const clearance = async (locator) =>
            locator.evaluate((node) => {
              const r = node.getBoundingClientRect();
              const nav = document.querySelector(".app-bottomnav");
              const navTop =
                nav && getComputedStyle(nav).position === "fixed"
                  ? nav.getBoundingClientRect().top
                  : innerHeight;
              return {
                top: r.top,
                bottom: r.bottom,
                navTop,
                hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === node,
              };
            });
          const normalClearance = await clearance(input);
          assert(
            normalClearance.top >= 0 &&
              normalClearance.bottom <= normalClearance.navTop &&
              normalClearance.hit,
            JSON.stringify({ appearance, density, width, motion, normalClearance }),
          );
          const normalStyle = await style(input),
            statusStyle = await style(page.locator("#score-assessment-check"));
          assert(normalStyle.width >= 24 && normalStyle.height >= 24);
          const representative =
            ((appearance === "light" && density === "comfortable" && width === 1280) ||
              (appearance === "dark" && density === "guided" && width === 390)) &&
            motion === "reduce";
          if (representative)
            await page.screenshot({
              path: `${output}/score-${width === 390 ? "phone" : "desktop"}.png`,
              fullPage: true,
            });
          await page.evaluate(() => {
            window.__rosterAudit.holdList = false;
            window.__rosterAudit.releaseList();
          });
          await page.locator("#score-assessment-check").waitFor({ state: "detached" });
          assert(
            await input.evaluate(
              (el) => el === window.__retainedScoreNode && el === document.activeElement,
            ),
          );
          assert.equal(await input.inputValue(), "19");
          const choice = page.getByRole("button", { name: new RegExp(titles[0]) });
          assert((await choice.textContent()).includes("1 of 3 recorded"));
          await input.focus();
          await input.press("Enter");
          await submitDelete(2);
          const reason = page.getByLabel("Reason for changing Ana Santos's recorded score", {
            exact: true,
          });
          await reason.fill("Synthetic reviewed-paper correction — retain this reason");
          await reason.focus();
          await reason.evaluate((el) => (window.__retainedReasonNode = el));
          await page.evaluate((id) => {
            window.__rosterAudit.holdList = true;
            window.__rosterAudit.releaseList = null;
            window.__rosterAudit.releaseDelete[id]();
          }, ids[2]);
          await page.getByText(/Checking assessment items/).waitFor();
          await page.waitForFunction(() => Boolean(window.__rosterAudit.releaseList));
          assert(
            await reason.evaluate(
              (el) => el === window.__retainedReasonNode && el === document.activeElement,
            ),
          );
          await reason.press("Enter");
          assert.equal(await page.evaluate(() => window.__rosterAudit.calls.length), 1);
          assert(await page.getByText("Recorded: 18 / 20", { exact: true }).isVisible());
          assert(await page.getByText("Change to: 19 / 20", { exact: true }).isVisible());
          const reasonClearance = await clearance(reason);
          assert(
            reasonClearance.top >= 0 &&
              reasonClearance.bottom <= reasonClearance.navTop &&
              reasonClearance.hit,
            JSON.stringify({ appearance, density, width, motion, reasonClearance }),
          );
          const correctionViolations = await axeCheck();
          assert.deepEqual(correctionViolations, []);
          const reasonStyle = await style(reason);
          assert(reasonStyle.width >= 24 && reasonStyle.height >= 24);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          );
          assert(!overflow, JSON.stringify({ appearance, density, width, motion }));
          if (representative)
            await page.screenshot({
              path: `${output}/correction-${width === 390 ? "phone" : "desktop"}.png`,
              fullPage: true,
            });
          await page.evaluate(() => {
            window.__rosterAudit.holdList = false;
            window.__rosterAudit.releaseList();
          });
          await page.locator("#score-assessment-check").waitFor({ state: "detached" });
          assert(
            await reason.evaluate(
              (el) => el === window.__retainedReasonNode && el === document.activeElement,
            ),
          );
          assert((await reason.inputValue()).includes("retain this reason"));
          await reason.press("Escape");
          await input.waitFor();
          assert.equal(await input.inputValue(), "18");
          const audit = await page.evaluate(() => ({
            calls: window.__rosterAudit.calls,
            saved: window.__rosterAudit.saved,
            rosters: window.__rosterAudit.rosters,
            reads: window.__rosterAudit.reads.map((list) =>
              list.map((i) => ({ id: i.id, recordedCount: i.recordedCount })),
            ),
          }));
          assert.equal(audit.calls.length, 1);
          assert.equal(audit.calls[0][0], ids[0]);
          assert.equal(audit.calls[0][2], "scored");
          assert.equal(audit.calls[0][3], 18);
          assert.equal(audit.calls[0][4], null);
          assert.equal(audit.saved.assessmentItemId, ids[0]);
          assert.equal(audit.saved.score, 18);
          assert.equal(audit.rosters.length, 1);
          const persisted = await page.evaluate(
            (id) => window.__rosterAudit.readScores(id),
            ids[0],
          );
          assert.equal(persisted.find((e) => e.learnerId === audit.calls[0][1]).score, 18);
          cases.push({
            appearance,
            density,
            width,
            motion,
            ids,
            audit,
            persisted,
            normalStyle,
            normalClearance,
            reasonClearance,
            statusStyle,
            reasonStyle,
            normalViolations,
            correctionViolations,
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
    "scripts/assurance/scores-roster-refresh-browser.mjs",
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
          "Controlled synthetic in-memory writes and reads; not native persistence/device proof",
          "Both resolved appearances; System provider resolution remains separately evidenced",
          "Full PM-12/13/A1–A7 teacher/manual/platform acceptance remains partial",
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
