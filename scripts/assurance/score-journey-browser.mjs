// Runs production UI components with synthetic in-memory repositories only.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "../ui-browser.mjs";
const output = process.env.LIKHA_SCORE_OUTPUT ?? ".cache/score-assurance";
const url = "http://127.0.0.1:1420/dev-preview.html";
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
vite.stdout.on("data", (c) => (logs += c));
vite.stderr.on("data", (c) => (logs += c));
let browser;
const checks = [];
const inventory = [];
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
    hasTouch: true,
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
  await page
    .getByLabel("Item name", { exact: true })
    .fill(
      "Bounded score probe — Synthetic review of a long assessment title in the same teacher journey",
    );
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
  assert((await row.innerText()).includes("Not saved."));
  assert((await row.innerText()).includes("On this device: 18 / 20"));
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
  const correctionRow = reason.locator("xpath=ancestor::tr");
  assert((await correctionRow.innerText()).includes("Recorded: 18 / 20"));
  assert((await correctionRow.innerText()).includes("Change to: 19 / 20"));
  await reason.press("Tab");
  assert(
    await correctionRow
      .getByRole("button", { name: "Save correction", exact: true })
      .evaluate((node) => node === document.activeElement),
  );
  await page.keyboard.press("Tab");
  assert(
    await correctionRow
      .getByRole("button", { name: "Cancel", exact: true })
      .evaluate((node) => node === document.activeElement),
  );
  assert.equal(await page.evaluate(() => window.__scoreAudit.calls.length), 1);
  await page.keyboard.press("Enter");
  await input.waitFor();
  assert.equal(await input.inputValue(), "18");
  await page.waitForFunction(() => document.activeElement?.id === "score-l1");
  checks.push({
    check: "correction comparison and keyboard cancel without a write",
    result: "PASS",
  });
  await input.fill("19");
  await input.press("Enter");
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
  const last = page.getByLabel("Score for Maria Corazon Dela Peña-Villanueva", { exact: true });
  await last.focus();
  await last.press("Tab");
  assert(!(await last.evaluate((node) => node === document.activeElement)));
  await input.focus();
  await input.press("Shift+Tab");
  assert(!(await input.evaluate((node) => node === document.activeElement)));
  checks.push({ check: "native Tab exits at both score sequence boundaries", result: "PASS" });
  await input.fill("");
  assert((await row.innerText()).includes("Blank input does not clear the recorded value."));
  await input.press("Escape");
  assert.equal(await input.inputValue(), "19");
  assert.equal(await page.evaluate(() => window.__scoreAudit.calls.length), 4);
  checks.push({
    check: "blank edit preserves recorded value and Escape restores it",
    result: "PASS",
  });
  await input.focus();
  await input.press("Tab");
  const rowActionsReachable = await row
    .getByRole("button", { name: "Correction history for Ana Santos" })
    .evaluate((n) => n === document.activeElement);
  checks.push({
    check: "clean interior score reaches History via native Tab",
    result: rowActionsReachable ? "PASS" : "FAIL",
  });
  if (!process.env.LIKHA_BASELINE) assert(rowActionsReachable);
  await input.fill("20");
  await input.press("Enter");
  await reason.fill("Synthetic pending correction; do not save");
  // Reproduce the audited wide-to-phone resize with focus retained.
  await page.setViewportSize({ width: 1280, height: 900 });
  await reason.focus();
  await reason.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const clearance = await reason.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const nav = document.querySelector(".app-bottomnav").getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return {
      top: rect.top,
      bottom: rect.bottom,
      navTop: nav.top,
      hit: hit === node,
      focused: document.activeElement === node,
    };
  });
  checks.push({ check: "focused correction clears fixed navigation after resize", ...clearance });
  await writeFile(`${output}/focus-resize.json`, JSON.stringify(clearance, null, 2));
  if (!process.env.LIKHA_BASELINE) {
    assert(
      clearance.focused &&
        clearance.hit &&
        clearance.top >= 0 &&
        clearance.bottom <= clearance.navTop,
    );
  }
  for (const appearance of ["light", "dark"]) {
    await page.getByRole("button", { name: /Account preferences for/ }).click();
    const panel = page.getByRole("dialog", { name: "Account preferences", exact: true });
    await panel.getByLabel("Appearance").selectOption(appearance);
    await page.keyboard.press("Escape");
    for (const mode of ["efficient", "comfortable", "guided"]) {
      await page.getByRole("button", { name: /Account preferences for/ }).click();
      await panel
        .getByRole("button", { name: mode[0].toUpperCase() + mode.slice(1), exact: true })
        .click();
      await page.keyboard.press("Escape");
      for (const width of [1280, 640, 390]) {
        await page.setViewportSize({
          width,
          height: width === 640 ? 450 : width === 390 ? 844 : 900,
        });
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
        await reason.focus();
        await page.waitForTimeout(100);
        const controls = await page.evaluate(() =>
          [
            ...document.querySelectorAll(
              ".concept-folio button, .concept-folio input, .concept-folio select, .concept-folio summary",
            ),
          ]
            .filter(
              (n) => n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().height > 0,
            )
            .map((n, index) => {
              const s = getComputedStyle(n),
                r = n.getBoundingClientRect();
              return {
                index,
                id: n.id,
                tag: n.tagName,
                text: n.textContent?.trim(),
                label:
                  n.getAttribute("aria-label") ??
                  (n.labels ? [...n.labels].map((l) => l.textContent.trim()).join(" ") : null),
                className: n.className,
                disabled: n.disabled ?? n.getAttribute("aria-disabled"),
                role: n.getAttribute("role"),
                selected: n.getAttribute("aria-pressed") ?? n.getAttribute("aria-selected"),
                geometry: { width: r.width, height: r.height },
                style: Object.fromEntries(
                  [
                    "fontFamily",
                    "fontSize",
                    "fontWeight",
                    "lineHeight",
                    "padding",
                    "gap",
                    "border",
                    "borderRadius",
                    "backgroundColor",
                    "color",
                    "minHeight",
                    "outline",
                    "transition",
                    "zIndex",
                  ].map((k) => [k, s[k]]),
                ),
              };
            }),
        );
        inventory.push({ appearance, mode, width, reducedMotion: true, controls });
        const focus = await reason.evaluate((n) => {
          const r = n.getBoundingClientRect(),
            nav = document.querySelector(".app-bottomnav").getBoundingClientRect();
          return {
            top: r.top,
            bottom: r.bottom,
            navTop: nav.height > 0 ? nav.top : innerHeight,
            hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === n,
          };
        });
        if (!process.env.LIKHA_BASELINE)
          assert(focus.hit && focus.top >= 0 && focus.bottom <= focus.navTop);
        checks.push({ check: `focus clearance ${appearance}/${mode}/${width}`, ...focus });
        await page.screenshot({
          path: `${output}/design-${appearance}-${mode}-${width}.png`,
          fullPage: true,
        });
        checks.push({
          check: `render and accessibility ${appearance}/${mode}/${width}`,
          ...result,
        });
      }
    }
  }
  await writeFile(`${output}/control-inventory.json`, JSON.stringify(inventory, null, 2));
  await page.setViewportSize({ width: 390, height: 1000 });
  await correctionRow.getByRole("button", { name: "Cancel", exact: true }).tap();
  assert.equal(await input.inputValue(), "19");
  assert.equal(await page.evaluate(() => window.__scoreAudit.calls.length), 4);
  checks.push({
    check: "touch-emulated Cancel restores recorded score without writing",
    result: "PASS",
    limit: "Browser emulation; not installed Android evidence",
  });
  checks.push({
    check: "640px reflow models a 1280px workspace at 200% CSS zoom",
    result: "PASS",
    limit: "Equivalent CSS viewport; not native OS/browser zoom or assistive technology",
  });
  await writeFile(
    `${output}/design-browser.json`,
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
