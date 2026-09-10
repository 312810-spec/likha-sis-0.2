import { describe, expect, it } from "vitest";
import { PERSISTENCE_STATUS, mostActionable, type PersistenceState } from "./persistence-status";

const ALL_STATES: PersistenceState[] = [
  "saved-local",
  "pending-sync",
  "synced",
  "offline",
  "conflict",
  "failed",
];

describe("persistence-status vocabulary", () => {
  it("defines a presentation for every state", () => {
    for (const state of ALL_STATES) {
      expect(PERSISTENCE_STATUS[state]).toBeDefined();
    }
    expect(Object.keys(PERSISTENCE_STATUS).sort()).toEqual([...ALL_STATES].sort());
  });

  it("gives every state a non-empty, distinct label", () => {
    const labels = ALL_STATES.map((s) => PERSISTENCE_STATUS[s].label);
    for (const label of labels) expect(label.trim().length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("uses only valid StatusChip tones", () => {
    const valid = new Set(["neutral", "productive", "success", "warning", "danger"]);
    for (const state of ALL_STATES) {
      expect(valid.has(PERSISTENCE_STATUS[state].tone)).toBe(true);
    }
  });

  it("never labels a state 'synced' unless it is the synced state (local-first honesty)", () => {
    for (const state of ALL_STATES) {
      if (state === "synced") continue;
      expect(PERSISTENCE_STATUS[state].label.toLowerCase()).not.toContain("synced");
      expect(PERSISTENCE_STATUS[state].label.toLowerCase()).not.toContain("cloud");
      expect(PERSISTENCE_STATUS[state].label.toLowerCase()).not.toContain("backed up");
    }
  });

  describe("mostActionable", () => {
    it("returns null for no states", () => {
      expect(mostActionable([])).toBeNull();
    });

    it("prefers conflict over everything", () => {
      expect(mostActionable(["synced", "conflict", "failed"])).toBe("conflict");
    });

    it("prefers failed over pending-sync", () => {
      expect(mostActionable(["pending-sync", "failed"])).toBe("failed");
    });

    it("prefers pending-sync over synced/offline/saved-local", () => {
      expect(mostActionable(["synced", "pending-sync", "saved-local"])).toBe("pending-sync");
    });

    it("returns the single state when only one is given", () => {
      expect(mostActionable(["offline"])).toBe("offline");
    });
  });
});
