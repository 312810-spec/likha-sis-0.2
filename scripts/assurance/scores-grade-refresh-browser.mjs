// Actual Scores UI with controlled synthetic term-grade read failures only.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "../ui-browser.mjs";

const output = ".cache/scores-grade-refresh";
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
    assert(body.includes("export class FixtureLearnerScoreRepository"));
    body = body.replace(
      "export class FixtureLearnerScoreRepository",
      "class BaseFixtureLearnerScoreRepository",
    );
    body += `
      window.__gradeAudit = {mode:"success", grade:88, writes:0, reads:0, reject:null};
      export class FixtureLearnerScoreRepository extends BaseFixtureLearnerScoreRepository {
        async record(...args) {window.__gradeAudit.writes++;return super.record(...args);}
        async computeTermGrade() {
          const audit=window.__gradeAudit;audit.reads++;
          if(audit.mode==="delay") await new Promise((_resolve,reject)=>audit.reject=reject);
          if(audit.mode==="reject") throw new Error("synthetic grade read failure");
          return {initialGrade:85.8,termGrade:audit.grade,wasTransmuted:true,wasFloored:false,complete:true};
        }
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
  const choice = page.getByRole("button", {
    name: new RegExp("Written Works — Synthetic assessment"),
  });
  await choice.click();
  const input = page.getByLabel("Score for Ana Santos", { exact: true });
  await input.fill("0");
  await input.press("Enter");
  await page
    .getByText(/Saved on this device/)
    .first()
    .waitFor();
  assert.equal(await input.inputValue(), "0");
  assert.equal(await choice.getAttribute("aria-pressed"), "true");
  assert(
    await page
      .getByText("Can’t delete — already has recorded scores.", { exact: true })
      .isVisible(),
  );
  const show = page.getByRole("button", { name: "Show term grades", exact: true });
  await show.click();
  const grades = page.getByRole("table", { name: "Computed term grades" });
  const anaGrade = grades.getByRole("row", { name: /Ana Santos/ });
  await grades.getByText("88", { exact: true }).first().waitFor();
  await page.evaluate(() => (window.__gradeAudit.mode = "delay"));
  // Change an already-recorded score through the actual reason/review path.
  await input.fill("1");
  await input.press("Enter");
  const reason = page.getByLabel(/Reason for changing Ana Santos/);
  await reason.fill("Synthetic correction for grade refresh check");
  await page.getByRole("button", { name: "Save correction", exact: true }).click();
  await grades.getByText("Updating grade…", { exact: true }).first().waitFor();
  assert.equal(await anaGrade.getByText("88", { exact: true }).count(), 0);
  await page.evaluate(() => window.__gradeAudit.reject(new Error("synthetic delayed failure")));
  const errorText = "Could not refresh. Show term grades to retry.";
  await grades.getByText(errorText, { exact: true }).first().waitFor();
  assert.equal(await input.inputValue(), "1");
  assert(
    await page
      .getByText(/Saved on this device/)
      .first()
      .isVisible(),
  );
  const writes = await page.evaluate(() => window.__gradeAudit.writes);
  await page.evaluate(() => {
    window.__gradeAudit.mode = "success";
    window.__gradeAudit.grade = 92;
  });
  await show.focus();
  await show.press("Enter");
  await grades.getByText("92", { exact: true }).first().waitFor();
  assert(await show.evaluate((el) => el === document.activeElement));
  assert.equal(await page.evaluate(() => window.__gradeAudit.writes), writes);
  checks.push({
    case: "saved correction invalidates old grade; failed read preserves save; keyboard retry reads only and retains focus",
    status: "PASS",
    writes,
  });
  for (const motion of ["no-preference", "reduce"]) {
    await page.emulateMedia({ reducedMotion: motion });
    for (const appearance of ["light", "dark"])
      for (const density of ["efficient", "comfortable", "guided"])
        for (const width of [1280, 640, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          // Use existing account preferences without introducing test-only UI.
          const account = page.locator(".app-account-trigger");
          if ((await account.count()) && (await account.isVisible())) {
            await account.click();
          } else {
            await page.getByRole("button", { name: "Account", exact: true }).click();
          }
          await page.getByRole("combobox", { name: /Appearance/ }).selectOption(appearance);
          const labels = { efficient: "Efficient", comfortable: "Comfortable", guided: "Guided" };
          await page.getByRole("button", { name: labels[density], exact: true }).click();
          if ((await account.count()) && (await account.isVisible()))
            await page.keyboard.press("Escape");
          else {
            await page.getByRole("button", { name: "Classes", exact: true }).click();
            await page.getByRole("button", { name: "Mathematics · Mabini", exact: true }).click();
            await page.getByRole("tab", { name: "Scores", exact: true }).click();
          }
          await input.waitFor();
          await page.evaluate(() => (window.__gradeAudit.mode = "reject"));
          await show.click();
          await grades.getByText(errorText, { exact: true }).first().waitFor();
          assert.equal(await grades.getByText("92", { exact: true }).count(), 0);

          await page.evaluate(() => {
            window.scrollTo(0, 0);
            for (const el of document.querySelectorAll("*")) if (el.scrollTop) el.scrollTop = 0;
          });
          await page.evaluate(axe.source);
          const violations = await page.evaluate(async () =>
            (
              await window.axe.run(document, {
                runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
              })
            ).violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
          );
          const bounds = await page.evaluate(() => {
            const choice = document.querySelector(".assessment-item-list > li > button");
            const input = document.querySelector(".score-entry-input");
            const gradeTable = document.querySelector(".term-grades table");
            const gradeAction = document.querySelector(".term-grades > button");
            const gradeError = gradeTable.querySelector(".field-error");
            const rect = choice.getBoundingClientRect();
            return {
              rosterY: input.getBoundingClientRect().top,
              gradeActionWidth: gradeAction.getBoundingClientRect().width,
              gradeActionHeight: gradeAction.getBoundingClientRect().height,
              gradeCellOverflow: [...gradeTable.querySelectorAll("tbody th,tbody td")].some(
                (el) => el.scrollWidth > el.clientWidth + 1,
              ),
              gradeErrorColor: getComputedStyle(gradeError).color,
              gradeErrorFont: getComputedStyle(gradeError).fontSize,
              choiceHeight: rect.height,
              choiceWidth: rect.width,
              choiceOverflow: choice.scrollWidth > choice.clientWidth + 1,
              pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
              controlHeight: getComputedStyle(choice).minHeight,
              background: getComputedStyle(choice).backgroundColor,
              text: getComputedStyle(choice).color,
              focus: getComputedStyle(choice).outlineColor,
              font: getComputedStyle(choice).fontFamily,
            };
          });
          assert.deepEqual(violations, []);
          assert.equal(bounds.choiceOverflow, false);
          assert.equal(bounds.pageOverflow, false);
          assert.equal(
            bounds.gradeCellOverflow,
            false,
            JSON.stringify({ appearance, density, width, motion, bounds }),
          );
          assert(bounds.gradeActionWidth >= 24 && bounds.gradeActionHeight >= 24);
          assert(bounds.choiceHeight >= 24 && bounds.choiceWidth >= 24);
          cases.push({ appearance, density, width, motion, bounds, violations, status: "PASS" });
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
  const sourcePaths = [
    "src/ui/ClassRecordWorkspace.tsx",
    "src/ui/ClassRecordWorkspace.test.tsx",
    "scripts/assurance/scores-grade-refresh-browser.mjs",
  ];
  const sources = {};
  for (const path of sourcePaths)
    sources[path] = createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  const receipt = {
    project: "LIKHA-SIS",
    head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sources,
    browser: browser.version(),
    node: process.version,
    checks,
    cases,
    limits: [
      "Synthetic in-memory grade values/read faults; no production algorithm or native/device acceptance",
      "Full Scores A1–A7 still pending external acceptance",
    ],
  };
  await writeFile(output + "/receipt.json", JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify({ cases: cases.length, checks: checks.length, status: "PASS" }));
} finally {
  await browser?.close();
  server.kill();
}
