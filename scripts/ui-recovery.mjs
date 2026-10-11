#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "./ui-browser.mjs";
const url = "http://127.0.0.1:1420/dev-preview.html";
const output = ".cache/ux-recovery";
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
vite.stdout.on("data", (chunk) => (serverLog += chunk));
vite.stderr.on("data", (chunk) => (serverLog += chunk));
const checks = [];
let browser;
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
async function inspect(page, label) {
  await page.addScriptTag({ content: axe.source });
  const result = await page.evaluate(async () => {
    const accessibility = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
    const textareas = [...document.querySelectorAll("main textarea")].map((node) => ({
      height: node.getBoundingClientRect().height,
      width: node.getBoundingClientRect().width,
      parentWidth: node.parentElement.getBoundingClientRect().width,
      font: getComputedStyle(node).fontSize,
    }));
    return {
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      violations: accessibility.violations.map((item) => item.id),
      textareas,
      bodyFont: getComputedStyle(document.body).fontSize,
    };
  });
  assert(!result.overflow, `${label}: horizontal overflow`);
  assert(result.violations.length === 0, `${label}: axe ${result.violations.join(", ")}`);
  for (const area of result.textareas)
    assert(
      area.height >= 60 && area.width >= area.parentWidth * 0.8 && area.font === result.bodyFont,
      `${label}: textarea affordance ${JSON.stringify(area)}`,
    );
  checks.push({ label, ...result });
}
async function preferences(page, appearance) {
  await page.getByRole("button", { name: /Account preferences for/ }).click();
  const panel = page.getByRole("dialog", { name: "Account preferences", exact: true });
  await panel.getByLabel("Appearance").selectOption(appearance);
  await panel.getByRole("button", { name: "Guided", exact: true }).click();
  await page.keyboard.press("Escape");
}
async function matrix(page, name) {
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const appearance of ["light", "dark"]) {
      await preferences(page, appearance);
      await inspect(page, `${name}/${width}/${appearance}`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await preferences(page, "light");
  await page.screenshot({ path: `${output}/${name}-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/${name}-phone.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
}
async function open(page, destination, state = "healthy") {
  await page.goto(`${url}?ux=${destination}&state=${state}`, { waitUntil: "networkidle" });
  await page.locator("main").waitFor();
}
async function workbook(page) {
  await page.getByLabel("Which section is this SF1 for?").selectOption("sec-not-started");
  await page.getByRole("button", { name: "Choose Excel file", exact: true }).click();
  await page.getByRole("heading", { name: "Import preview", exact: true }).waitFor();
}
try {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* starting */
    }
    if (attempt === 79) throw new Error(serverLog);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: await uiBrowserExecutable() });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  await open(page, "lesson-plans", "refresh-error");
  await page
    .getByLabel("Learning competency", { exact: true })
    .fill("Explain fractions with models");
  await page
    .getByLabel("Learning objectives (2–3, one per line)")
    .fill("Identify equivalent fractions");
  await page.getByLabel("Planned activities").fill("Compare paper fraction strips");
  await page
    .getByLabel("How learning will be checked")
    .fill("Exit ticket with equivalent fractions");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Lesson Plans", exact: true }).click();
  assert(
    (await page.getByLabel("Learning competency", { exact: true }).inputValue()) ===
      "Explain fractions with models",
    "Lesson draft lost on navigation",
  );
  await matrix(page, "lesson-session-draft");
  await page.getByRole("button", { name: "Save lesson plan", exact: true }).click();
  await page.getByRole("button", { name: "Retry lesson plans", exact: true }).waitFor();
  await inspect(page, "lesson-confirmed-refresh-failure");
  await page.getByRole("button", { name: "Retry lesson plans", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).waitFor();
  await open(page, "schedule-planner", "refresh-error");
  const generate = page.getByRole("button", { name: "Generate plan", exact: true });
  await generate.click();
  assert(
    await page
      .getByRole("button", { name: "Cancel", exact: true })
      .evaluate((node) => node === document.activeElement),
    "Cancel must receive initial confirmation focus",
  );
  await page.keyboard.press("Escape");
  assert(
    await generate.evaluate((node) => node === document.activeElement),
    "Confirmation must restore trigger focus",
  );
  await generate.click();
  await page.getByRole("button", { name: "Confirm replacement", exact: true }).click();
  await page.getByText(/Draft revision 2 was generated, but/).waitFor();
  assert(await generate.isDisabled(), "Planner writes must wait for refresh");
  await matrix(page, "planner-partial-success");
  await page.getByRole("button", { name: "Refresh schedule", exact: true }).click();
  await page.getByRole("button", { name: "Publish plan", exact: true }).click();
  await page.getByRole("button", { name: "Confirm publication", exact: true }).click();
  await page.getByText(/Publication is confirmed, but/).waitFor();
  await inspect(page, "planner-confirmed-publication-refresh-failure");
  await open(page, "learning-support", "marker-error");
  await page.getByLabel("Goal", { exact: true }).fill("Explain equivalent fractions");
  await page.getByLabel("Intervention", { exact: true }).fill("Guided fraction strip practice");
  await page.getByRole("button", { name: "Save plan and clear the marker", exact: true }).click();
  await page.getByRole("button", { name: "Retry clearing marker", exact: true }).waitFor();
  await matrix(page, "support-marker-recovery");
  await page.getByRole("button", { name: "Retry clearing marker", exact: true }).click();
  await page.getByRole("button", { name: "Record participation", exact: true }).waitFor();
  await inspect(page, "support-marker-cleared-on-retry");
  await open(page, "learning-support", "update-error");
  await page
    .getByPlaceholder("Record participation to start this plan")
    .fill("Completed guided practice");
  await page.getByRole("button", { name: "Record participation", exact: true }).click();
  await page.getByText(/Saving was not confirmed. This step/).waitFor();
  assert(
    await page.getByRole("button", { name: "Record participation", exact: true }).isDisabled(),
    "Unconfirmed support transition must gate repeats",
  );
  await matrix(page, "support-update-recovery");
  await page.getByRole("button", { name: "Reload cases", exact: true }).first().click();
  await page.getByText("Completed guided practice", { exact: false }).first().waitFor();
  await inspect(page, "support-transition-reconciled");
  await open(page, "sf1-import", "commit-error");
  await workbook(page);
  assert(
    await page.getByRole("button", { name: "Import learners", exact: true }).isDisabled(),
    "Duplicate review cannot be skipped",
  );
  await matrix(page, "sf1-duplicate-review");
  await page.getByRole("button", { name: "This is the same learner", exact: true }).click();
  await page.getByRole("button", { name: "Import learners", exact: true }).click();
  await page.getByRole("button", { name: "Re-read workbook and review", exact: true }).waitFor();
  await matrix(page, "sf1-unconfirmed-import");
  await page.getByRole("button", { name: "Re-read workbook and review", exact: true }).click();
  await page.getByRole("heading", { name: "Import preview", exact: true }).waitFor();
  assert(
    await page.getByRole("button", { name: "Import learners", exact: true }).isDisabled(),
    "Fresh reread must clear prior duplicate decision",
  );
  await inspect(page, "sf1-fresh-review-required");
  await open(page, "today");
  await matrix(page, "today-pending-work");
  await page.setViewportSize({ width: 640, height: 450 });
  const originalFont = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.body).fontSize),
  );
  await page.evaluate(
    (font) =>
      document.documentElement.style.setProperty("--font-size-base", `${font * 2}px`, "important"),
    originalFont,
  );
  assert(
    (await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize))) ===
      originalFont * 2,
    "Text was not doubled",
  );
  await inspect(page, "today-200-percent-text");
  await page.screenshot({ path: `${output}/today-200-percent-text.png`, fullPage: true });
  const touch = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await open(touch, "sf1-import");
  await workbook(touch);
  await touch.getByRole("button", { name: "This is the same learner", exact: true }).tap();
  await touch.getByRole("button", { name: "Import learners", exact: true }).tap();
  await touch.getByRole("button", { name: "Import another SF1", exact: true }).waitFor();
  await inspect(touch, "sf1-touch-success");
  await writeFile(
    `${output}/manifest.json`,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        browser: browser.version(),
        sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        sourceDiffSha256: createHash("sha256")
          .update(execFileSync("git", ["diff", "HEAD", "--", "src", "scripts"]))
          .digest("hex"),
        checks,
        limitations:
          "Synthetic repositories verify rendered recovery UX; native file dialogs, parsing, database transactions, and authorization are not exercised.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `quality:ui:recovery PASS — ${checks.length} checks, recovery workflows, draft retention, confirmation focus, 200% text and touch.`,
  );
} finally {
  await browser?.close();
  vite.kill();
}
