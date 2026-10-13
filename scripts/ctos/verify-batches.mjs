import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

/** Executes checks, never declares domain implementation or device acceptance. */
export function runCheck(command, args, { cwd, logPath, timeoutMs = 900_000 }) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const log = fs.createWriteStream(logPath);
    const child = spawn(command, args, {
      cwd,
      detached: process.platform !== "win32",
      shell: process.platform === "win32" && command.endsWith(".cmd"),
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });
    let launchError;
    let timedOut = false;
    child.on("error", (error) => {
      launchError = error.code ?? "LAUNCH_ERROR";
    });
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform !== "win32" && child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /* Already exited. */
        }
      } else child.kill("SIGKILL");
    }, timeoutMs);
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      log.end(() =>
        resolve({
          command,
          args,
          startedAt,
          finishedAt: new Date().toISOString(),
          status: launchError
            ? "NOT RUN"
            : timedOut
              ? "INCONCLUSIVE"
              : exitCode === 0 && !signal
                ? "PASS"
                : "FAIL",
          exitCode,
          signal,
          launchError,
          timedOut,
          logPath,
        }),
      );
    });
  });
}

export async function main(args = process.argv.slice(2)) {
  if (args.some((arg) => !["--ui", "--native"].includes(arg))) {
    throw new Error("Supported options: --ui --native");
  }
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const evidenceRoot = path.join(root, ".ctos-evidence");
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(evidenceRoot, "run-"));
  const sourceHash = createHash("sha256");
  const sourceFiles = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean)
    .sort();
  for (const file of sourceFiles) {
    sourceHash.update(file + "\0");
    const absolute = path.join(root, file);
    sourceHash.update(fs.existsSync(absolute) ? fs.readFileSync(absolute) : "DELETED");
    sourceHash.update("\0");
  }
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const jobs = [
    ["frontend-quality", npm, ["run", "quality"], root],
    ["build", npm, ["run", "build"], root],
    ["fixture-isolation", npm, ["run", "check:dev-preview-isolation"], root],
  ];
  if (args.includes("--ui")) {
    jobs.push(
      ["ui", npm, ["run", "quality:ui"], root],
      ["ui-recovery", npm, ["run", "quality:ui:recovery"], root],
    );
  }
  if (args.includes("--native")) {
    const native = path.join(root, "src-tauri");
    jobs.push(
      ["native-format", "cargo", ["fmt", "--check"], native],
      ["native-tests", "cargo", ["test", "--locked"], native],
      [
        "native-clippy",
        "cargo",
        ["clippy", "--locked", "--all-targets", "--", "-D", "warnings"],
        native,
      ],
    );
  }
  const report = {
    schemaVersion: 1,
    head,
    sourceDigest: sourceHash.digest("hex"),
    dirtyAtStart: Boolean(dirty),
    scope:
      "Automated development checks only; no installed-device, official-fidelity, or teacher acceptance.",
    readiness: "INCONCLUSIVE",
    checks: [],
    outstanding: [
      "installed-Windows",
      "two-device-sync",
      "process-death",
      "replacement-recovery",
      "Android-native",
      "official-output-fidelity",
      "manual-accessibility",
      "teacher-review",
    ],
  };
  const receipt = path.join(directory, "receipt.json");
  for (const [id, command, jobArgs, cwd] of jobs) {
    const result = await runCheck(command, jobArgs, {
      cwd,
      logPath: path.join(directory, `${id}.log`),
    });
    report.checks.push({ id, ...result });
    if (result.status === "FAIL") report.readiness = "BLOCKED";
    const temporary = `${receipt}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(report, null, 2));
    fs.renameSync(temporary, receipt);
    process.stdout.write(`${id}: ${result.status}\n`);
  }
  process.stdout.write(`Evidence: ${receipt}\nReadiness: ${report.readiness}\n`);
  // Missing required external evidence is intentionally not a successful release gate.
  return report.readiness === "BLOCKED" ? 1 : 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
