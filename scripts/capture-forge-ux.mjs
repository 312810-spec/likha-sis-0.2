#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { uiBrowserExecutable } from "./ui-browser.mjs";

const project = path.resolve(process.env.LIKHA_CAPTURE_PROJECT ?? ".");
const stage = process.env.LIKHA_CAPTURE_STAGE ?? "after";
if (!["before", "after"].includes(stage)) throw new Error("Capture stage must be before or after");
const output = path.resolve(
  process.env.LIKHA_CAPTURE_OUTPUT ?? `docs/screenshots/forge-ux/${stage}`,
);
await mkdir(output, { recursive: true });
const url = "http://127.0.0.1:1420/dev-preview.html";
const vite = spawn(
  process.execPath,
  [path.resolve("node_modules/vite/bin/vite.js"), "--host", "127.0.0.1"],
  { cwd: project, stdio: ["ignore", "pipe", "pipe"] },
);
let serverOutput = "";
vite.stdout.on("data", (chunk) => (serverOutput += chunk));
vite.stderr.on("data", (chunk) => (serverOutput += chunk));
let browser;
try {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* Vite is starting. */
    }
    if (attempt === 79) throw new Error(`Vite did not start: ${serverOutput}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ headless: true, executablePath: await uiBrowserExecutable() });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "My classes", exact: true }).waitFor();
  await page.getByRole("button", { name: "Mathematics · Mabini", exact: true }).click();
  await page.getByRole("heading", { name: "Class learners", exact: true }).waitFor();
  const captures = [];
  for (const mode of ["Comfortable", "Guided"]) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.getByRole("button", { name: /Account preferences for/ }).click();
      const panel = page.getByRole("dialog", { name: "Account preferences", exact: true });
      await panel.getByLabel("Appearance").selectOption("light");
      await panel.getByRole("button", { name: mode, exact: true }).click();
      await page.keyboard.press("Escape");
      await page.locator(".concept-folio-heading").click();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.scrollTo(0, 0));
      const file = `${width === 1440 ? "desktop" : "phone"}-${mode.toLowerCase()}.png`;
      const spacing = await page.evaluate(() => ({
        unit: getComputedStyle(document.documentElement).getPropertyValue("--unit").trim(),
        space4: getComputedStyle(document.documentElement).getPropertyValue("--space-4").trim(),
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
      await page.screenshot({ path: path.join(output, file), fullPage: true });
      captures.push({
        file,
        width,
        height: 1000,
        appearance: "light",
        mode: mode.toLowerCase(),
        spacing,
      });
    }
  }
  const source = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: project,
    encoding: "utf8",
  }).trim();
  const diff = execFileSync("git", ["diff", "HEAD", "--", "src", "scripts"], { cwd: project });
  await writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify(
      {
        stage,
        capturedAt: new Date().toISOString(),
        source,
        sourceDiffSha256: createHash("sha256").update(diff).digest("hex"),
        browser: browser.version(),
        data: "Synthetic development preview; real application components, no native database or dialogs",
        captures,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Captured ${captures.length} ${stage} screenshots from ${source} in ${output}`);
} finally {
  if (browser) await browser.close();
  vite.kill("SIGTERM");
}
