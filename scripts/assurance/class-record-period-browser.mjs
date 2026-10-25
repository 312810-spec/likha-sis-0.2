// Real context form, synthetic repositories; no native persistence claim.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "../ui-browser.mjs";
const output = ".cache/class-record-period";
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
    if (i === 79) throw Error("Preview server unavailable");
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
          await page.route("**/src/dev-preview/DevPreviewApp.tsx", async (route) => {
            const response = await route.fetch();
            let body = await response.text();
            assert(body.includes(': "workspace"'));
            body = body.replace(': "workspace"', ': "record-library"');
            await route.fulfill({ response, body });
          });
          await page.route("**/src/dev-preview/fixtures.ts", async (route) => {
            const response = await route.fetch();
            let body = await response.text();
            for (const name of ["Section", "Grading", "ClassRecord"]) {
              const needle = `export class Fixture${name}Repository`;
              assert(body.includes(needle));
              body = body.replace(needle, `class BaseFixture${name}Repository`);
            }
            body += `
window.__periodAudit={reads:[],writes:[]};
export class FixtureSectionRepository extends BaseFixtureSectionRepository {
 async list(){const rows=await super.list();return [...rows,{...rows[0],id:'period-new-section',schoolYear:'2027-2028',name:'Synthetic next-year section'}];}
}
export class FixtureGradingRepository extends BaseFixtureGradingRepository {
 async listPeriodsBySchoolYear(year){const a=window.__periodAudit;a.reads.push(year);if(year!=='2027-2028')return super.listPeriodsBySchoolYear(year);return new Promise((resolve,reject)=>{a.release=()=>resolve([{id:'period-new',schoolId:'fixture-school',schoolYear:year,policyPeriodId:'synthetic',label:'Synthetic next-year term',startsOn:'2027-06-01',endsOn:'2027-09-01',createdAt:'synthetic'}]);a.empty=()=>resolve([]);a.fail=()=>reject(Error('Synthetic offline'));});}
}
export class FixtureClassRecordRepository extends BaseFixtureClassRecordRepository {
 async create(...args){window.__periodAudit.writes.push(args);return null;}
}`;
            await route.fulfill({ response, body });
          });
          await page.goto(url, { waitUntil: "networkidle" });
          const period = page.getByLabel("Grading period", { exact: true });
          await page.waitForFunction(() => document.querySelector("#class-record-period")?.value);
          const oldPeriod = await period.inputValue();
          assert(oldPeriod);
          const subject = await page.getByLabel("Subject", { exact: true }).inputValue();
          const weighting = await page
            .getByLabel("DepEd grading weighting", { exact: true })
            .inputValue();
          await page.getByLabel("Section", { exact: true }).selectOption("period-new-section");
          const open = page.getByRole("button", { name: "Open class record", exact: true });
          const observations = [];
          console.log(appearance, density, width, motion);
          const audit = async (state) => {
            await page.evaluate(axe.source);
            const result = await page.evaluate(async () => {
              const axeResult = await window.axe.run(document, {
                runOnly: {
                  type: "tag",
                  values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
                },
              });
              const node = document.querySelector("#class-record-period");
              const s = getComputedStyle(node);
              return {
                violations: axeResult.violations.map((v) => v.id),
                overflow: document.documentElement.scrollWidth > innerWidth,
                period: node.value,
                description: node.getAttribute("aria-describedby"),
                style: {
                  font: s.fontFamily,
                  color: s.color,
                  background: s.backgroundColor,
                  height: s.height,
                  radius: s.borderRadius,
                },
                reads: [...window.__periodAudit.reads],
                writes: [...window.__periodAudit.writes],
              };
            });
            assert.deepEqual(result.violations, []);
            assert.equal(result.overflow, false);
            observations.push({ state, ...result });
            if (
              motion === "reduce" &&
              ((appearance === "light" && density === "comfortable" && width === 1280) ||
                (appearance === "dark" && density === "guided" && width === 390))
            )
              await page.screenshot({ path: `${output}/${state}-${width}.png`, fullPage: true });
          };
          assert(await period.isDisabled());
          assert.equal(await period.inputValue(), "");
          assert.equal(await period.locator(`option[value="${oldPeriod}"]`).count(), 0);
          await open.dispatchEvent("click");
          await open.focus();
          await page.keyboard.press("Enter");
          assert.deepEqual(await page.evaluate(() => window.__periodAudit.writes), []);
          await audit("pending");
          await page.evaluate(() => window.__periodAudit.fail());
          const retry = page.getByRole("button", { name: "Retry grading periods", exact: true });
          await retry.waitFor();
          assert(await period.isDisabled());
          await open.dispatchEvent("click");
          await audit("failed");
          await retry.focus();
          await page.keyboard.press("Enter");
          await page.waitForFunction(() => window.__periodAudit.reads.length === 3);
          assert.equal(await page.getByLabel("Subject", { exact: true }).inputValue(), subject);
          assert.equal(
            await page.getByLabel("DepEd grading weighting", { exact: true }).inputValue(),
            weighting,
          );
          assert.deepEqual(await page.evaluate(() => window.__periodAudit.writes), []);
          await page.evaluate(() => window.__periodAudit.empty());
          await page.getByText("No grading periods for 2027-2028.", { exact: true }).waitFor();
          assert(await period.isDisabled());
          await open.dispatchEvent("click");
          await audit("empty");
          // Re-enter context; explicit teacher action, no automatic write or retry.
          await page.getByLabel("Section", { exact: true }).selectOption({ index: 0 });
          await page.waitForFunction(() => document.querySelector("#class-record-period")?.value);
          await page.getByLabel("Section", { exact: true }).selectOption("period-new-section");
          await page.waitForFunction(() => window.__periodAudit.reads.length === 5);
          await page.evaluate(() => window.__periodAudit.release());
          await page.waitForFunction(
            () => document.querySelector("#class-record-period")?.value === "period-new",
          );
          assert.equal(await open.getAttribute("aria-disabled"), "false");
          await audit("ready");
          await open.dispatchEvent("click");
          assert.deepEqual(await page.evaluate(() => window.__periodAudit.writes), [
            ["period-new-section", subject, "period-new", weighting],
          ]);
          cases.push({
            appearance,
            density,
            width,
            motion,
            observations,
            submitted: await page.evaluate(() => window.__periodAudit.writes),
          });
          await context.close();
        }
  const hashes = {};
  for (const file of [
    "src/ui/ClassRecordsScreen.tsx",
    "src/ui/theme/styles.css",
    "scripts/assurance/class-record-period-browser.mjs",
  ])
    hashes[file] = createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  const receipt = {
    head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    environment: "Chromium local dev preview; synthetic read failures, no native persistence",
    hashes,
    configurations: cases.length,
    states: cases.length * 4,
    cases,
  };
  await writeFile(`${output}/receipt.json`, JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    `PASS ${cases.length} configurations / ${cases.length * 4} states; exact tuple and no blocked/retry writes`,
  );
} finally {
  await browser?.close();
  server.kill();
}
