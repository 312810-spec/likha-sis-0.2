#!/usr/bin/env node
// Deterministic memory-health report (Wave 2J, docs/adr/0050,
// "Memory health UX" / "SessionStart guard"). Makes NO network call and
// NO LLM call to determine health -- every field below is computed from
// local filesystem state and, for the external-observer row, from a
// static config read (never a live probe of the provider). Run via
// `node scripts/memory/health.mjs` or the `/memory-health` skill.

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CANONICAL_DOC_PATHS } from "./recall.mjs";
import { readAllObservations, JOURNAL_DIR, existingIds } from "./journal.mjs";

const REPO_ROOT = process.cwd();

function checkRepositoryBrain() {
  const missing = CANONICAL_DOC_PATHS.filter((p) => !existsSync(join(REPO_ROOT, p)));
  return missing.length === 0 ? "HEALTHY" : `DEGRADED (missing: ${missing.join(", ")})`;
}

function checkVerificationDebtLoaded() {
  const path = join(REPO_ROOT, "docs", "VERIFICATION-DEBT.md");
  if (!existsSync(path)) return "MISSING";
  const text = readFileSync(path, "utf8");
  return text.trim().length > 0 ? "LOADED" : "EMPTY";
}

function checkLocalJournalWritable() {
  try {
    if (!existsSync(JOURNAL_DIR)) {
      // Journal is created lazily on first observation -- an absent
      // directory is not itself unhealthy, only an unwritable one is.
      writeFileSync(join(REPO_ROOT, ".claude", "memory", ".health-probe"), "ok");
      unlinkSync(join(REPO_ROOT, ".claude", "memory", ".health-probe"));
      return "HEALTHY";
    }
    const probe = join(JOURNAL_DIR, ".health-probe");
    writeFileSync(probe, "ok");
    unlinkSync(probe);
    return "HEALTHY";
  } catch (err) {
    return `DEGRADED (${String(err && err.message ? err.message : err)})`;
  }
}

function lastLocalWrite(observations) {
  if (observations.length === 0) return "never";
  const latest = observations.reduce((a, b) => (a.recordedAt > b.recordedAt ? a : b));
  return latest.recordedAt;
}

/** Reads whether the external inference-backed observer (claude-mem) is
 * enabled, from the SAME config Claude Code itself reads
 * (`~/.claude/settings.json`'s `enabledPlugins`) -- never by contacting
 * claude-mem's worker process or its upstream provider. This is
 * deliberately a static, zero-cost read: this project's memory
 * architecture (docs/adr/0050) does not require knowing claude-mem's
 * live status to report LIKHA's own memory health, because claude-mem
 * is optional Layer-3 enrichment, never in the durable-capture path. */
function checkExternalObserver() {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return "UNKNOWN (no home directory resolved)";
  const settingsPath = join(home, ".claude", "settings.json");
  if (!existsSync(settingsPath)) return "DISABLED (no global settings found)";
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    const enabled = settings?.enabledPlugins?.["claude-mem@thedotmack"];
    return enabled === true
      ? "OPTIONAL-ENRICHMENT-ENABLED (not persistence-critical; see ADR-0050)"
      : "DISABLED (by design; see ADR-0050)";
  } catch {
    return "UNKNOWN (settings unreadable)";
  }
}

export function computeHealth() {
  const observations = readAllObservations();
  const ids = existingIds();
  const duplicateCandidates = observations.length - ids.size;

  return {
    repositoryBrain: checkRepositoryBrain(),
    verificationDebt: checkVerificationDebtLoaded(),
    localJournal: checkLocalJournalWritable(),
    localIndex: existsSync(JOURNAL_DIR) ? "HEALTHY" : "HEALTHY (empty, not yet written)",
    localRetrieval: "HEALTHY (grep-based, no network/inference dependency)",
    localEmbeddings: "DISABLED (not justified for this project's scale; see ADR-0050)",
    externalObserver: checkExternalObserver(),
    operatingMode: "LOCAL_ONLY (permanent, by design -- see ADR-0050)",
    pendingObservations: 0, // no async enrichment queue exists to be pending
    failedObservations: observations.filter((o) => o.meta && o.meta.failed).length,
    duplicateCandidates: duplicateCandidates > 0 ? duplicateCandidates : 0,
    lastLocalWrite: lastLocalWrite(observations),
    lastExternalSuccess: "N/A -- external observer is not in the persistence path (ADR-0050)",
    circuitBreaker: "N/A -- no external inference call exists in the write path to trip a breaker",
    observationCount: observations.length,
  };
}

export function formatHealthReport(health) {
  const lines = [
    "LIKHA Memory Health",
    "",
    `Repository brain       ${health.repositoryBrain}`,
    `Verification debt      ${health.verificationDebt}`,
    `Local journal          ${health.localJournal}`,
    `Local index             ${health.localIndex}`,
    `Local retrieval         ${health.localRetrieval}`,
    `Local embeddings        ${health.localEmbeddings}`,
    `External observer       ${health.externalObserver}`,
    `Operating mode          ${health.operatingMode}`,
    "",
    `Total observations      ${health.observationCount}`,
    `Pending observations    ${health.pendingObservations}`,
    `Failed observations     ${health.failedObservations}`,
    `Duplicate candidates    ${health.duplicateCandidates}`,
    `Last local write        ${health.lastLocalWrite}`,
    `Last external success   ${health.lastExternalSuccess}`,
    `Circuit breaker         ${health.circuitBreaker}`,
  ];
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(formatHealthReport(computeHealth()));
}
