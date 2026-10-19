import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// GitHub artifact metadata retrieved 2026-10-20; digest covers the original ZIP.
export const candidate = Object.freeze({
  source: "52a761cc3d1368a2cc91c95c1ab59a06a07ef266",
  run: 39338547483,
  artifact: 12228374752,
  bytes: 22970803,
  sha256: "f43f96151e69ad1dbb64b124cc9f499c173e46c01a2a54c2648b551c9efcb1bc",
  url: "https://github.com/312810-spec/likha-sis-0.2/actions/runs/39338547483/artifacts/12228374752",
  expiresAt: "2026-11-02T23:23:52Z",
});

const tasks = [
  [
    "W1",
    "Identify class, subject, year, period, item and maximum score.",
    "All identities match the synthetic fixture.",
  ],
  [
    "W2",
    "Save a synthetic score offline, close and reopen the installed app.",
    "The same learner/item retains the recorded value; local save does not imply hub receipt.",
  ],
  [
    "W3",
    "While saving 18 is pending, type 19.",
    "Recorded18 and unsaved19 remain distinct; one submitted revision. Use controlled delay only if available; otherwise NOT RUN.",
  ],
  [
    "W4",
    "Review a correction from18 to19 with a reason, then cancel.",
    "Recorded18 remains; no new history or transfer record.",
  ],
  [
    "W5",
    "Commit the correction from18 to19 with a reason.",
    "Stored19 and exact reason/history18→19; local and transfer states remain distinct.",
  ],
  [
    "W6",
    "Encounter a denied write and retry the retained draft.",
    "Denial changes no stored score/history; the draft survives. Without a controlled denial case, NOT RUN.",
  ],
  [
    "W7",
    "Compare blank, zero, Excused and N/A; leave the final row by keyboard.",
    "Meanings remain distinct; navigation causes no incidental score write.",
  ],
  [
    "W8",
    "Reach interior History/exception actions using keyboard; narrow a pending correction and cancel.",
    "Focus/actions remain visible and reachable; cancellation preserves recorded value.",
  ],
  [
    "W9",
    "Explain completeness with an unsaved edit and explain unavailable transfer evidence.",
    "Saved-data basis and pending input are distinguished; no approval or hub receipt inferred.",
  ],
  [
    "W10",
    "Exercise actual 200% zoom and a screen reader in the installed app.",
    "Record exact zoom method and AT/version separately; essential fields, status and actions remain usable.",
  ],
  [
    "W11",
    "Exercise an upgrade using only a disposable synthetic installation.",
    "Record both exact builds and verify score/history retention; never upgrade an existing real-data installation for this trial.",
  ],
  [
    "T1",
    "Observe intended teachers performing matched baseline/candidate tasks without control hints.",
    "Record order/familiarity, completion, errors, assists, explanations and observed times; no invented timing or usability benefit.",
  ],
];

export async function verifyArchive(archive, expected = candidate) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(archive)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  const sha256 = hash.digest("hex");
  if (bytes !== expected.bytes || sha256 !== expected.sha256) {
    throw new Error(
      "Archive does not match the pinned candidate ZIP (size/SHA-256). No trial record created.",
    );
  }
  return {
    status: "PASS",
    bytes,
    sha256,
    basis: "Original ZIP matches pinned GitHub artifact metadata; installation not tested.",
  };
}

export async function prepareTrial(archive, output, expected = candidate) {
  const archiveCheck = await verifyArchive(archive, expected);
  const record = {
    schemaVersion: 1,
    candidate: expected,
    preparation: {
      // This is a real preparation time, never an observation/accomplishment time.
      preparedAt: new Date().toISOString(),
      platform: os.platform(),
      release: os.release(),
      architecture: os.arch(),
      node: process.version,
      archiveCheck,
    },
    readiness: "INCONCLUSIVE",
    deviceObservation: {
      evaluator: null,
      observedAt: null,
      device: null,
      installedBuild: null,
      installerFileSha256: null,
      fixtureIds: null,
      zoomMethod: null,
      assistiveTechnology: null,
    },
    observations: tasks.map(([id, task, oracle]) => ({
      id,
      task,
      oracle,
      status: "NOT RUN",
      observedAt: null,
      actual: null,
      evidence: null,
    })),
    separateGates: { actualAndroid: "NOT RUN", realTwoDeviceExchange: "NOT RUN" },
  };
  // Non-recursive creation refuses an existing file/directory, preserving old work.
  await mkdir(output);
  await writeFile(path.join(output, "observations.json"), JSON.stringify(record, null, 2) + "\n", {
    flag: "wx",
  });
  return record;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [archive, output, ...extra] = process.argv.slice(2);
  if (!archive || !output || extra.length) {
    console.error(
      'Usage: node scripts/assurance/prepare-scores-trial.mjs "original-download.zip" "new-results-folder"',
    );
    process.exitCode = 1;
  } else {
    try {
      await prepareTrial(archive, output);
      console.log(
        "Archive verified; observations.json created. All device/teacher observations remain NOT RUN.",
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
