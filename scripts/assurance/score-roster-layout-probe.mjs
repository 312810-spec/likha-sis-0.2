// Layout/focus only: generated roster replies are synthetic read models, not durable records.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "../ui-browser.mjs";
const output = ".cache/score-roster-layout";
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
  stdio: "ignore",
});
let browser;
const checks = [];
try {
  await mkdir(output, { recursive: true });
  const url = "http://127.0.0.1:1420/dev-preview.html";
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* server starting */
    }
    if (i === 79) throw new Error("Preview did not start");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ headless: true, executablePath: await uiBrowserExecutable() });
  for (const count of [0, 60]) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
    });
    await page.route("**/src/dev-preview/fixtures.ts", async (route) => {
      const response = await route.fetch();
      let body = await response.text();
      assert(body.includes("export class FixtureLearnerScoreRepository"));
      body = body.replace(
        "export class FixtureLearnerScoreRepository",
        "class BaseFixtureLearnerScoreRepository",
      );
      body += `\nwindow.__rosterLayout = { writes: 0 };
      export class FixtureLearnerScoreRepository extends BaseFixtureLearnerScoreRepository {
        async rosterForItem(item) {
          const rows = await super.rosterForItem(item);
          if (rows === null) return null;
          return Array.from({length:${count}}, (_,i) => ({learnerId: 'synthetic-layout-' + i,
            givenName: 'Synthetic Learner ' + String(i+1).padStart(3,'0'),
            familyName: 'Dela Peña-Villanueva Long Family Name', status:null,score:null,updatedAt:null}));
        }
        async record(...args) { window.__rosterLayout.writes++; throw new Error('Read-only layout probe must not write'); }
      }`;
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
      .fill("Synthetic roster layout — long assessment title for current period");
    await page.getByRole("button", { name: "Add item", exact: true }).click();
    await page.getByRole("button", { name: /Written Works — Synthetic roster layout/ }).click();
    if (count === 0) {
      await page.getByText("No learners eligible for this item's grading period.").waitFor();
      assert.equal(await page.locator(".score-entry-input").count(), 0);
    } else {
      await page.getByText("0 of 60 recorded", { exact: true }).waitFor();
      assert.equal(await page.locator(".score-entry-input").count(), 60);
      const first = page.locator("#score-synthetic-layout-0");
      await first.focus();
      for (let i = 1; i < 60; i++) await page.keyboard.press("ArrowDown");
      assert(
        await page
          .locator("#score-synthetic-layout-59")
          .evaluate((n) => n === document.activeElement),
      );
    }
    for (const width of [1280, 640, 390]) {
      await page.setViewportSize({ width, height: width === 640 ? 450 : 844 });
      if (count) {
        const last = page.locator("#score-synthetic-layout-59");
        await last.focus();
        await page.waitForTimeout(100);
        const focus = await last.evaluate((n) => {
          const r = n.getBoundingClientRect(),
            nav = document.querySelector(".app-bottomnav").getBoundingClientRect();
          return {
            top: r.top,
            bottom: r.bottom,
            limit: nav.height ? nav.top : innerHeight,
            hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === n,
          };
        });
        assert(focus.hit && focus.top >= 0 && focus.bottom <= focus.limit);
        await last.press("Tab");
        assert(
          await page
            .getByRole("group", {
              name: "Exception status for Synthetic Learner 060 Dela Peña-Villanueva Long Family Name",
            })
            .getByRole("button", { name: "Excused", exact: true })
            .evaluate((n) => n === document.activeElement),
        );
      }
      if (!count)
        await page
          .getByText("No learners eligible for this item's grading period.")
          .scrollIntoViewIfNeeded();
      await page.addScriptTag({ content: axe.source });
      const assessed = await page.evaluate(async () => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        violations: (
          await window.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          })
        ).violations.map((x) => x.id),
        writes: window.__rosterLayout.writes,
      }));
      assert.equal(assessed.overflow, false);
      assert.deepEqual(assessed.violations, []);
      assert.equal(assessed.writes, 0);
      checks.push({ count, width, ...assessed });
      if (width === 390) await page.screenshot({ path: `${output}/roster-${count}-390.png` });
    }
    await page.close();
  }
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        class:
          "Production UI with injected synthetic read-only roster; NOT native roster loading, persistence or measured throughput",
        checks,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(checks));
} finally {
  await browser?.close();
  vite.kill("SIGTERM");
}
