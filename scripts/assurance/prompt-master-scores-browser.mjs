// Matched source-bound synthetic task; baseline must run before UI edits.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "../ui-browser.mjs";

const mode = process.argv.includes("--baseline") ? "baseline" : "candidate";
const output = ".cache/prompt-master";
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
  // Pressed selection stays a native keyboard-operable button.
  await choice.focus();
  await page.keyboard.press("Space");
  assert.equal(await choice.getAttribute("aria-pressed"), "true");
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
          const rect = choice.getBoundingClientRect();
          return {
            rosterY: input.getBoundingClientRect().top,
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
        assert(bounds.choiceHeight >= 24 && bounds.choiceWidth >= 24);
        cases.push({ appearance, density, width, bounds, violations, status: "PASS" });
        await page.screenshot({
          path: output + "/" + mode + "-" + appearance + "-" + density + "-" + width + ".png",
          fullPage: true,
        });
      }
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  const source = {};
  for (const f of ["src/ui/ClassRecordWorkspace.tsx", "src/ui/theme/styles.css"])
    source[f] = sha(await readFile(f));
  const receipt = {
    mode,
    scenario: title,
    head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    source,
    browser: browser.version(),
    node: process.version,
    cases,
    limits:
      "Synthetic dev-preview teacher fixture. No installed/device/teacher-comprehension claim.",
  };
  assert.equal(cases.length, 18);
  if (mode === "candidate") {
    const baseline = JSON.parse(await readFile(output + "/baseline.json", "utf8"));
    assert.equal(baseline.scenario, title);
    receipt.comparison = cases.map((c, i) => {
      const b = baseline.cases[i];
      assert.equal(
        JSON.stringify([c.appearance, c.density, c.width]),
        JSON.stringify([b.appearance, b.density, b.width]),
      );
      const delta = c.bounds.rosterY - b.bounds.rosterY;
      assert(delta <= 1, "roster moved lower: " + JSON.stringify({ c, delta }));
      return { appearance: c.appearance, density: c.density, width: c.width, rosterYDelta: delta };
    });
  }
  await writeFile(output + "/" + mode + ".json", JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify({ mode, cases: cases.length, status: "PASS", comparison: receipt.comparison }),
  );
} finally {
  await browser?.close();
  server.kill();
}
