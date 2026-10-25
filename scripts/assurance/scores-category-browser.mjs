// Production Scores controls, synthetic category reads; no native/device proof.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "../ui-browser.mjs";
const output = ".cache/scores-category";
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
  stdio: "pipe",
});
let browser;
const cases = [];
try {
  const url = "http://127.0.0.1:1420/dev-preview.html";
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    if (i === 79) throw Error("Server unavailable");
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
            for (const name of ["Assessment", "LearnerScore"]) {
              const needle = `export class Fixture${name}Repository`;
              assert(body.includes(needle));
              body = body.replace(needle, `class BaseFixture${name}Repository`);
            }
            body += `
window.__categoryAudit={categoryReads:[],itemReads:[],rosterReads:[],creates:[],scores:[]};
export class FixtureAssessmentRepository extends BaseFixtureAssessmentRepository {
 async listCategorySets(){const rows=await super.listCategorySets();return [...rows,{...rows[0],id:'audit-other',name:'Synthetic recovery set',isDefault:false},{...rows[0],id:'audit-empty',name:'Synthetic empty set',isDefault:false}];}
 async listCategoriesForSet(id){const a=window.__categoryAudit;a.categoryReads.push(id);if(id==='audit-empty')return [];if(id!=='audit-other')return super.listCategoriesForSet(id);return new Promise((resolve,reject)=>{a.release=()=>resolve([{id:'audit-category',setId:id,name:'Synthetic recovered category',sequence:1}]);a.fail=()=>reject(Error('Synthetic offline'));});}
 async listItemsByClassRecord(id){window.__categoryAudit.itemReads.push(id);return super.listItemsByClassRecord(id);}
 async createItem(...args){window.__categoryAudit.creates.push(args);return super.createItem(...args);}
}
export class FixtureLearnerScoreRepository extends BaseFixtureLearnerScoreRepository {
 async rosterForItem(id){window.__categoryAudit.rosterReads.push(id);return super.rosterForItem(id);}
 async record(...args){window.__categoryAudit.scores.push(args);const result=await super.record(...args);window.__categoryAudit.saved=result;return result;}
}`;
            await route.fulfill({ response, body });
          });
          await page.goto(url, { waitUntil: "networkidle" });
          await page.getByRole("button", { name: "Mathematics · Mabini", exact: true }).click();
          await page.getByRole("tab", { name: "Scores", exact: true }).click();
          await page.getByLabel("Grading period", { exact: true }).selectOption("gp1");
          await page.getByLabel("DepEd grading weighting", { exact: true }).selectOption("wp-k10");
          await page.getByRole("button", { name: "Open class record", exact: true }).click();
          await page.getByLabel("Item name", { exact: true }).fill("Synthetic category baseline");
          await page.getByRole("button", { name: "Add item", exact: true }).click();
          await page
            .getByRole("button", { name: /Synthetic category baseline \(max 20\)/ })
            .click();
          const score = page.getByLabel("Score for Ana Santos", { exact: true });
          await score.fill("0");
          await score.press("Enter");
          await page.waitForFunction(() => window.__categoryAudit.saved?.score === 0);
          await score.fill("1");
          await score.press("Enter");
          const reason = page.getByRole("textbox", {
            name: "Reason for changing Ana Santos's recorded score",
          });
          await reason.fill("Synthetic correction draft retained");
          await page.getByRole("button", { name: "Add assessment item", exact: true }).click();
          const name = page.getByLabel("Item name", { exact: true }),
            max = page.getByLabel("Max score", { exact: true });
          await name.fill("Synthetic recovered item");
          await max.fill("30");
          const before = await page.evaluate(() => ({
            items: window.__categoryAudit.itemReads.length,
            rosters: window.__categoryAudit.rosterReads.length,
            scoreCalls: window.__categoryAudit.scores.length,
            creates: window.__categoryAudit.creates.length,
          }));
          await reason.evaluate((n) => (n.dataset.categoryIdentity = "retained"));
          await page.getByLabel("Category set", { exact: true }).selectOption("audit-other");
          const category = page.getByLabel("Category", { exact: true });
          await page.waitForFunction(() => typeof window.__categoryAudit.fail === "function");
          await page.evaluate(() => window.__categoryAudit.fail());
          const retry = page.getByRole("button", { name: "Retry categories", exact: true });
          await retry.waitFor();
          const observations = [];
          const audit = async (state) => {
            assert.equal(await name.inputValue(), "Synthetic recovered item");
            assert.equal(await max.inputValue(), "30");
            assert.equal(await reason.inputValue(), "Synthetic correction draft retained");
            assert.equal(await reason.getAttribute("data-category-identity"), "retained");
            const calls = await page.evaluate(() => window.__categoryAudit);
            assert.equal(calls.itemReads.length, before.items);
            assert.equal(calls.rosterReads.length, before.rosters);
            assert.equal(calls.scores.length, before.scoreCalls);
            assert.equal(calls.creates.length, before.creates);
            assert.equal(calls.saved.score, 0);
            await page.evaluate(axe.source);
            const view = await page.evaluate(async () => {
              const a = await window.axe.run(document, {
                runOnly: {
                  type: "tag",
                  values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
                },
              });
              const n = document.querySelector("#workspace-category"),
                s = getComputedStyle(n);
              return {
                violations: a.violations.map((v) => v.id),
                overflow: document.documentElement.scrollWidth > innerWidth,
                value: n.value,
                description: n.getAttribute("aria-describedby"),
                style: {
                  font: s.fontFamily,
                  fontSize: s.fontSize,
                  color: s.color,
                  background: s.backgroundColor,
                  height: s.height,
                  radius: s.borderRadius,
                },
              };
            });
            assert.deepEqual(view.violations, []);
            assert.equal(view.overflow, false);
            observations.push({
              state,
              ...view,
              categoryReads: calls.categoryReads,
              items: calls.itemReads,
              rosters: calls.rosterReads,
              scoreCalls: calls.scores,
              creates: calls.creates,
              saved: calls.saved,
            });
            if (
              motion === "reduce" &&
              ((appearance === "light" && density === "comfortable" && width === 1280) ||
                (appearance === "dark" && density === "guided" && width === 390))
            )
              await page.screenshot({ path: `${output}/${state}-${width}.png`, fullPage: true });
          };
          assert(await category.isDisabled());
          await audit("failed");
          await retry.focus();
          await page.keyboard.press("Enter");
          await page.getByText("Loading categories…", { exact: true }).waitFor();
          await audit("retrying");
          await page.evaluate(() => window.__categoryAudit.release());
          await category.selectOption("audit-category");
          assert(await category.isEnabled());
          await audit("ready");
          // No create replay: one explicit click after review submits the current category tuple.
          await page.getByRole("button", { name: "Add item", exact: true }).click();
          await page.getByText("Synthetic recovered item added.", { exact: true }).waitFor();
          const submitted = await page.evaluate(() => window.__categoryAudit.creates.at(-1));
          assert.deepEqual(submitted.slice(1), ["audit-category", "Synthetic recovered item", 30]);
          assert.equal(await reason.inputValue(), "Synthetic correction draft retained");
          await page.getByRole("button", { name: "Add assessment item", exact: true }).click();
          await name.fill("Synthetic recovered item");
          await max.fill("30");
          const newBefore = await page.evaluate(() => ({
            items: window.__categoryAudit.itemReads.length,
            rosters: window.__categoryAudit.rosterReads.length,
            scoreCalls: window.__categoryAudit.scores.length,
            creates: window.__categoryAudit.creates.length,
          }));
          Object.assign(before, newBefore);
          await page.getByLabel("Category set", { exact: true }).selectOption("audit-empty");
          await page
            .getByText("No categories are available for this set.", { exact: true })
            .waitFor();
          assert(await category.isDisabled());
          await audit("empty");
          await page.getByRole("button", { name: "Add item", exact: true }).dispatchEvent("click");
          assert.equal(
            await page.evaluate(() => window.__categoryAudit.creates.length),
            before.creates,
          );
          cases.push({ appearance, density, width, motion, observations, submitted });
          console.log(appearance, density, width, motion, "PASS");
          await context.close();
        }
  const hashes = {};
  for (const file of [
    "src/ui/ClassRecordWorkspace.tsx",
    "src/ui/theme/styles.css",
    "scripts/assurance/scores-category-browser.mjs",
  ])
    hashes[file] = createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  await writeFile(
    `${output}/receipt.json`,
    JSON.stringify(
      {
        head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        environment: "Chromium dev preview; synthetic repositories; no native persistence claim",
        configurations: cases.length,
        states: cases.length * 4,
        hashes,
        cases,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`PASS ${cases.length} configurations / ${cases.length * 4} states`);
} finally {
  await browser?.close();
  server.kill();
}
