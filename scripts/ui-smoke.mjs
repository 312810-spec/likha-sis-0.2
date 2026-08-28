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
  browser = await chromium.launch({ headless: true });
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
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
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
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
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
  console.log(
    `quality:ui PASS — workflow, enrollment history, phone reflow, context handoff, and axe WCAG A/AA (${result.violations.length} non-blocking findings).`,
  );
} finally {
  if (browser) await browser.close();
  vite.kill("SIGTERM");
}
