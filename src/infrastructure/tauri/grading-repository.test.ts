import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { GradingPeriod, GradingPolicy, GradingPolicyPeriod } from "../../domain/grading";
import { TauriGradingRepository } from "./grading-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriGradingRepository", () => {
  it("listPolicies invokes list_grading_policies with no arguments", async () => {
    const policies: GradingPolicy[] = [
      { id: "p1", name: "Three-Term", sourceCitation: "cite", isDefault: true, createdAt: "now" },
    ];
    mockInvoke.mockResolvedValueOnce(policies);

    const result = await new TauriGradingRepository().listPolicies();

    expect(mockInvoke).toHaveBeenCalledWith("list_grading_policies");
    expect(result).toEqual(policies);
  });

  it("listPolicyPeriods invokes list_grading_policy_periods with policyId", async () => {
    const periods: GradingPolicyPeriod[] = [
      { id: "pp1", policyId: "p1", sequence: 1, label: "1st Term" },
    ];
    mockInvoke.mockResolvedValueOnce(periods);

    const result = await new TauriGradingRepository().listPolicyPeriods("p1");

    expect(mockInvoke).toHaveBeenCalledWith("list_grading_policy_periods", { policyId: "p1" });
    expect(result).toEqual(periods);
  });

  it("listPeriodsBySchoolYear invokes list_grading_periods_by_school_year with schoolYear", async () => {
    const periods: GradingPeriod[] = [];
    mockInvoke.mockResolvedValueOnce(periods);

    const result = await new TauriGradingRepository().listPeriodsBySchoolYear("2026-2027");

    expect(mockInvoke).toHaveBeenCalledWith("list_grading_periods_by_school_year", {
      schoolYear: "2026-2027",
    });
    expect(result).toEqual(periods);
  });

  it("createPeriod invokes create_grading_period with all four fields", async () => {
    const period: GradingPeriod = {
      id: "gp1",
      schoolId: "s1",
      schoolYear: "2026-2027",
      policyPeriodId: "pp1",
      label: "1st Term",
      startsOn: "2026-06-08",
      endsOn: "2026-09-15",
      createdAt: "now",
    };
    mockInvoke.mockResolvedValueOnce(period);

    const result = await new TauriGradingRepository().createPeriod(
      "2026-2027",
      "pp1",
      "2026-06-08",
      "2026-09-15",
    );

    expect(mockInvoke).toHaveBeenCalledWith("create_grading_period", {
      schoolYear: "2026-2027",
      policyPeriodId: "pp1",
      startsOn: "2026-06-08",
      endsOn: "2026-09-15",
    });
    expect(result).toEqual(period);
  });

  it("createPeriod returns null when the policy period could not be resolved", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriGradingRepository().createPeriod(
      "2026-2027",
      "unknown",
      "2026-06-08",
      "2026-09-15",
    );

    expect(result).toBeNull();
  });
});
