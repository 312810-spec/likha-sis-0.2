// Production app + synthetic IPC replies. No native authorization/persistence claim.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import axe from "axe-core";
import { uiBrowserExecutable } from "../ui-browser.mjs";
const output = ".cache/legacy-setup-recovery";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
  stdio: "ignore",
});
let browser;
const checks = [];
try {
  await mkdir(output, { recursive: true });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch("http://127.0.0.1:1420")).ok) break;
    } catch {
      /* starting */
    }
    if (i === 99) throw new Error("Vite did not start");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ headless: true, executablePath: await uiBrowserExecutable() });
  for (const theme of ["light", "dark"]) {
    for (const density of ["efficient", "comfortable", "guided"]) {
      for (const width of [1280, 640, 390]) {
        const page = await browser.newPage({
          viewport: { width, height: 900 },
          reducedMotion: "reduce",
        });
        await page.addInitScript(
          ({ theme, density }) => {
            localStorage.setItem("likha-sis:appearance", theme);
            localStorage.setItem("likha-sis:teacher-mode", density);
            const current = {
              userId: "synthetic-owner",
              username: "synthetic.owner",
              displayName: "Synthetic owner",
              schoolId: "synthetic-school",
              schoolName: "Synthetic school",
              roles: [],
              expiresAtUnixMs: Date.now() + 3600000,
              idleExpiresAtUnixMs: Date.now() + 3600000,
            };
            window.__recoveryProbe = { writes: 0, release: null };
            window.__TAURI_INTERNALS__ = {
              invoke: async (command) => {
                if (command === "installation_status") return { needsSetup: false };
                if (command === "current_session") return current;
                if (command === "legacy_setup_recovery_available") return true;
                if (command === "restore_legacy_setup_access") {
                  window.__recoveryProbe.writes++;
                  await new Promise((resolve) => {
                    window.__recoveryProbe.release = resolve;
                  });
                  return { ...current, roles: ["registrar", "school_head", "teacher"] };
                }
                if (command.startsWith("get_")) return null;
                return [];
              },
              convertFileSrc: (value) => value,
            };
          },
          { theme, density },
        );
        await page.goto("http://127.0.0.1:1420", { waitUntil: "networkidle" });
        const trigger = page.getByRole("button", { name: "Restore setup access", exact: true });
        await trigger.click();
        const input = page.getByLabel("Current password", { exact: true });
        await input.fill("synthetic-secret");
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        assert.equal(await page.evaluate(() => window.__recoveryProbe.writes), 0);
        assert(await trigger.evaluate((node) => node === document.activeElement));
        await trigger.click();
        assert.equal(await input.inputValue(), "");
        await input.fill("synthetic-secret");
        await input.press("Tab");
        const confirm = page.getByRole("button", {
          name: "Confirm restore setup access",
          exact: true,
        });
        assert(await confirm.evaluate((node) => node === document.activeElement));
        const geometry = await confirm.evaluate((node) => {
          const b = node.getBoundingClientRect();
          return {
            visible: b.width > 0 && b.height > 0,
            hit: node.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)),
            overflow: document.documentElement.scrollWidth > innerWidth,
            theme: document.documentElement.dataset.appearance,
            density: document.documentElement.dataset.teacherMode,
          };
        });
        assert(geometry.visible && geometry.hit && !geometry.overflow);
        assert.equal(geometry.theme, theme);
        assert.equal(geometry.density, density);
        await page.addScriptTag({ content: axe.source });
        const violations = await page.evaluate(async () =>
          (
            await window.axe.run(
              document.querySelector('section[aria-label="Restore setup access"]'),
              { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } },
            )
          ).violations.map((v) => v.id),
        );
        assert.deepEqual(violations, []);
        if (width === 390 && density === "comfortable")
          await page.screenshot({ path: `${output}/${theme}-phone.png`, fullPage: true });
        await confirm.click();
        assert.equal(await input.inputValue(), "");
        assert(await page.getByRole("button", { name: "Cancel", exact: true }).isDisabled());
        await page.evaluate(() => window.__recoveryProbe.release());
        await trigger.waitFor({ state: "detached" });
        assert.equal(await page.evaluate(() => window.__recoveryProbe.writes), 1);
        checks.push({
          theme,
          density,
          width,
          cancelWrites: 0,
          restoreRequests: 1,
          geometry,
          violations,
          receiptUpdatesAppRoles: true,
        });
        await page.close();
      }
    }
  }
  await writeFile(
    `${output}/evidence.json`,
    JSON.stringify(
      {
        method: "Production App with injected synthetic IPC; native/device checks separate",
        checks,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      cases: checks.length,
      result: "PASS",
      nativeRecovery: "NOT RUN by browser mock",
    }),
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
