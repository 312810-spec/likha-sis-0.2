// Synthetic preference cases; holds React to inspect the real pre-module shell.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { uiBrowserExecutable } from "../ui-browser.mjs";

const built = process.argv.includes("--built");
const output = ".cache/appearance-startup";
const url = "http://127.0.0.1:1420/";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    ...(built ? ["preview", "--port", "1420"] : []),
    "--host",
    "127.0.0.1",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let logs = "";
server.stdout.on("data", (chunk) => (logs += chunk));
server.stderr.on("data", (chunk) => (logs += chunk));
let browser;
const checks = [];
try {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      // The local server is still starting.
    }
    if (attempt === 79) throw new Error(logs);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ headless: true, executablePath: await uiBrowserExecutable() });
  for (const system of ["light", "dark"]) {
    for (const preference of [null, "light", "dark", "system", "invalid", "storage-denied"]) {
      const page = await browser.newPage({ colorScheme: system });
      await page.addInitScript((value) => {
        if (value === "storage-denied") {
          Object.defineProperty(window, "localStorage", {
            get() {
              throw new Error("synthetic storage denial");
            },
          });
        } else if (value !== null) localStorage.setItem("likha-sis:appearance", value);
      }, preference);
      await page.route(built ? "**/assets/index-*.js" : "**/src/main.tsx", (route) =>
        route.fulfill({
          contentType: "text/javascript",
          body: `${built ? "" : 'import "/src/ui/theme/styles.css";'} await new Promise(() => {});`,
        }),
      );
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() =>
        getComputedStyle(document.body).fontFamily.includes("Public"),
      );
      const actual = await page.evaluate(() => ({
        appearance: document.documentElement.dataset.appearance,
        background: getComputedStyle(document.body).backgroundColor,
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        children: document.getElementById("root").childElementCount,
      }));
      const expected = ["light", "dark"].includes(preference) ? preference : system;
      assert.equal(actual.appearance, expected);
      assert.equal(actual.colorScheme, expected);
      assert.equal(
        actual.background,
        expected === "dark" ? "rgb(20, 23, 34)" : "rgb(246, 247, 250)",
      );
      assert.equal(actual.children, 0, "React must not have mounted to supply the preference");
      checks.push({ system, preference, expected, actual, status: "PASS" });
      await page.close();
    }
  }
  // Real entrypoint/provider still starts when preference reads/writes fail.
  const page = await browser.newPage({ colorScheme: "dark" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("synthetic storage denial");
      },
    });
  });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("root").childElementCount > 0);
  await page.waitForFunction(() => document.documentElement.dataset.appearance === "dark");
  assert.deepEqual(errors, []);
  checks.push({ case: "real React startup with denied preference storage", status: "PASS" });
  await mkdir(output, { recursive: true });
  const sourceSha256 = createHash("sha256")
    .update(await readFile("index.html"))
    .digest("hex");
  await writeFile(
    `${output}/${built ? "production" : "development"}.json`,
    JSON.stringify(
      {
        project: "LIKHA-SIS",
        method: "Playwright browser / synthetic local preferences",
        browser: browser.version(),
        mode: built ? "production build" : "development server",
        sourceSha256,
        expectedCases: 13,
        checks,
        limits:
          "Held entrypoint is fault injection, not installed Windows timing or native startup proof.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`PASS: ${checks.length}/13 ${built ? "production" : "development"} startup cases.`);
} finally {
  await browser?.close();
  server.kill();
}
