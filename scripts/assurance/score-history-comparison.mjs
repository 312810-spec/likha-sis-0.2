// Optional local experiment. Never imported by production or required CI.
// Install @base-ui/react@1.9.0 without saving manifests, then npm ci to restore.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "../ui-browser.mjs";

const run = promisify(execFile);
const output = ".cache/history-comparison";
const componentPath = "src/ui/components/ScoreCorrectionHistory.tsx";
const baseline = "7bea54ac4b3e26baea3f30fd02963d606ceb154e";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const packageJson = JSON.parse(await readFile("node_modules/@base-ui/react/package.json", "utf8"));
assert.equal(packageJson.version, "1.9.0", "install the pinned experimental candidate first");
const license = await readFile("node_modules/@base-ui/react/LICENSE", "utf8");
assert(license.startsWith("MIT License"));
await mkdir(output, { recursive: true });
const source = await readFile(componentPath, "utf8");
const original = (await run("git", ["show", `${baseline}:${componentPath}`])).stdout;

// Only the disclosure wrapper changes. The LIKHA async model/content stays exact.
let candidate = source.replace(
  'import { useEffect, useId, useRef, useState } from "react";',
  'import { useEffect, useId, useRef, useState } from "react";\nimport { Collapsible } from "@base-ui/react/collapsible";',
);
assert.notEqual(candidate, source);
const replacements = [
  [
    '<div className="score-correction-history">',
    '<Collapsible.Root className="score-correction-history" open={open} onOpenChange={changeOpen}>',
  ],
  [
    '<button\n        type="button"\n        className="correction-history-toggle"',
    '<Collapsible.Trigger\n        type="button"\n        className="correction-history-toggle"',
  ],
  ["        onClick={() => changeOpen(!open)}\n", ""],
  [
    '      </button>\n      <div id={panelId} className="correction-history-panel" hidden={!open}>',
    '      </Collapsible.Trigger>\n      <Collapsible.Panel keepMounted id={panelId} className="correction-history-panel">',
  ],
  ["      </div>\n    </div>\n  );", "      </Collapsible.Panel>\n    </Collapsible.Root>\n  );"],
];
for (const [before, after] of replacements) {
  assert(candidate.includes(before), `candidate hook missing: ${before}`);
  candidate = candidate.replace(before, after);
}
const forFixture = (text) =>
  text
    .replaceAll('"../../application/', '"../../src/application/')
    .replaceAll('"../../domain/', '"../../src/domain/');
await writeFile(`${output}/base-component.tsx`, forFixture(candidate));
await writeFile(`${output}/original-component.tsx`, forFixture(original));
await writeFile(`${output}/candidate-app-source.txt`, candidate);

