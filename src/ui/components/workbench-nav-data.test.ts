import { describe, expect, it } from "vitest";
import {
  BOTTOM_NAV,
  HOME_DESTINATION,
  NAV_GROUPS,
  TAB_LABELS,
  groupLabelForTab,
  normalizeTab,
} from "./workbench-nav-data";

describe("workbench-nav-data", () => {
  it("labels the workspace destination as Home", () => {
    expect(TAB_LABELS.workspace).toBe("Home");
  });

  it("pins Home outside the groups", () => {
    expect(HOME_DESTINATION).toEqual({ id: "workspace", label: "Home" });
    const inAnyGroup = NAV_GROUPS.some((g) => g.tabs.some((t) => t.id === "workspace"));
    expect(inAnyGroup).toBe(false);
  });

  it("keeps every non-Home destination in exactly one group", () => {
    const grouped = NAV_GROUPS.flatMap((g) => g.tabs.map((t) => t.id));
    expect(grouped).toContain("today-classes");
    expect(grouped).toContain("audit-log");
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("exposes a five-slot bottom nav (four real + synthetic More)", () => {
    expect(BOTTOM_NAV.map((d) => d.id)).toEqual([
      "workspace",
      "today-classes",
      "learners",
      "class-records",
    ]);
  });

  it("normalizes contextual tabs to their parent list tab", () => {
    expect(normalizeTab("section-roster")).toBe("sections");
    expect(normalizeTab("schedule-meetings")).toBe("sections");
    expect(normalizeTab("attendance")).toBe("attendance");
  });

  it("resolves the group label for a tab, contextual tabs included", () => {
    expect(groupLabelForTab("attendance")).toBe("Daily Teaching");
    expect(groupLabelForTab("section-roster")).toBe("Learner Records");
    expect(groupLabelForTab("workspace")).toBeNull();
  });
});
