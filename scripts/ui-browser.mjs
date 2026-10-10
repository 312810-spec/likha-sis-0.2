import { execFile } from "node:child_process";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Use the official headless shell where desktop Chromium cannot open local sockets. */
export async function uiBrowserExecutable() {
  const override = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (override) {
    await access(override);
    return override;
  }
  if (process.platform !== "linux") return undefined;
  const cache = path.resolve(process.env.LIKHA_UI_BROWSER_CACHE ?? ".cache/ui-browser");
  const pointer = path.join(cache, "installed.json");
  try {
    const installed = JSON.parse(await readFile(pointer, "utf8"));
    await access(installed.executable);
    return installed.executable;
  } catch {
    // A missing cache is reproducible from Google's official distribution.
  }
  await mkdir(cache, { recursive: true });
  const manifestFile = path.join(cache, "manifest.json");
  await run("curl", [
    "-fsSL",
    "--max-time",
    "60",
    "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json",
    "-o",
    manifestFile,
  ]);
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  const stable = manifest.channels.Stable;
  const download = stable.downloads["chrome-headless-shell"].find(
    (entry) => entry.platform === "linux64",
  );
  if (
    !/^\d+\.\d+\.\d+\.\d+$/.test(stable.version) ||
    !download?.url.startsWith("https://storage.googleapis.com/chrome-for-testing-public/")
  )
    throw new Error("Chrome for Testing returned an unexpected download source");
  const archive = path.join(cache, `${stable.version}.zip`);
  const directory = path.join(cache, stable.version);
  await run("curl", ["-fsSL", "--max-time", "180", download.url, "-o", archive]);
  await mkdir(directory, { recursive: true });
  await run("python3", [
    "-c",
    "import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])",
    archive,
    directory,
  ]);
  const executable = path.join(directory, "chrome-headless-shell-linux64", "chrome-headless-shell");
  await chmod(executable, 0o755);
  await writeFile(
    pointer,
    JSON.stringify({ version: stable.version, source: download.url, executable }, null, 2) + "\n",
  );
  return executable;
}
