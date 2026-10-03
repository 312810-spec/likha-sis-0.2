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
  await page.getByRole("region", { name: "Workspace" }).waitFor();
  await page.getByText(/3 learners across 4 sections/).waitFor();
  await page.getByRole("button", { name: "Mark attendance", exact: true }).click();
  await page.getByRole("heading", { name: "Attendance", exact: true }).waitFor();
  if ((await page.getByLabel("Section").inputValue()) !== "sec-not-started")
    throw new Error("workspace-to-attendance context was not preserved");
  await page.getByText("0 of 2 marked").waitFor();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Learners", exact: true }).click();
  await page.getByRole("heading", { name: "Learners", exact: true }).waitFor();
  await page.getByRole("button", { name: "View enrollment history for Ana Santos" }).click();
  await page.getByText("Started 2 Jun 2025 · Ended 1 Apr 2026").waitFor();
  await page.getByText("Started 1 Jun 2026 · Current placement").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  if (hasHorizontalOverflow) throw new Error("learner enrollment history overflows at phone width");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByText("Recent sign-in activity", { exact: true }).click();
  await page.getByRole("button", { name: "View all sign-in activity" }).click();
  await page
    .getByText(/Sign-in Activity/i)
    .first()
    .waitFor();
  await page.addScriptTag({ content: axe.source });
  const result = await page.evaluate(async () =>
    window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] }),
  );
  const blocking = result.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact),
  );
  if (blocking.length)
    throw new Error(`axe found blocking violations: ${blocking.map(({ id }) => id).join(", ")}`);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const appearance of ["light", "dark"]) {
      for (const mode of ["Efficient", "Comfortable", "Guided"]) {
        if (width <= 860) await page.getByRole("button", { name: "Open navigation" }).click();
        const surface = page.locator(width <= 860 ? ".app-sidebar" : ".app-topbar");
        await surface.getByLabel("Appearance").selectOption(appearance);
        await surface.getByRole("button", { name: mode, exact: true }).click();
        if (width <= 860) await page.keyboard.press("Escape");
        if (width <= 860) {
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          const footer = await page.locator(".folio-activity summary").boundingBox();
          const navigation = await page.locator(".app-bottomnav").boundingBox();
          if (!footer || !navigation || footer.y + footer.height > navigation.y)
            throw new Error(`Bottom navigation covers the final control at ${width}px in ${mode}`);
        }
        const state = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          theme: document.documentElement.dataset.appearance,
          mode: document.documentElement.dataset.teacherMode,
        }));
        if (state.overflow || state.theme !== appearance || state.mode !== mode.toLowerCase())
          throw new Error(
            `Folio reflow/preference failure: ${width}, ${appearance}, ${mode}: ${JSON.stringify(state)}`,
          );
      }
      const findings = await page.evaluate(async () =>
        window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] }),
      );
      if (findings.violations.length)
        throw new Error(
          `Folio accessibility: ${width}/${appearance}: ${findings.violations.map(({ id }) => id).join(", ")}`,
        );
    }
  }
  await page.reload();
  if ((await page.evaluate(() => document.documentElement.dataset.appearance)) !== "dark")
    throw new Error("Dark appearance did not survive reload");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "My Day", exact: true }).click();
  await page.getByRole("button", { name: /Mathematics.*Open class/ }).click();
  await page.getByRole("heading", { name: "Mathematics — Mabini" }).waitFor();
  await page.getByRole("button", { name: /Science.*Open class/ }).click();
  await page.getByRole("heading", { name: "Science — Rizal" }).waitFor();
  await page
    .getByRole("region", { name: "Science — Rizal" })
    .getByRole("button", { name: "Check attendance" })
    .click();
  await page.getByRole("heading", { name: "Subject Attendance", exact: true }).waitFor();
  if ((await page.getByLabel("Class", { exact: true }).inputValue()) !== "ta-2")
    throw new Error("Selected subject class was lost on attendance entry");
  await page.getByRole("button", { name: "My Day", exact: true }).click();
  await page.getByRole("button", { name: "Open class record", exact: true }).click();
  await page.getByRole("heading", { name: /Science.*Rizal/ }).waitFor();
  console.log(
    "quality:ui PASS — attendance/context handoff, enrollment history, light/dark × three teacher modes × four widths, preference reload, class switching and axe WCAG A/AA.",
  );
} finally {
  if (browser) await browser.close();
  vite.kill("SIGTERM");
}
