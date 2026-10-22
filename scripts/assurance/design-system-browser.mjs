// Shared CSS/components/providers in an isolated unshipped catalog.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "../ui-browser.mjs";
const fixture =
  '\nimport {createRoot} from "react-dom/client";\nimport {ModeProvider} from "../../src/ui/theme/ModeContext";\nimport {AppearanceControl} from "../../src/ui/theme/AppearanceControl";\nimport {useTeacherMode} from "../../src/ui/theme/useTeacherMode";\nimport {Alert} from "../../src/ui/components/Alert";\nimport {StatusChip} from "../../src/ui/components/StatusChip";\nimport {Loading} from "../../src/ui/components/Loading";\nimport {EmptyState} from "../../src/ui/components/EmptyState";\nimport {DataTable} from "../../src/ui/components/DataTable";\nimport "../../src/ui/theme/styles.css";\nexport function Catalog(){\n const {mode,setMode}=useTeacherMode();\n return <main style={{padding:"var(--space-4)",maxWidth:"var(--content-width-wide)",margin:"auto"}}>\n <h1>LIKHA shared-system synthetic contract catalog</h1>\n <AppearanceControl/><label>Density<select value={mode} onChange={e=>setMode(e.target.value)}>\n {["efficient","comfortable","guided"].map(v=><option key={v}>{v}</option>)}</select></label>\n <label>Unsaved synthetic note<input id="preserved" defaultValue="Synthetic unsaved note: 0 remains zero"/></label>\n <h2>Actions and fields</h2><div className="worksheet-actions">\n <button id="normal">Review saved evidence</button>\n <button id="primary" className="button-primary">Save synthetic decision</button>\n <button id="selected" aria-pressed="true">Selected action</button>\n <button id="disabled" disabled>Unavailable action</button>\n <button id="aria-disabled" aria-disabled="true" onClick={e=>e.preventDefault()}>Checking evidence…</button>\n </div>\n <label>Invalid score<input id="invalid" aria-invalid="true" aria-describedby="invalid-reason" defaultValue="21"/></label>\n <p id="invalid-reason" className="field-error">Synthetic error: use a value from 0 to 20.</p>\n <label>Recorded value<input id="readonly" readOnly value="0"/></label>\n <label>Correction reason<textarea id="reason" defaultValue="Synthetic evidence available for review."/></label>\n <label><input id="checkbox" type="checkbox"/>Include this synthetic item</label>\n <label><input id="radio" type="radio" name="sample"/>Use this synthetic source</label>\n <h2>Feedback</h2>\n {["error","warning","success","info"].map(t=><Alert key={t} tone={t}><p>{t}: synthetic message; no school operation occurred.</p></Alert>)}\n {["neutral","productive","success","warning","danger"].map(t=><StatusChip key={t} tone={t}>{t} synthetic status</StatusChip>)}\n <Loading label="Checking synthetic evidence…"/>\n <EmptyState title="No synthetic records" description="Nothing recorded in this example." action={<button>Choose synthetic context</button>}/>\n <h2>Table</h2><DataTable caption="Synthetic source values" captionVisible reflowAt={640}\n columns={[{key:"name",header:"Learner"},{key:"value",header:"Value",align:"end"}]}\n rows={[{key:"a",rowHeader:"name",cells:{name:"Synthetic learner with a deliberately long display name",value:"0"}},{key:"b",rowHeader:"name",cells:{name:"Another synthetic learner",value:"Not recorded"}}]}/>\n </main>;\n}\ncreateRoot(document.getElementById("catalog")).render(<ModeProvider><Catalog/></ModeProvider>);\n';
const output = ".cache/design-system";
await mkdir(output, { recursive: true });
await writeFile(output + "/catalog.tsx", fixture);
await writeFile(
  output + "/catalog.html",
  '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shared contract</title></head><body><div id="catalog"></div><script type="module" src="/.cache/design-system/catalog.tsx"></script></body></html>',
);
const sha = (x) => createHash("sha256").update(x).digest("hex");
const scale = { efficient: [8, 14, 34], comfortable: [12, 15, 40], guided: [18, 17, 72] };
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "",
  browser,
  declarations;
server.stdout.on("data", (c) => (logs += c));
server.stderr.on("data", (c) => (logs += c));
const cases = [],
  profiles = {},
  interactionChecks = [];
