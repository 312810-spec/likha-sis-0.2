// Runs production UI components with synthetic in-memory repositories only.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "../ui-browser.mjs";
const output = ".cache/score-assurance";
const url = "http://127.0.0.1:1420/dev-preview.html";
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
vite.stdout.on("data", (c) => (logs += c));
vite.stderr.on("data", (c) => (logs += c));
let browser;
const checks = [];
try {
  for (let n = 0; n < 80; n++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* starting */
    }
    if (n === 79) throw new Error(logs);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: await uiBrowserExecutable() });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    reducedMotion: "reduce",
  });
  // Fault injection stays in this browser response, with no app/fixture edits.
  await page.route("**/src/dev-preview/fixtures.ts", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    assert(
      body.includes("export class FixtureLearnerScoreRepository"),
      "fixture hook must match served module",
    );
    body = body.replace(
      "export class FixtureLearnerScoreRepository",
      "class BaseFixtureLearnerScoreRepository",
    );
    body += `\nwindow.__scoreAudit = { calls: [], mode: "delay", release: null };
      export class FixtureLearnerScoreRepository extends BaseFixtureLearnerScoreRepository {
        async record(...args) {
          window.__scoreAudit.calls.push(args);
          if (window.__scoreAudit.mode === "delay") await new Promise(resolve => window.__scoreAudit.release = resolve);
          if (window.__scoreAudit.mode === "reject") throw new Error("synthetic denied write");
          return super.record(...args);
        }
      }
      window.__scoreAudit.read = item => new BaseFixtureLearnerScoreRepository().rosterForItem(item);
      window.__scoreAudit.history = (item, learner) => new BaseFixtureLearnerScoreRepository().correctionHistory(item, learner);\n`;
    await route.fulfill({ response, body });
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Mathematics · Mabini", exact: true }).click();
  await page.getByRole("tab", { name: "Scores", exact: true }).click();
  await page.getByLabel("Grading period", { exact: true }).selectOption("gp1");
  await page.getByLabel("DepEd grading weighting", { exact: true }).selectOption("wp-k10");
  await page.getByRole("button", { name: "Open class record", exact: true }).click();
  await page.getByLabel("Item name", { exact: true }).fill("Bounded score probe");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByRole("button", { name: /Written Works — Bounded score probe/ }).click();
  const input = page.getByLabel("Score for Ana Santos", { exact: true });
  const row = input.locator("xpath=ancestor::tr");
  await input.fill("18");
  await input.press("Enter");
  await page.waitForFunction(() => window.__scoreAudit.calls.length === 1);
  await input.fill("19");
  await page.evaluate(() => window.__scoreAudit.release());
  await page.waitForFunction(() => !document.body.textContent.includes("Saving…"));
  assert.equal(await input.inputValue(), "19");
  assert(await input.evaluate((node) => node === document.activeElement));
  assert.equal(await row.getByText(/Saved on this device/).count(), 0);
  const saved18 = await page.evaluate(async () => {
    const audit = window.__scoreAudit;
    const [item, learner] = audit.calls[0];
    return (await audit.read(item)).find((row) => row.learnerId === learner);
  });
  assert.equal(saved18.score, 18);
  checks.push({
    check: "older acknowledgment preserves newer draft and focus",
    displayed: 19,
    fixturePersisted: saved18.score,
    calls: 1,
  });
  await page.evaluate(() => (window.__scoreAudit.mode = "normal"));
  await input.press("Enter");
  const reason = page.getByLabel(/Reason for.*Ana Santos/);
  await reason.fill("Synthetic correction after checking work");
  await reason.press("Enter");
  await row.getByText(/Saved on this device/).waitFor();
  const corrected = await page.evaluate(async () => {
    const audit = window.__scoreAudit;
    const [item, learner] = audit.calls[0];
    return {
      row: (await audit.read(item)).find((row) => row.learnerId === learner),
      history: await audit.history(item, learner),
      calls: audit.calls,
    };
  });
  assert.equal(corrected.row.score, 19);
  assert.equal(corrected.history.length, 1);
  assert.equal(corrected.history[0].previousScore, 18);
  assert.equal(corrected.history[0].newScore, 19);
  assert.equal(corrected.calls.length, 2);
  checks.push({ check: "explicit correction saves exact score and lineage", result: "PASS" });
  const next = page.getByLabel("Score for Bayani Cruz", { exact: true });
  assert(await next.evaluate((node) => node === document.activeElement));
  await page.evaluate(() => (window.__scoreAudit.mode = "reject"));
  await next.fill("12");
  await next.press("Enter");
  const nextRow = next.locator("xpath=ancestor::tr");
  await nextRow.getByRole("alert").waitFor();
  assert.equal(await next.inputValue(), "12");
  assert.equal(await nextRow.getByText(/Saved on this device/).count(), 0);
  const rejected = await page.evaluate(async () => {
    const audit = window.__scoreAudit;
    const [item, learner] = audit.calls[2];
    return (await audit.read(item)).find((row) => row.learnerId === learner);
  });
  assert.equal(rejected.score, null);
  checks.push({ check: "rejected write retains draft and has no saved claim", result: "PASS" });
  await page.evaluate(() => (window.__scoreAudit.mode = "normal"));
  await next.press("Tab");
  await nextRow.getByText(/Saved on this device/).waitFor();
  const retried = await page.evaluate(async () => {
    const audit = window.__scoreAudit;
    const [item, learner] = audit.calls[3];
    return (await audit.read(item)).find((row) => row.learnerId === learner);
  });
  assert.equal(retried.score, 12);
  checks.push({ check: "explicit keyboard retry saves retained value", result: "PASS" });
  for (const appearance of ["light", "dark"]) {
    await page.getByRole("button", { name: /Account preferences for/ }).click();
    const panel = page.getByRole("dialog", { name: "Account preferences", exact: true });
    await panel.getByLabel("Appearance").selectOption(appearance);
    await page.keyboard.press("Escape");
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.addScriptTag({ content: axe.source });
      const result = await page.evaluate(async () => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        violations: (
          await window.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          })
        ).violations.map((v) => v.id),
      }));
      assert.equal(result.overflow, false);
      assert.deepEqual(result.violations, []);
      await input.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/score-${appearance}-${width}.png`, fullPage: true });
      checks.push({ check: `render and accessibility ${appearance}/${width}`, ...result });
    }
  }
  await writeFile(
    `${output}/browser.json`,
    JSON.stringify(
      {
        evidence:
          "Browser production components; synthetic memory persistence; NOT native authorization/SQLite",
        checks,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(checks, null, 2));
} finally {
  await browser?.close();
  vite.kill("SIGTERM");
}
