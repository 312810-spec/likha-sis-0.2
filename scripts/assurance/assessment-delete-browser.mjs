// Production authoring UI with controlled synthetic deletion acknowledgments.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "../ui-browser.mjs";
const output = ".cache/assessment-delete";
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "",
  browser;
server.stdout.on("data", (c) => (logs += c));
server.stderr.on("data", (c) => (logs += c));
const cases = [],
  checks = [];
try {
  const url = "http://127.0.0.1:1420/dev-preview.html";
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    if (i === 79) throw Error(logs);
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ headless: true, executablePath: await uiBrowserExecutable() });
  for (const surface of ["workspace", "studio"])
    for (const appearance of ["light", "dark"])
      for (const density of ["efficient", "comfortable", "guided"])
        for (const width of [1280, 640, 390])
          for (const motion of ["no-preference", "reduce"]) {
            const context = await browser.newContext({
              viewport: { width, height: 1000 },
              colorScheme: appearance,
              reducedMotion: motion,
              hasTouch: true,
            });
            await context.addInitScript(
              ({ appearance, density }) => {
                localStorage.setItem("likha-sis:appearance", appearance);
                localStorage.setItem("likha-sis:teacher-mode", density);
              },
              { appearance, density },
            );
            const page = await context.newPage();
            await page.route("**/src/dev-preview/fixtures.ts", async (route) => {
              const response = await route.fetch();
              let body = await response.text();
              assert(body.includes("export class FixtureAssessmentRepository"));
              body = body.replace(
                "export class FixtureAssessmentRepository",
                "class BaseFixtureAssessmentRepository",
              );
              body += `
    window.__deleteAudit={calls:[],created:[],release:{},mode:"delay",reads:[]};
    export class FixtureAssessmentRepository extends BaseFixtureAssessmentRepository{
     async createItem(...args){const r=await super.createItem(...args);window.__deleteAudit.created.push(r);return r;}
     async listItemsByClassRecord(...args){const r=await super.listItemsByClassRecord(...args);window.__deleteAudit.reads.push(r.map(i=>i.id));return r;}
     async deleteItem(id){const a=window.__deleteAudit;a.calls.push(id);const mode=a.mode;
      if(mode!=="instant")await new Promise(r=>a.release[id]=r);
      if(mode==="refuse")return false;
      const r=await super.deleteItem(id);if(mode==="unknownAfterWrite")throw Error("synthetic result lost after write");return r;}
    }
   `;
              await route.fulfill({ response, body });
            });
            await page.goto(url, { waitUntil: "networkidle" });
            await page.getByRole("button", { name: "Mathematics · Mabini", exact: true }).click();
            await page.getByRole("tab", { name: "Scores", exact: true }).click();
            await page.getByLabel("Grading period", { exact: true }).selectOption("gp1");
            await page
              .getByLabel("DepEd grading weighting", { exact: true })
              .selectOption("wp-k10");
            await page.getByRole("button", { name: "Open class record", exact: true }).click();
            if (surface === "studio")
              await page.getByRole("button", { name: "Creation Studio", exact: true }).click();
            const titles = [
              "Synthetic first assessment",
              "Synthetic second assessment",
              "Synthetic current assessment",
            ];
            for (const title of titles) {
              const toggle = page.getByRole("button", { name: "Add assessment item", exact: true });
              if (surface === "workspace" && (await toggle.isVisible())) await toggle.click();
              await page.getByLabel("Item name", { exact: true }).fill(title);
              await page
                .getByRole("button", {
                  name: surface === "workspace" ? "Add item" : "Add item and continue",
                  exact: true,
                })
                .click();
              await page.getByText(title + " added.", { exact: true }).waitFor();
            }
            const ids = await page.evaluate(() => window.__deleteAudit.created.map((i) => i.id));
            const group = (i) =>
              page.getByRole("group", { name: "Actions for " + titles[i], exact: true });
            const arm = async (i) => {
              await group(i).getByRole("button", { name: "Delete", exact: true }).click();
            };
            const submit = async (i) => {
              await arm(i);
              const button = group(i).getByRole("button", { name: "Confirm delete", exact: true });
              await button.focus();
              await button.press("Enter");
              await page.waitForFunction((id) => window.__deleteAudit.calls.includes(id), ids[i]);
            };
            await arm(2);
            await group(2).getByRole("button", { name: "Cancel", exact: true }).click();
            assert.equal(await page.evaluate(() => window.__deleteAudit.calls.length), 0);
            if (surface === "workspace")
              await page
                .getByRole("button", { name: new RegExp(titles[0] + ".*Max 20", "i") })
                .click();
            await submit(0);
            assert.equal(
              await group(0).getByRole("button", { name: "Cancel", exact: true }).count(),
              0,
            );
            assert.equal(
              await group(0)
                .getByRole("button", { name: "Edit", exact: true })
                .getAttribute("aria-disabled"),
              "true",
            );
            await arm(1);
            await page.evaluate(() => (window.__deleteAudit.mode = "refuse"));
            const confirmSecond = group(1).getByRole("button", {
              name: "Confirm delete",
              exact: true,
            });
            await confirmSecond.focus();
            await confirmSecond.press("Enter");
            await page.waitForFunction(() => window.__deleteAudit.calls.length === 2);
            if (surface === "workspace")
              await page
                .getByRole("button", { name: new RegExp(titles[2] + ".*Max 20", "i") })
                .click();
            else {
              await page.getByLabel("Max score", { exact: true }).focus();
            }
            const focused = await page.evaluate(
              () => document.activeElement?.id || document.activeElement?.textContent,
            );
            await page.evaluate((id) => window.__deleteAudit.release[id](), ids[0]);
            await page.getByText(titles[0] + " deleted.", { exact: true }).waitFor();
            const busy = group(1).getByRole("button", { name: "Deleting…", exact: true });
            await busy.waitFor();
            assert.equal(await busy.getAttribute("aria-disabled"), "true");
            assert.equal(
              await group(1).getByRole("button", { name: "Cancel", exact: true }).count(),
              0,
            );
            assert.equal(
              await page.evaluate(
                () => document.activeElement?.id || document.activeElement?.textContent,
              ),
              focused,
              "late first delete must not steal focus",
            );
            if (surface === "workspace")
              assert(
                await page
                  .getByRole("heading", { name: titles[2] + " scores", exact: true })
                  .isVisible(),
              );
            await busy.focus();
            await busy.press("Enter");
            assert.equal(await page.evaluate(() => window.__deleteAudit.calls.length), 2);
            const controls = await group(1)
              .locator("button")
              .evaluateAll((els) =>
                els.map((el) => {
                  const s = getComputedStyle(el),
                    r = el.getBoundingClientRect();
                  return {
                    label: el.textContent,
                    width: r.width,
                    height: r.height,
                    minHeight: s.minHeight,
                    color: s.color,
                    background: s.backgroundColor,
                    border: s.borderColor,
                    font: s.fontFamily,
                    fontSize: s.fontSize,
                    lineHeight: s.lineHeight,
                    padding: s.padding,
                    radius: s.borderRadius,
                    opacity: s.opacity,
                    outline: s.outlineWidth,
                    outlineOffset: s.outlineOffset,
                    transition: s.transitionDuration,
                    easing: s.transitionTimingFunction,
                  };
                }),
              );
            assert(controls.every((c) => c.width >= 24 && c.height >= 24));
            await page.evaluate(axe.source);
            const auditAxe = () =>
              page.evaluate(async () =>
                (
                  await window.axe.run(document, {
                    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
                  })
                ).violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
              );
            const pendingViolations = await auditAxe();
            assert.deepEqual(pendingViolations, []);
            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth + 1,
            );
            assert(!overflow, JSON.stringify({ surface, appearance, density, width, motion }));
            if (
              ((appearance === "light" && density === "comfortable" && width === 1280) ||
                (appearance === "dark" && density === "guided" && width === 390)) &&
              motion === "reduce"
            )
              await page.screenshot({
                path: `${output}/${surface}-${width === 390 ? "phone" : "desktop"}.png`,
                fullPage: true,
              });
            await page.evaluate((id) => window.__deleteAudit.release[id](), ids[1]);
            await page
              .getByRole("alert")
              .filter({ hasText: `“${titles[1]}” was not deleted.` })
              .waitFor();
            assert(await group(1).isVisible());
            assert.equal(
              await group(1).getByRole("button", { name: "Delete", exact: true }).count(),
              1,
            );
            const refusedViolations = await auditAxe();
            assert.deepEqual(refusedViolations, []);
            const result = await page.evaluate(() => window.__deleteAudit);
            assert.deepEqual(result.calls, [ids[0], ids[1]]);
            assert(!result.reads.at(-1).includes(ids[0]));
            assert(result.reads.at(-1).includes(ids[1]));
            cases.push({
              surface,
              appearance,
              density,
              width,
              motion,
              ids,
              calls: result.calls,
              read: result.reads.at(-1),
              controls,
              pendingViolations,
              refusedViolations,
              overflow,
              status: "PASS",
            });
            if (
              appearance === "light" &&
              density === "efficient" &&
              width === 1280 &&
              motion === "no-preference"
            ) {
              const toggle = page.getByRole("button", { name: "Add assessment item", exact: true });
              if (surface === "workspace" && (await toggle.isVisible())) await toggle.click();
              await page.getByLabel("Item name", { exact: true }).fill("Retained creation draft");
              await page.evaluate(() => (window.__deleteAudit.mode = "unknownAfterWrite"));
              await submit(2);
              await page.evaluate((id) => window.__deleteAudit.release[id](), ids[2]);
              await page
                .getByRole("alert")
                .filter({ hasText: `Deletion of “${titles[2]}” was not confirmed.` })
                .waitFor();
              assert.equal(
                await page.getByRole("button", { name: "Confirm delete", exact: true }).count(),
                0,
              );
              assert.equal(await page.evaluate(() => window.__deleteAudit.calls.length), 3);
              const reload = page.getByRole("button", { name: "Reload items", exact: true });
              await reload.focus();
              await reload.press("Enter");
              await group(1).waitFor();
              assert.equal(await group(2).count(), 0);
              assert.equal(
                await page.getByLabel("Item name", { exact: true }).inputValue(),
                "Retained creation draft",
              );
              assert.equal(await page.evaluate(() => window.__deleteAudit.calls.length), 3);
              await page.evaluate(() => (window.__deleteAudit.mode = "instant"));
              await submit(1);
              await page.getByText(titles[1] + " deleted.", { exact: true }).waitFor();
              assert.equal(await page.evaluate(() => window.__deleteAudit.calls.length), 4);
              assert.equal(
                await page.getByLabel("Item name", { exact: true }).inputValue(),
                "Retained creation draft",
              );
              checks.push({
                surface,
                case: "unknown result after actual fixture removal requires read-only reload; no replay; next explicit delete and retained creation draft",
                calls: await page.evaluate(() => window.__deleteAudit.calls),
                status: "PASS",
              });
            }
            console.log(JSON.stringify({ completed: cases.length, surface }));
            await context.close();
          }
  const sources = {};
  for (const f of [
    "src/ui/ClassRecordWorkspace.tsx",
    "src/ui/AssessmentAuthoringScreen.tsx",
    "src/ui/ClassRecordWorkspace.test.tsx",
    "src/ui/AssessmentAuthoringScreen.test.tsx",
    "src/ui/theme/styles.css",
    "scripts/assurance/assessment-delete-browser.mjs",
  ])
    sources[f] = createHash("sha256")
      .update(await readFile(f))
      .digest("hex");
  await writeFile(
    output + "/receipt.json",
    JSON.stringify(
      {
        project: "LIKHA-SIS",
        head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        node: process.version,
        browser: browser.version(),
        sources,
        cases,
        checks,
        limits: [
          "Controlled in-memory fixture deletes/refusals/lost replies; no native persistence/device proof",
          "Both resolved appearances; System resolution retains prior shared-provider receipt",
          "Teacher/device/manual AT/OS zoom and full PM-12/A1–A7 remain pending",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ cases: cases.length, checks: checks.length, status: "PASS" }));
} finally {
  await browser?.close();
  server.kill();
}