try {
  const url = "http://127.0.0.1:1420/" + output + "/catalog.html";
  for (let n = 0; n < 80; n++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    if (n === 79) throw Error(logs);
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ headless: true, executablePath: await uiBrowserExecutable() });
  for (const motion of ["no-preference", "reduce"])
    for (const host of ["light", "dark"])
      for (const appearance of ["light", "dark", "system"])
        for (const density of ["efficient", "comfortable", "guided"]) {
          const context = await browser.newContext({
            colorScheme: host,
            reducedMotion: motion,
            viewport: { width: 1280, height: 1000 },
          });
          await context.addInitScript(
            ({ appearance, density }) => {
              localStorage.setItem("likha-sis:appearance", appearance);
              localStorage.setItem("likha-sis:teacher-mode", density);
            },
            { appearance, density },
          );
          const page = await context.newPage();
          await page.goto(url, { waitUntil: "networkidle" });
          const resolved = appearance === "system" ? host : appearance;
          await page.waitForFunction(
            ({ resolved, density }) =>
              document.documentElement.dataset.appearance === resolved &&
              document.documentElement.dataset.teacherMode === density,
            { resolved, density },
          );
          const data = await page.evaluate(() => {
            const declarations = [];
            function visit(rules, conditions = []) {
              for (const r of rules) {
                if (r.style)
                  for (const name of r.style)
                    if (name.startsWith("--"))
                      declarations.push({
                        name,
                        value: r.style.getPropertyValue(name).trim(),
                        selector: r.selectorText ?? null,
                        conditions,
                      });
                if (r.cssRules)
                  visit(r.cssRules, [...conditions, r.conditionText ?? r.name ?? "group"]);
              }
            }
            for (const sheet of document.styleSheets) visit(sheet.cssRules);
            const root = getComputedStyle(document.documentElement),
              tokens = {};
            const probe = document.createElement("div");
            probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none";
            document.body.append(probe);
            for (const name of [...new Set(declarations.map((d) => d.name))].sort()) {
              const raw = root.getPropertyValue(name).trim();
              if (!raw) {
                tokens[name] = {
                  raw: null,
                  resolved: null,
                  note: "Scoped/inactive; see declarations",
                };
                continue;
              }
              let property;
              if (name.startsWith("--color-")) property = "color";
              else if (name === "--font-family" || name === "--font-numeric")
                property = "fontFamily";
              else if (name.startsWith("--font-size")) property = "fontSize";
              else if (name.startsWith("--motion-duration")) property = "transitionDuration";
              else if (name.startsWith("--motion-easing")) property = "transitionTimingFunction";
              else if (name.startsWith("--elevation")) property = "boxShadow";
              else if (name.startsWith("--line-height")) property = "lineHeight";
              else if (
                /--(?:space-|spacing-|control-|content-|sidebar-|breakpoint-|radius|focus-ring)/.test(
                  name,
                )
              )
                property = "width";
              if (property) {
                probe.style[property] = "var(" + name + ")";
                tokens[name] = { raw, resolved: getComputedStyle(probe)[property], property };
                probe.style[property] = "";
              } else tokens[name] = { raw, resolved: null, note: "No generic typed measurement" };
            }
            probe.remove();
            const props = [
              "color",
              "backgroundColor",
              "borderColor",
              "borderRadius",
              "fontFamily",
              "fontSize",
              "fontWeight",
              "lineHeight",
              "minHeight",
              "paddingTop",
              "paddingRight",
              "paddingBottom",
              "paddingLeft",
              "outlineColor",
              "outlineWidth",
              "outlineOffset",
              "transitionDuration",
              "transitionTimingFunction",
              "opacity",
              "cursor",
              "accentColor",
            ];
            const controls = {};
            for (const selector of [
              "#normal",
              "#primary",
              "#selected",
              "#disabled",
              "#aria-disabled",
              "#invalid",
              "#readonly",
              "#reason",
              "#checkbox",
              "#radio",
              ".alert-error",
              ".alert-warning",
              ".alert-success",
              ".alert-info",
              ".status-chip-neutral",
              ".status-chip-productive",
              ".status-chip-success",
              ".status-chip-warning",
              ".status-chip-danger",
              ".loading-state",
              ".empty-state",
              ".data-table",
            ]) {
              const el = document.querySelector(selector),
                s = getComputedStyle(el),
                rect = el.getBoundingClientRect();
              controls[selector] = {
                ...Object.fromEntries(props.map((p) => [p, s[p]])),
                width: rect.width,
                height: rect.height,
                role: el.getAttribute("role"),
                disabled: el.matches(":disabled"),
                ariaDisabled: el.getAttribute("aria-disabled"),
              };
            }
            return { declarations, tokens, controls, scheme: root.colorScheme };
          });
          declarations ??= data.declarations;
          assert.deepEqual(
            ["--spacing-unit", "--font-size-base", "--control-height"].map((k) =>
              parseFloat(data.tokens[k].resolved),
            ),
            scale[density],
          );
          assert.equal(data.scheme, resolved);
          const ratios = [];
          function luminance(rgb) {
            const c = rgb
              .match(/[\d.]+/g)
              ?.slice(0, 3)
              .map(Number);
            assert(c?.length === 3, "Computed RGB expected: " + rgb);
            return c
              .map((x) => x / 255)
              .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
              .reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
          }
          const contrast = (a, b) => {
            const p = [luminance(a), luminance(b)].sort((x, y) => y - x);
            return (p[0] + 0.05) / (p[1] + 0.05);
          };
          for (const bg of ["bg", "surface", "surface-2", "primary-wash"]) {
            for (const fg of ["text", "text-muted", "primary", "border", "focus"]) {
              const minimum = ["border", "focus"].includes(fg) ? 3 : 4.5;
              const ratio = contrast(
                data.tokens["--color-" + fg].resolved,
                data.tokens["--color-" + bg].resolved,
              );
              ratios.push({ foreground: fg, background: bg, ratio, minimum });
              assert(ratio >= minimum, JSON.stringify(ratios.at(-1)));
            }
          }
          for (const selector of [
            ".alert-error",
            ".alert-warning",
            ".alert-success",
            ".alert-info",
            ".status-chip-neutral",
            ".status-chip-productive",
            ".status-chip-success",
            ".status-chip-warning",
            ".status-chip-danger",
            "#primary",
          ]) {
            const c = data.controls[selector],
              ratio = contrast(c.color, c.backgroundColor);
            ratios.push({ selector, ratio, minimum: 4.5 });
            assert(ratio >= 4.5, JSON.stringify(ratios.at(-1)));
          }
          for (const s of [
            "#normal",
            "#primary",
            "#selected",
            "#invalid",
            "#readonly",
            "#reason",
            "#checkbox",
            "#radio",
          ]) {
            const c = data.controls[s];
            assert(c.width >= 24 && c.height >= 24, "small target " + s);
          }
          if (motion === "reduce")
            assert(
              data.controls["#normal"].transitionDuration
                .split(",")
                .every((t) => parseFloat(t) <= 0.001),
            );
          await page.locator("#normal").focus();
          await page.keyboard.press("Tab");
          await page.keyboard.press("Shift+Tab");
          const focus = await page.locator("#normal").evaluate((el) => ({
            visible: el.matches(":focus-visible"),
            width: getComputedStyle(el).outlineWidth,
            offset: getComputedStyle(el).outlineOffset,
          }));
          assert(focus.visible && parseFloat(focus.width) === 2 && parseFloat(focus.offset) === 2);
          await page.locator("#normal").hover();
          await page.waitForFunction(
            () => getComputedStyle(document.querySelector("#normal")).filter === "brightness(0.97)",
          );
          const hover = await page.locator("#normal").evaluate((el) => getComputedStyle(el).filter);
          await page.mouse.down();
          const active = await page.locator("#normal").evaluate((el) => el.matches(":active"));
          await page.mouse.up();
          assert(active);
          await page.evaluate(axe.source);
          const violations = await page.evaluate(async () =>
            (
              await window.axe.run(document, {
                runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
              })
            ).violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
          );
          assert.deepEqual(violations, []);
          const widths = [];
          for (const width of [1280, 640, 390]) {
            await page.setViewportSize({ width, height: 1000 });
            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth + 1,
            );
            assert.equal(overflow, false);
            widths.push({ width, overflow });
          }
          const profile = resolved + "/" + density + "/" + motion;
          const content = {
            tokens: data.tokens,
            controls: data.controls,
            ratios,
            focus,
            hover,
            active,
          };
          if (profiles[profile])
            assert.deepEqual(
              content,
              profiles[profile],
              "host/preference changed same resolved profile",
            );
          else profiles[profile] = content;
          cases.push({
            motion,
            host,
            appearance,
            resolved,
            density,
            profile,
            widths,
            violations,
            status: "PASS",
          });
          if (
            motion === "reduce" &&
            appearance === "system" &&
            host === "light" &&
            density === "comfortable"
          ) {
            await page.setViewportSize({ width: 1280, height: 1000 });
            await page.screenshot({ path: output + "/desktop.png", fullPage: true });
          }
          if (
            motion === "reduce" &&
            appearance === "system" &&
            host === "dark" &&
            density === "guided"
          ) {
            await page.setViewportSize({ width: 390, height: 1000 });
            await page.screenshot({ path: output + "/phone.png", fullPage: true });
          }
          await context.close();
        }
  const page = await browser.newPage({ colorScheme: "light" });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator("#preserved").fill("Synthetic draft retained through display change");
  await page.getByRole("combobox", { name: /Appearance/ }).selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.documentElement.dataset.appearance === "dark");
  await page.getByRole("combobox", { name: /Appearance/ }).selectOption("light");
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.documentElement.dataset.appearance === "light");
  await page.getByRole("combobox", { name: /Density/ }).focus();
  await page.getByRole("combobox", { name: /Density/ }).selectOption("guided");
  assert.equal(
    await page.locator("#preserved").inputValue(),
    "Synthetic draft retained through display change",
  );
  assert(
    await page
      .getByRole("combobox", { name: /Density/ })
      .evaluate((el) => el === document.activeElement),
  );
  interactionChecks.push({
    case: "System follows host; explicit Light wins; display changes preserve unsaved DOM input and select focus",
    status: "PASS",
  });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.getByRole("combobox", { name: /Appearance/ }).inputValue(), "light");
  assert.equal(await page.getByRole("combobox", { name: /Density/ }).inputValue(), "guided");
  interactionChecks.push({
    case: "Actual preference storage survives reload; no draft persistence claim",
    status: "PASS",
  });
  assert.equal(cases.length, 36);
  const sources = {};
  for (const f of [
    "src/ui/theme/styles.css",
    "src/ui/theme/ModeContext.tsx",
    "src/ui/theme/AppearanceProvider.tsx",
    "src/ui/components/Alert.tsx",
    "src/ui/components/StatusChip.tsx",
    "src/ui/components/DataTable.tsx",
    "src/ui/components/Loading.tsx",
    "src/ui/components/EmptyState.tsx",
    "scripts/assurance/design-system-browser.mjs",
  ])
    sources[f] = sha(await readFile(f));
  const receipt = {
    project: "LIKHA-SIS",
    head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sources,
    fixtureSha256: sha(fixture),
    browser: browser.version(),
    node: process.version,
    method:
      "Actual shared CSS/components/providers in unshipped synthetic catalog; computed token profiles deduplicated after exact equality assertion",
    declarations,
    profiles,
    cases,
    interactionChecks,
    limits: [
      "No production handler/authority/workflow-write claim",
      "Intended opaque semantic pairs only; inactive opacity recorded separately",
      "No all-consumer or complete accessibility, manual AT, OS zoom, teacher/device acceptance",
      "Brand/logo, print and native surfaces need separate evidence",
    ],
  };
  await writeFile(output + "/receipt.json", JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify({
      cases: cases.length,
      widthChecks: cases.length * 3,
      interactionChecks: interactionChecks.length,
      profiles: Object.keys(profiles).length,
      declarations: declarations.length,
      status: "PASS",
    }),
  );
} finally {
  await browser?.close();
  server.kill();
}
if (process.argv.includes("--check-built")) {
  for (const f of await readdir("dist/assets"))
    if (f.endsWith(".js"))
      assert(
        !(await readFile("dist/assets/" + f, "utf8")).includes(
          "LIKHA shared-system synthetic contract catalog",
        ),
        "fixture leaked into production",
      );
  console.log("PASS: catalog absent from production JavaScript");
}
