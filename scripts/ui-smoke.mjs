#!/usr/bin/env node

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import axe from "axe-core";

const host = "127.0.0.1";
const port = 1420;
const url = `http://${host}:${port}/dev-preview.html`;
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", host], {
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
vite.stdout.on("data", (chunk) => (serverOutput += chunk));
vite.stderr.on("data", (chunk) => (serverOutput += chunk));

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not become ready.\n${serverOutput}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ]
      : [],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });
  await page.goto(url, { waitUntil: "networkidle" });
  const preview = page.getByRole("status").filter({ hasText: "Development preview" });
  if ((await preview.count()) !== 1)
    throw new Error("synthetic-data preview boundary is not visible");
  await page.getByRole("heading", { name: "My classes" }).waitFor();
  await page.getByRole("button", { name: "Science · Rizal", exact: true }).click();
  await page.getByRole("heading", { name: "Rizal", exact: true }).waitFor();
  await page.getByRole("button", { name: "Check attendance", exact: true }).click();
  await page.getByRole("heading", { name: "Subject Attendance", exact: true }).waitFor();
  if ((await page.getByLabel("Class", { exact: true }).inputValue()) !== "ta-2")
    throw new Error("Scoped class attendance lost its assignment");
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("heading", { name: "Rizal", exact: true }).waitFor();
  await page.getByRole("tab", { name: "Scores", exact: true }).click();
  await page.getByLabel("Grading period", { exact: true }).waitFor();
  if (
    !(await page
      .getByRole("tab", { name: "Scores", exact: true })
      .evaluate((node) => node === document.activeElement))
  )
    throw new Error("Loading Scores moved focus away from its worksheet tab");
  await page.getByLabel("Grading period", { exact: true }).selectOption("gp1");
  await page.getByRole("tab", { name: "Forms", exact: true }).click();
  await page.getByRole("tab", { name: "Scores", exact: true }).click();
  if ((await page.getByLabel("Grading period", { exact: true }).inputValue()) !== "gp1")
    throw new Error("Worksheet switch lost the selected term");
  await page.getByRole("button", { name: "Back to Science — Rizal", exact: true }).click();
  if ((await page.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")) !== "true")
    throw new Error("Back to class did not restore Overview");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Learners", exact: true }).click();
  await page.getByRole("button", { name: "View enrollment history for Ana Santos" }).click();
  await page.getByText("Started 1 Jun 2026 · Current placement").waitFor();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.addScriptTag({ content: axe.source });
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const appearance of ["light", "dark"]) {
      for (const mode of ["Efficient", "Comfortable", "Guided"]) {
        await page.getByRole("button", { name: /Account preferences for/ }).click();
        const panel = page.getByRole("dialog", { name: "Account preferences", exact: true });
        await panel.getByLabel("Appearance").selectOption(appearance);
        await panel.getByRole("button", { name: mode, exact: true }).click();
        await page.keyboard.press("Escape");
        const state = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          theme: document.documentElement.dataset.appearance,
          mode: document.documentElement.dataset.teacherMode,
        }));
        if (state.overflow || state.theme !== appearance || state.mode !== mode.toLowerCase())
          throw new Error(
            `Reflow/preference: ${width}/${appearance}/${mode}: ${JSON.stringify(state)}`,
          );
        if (width <= 860) {
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          const final = await page.locator(".concept-folio-links button").last().boundingBox();
          const nav = await page.locator(".app-bottomnav").boundingBox();
          if (!final || !nav || final.y + final.height > nav.y)
            throw new Error("Phone navigation covers the final form control");
        }
        const findings = await page.evaluate(async () =>
          window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] }),
        );
        if (findings.violations.length)
          throw new Error(
            `Accessibility ${width}/${appearance}/${mode}: ${findings.violations.map((v) => v.id).join(", ")}`,
          );
      }
    }
  }
  await page.reload();
  if ((await page.evaluate(() => document.documentElement.dataset.appearance)) !== "dark")
    throw new Error("Appearance did not survive reload");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "School Forms", exact: true }).click();
  await page.getByRole("button", { name: "Open My Advisory", exact: true }).waitFor();
  await page.getByRole("button", { name: "Open My Advisory", exact: true }).click();
  await page.getByRole("heading", { name: "Monthly attendance preview", exact: true }).waitFor();
  await page.getByRole("button", { name: "Export SF2-inspired CSV", exact: true }).waitFor();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByLabel("Date", { exact: true }).fill("2026-10-05");
  await page.getByRole("button", { name: "Open class", exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Open class", exact: true }).first().click();
  await page.getByRole("heading", { name: "My classes" }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation", { name: "Primary — quick access" })
    .getByRole("button", { name: "Account", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Account", exact: true })
    .getByLabel("Appearance")
    .waitFor();
  await page.getByRole("button", { name: "More tools and settings", exact: true }).click();
  await page.getByRole("heading", { name: "More", exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Mathematics · Mabini", exact: true }).click();
  await page.getByRole("heading", { name: "Class learners", exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const appearance of ["light", "dark"]) {
    await page.getByRole("button", { name: /Account preferences for/ }).click();
    const panel = page.getByRole("dialog", { name: "Account preferences", exact: true });
    await panel.getByLabel("Appearance").selectOption(appearance);
    await panel.getByRole("button", { name: "Comfortable", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.locator(".concept-folio-heading").click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    if (process.env.LIKHA_CAPTURE_UI)
      await page.screenshot({
        path: `docs/design/class-folio/desktop-${appearance}.png`,
        fullPage: true,
      });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    if (process.env.LIKHA_CAPTURE_UI)
      await page.screenshot({ path: `docs/design/class-folio/phone-${appearance}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("tab", { name: "Scores", exact: true }).click();
  await page.getByLabel("Grading period", { exact: true }).waitFor();
  if (process.env.LIKHA_CAPTURE_UI)
    await page.screenshot({ path: "docs/design/class-folio/class-dark.png", fullPage: true });
  await page.getByLabel("Grading period", { exact: true }).selectOption("gp1");
  await page.getByLabel("DepEd grading weighting", { exact: true }).selectOption("wp-k10");
  await page.getByRole("button", { name: "Open class record", exact: true }).click();
  await page.addScriptTag({ content: axe.source });
  await page.getByLabel("Item name", { exact: true }).fill("Review quiz");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByRole("button", { name: /Written Works — Review quiz/ }).click();
  const score = page.getByLabel("Score for Ana Santos", { exact: true });
  await score.fill("18");
  await score.press("Enter");
  await page.getByLabel("Score for Bayani Cruz", { exact: true }).waitFor();
  if (
    !(await page
      .getByLabel("Score for Bayani Cruz", { exact: true })
      .evaluate((node) => node === document.activeElement))
  )
    throw new Error("Enter did not save and move to the next learner");
  await page.getByRole("tab", { name: "Forms", exact: true }).click();
  await page.getByRole("tab", { name: "Scores", exact: true }).click();
  if ((await score.inputValue()) !== "18") throw new Error("Score was lost across worksheet tabs");
  for (const appearance of ["light", "dark"]) {
    await page.getByRole("button", { name: /Account preferences for/ }).click();
    await page
      .getByRole("dialog", { name: "Account preferences", exact: true })
      .getByLabel("Appearance")
      .selectOption(appearance);
    await page.keyboard.press("Escape");
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    for (const width of [1440, 1024, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const result = await page.evaluate(async () => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        violations: (
          await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })
        ).violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
        })),
      }));
      if (result.overflow || result.violations.length)
        throw new Error(`Scoring ${width}/${appearance}: ${JSON.stringify(result)}`);
      if (width === 1440) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const index = await page.locator(".concept-folio-index").boundingBox();
        if (!index || index.y < 0) throw new Error("Class index scrolled out of view");
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator(".concept-folio-heading").click();
    if (process.env.LIKHA_CAPTURE_UI)
      await page.screenshot({
        path: `docs/design/class-folio/scores-${appearance}.png`,
        fullPage: true,
      });
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("heading", { name: "Review quiz scores", exact: true })
      .scrollIntoViewIfNeeded();
    if (process.env.LIKHA_CAPTURE_UI)
      await page.screenshot({ path: `docs/design/class-folio/scores-phone-${appearance}.png` });
  }
  await page.setViewportSize({ width: 1024, height: 480 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Account preferences for/ }).click();
  const account = page.getByRole("dialog", { name: "Account preferences", exact: true });
  const accountBox = await account.boundingBox();
  if (!accountBox || accountBox.y + accountBox.height > 480)
    throw new Error("Account clips on a short viewport");
  await account.getByRole("button", { name: "Close account preferences", exact: true }).click();
  if (
    !(await page
      .getByRole("button", { name: /Account preferences for/ })
      .evaluate((node) => node === document.activeElement))
  )
    throw new Error("Closing Account lost trigger focus");
  console.log(
    "quality:ui PASS — assigned class selection/context, score entry, Forms/Calendar/Account/More, enrollment history, both appearances × three densities × four widths, footer clearance, remembered preference, keyboard score saving, sticky class index, short-screen Account, zero axe WCAG A/AA findings.",
  );
} finally {
  if (browser) await browser.close();
  vite.kill("SIGTERM");
}
