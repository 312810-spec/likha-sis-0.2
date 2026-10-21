// Source census is deliberately not runtime or authorization certification.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import owners from "../../docs/assurance/prompt-master-source-owners-2026-10-22.json" with { type: "json" };

const sha = (value) => createHash("sha256").update(value).digest("hex");
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) => (e.isDirectory() ? walk(dir + "/" + e.name) : [dir + "/" + e.name])),
    )
  ).flat();
}
const files = (await walk("src/ui"))
  .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
  .sort();
const surfaces = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const components = [],
    imports = [],
    controls = [];
  function visit(node) {
    if (ts.isImportDeclaration(node)) imports.push(node.moduleSpecifier.text);
    if (ts.isFunctionDeclaration(node) && node.name && /^[A-Z]/.test(node.name.text))
      components.push(node.name.text);
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(ast);
      if (["button", "input", "select", "textarea", "dialog", "table", "form"].includes(tag)) {
        controls.push({
          tag,
          line: ast.getLineAndCharacterOfPosition(node.pos).line + 1,
          attributes: node.attributes.properties.filter(ts.isJsxAttribute).map((p) => ({
            name: p.name.getText(ast),
            value: p.initializer?.getText(ast) ?? null,
          })),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!owners[file]?.length) throw Error("Unowned source: " + file);
  const nearbyRoleHints = source
    .split("\n")
    .map((text, i) => ({ line: i + 1, text: text.trim() }))
    .filter((r) =>
      /roles\.includes|roles\.some|canManage|canEdit|school_head|registrar/.test(r.text),
    );
  surfaces.push({
    file,
    sha256: sha(source),
    owners: owners[file],
    components,
    imports,
    controls,
    roleHints: nearbyRoleHints,
    stateSignals: [
      "loading",
      "empty",
      "error",
      "pending",
      "draft",
      "offline",
      "conflict",
      "denied",
      "retry",
      "cancel",
    ].filter((s) => new RegExp(s, "i").test(source)),
    stateSignalMeaning:
      "Text/symbol occurrence only; applicable state transitions require manual source/runtime review",
    runtime: "NOT RUN by this census; attach task-specific browser/native receipts",
    authority:
      "UI hints are not trusted authorization; inspect connected application/native boundaries before changes",
  });
}
const nav = await readFile("src/ui/components/workbench-nav-data.ts", "utf8");
const app = await readFile("src/App.tsx", "utf8");
const ast = ts.createSourceFile("navigation.ts", nav, ts.ScriptTarget.Latest, true);
let ids = [],
  labels = {};
for (const node of ast.statements) {
  if (ts.isTypeAliasDeclaration(node) && node.name.text === "SignedInTab") {
    ids = node.type.types.map((t) => t.literal.text);
  }
  if (ts.isVariableStatement(node))
    for (const d of node.declarationList.declarations) {
      if (d.name.getText(ast) === "TAB_LABELS")
        labels = Object.fromEntries(
          d.initializer.properties.map((p) => [p.name.text, p.initializer.text]),
        );
    }
}
const routeOwners = {
  review: "15",
  today: "07",
  "daily-planner": "07",
  "record-library": "18",
  workspace: "07",
  "school-forms": "18",
  calendar: "23",
  more: "05",
  account: "29",
  learners: "19",
  sections: "20",
  "section-roster": "20",
  "teaching-assignments": "22",
  "section-adviser": "20",
  "schedule-meetings": "23",
  "sf1-import": "21",
  "my-day": "08",
  "today-classes": "07",
  attendance: "11",
  "subject-attendance": "10",
  "subject-monitor": "10",
  "adviser-view": "11",
  "teacher-load": "24",
  "monthly-summary": "11",
  "grading-periods": "25",
  "class-records": "13",
  "lesson-plans": "26",
  "audit-log": "29",
  "admin-password-reset": "29",
  "school-members": "22",
  devices: "28",
  "conflict-review": "27",
  "sync-status": "27",
  "school-branding": "03",
  "learning-support": "15",
  "schedule-planner": "24",
};
const routes = ids.map((id) => {
  if (!routeOwners[id]) throw Error("Unowned destination: " + id);
  const needles = [...app.matchAll(/activeTab === "([^"]+)"/g)].filter((m) => m[1] === id);
  if (!needles.length) throw Error("Destination without reviewed App branch: " + id);
  return {
    id,
    owner: "PM-" + routeOwners[id],
    label: labels[id],
    appLines: needles.map((m) => app.slice(0, m.index).split("\n").length),
    context: [
      "section-roster",
      "teaching-assignments",
      "section-adviser",
      "schedule-meetings",
      "learning-support",
    ].includes(id)
      ? "Context/selection dependent; inspect branch fallback"
      : "Inspect branch and connected service",
    roleCoverage: "NOT RUN by census; source role hints are recorded per consumer",
    runtime:
      "NOT RUN by census; teacher/school-head smoke and selected task receipts recorded separately",
  };
});
const receipt = {
  project: "LIKHA-SIS",
  method: "TypeScript AST source census and exact App conditional references",
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  source: { app: sha(app), navigation: sha(nav) },
  coverage: {
    uiSourcesExpected: files.length,
    uiSourcesOwned: surfaces.length,
    destinationsExpected: ids.length,
    destinationsLocated: routes.length,
  },
  routes,
  surfaces,
  limits: [
    "Source census does not prove runtime reachability, permissions or state completeness",
    "No native/device/teacher acceptance inferred",
    "Reconcile new/deleted routes, role conditions and source owners at each task",
  ],
};
await writeFile(
  "docs/assurance/prompt-master-inventory-2026-10-22.json",
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt.coverage));
