// Real authoring UI; controlled in-memory update/rename and list acknowledgments.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "../ui-browser.mjs";
const output = ".cache/assessment-edit";
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
                window.__editAudit={mode:"instant",calls:[],created:[],release:null,holdList:false,releaseList:null,results:[]};
                export class FixtureAssessmentRepository extends BaseFixtureAssessmentRepository {
                  async createItem(...args){const r=await super.createItem(...args);window.__editAudit.created.push(r);return r;}
                  async listItemsByClassRecord(...args){const a=window.__editAudit;if(a.holdList)await new Promise(r=>a.releaseList=r);return super.listItemsByClassRecord(...args);}
                  async updateItem(...args){const a=window.__editAudit;a.calls.push({kind:"update",args});
                    if(a.mode!=="instant")await new Promise(r=>a.release=r);
                    if(a.mode==="reject")throw Error("synthetic rejected update");
                    const r=await super.updateItem(...args);a.results.push(r);return r;}
                  async renameItem(...args){const a=window.__editAudit;a.calls.push({kind:"rename",args});
                    if(a.mode!=="instant")await new Promise(r=>a.release=r);
                    const r=await super.renameItem(...args);a.results.push(r);return r;}
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
            for (const title of ["Synthetic first item", "Synthetic second item"]) {
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
            const ids = await page.evaluate(() => window.__editAudit.created.map((i) => i.id));
            const prefix = surface === "workspace" ? "" : "authoring-";
            const field = (kind, id = ids[0]) => page.locator(`#${prefix}edit-${kind}-${id}`);
            const edit = async (id) => {
              if (surface === "studio")
                await page
                  .getByRole("group", {
                    name: `Actions for ${id === ids[0] ? "Synthetic first item" : "Synthetic second item"}`,
                    exact: true,
                  })
                  .getByRole("button", { name: "Edit", exact: true })
                  .click();
              else
                await page
                  .locator(".assessment-item-list > li")
                  .filter({
                    has: page.getByRole("button", {
                      name: new RegExp(
                        id === ids[0] ? "Synthetic first item" : "Synthetic second item",
                      ),
                    }),
                  })
                  .getByRole("button", { name: "Edit", exact: true })
                  .click();
            };
            await edit(ids[0]);
            await page.evaluate(() => {
              const a = window.__editAudit;
              a.mode = "delay";
              a.holdList = true;
            });
            const submitted = "Synthetic submitted revision — saved record";
            const newer = "Synthetic newer revision — keep this unsaved work";
            await field("name").fill(submitted);
            await page.getByRole("button", { name: "Save", exact: true }).click();
            await page.waitForFunction(() => window.__editAudit.calls.length === 1);
            const busy = page.getByRole("button", { name: "Saving…", exact: true });
            await busy.focus();
            await busy.press("Enter");
            assert.equal(await page.evaluate(() => window.__editAudit.calls.length), 1);
            await field("name").fill(newer);
            await field("category").selectOption("cat-pt");
            await field("max").fill("30");
            await field("max").focus();
            await page.evaluate(() => window.__editAudit.release());
            await page
              .getByText(submitted + " updated. Your newer item edits are retained.", {
                exact: true,
              })
              .waitFor();
            await page.waitForFunction(() => Boolean(window.__editAudit.releaseList));
            assert(
              await field("max").evaluate((el) => el === document.activeElement),
              "focus while refreshing",
            );
            assert.equal(await field("name").inputValue(), newer);
            await page.evaluate(() => {
              window.__editAudit.holdList = false;
              window.__editAudit.releaseList();
            });
            await page.getByRole("button", { name: "Save", exact: true }).waitFor();
            assert.equal(await field("name").inputValue(), newer);
            assert.equal(await field("max").inputValue(), "30");
            assert.equal(await field("category").inputValue(), "cat-pt");
            assert(
              await field("max").evaluate((el) => el === document.activeElement),
              "focus after refreshing",
            );
            const audit = await page.evaluate(() => window.__editAudit);
            assert.deepEqual(audit.calls, [
              { kind: "update", args: [ids[0], submitted, "cat-ww", 20] },
            ]);
            assert.equal(audit.results[0].id, ids[0]);
            assert.equal(audit.results[0].name, submitted);
            assert.equal(audit.results[0].maxScore, 20);
            assert.equal(audit.results[0].categoryId, "cat-ww");
            await page.evaluate(axe.source);
            const violations = await page.evaluate(async () =>
              (
                await window.axe.run(document, {
                  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
                })
              ).violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
            );
            assert.deepEqual(violations, []);
            const controls = await page
              .locator(".item-edit-form input,.item-edit-form select,.item-edit-form > button")
              .evaluateAll((els) =>
                els.map((el) => {
                  const s = getComputedStyle(el),
                    r = el.getBoundingClientRect();
                  return {
                    id: el.id || el.textContent,
                    role: el.tagName,
                    width: r.width,
                    height: r.height,
                    minHeight: s.minHeight,
                    padding: s.padding,
                    font: s.fontFamily,
                    fontSize: s.fontSize,
                    lineHeight: s.lineHeight,
                    color: s.color,
                    background: s.backgroundColor,
                    border: s.borderColor,
                    radius: s.borderRadius,
                    outline: s.outlineWidth,
                    outlineOffset: s.outlineOffset,
                    transition: s.transitionDuration,
                    easing: s.transitionTimingFunction,
                  };
                }),
              );
            assert(controls.every((c) => c.width >= 24 && c.height >= 24));
            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth + 1,
            );
            assert(!overflow, JSON.stringify({ surface, appearance, density, width, motion }));
            cases.push({
              surface,
              appearance,
              density,
              width,
              motion,
              submitted: audit.calls[0],
              saved: audit.results[0],
              retained: { name: newer, category: "cat-pt", max: 30, focus: "Max score" },
              controls,
              violations,
              overflow,
              status: "PASS",
            });
            if (
              ((appearance === "light" && density === "comfortable" && width === 1280) ||
                (appearance === "dark" && density === "guided" && width === 390)) &&
              motion === "reduce"
            )
              await page.screenshot({
                path: `${output}/${surface}-${width === 390 ? "phone" : "desktop"}.png`,
                fullPage: true,
              });
            if (
              appearance === "light" &&
              density === "efficient" &&
              width === 1280 &&
              motion === "no-preference"
            ) {
              await page.getByRole("button", { name: "Cancel", exact: true }).click();
              await edit(ids[1]);
              await field("name", ids[1]).fill("Submitted second revision");
              await page.getByRole("button", { name: "Save", exact: true }).click();
              await page.getByRole("button", { name: "Cancel", exact: true }).click();
              // First item now has the acknowledged name. Find its existing Edit action by row.
              await page
                .locator(".assessment-item-list > li")
                .filter({ hasText: submitted })
                .getByRole("button", { name: "Edit", exact: true })
                .click();
              await field("name").fill("Reopened first-item work");
              await page.evaluate(() => window.__editAudit.release());
              await page
                .getByText(
                  "Submitted second revision updated. Your newer item edits are retained.",
                  { exact: true },
                )
                .waitFor();
              await page.getByRole("button", { name: "Save", exact: true }).waitFor();
              assert.equal(await field("name").inputValue(), "Reopened first-item work");
              await page.evaluate(() => (window.__editAudit.mode = "reject"));
              await page.getByRole("button", { name: "Save", exact: true }).click();
              await field("name").fill("Retry current work");
              await page.evaluate(() => window.__editAudit.release());
              await page
                .getByRole("alert")
                .filter({ hasText: "Could not save changes to “Reopened first-item work”." })
                .waitFor();
              assert.equal(await field("name").inputValue(), "Retry current work");
              assert.equal(await page.evaluate(() => window.__editAudit.calls.length), 3);
              await page.evaluate(() => (window.__editAudit.mode = "instant"));
              await page.getByRole("button", { name: "Save", exact: true }).click();
              await page.getByText("Retry current work updated.", { exact: true }).waitFor();
              assert.equal(await field("name").count(), 0);
              const final = await page.evaluate(() => window.__editAudit.calls);
              assert.equal(final.length, 4);
              assert.equal(final[1].args[0], ids[1]);
              assert.equal(final[3].args[1], "Retry current work");
              checks.push({
                surface,
                case: "cancel/switch acknowledgment, rejection preserves current draft, explicit retry closes unchanged editor",
                calls: final,
                status: "PASS",
              });
            }
            await context.close();
          }
  const sources = {};
  for (const f of [
    "src/ui/ClassRecordWorkspace.tsx",
    "src/ui/AssessmentAuthoringScreen.tsx",
    "src/ui/ClassRecordWorkspace.test.tsx",
    "src/ui/AssessmentAuthoringScreen.test.tsx",
    "src/ui/theme/styles.css",
    "scripts/assurance/assessment-edit-browser.mjs",
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
          "In-memory fixture writes/list reads, not native persistence or actual-device proof",
          "Both resolved appearances; unchanged provider System resolution receipt remains historical",
          "Manual assistive/OS zoom/teacher acceptance and full PM-12/A1–A7 remain pending",
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