const harness = `
import { useMemo, useState } from "react";
import { LearnerScoreApplicationService } from "../../src/application/learner-score-service";
import { ModeProvider } from "../../src/ui/theme/ModeContext";
import { AppearanceControl } from "../../src/ui/theme/AppearanceControl";
import { useTeacherMode } from "../../src/ui/theme/useTeacherMode";
import "../../src/ui/theme/styles.css";
const probe = window.__historyProbe = { calls: [], writes: 0, mode: "error", releases: [] };
const name = "Ana María Dela Peña-Villanueva";
function entries(item, learner) { return [{ id: "synthetic-correction", assessmentItemId: item, learnerId: learner,
 previousStatus: "scored", previousScore: 0, previousRecordedByUserId: "synthetic-original",
 previousRecordedByName: "Original teacher (synthetic)", previousRecordedAt: "2026-10-01T09:00:00Z",
 newStatus: "scored", newScore: 19, correctedByUserId: "synthetic-reviewer", correctedByName: "Reviewing teacher (synthetic)",
 reason: "Synthetic recount after reviewing the written solution. " + "Evidence_".repeat(22) + item,
 correctedAt: "2026-10-06T14:30:00Z" }]; }
const repo = { rosterForItem: async () => [], record: async () => { probe.writes++; throw Error("No writes permitted"); },
 computeTermGrade: async () => null, correctionHistory: async (item, learner) => {
 probe.calls.push({ item, learner });
 if (probe.mode === "error") throw Error("Synthetic read failure");
 if (probe.mode === "delay") return new Promise(resolve => probe.releases.push(() => resolve(entries(item, learner))));
 return probe.mode === "empty" ? [] : entries(item, learner);
 }};
function Surface({ Component }) {
 const {mode, setMode} = useTeacherMode();
 const [item, setItem] = useState("ai-1"); const [serviceVersion, setServiceVersion] = useState(0);
 const service = useMemo(() => new LearnerScoreApplicationService(repo), [serviceVersion]);
 return <main style={{padding:"var(--space-4)", maxWidth:"var(--content-width-wide)", margin:"auto"}}>
 <h1>Scores history — synthetic comparison</h1>
 <div style={{display:"flex",flexWrap:"wrap",gap:"var(--space-4)",marginBottom:"var(--space-4)"}}>
 <AppearanceControl/><label>Density<select value={mode} onChange={e=>setMode(e.target.value)}>
 {['efficient','comfortable','guided'].map(m=><option key={m}>{m}</option>)}</select></label>
 <button onClick={()=>setItem(v=>v==='ai-1'?'ai-2':'ai-1')}>Change assessment</button>
 <button onClick={()=>setServiceVersion(v=>v+1)}>Replace read service</button></div>
 <div className="score-entry-scroll"><table className="attendance-roster score-entry">
 <thead><tr><th scope="col">Learner</th><th scope="col">Score</th><th scope="col">Exception</th></tr></thead>
 <tbody><tr><th scope="row">{name}</th><td><input aria-label="Recorded score" className="score-entry-input" value="19" readOnly/>
 <Component service={service} assessmentItemId={item} learnerId="l-1" learnerName={name}/>
 </td><td>No exception</td></tr></tbody></table></div></main>;
}
export function Harness({ Component }) { return <ModeProvider><Surface Component={Component}/></ModeProvider>; }
`;
await writeFile(`${output}/harness.tsx`, harness);
for (const variant of ["original", "native", "base"]) {
  const importPath =
    variant === "native"
      ? "../../src/ui/components/ScoreCorrectionHistory"
      : `./${variant}-component`;
  await writeFile(
    `${output}/${variant}.tsx`,
    `import {createRoot} from "react-dom/client"; import {Harness} from "./harness"; import {ScoreCorrectionHistory} from "${importPath}"; createRoot(document.getElementById("root")).render(<Harness Component={ScoreCorrectionHistory}/>);`,
  );
  await writeFile(
    `${output}/${variant}.html`,
    `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic history comparison</title></head><body><div id="root"></div><script type="module" src="/${output}/${variant}.tsx"></script></body></html>`,
  );
}

