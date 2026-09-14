import fs from "node:fs";

const DOC_EXTENSIONS = new Set([".md", ".mdx", ".txt"]);

function extensionOf(path) {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot) : "";
}

function isDocs(path) {
  return path.startsWith("docs/") || DOC_EXTENSIONS.has(extensionOf(path));
}

function isHarness(path) {
  return (
    path === "AGENTS.md" ||
    path.startsWith(".agents/") ||
    path.startsWith(".harness/") ||
    path.startsWith("scripts/harness/") ||
    path.startsWith("docs/harness/")
  );
}

function isCiControl(path) {
  return path.startsWith(".github/workflows/") || path.startsWith("scripts/ci/");
}

function isPackageManifest(path) {
  return path === "package.json" || path === "package-lock.json";
}

function isNative(path) {
  return (
    path.startsWith("src-tauri/") ||
    path === "Cargo.toml" ||
    path === "Cargo.lock" ||
    path.startsWith("java/") ||
    path.startsWith("sidecar/")
  );
}

function isUi(path) {
  return (
    path === "src/App.tsx" ||
    path.startsWith("src/ui/") ||
    path.startsWith("src/styles/") ||
    path.startsWith("public/") ||
    path.startsWith("e2e/") ||
    path.startsWith("tests/e2e/") ||
    path === "scripts/ui-smoke.mjs" ||
    path.endsWith(".css")
  );
}

function isJavaScript(path) {
  return (
    path.startsWith("src/") ||
    path.startsWith("scripts/") ||
    /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(path) ||
    path.startsWith("tsconfig") ||
    path.startsWith("vite.config") ||
    path.startsWith("eslint.config") ||
    path.startsWith("playwright.config") ||
    path === ".prettierrc.json" ||
    path === ".prettierignore"
  );
}

function isRecognized(path) {
  return (
    isDocs(path) ||
    isHarness(path) ||
    isCiControl(path) ||
    isPackageManifest(path) ||
    isNative(path) ||
    isUi(path) ||
    isJavaScript(path)
  );
}

export function classifyChanges(paths, { forceFull = false } = {}) {
  const normalized = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
  const unknown = normalized.filter((path) => !isRecognized(path));
  const ciControl = normalized.some(isCiControl);
  const packageManifest = normalized.some(isPackageManifest);
  const full =
    forceFull || normalized.length === 0 || ciControl || packageManifest || unknown.length > 0;
  const docsOnly = !full && normalized.every(isDocs);
  const harness = full || normalized.some(isHarness);
  const native = full || normalized.some(isNative);
  const ui = full || normalized.some(isUi);
  const javascript = full || normalized.some(isJavaScript) || ui;

  return {
    full,
    docsOnly,
    harness,
    javascript,
    ui,
    native,
    windows: full || native,
    unknown,
    changedCount: normalized.length,
  };
}

function writeOutput(name, value) {
  const rendered = Array.isArray(value) ? value.join(",") : String(value);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${rendered}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = fs.readFileSync(0, "utf8");
  const paths = input.split(/\r?\n/);
  const result = classifyChanges(paths, {
    forceFull: process.env.FORCE_FULL_CI === "true",
  });

  for (const [name, value] of Object.entries({
    full: result.full,
    docs_only: result.docsOnly,
    harness: result.harness,
    javascript: result.javascript,
    ui: result.ui,
    native: result.native,
    windows: result.windows,
    unknown: result.unknown,
    changed_count: result.changedCount,
  })) {
    writeOutput(name, value);
  }

  console.log(JSON.stringify(result, null, 2));
}
