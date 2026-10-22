// Actual Scores CSV feedback using virtual paths and synthetic results only.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "../ui-browser.mjs";

const output = ".cache/scores-export-feedback";
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", (chunk) => (logs += chunk));
server.stderr.on("data", (chunk) => (logs += chunk));
let browser;
const title =
  "Synthetic assessment — A carefully reviewed solution with a long title for the same class";
const cases = [];
const checks = [];
try {
  const url = "http://127.0.0.1:1420/dev-preview.html";
  for (let n = 0; n < 80; n++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* starting */
    }
    if (n === 79) throw Error(logs);
    await new Promise((done) => setTimeout(done, 250));
  }
  browser = await chromium.launch({ headless: true, executablePath: await uiBrowserExecutable() });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    reducedMotion: "reduce",
    hasTouch: true,
  });
  await page.route("**/src/dev-preview/fixtures.ts", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    for (const name of ["FixtureExportRepository", "FixtureLearnerScoreRepository"]) {
      assert(body.includes("export class " + name));
      body = body.replace("export class " + name, "class Base" + name);
    }
    body += `
      window.__exportAudit={modes:{report:"success",summary:"success"},calls:[],reveals:[],scoreWrites:0,reject:null};
      window.__exportAudit.path=kind=>"C:/Synthetic/"+kind+"_"+"LongSavedRecordName".repeat(8)+".csv";
      window.__exportAudit.run=async kind=>{
        const a=window.__exportAudit;a.calls.push(kind);
        if(a.modes[kind]==="delay") await new Promise((_resolve,reject)=>a.reject=reject);
        if(a.modes[kind]==="reject") throw new Error("synthetic export failure");
        return {filePath:a.path(kind),disclosure:{populatedFields:["Synthetic learner"],omittedFields:[{field:"Synthetic omitted field",reason:"Synthetic disclosure for layout verification"}]}};
      };
      export class FixtureExportRepository extends BaseFixtureExportRepository {
        async exportClassRecordReportCard(){return window.__exportAudit.run("report");}
        async exportClassRecordSummary(){return window.__exportAudit.run("summary");}
        async revealExportedFile(path){window.__exportAudit.reveals.push(path);}
      }
      export class FixtureLearnerScoreRepository extends BaseFixtureLearnerScoreRepository {
        async record(...args){window.__exportAudit.scoreWrites++;return super.record(...args);}
      }
    `;
    await route.fulfill({ response, body });
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Mathematics · Mabini", exact: true }).click();
  await page.getByRole("tab", { name: "Scores", exact: true }).click();
  await page.getByLabel("Grading period", { exact: true }).selectOption("gp1");
  await page.getByLabel("DepEd grading weighting", { exact: true }).selectOption("wp-k10");
  await page.getByRole("button", { name: "Open class record", exact: true }).click();
  await page.getByLabel("Item name", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByRole("button", { name: /Written Works — Synthetic assessment/ }).click();
  const input = page.getByLabel("Score for Ana Santos", { exact: true });
  await input.waitFor();
  const labels = { report: "report card", summary: "class summary" };
  const action = (kind) =>
    page.getByRole("button", { name: "Export " + labels[kind] + " (CSV)", exact: true });
  const folder = (kind) =>
    page.getByRole("button", { name: "Open " + labels[kind] + " folder", exact: true });
  const failure = (kind) =>
    page.getByRole("heading", {
      name: (kind === "report" ? "Report card" : "Class summary") + " export not confirmed",
      exact: true,
    });
  for (const kind of ["report", "summary"]) {
    await action(kind).click();
    await folder(kind).waitFor();
    await page.evaluate((k) => (window.__exportAudit.modes[k] = "delay"), kind);
    const before = await page.evaluate(() => window.__exportAudit.calls.length);
    await action(kind).click();
    const busy = page.getByRole("button", { name: "Exporting…", exact: true });
    await busy.waitFor();
    assert.equal(await busy.getAttribute("aria-disabled"), "true");
    assert.equal(await folder(kind).count(), 0);
    await busy.focus();
    await busy.press("Enter");
    assert.equal(await page.evaluate(() => window.__exportAudit.calls.length), before + 1);
    await page.evaluate(() => window.__exportAudit.reject(new Error("synthetic deferred failure")));
    await failure(kind).waitFor();
    assert.equal(await folder(kind).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Reload items", exact: true }).count(), 0);
    await page.evaluate((k) => (window.__exportAudit.modes[k] = "success"), kind);
    await action(kind).focus();
    await action(kind).press("Enter");
    await folder(kind).waitFor();
    assert(await action(kind).evaluate((el) => el === document.activeElement));
    await folder(kind).click();
    assert.equal(await page.evaluate(() => window.__exportAudit.scoreWrites), 0);
    checks.push({
      kind,
      case: "pending removes previous result; duplicate keyboard activation guarded; failure/retry retains focus; named folder path; zero score writes",
      status: "PASS",
    });
  }
  assert.deepEqual(
    await page.evaluate(() => window.__exportAudit.reveals),
    await page.evaluate(() => [
      window.__exportAudit.path("report"),
      window.__exportAudit.path("summary"),
    ]),
  );
  for (const motion of ["no-preference", "reduce"]) {
    await page.emulateMedia({ reducedMotion: motion });
    for (const appearance of ["light", "dark"])
      for (const density of ["efficient", "comfortable", "guided"])
        for (const width of [1280, 640, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          const account = page.locator(".app-account-trigger");
          if ((await account.count()) && (await account.isVisible())) await account.click();
          else await page.getByRole("button", { name: "Account", exact: true }).click();
          await page.getByRole("combobox", { name: /Appearance/ }).selectOption(appearance);
          const names = { efficient: "Efficient", comfortable: "Comfortable", guided: "Guided" };
          await page.getByRole("button", { name: names[density], exact: true }).click();
          if ((await account.count()) && (await account.isVisible()))
            await page.keyboard.press("Escape");
          else {
            await page.getByRole("button", { name: "Classes", exact: true }).click();
            await page.getByRole("button", { name: "Mathematics · Mabini", exact: true }).click();
            await page.getByRole("tab", { name: "Scores", exact: true }).click();
          }
          await input.waitFor();
          const states = [];
          for (const failed of ["report", "summary"]) {
            await page.evaluate(() => {
              window.__exportAudit.modes.report = "success";
              window.__exportAudit.modes.summary = "success";
            });
            await action("report").click();
            await folder("report").waitFor();
            await action("summary").click();
            await folder("summary").waitFor();
            await page.evaluate((k) => (window.__exportAudit.modes[k] = "reject"), failed);
            await action(failed).click();
            await failure(failed).waitFor();
            assert.equal(await folder(failed).count(), 0);
            assert(await folder(failed === "report" ? "summary" : "report").isVisible());
            await page.evaluate(axe.source);
            const violations = await page.evaluate(async () =>
              (
                await window.axe.run(document, {
                  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
                })
              ).violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
            );
            const bounds = await page.evaluate(() => ({
              pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
              pathOverflow: [...document.querySelectorAll(".term-grades code")].some(
                (el) => el.parentElement.scrollWidth > el.parentElement.clientWidth + 1,
              ),
              actions: [...document.querySelectorAll(".term-grades button")].map((el) => ({
                name: el.getAttribute("aria-label") ?? el.textContent,
                width: el.getBoundingClientRect().width,
                height: el.getBoundingClientRect().height,
              })),
            }));
            assert.deepEqual(violations, []);
            assert.equal(
              bounds.pageOverflow,
              false,
              JSON.stringify({ appearance, density, width, motion, failed, bounds }),
            );
            assert.equal(bounds.pathOverflow, false);
            assert(bounds.actions.every((a) => a.width >= 24 && a.height >= 24));
            states.push({ failed, bounds, violations, status: "PASS" });
          }
          cases.push({ appearance, density, width, motion, states, status: "PASS" });
          if (
            width === 1280 &&
            appearance === "light" &&
            density === "comfortable" &&
            motion === "reduce"
          )
            await page.screenshot({ path: output + "/desktop.png", fullPage: true });
          if (width === 390 && appearance === "dark" && density === "guided" && motion === "reduce")
            await page.screenshot({ path: output + "/phone.png", fullPage: true });
        }
  }
  const sources = {};
  for (const f of [
    "src/ui/ClassRecordWorkspace.tsx",
    "src/ui/ClassRecordWorkspace.test.tsx",
    "src/ui/theme/styles.css",
    "scripts/assurance/scores-export-feedback-browser.mjs",
  ])
    sources[f] = createHash("sha256")
      .update(await readFile(f))
      .digest("hex");
  const receipt = {
    project: "LIKHA-SIS",
    head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sources,
    node: process.version,
    browser: browser.version(),
    checks,
    cases,
    limits: [
      "Virtual paths/results only; no native file created/opened",
      "No official-form/file-byte fidelity claim",
      "Full teacher/device/manual A1–A7 pending",
    ],
  };
  await writeFile(output + "/receipt.json", JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify({
      cases: cases.length,
      states: cases.reduce((n, c) => n + c.states.length, 0),
      checks: checks.length,
      status: "PASS",
    }),
  );
} finally {
  await browser?.close();
  server.kill();
}