const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", (chunk) => (logs += chunk));
server.stderr.on("data", (chunk) => (logs += chunk));
let browser;
const checks = [];
try {
  const url = `http://127.0.0.1:1420/${output}/`;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await fetch(`${url}native.html`)).ok) break;
    } catch {
      /* starting */
    }
    if (attempt === 79) throw Error(logs);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ headless: true, executablePath: await uiBrowserExecutable() });
  const name = "Ana María Dela Peña-Villanueva";
  for (const variant of ["original", "native", "base"]) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
      hasTouch: true,
    });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${url}${variant}.html`, { waitUntil: "networkidle" });
    const toggle = page.getByRole("button", {
      name: `Correction history for ${name}`,
      exact: true,
    });
    await toggle.waitFor();
    if (variant !== "original") {
      const controlled = await toggle.getAttribute("aria-controls");
      assert(controlled);
      assert(await page.evaluate((id) => Boolean(document.getElementById(id)), controlled));
    }
    assert.equal(await page.evaluate(() => window.__historyProbe.calls.length), 0);
    await toggle.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("alert").waitFor();
    assert.equal(await page.evaluate(() => window.__historyProbe.calls.length), 1);
    await page.evaluate(() => (window.__historyProbe.mode = "success"));
    let retryActions;
    if (variant === "original") {
      assert.equal(
        await page.getByRole("button", { name: `Retry history for ${name}`, exact: true }).count(),
        0,
      );
      await toggle.click();
      await toggle.click();
      retryActions = 2;
    } else {
      await page.getByRole("button", { name: `Retry history for ${name}`, exact: true }).waitFor();
      // Name changes from Retry to Refresh as the async state changes; the
      // retained DOM button is the focus subject throughout, not its old name.
      const retry = page.locator(".correction-history-panel button");
      await page.evaluate(() => (window.__historyProbe.mode = "delay"));
      await page.keyboard.press("Tab");
      assert(await retry.evaluate((el) => el === document.activeElement));
      await page.keyboard.press("Enter");
      retryActions = 1;
      await page.waitForFunction(() => window.__historyProbe.calls.length === 2);
      assert(await retry.evaluate((el) => el === document.activeElement));
      assert.equal(await retry.getAttribute("aria-disabled"), "true");
      await retry.dispatchEvent("click");
      await retry.dispatchEvent("click");
      assert.equal(await page.evaluate(() => window.__historyProbe.calls.length), 2);
      await page.evaluate(() => window.__historyProbe.releases.shift()());
      await page.locator(".correction-history-change").waitFor();
      assert(await retry.evaluate((el) => el === document.activeElement));
      await page.evaluate(() => (window.__historyProbe.mode = "empty"));
      await retry.press("Space");
      await page.getByText("No corrections recorded for this score.", { exact: true }).waitFor();
      await page.evaluate(() => (window.__historyProbe.mode = "success"));
      await retry.press("Enter");
    }
    await page.locator(".correction-history-change").waitFor();
    assert.equal(
      (await page.locator(".correction-history-change").innerText()).replace(/\s+/g, " "),
      "0 → 19",
    );
    assert(
      (await page.locator(".correction-history-meta").innerText()).includes(
        "Original teacher (synthetic)",
      ),
    );
    checks.push({
      variant,
      case: "read-only error/recovery/history",
      retryActions,
      duplicateRequests: 0,
      writes: await page.evaluate(() => window.__historyProbe.writes),
    });
    if (variant !== "original") {
      await page.evaluate(() => (window.__historyProbe.mode = "delay"));
      await page.getByRole("button", { name: "Replace read service", exact: true }).click();
      assert.equal(await page.locator(".correction-history-entry").count(), 0);
      await page.getByText("Loading corrections…", { exact: true }).waitFor();
      await page.waitForFunction(() => window.__historyProbe.releases.length === 1);
      await page.getByRole("button", { name: "Change assessment", exact: true }).click();
      await page.waitForFunction(() => window.__historyProbe.releases.length === 2);
      await page.evaluate(() => {
        const old = window.__historyProbe.releases.shift();
        window.__historyProbe.releases.shift()();
        window.__historyProbe.old = old;
      });
      await page.locator(".correction-history-reason").waitFor();
      await page.evaluate(() => window.__historyProbe.old());
      assert((await page.locator(".correction-history-reason").innerText()).includes("ai-2"));
      checks.push({ variant, case: "service and item response isolation", status: "PASS" });
    }
    for (const appearance of ["light", "dark"])
      for (const density of ["efficient", "comfortable", "guided"])
        for (const width of [1280, 640, 390]) {
          if (variant === "original") continue;
          await page.setViewportSize({ width, height: 900 });
          await page.getByRole("combobox", { name: /Appearance/ }).selectOption(appearance);
          await page.getByRole("combobox", { name: /Density/ }).selectOption(density);
          await page.evaluate(axe.source);
          const violations = await page.evaluate(async () =>
            (
              await window.axe.run(document, {
                runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
              })
            ).violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
          );
          const geometry = await page.evaluate(() => ({
            pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
            panelOverflow: (() => {
              const p = document.querySelector(".correction-history-panel");
              return p.scrollWidth > p.clientWidth + 1;
            })(),
            selectable: getComputedStyle(document.querySelector(".correction-history-reason"))
              .userSelect,
            reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
            transitionSeconds: getComputedStyle(
              document.querySelector(".correction-history-toggle"),
            )
              .transitionDuration.split(",")
              .map((value) => Number.parseFloat(value)),
          }));
          checks.push({
            variant,
            case: `layout/a11y ${appearance}/${density}/${width}`,
            violations,
            geometry,
          });
          assert.deepEqual(violations, []);
          assert.equal(geometry.pageOverflow, false);
          assert.equal(
            geometry.panelOverflow,
            false,
            JSON.stringify({ variant, appearance, density, width, geometry }),
          );
          assert.notEqual(geometry.selectable, "none");
          assert.equal(geometry.reducedMotion, true);
          assert(geometry.transitionSeconds.every((value) => value <= 0.001));
          await page.screenshot({
            path: `${output}/${variant}-${appearance}-${density}-${width}.png`,
            fullPage: true,
          });
        }
    await toggle.focus();
    await toggle.press("Space");
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert(await toggle.evaluate((el) => el === document.activeElement));
    if (variant !== "original") {
      await page.evaluate(() => (window.__historyProbe.mode = "empty"));
      await toggle.tap();
      await page.getByText("No corrections recorded for this score.", { exact: true }).waitFor();
      const refresh = page.locator(".correction-history-panel button");
      const bounds = await refresh.boundingBox();
      assert(bounds && bounds.width >= 24 && bounds.height >= 24);
      await page.evaluate(() => (window.__historyProbe.mode = "success"));
      await refresh.tap();
      await page.locator(".correction-history-reason").waitFor();
      const copied = await page.locator(".correction-history-reason").evaluate((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        const matches = selection.toString() === node.textContent;
        selection.removeAllRanges();
        return matches;
      });
      assert(copied);
      checks.push({
        variant,
        case: "keyboard close, touch reopen/refresh and full reason selection",
        status: "PASS",
        minimumTarget: 24,
      });
    }
    assert.equal(await page.evaluate(() => window.__historyProbe.writes), 0);
    assert.deepEqual(pageErrors, []);
    await page.close();
  }
} finally {
  await browser?.close();
  server.kill();
}

const bundles = {};
assert.equal(checks.length, 43, "all expected comparison cases must execute");
for (const variant of ["native", "base"]) {
  const config = `import base from "../../vite.config.ts"; import fs from "node:fs";
export default {...base, plugins:[${variant === "base" ? `{name:"history-candidate-only",enforce:"pre",transform(code,id){if(id.split('?')[0].endsWith('/src/ui/components/ScoreCorrectionHistory.tsx')) return {code:fs.readFileSync('${output}/candidate-app-source.txt','utf8'),map:null};}},` : ""}...base.plugins],build:{outDir:'${output}/app-${variant}',emptyOutDir:true}};`;
  await writeFile(`${output}/build-${variant}.mjs`, config);
  const built = await run(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "build", "--config", `${output}/build-${variant}.mjs`],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  await writeFile(`${output}/build-${variant}.log`, built.stdout + built.stderr);
  const files = (await readdir(`${output}/app-${variant}/assets`)).filter((f) =>
    /\.(js|css)$/.test(f),
  );
  bundles[variant] = { jsBytes: 0, jsGzipBytes: 0, cssBytes: 0, assets: {} };
  for (const file of files) {
    const bytes = await readFile(`${output}/app-${variant}/assets/${file}`);
    bundles[variant].assets[file] = sha(bytes);
    if (file.endsWith(".js")) {
      bundles[variant].jsBytes += bytes.length;
      bundles[variant].jsGzipBytes += gzipSync(bytes).length;
    } else bundles[variant].cssBytes += bytes.length;
  }
}
const evidence = {
  project: "LIKHA-SIS",
  baseline,
  method:
    "Matched synthetic browser tasks with identical LIKHA async model/content/CSS; actual production app builds differ only in disclosure wrapper",
  candidate: {
    package: "@base-ui/react",
    version: packageJson.version,
    license: packageJson.license,
    licenseSha256: sha(license),
    dependencies: packageJson.dependencies,
  },
  sources: {
    scriptSha256: sha(await readFile("scripts/assurance/score-history-comparison.mjs")),
    nativeSha256: sha(source),
    originalSha256: sha(original),
    candidateSha256: sha(candidate),
  },
  checks,
  bundles,
  delta: {
    jsBytes: bundles.base.jsBytes - bundles.native.jsBytes,
    jsGzipBytes: bundles.base.jsGzipBytes - bundles.native.jsGzipBytes,
  },
  limits: [
    "Synthetic fixtures/browser environment; no teacher comprehension or native/device claim",
    "Experimental no-save dependency install; restore lockfile environment with npm ci before final production verification",
    "No whole-library quality judgment or unsupported component adoption",
  ],
};
await writeFile(`${output}/comparison.json`, JSON.stringify(evidence, null, 2) + "\n");
console.log(
  JSON.stringify({
    checks: checks.length,
    retryActions: { original: 2, native: 1, base: 1 },
    delta: evidence.delta,
    status: "PASS",
  }),
);
