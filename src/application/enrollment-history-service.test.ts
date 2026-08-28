import { describe, expect, it } from "vitest";
import type { EnrollmentHistoryRepository } from "../domain/ports/enrollment-history-repository";
import type { Section, SectionMembership } from "../domain/section";
import { EnrollmentHistoryApplicationService } from "./enrollment-history-service";

const MEMBERSHIPS: SectionMembership[] = [
  {
    id: "mem-1",
    schoolId: "school-1",
    sectionId: "section-1",
    learnerId: "learner-1",
    startsOn: "2025-06-02",
    endsOn: "2026-04-01",
    createdAt: "2025-06-02T00:00:00Z",
  },
  {
    id: "mem-2",
    schoolId: "school-1",
    sectionId: "missing-section",
    learnerId: "learner-1",
    startsOn: "2026-06-01",
    endsOn: null,
    createdAt: "2026-06-01T00:00:00Z",
  },
];

class FakeHistoryRepository implements EnrollmentHistoryRepository {
  learnerIds: string[] = [];

  async listByLearner(learnerId: string): Promise<SectionMembership[]> {
    this.learnerIds.push(learnerId);
    return MEMBERSHIPS;
  }
}

const SECTIONS: Section[] = [
  {
    id: "section-1",
    schoolId: "school-1",
    schoolYear: "2025-2026",
    gradeLevel: "6",
    name: "Mabini",
    createdAt: "now",
  },
];

describe("EnrollmentHistoryApplicationService", () => {
  it("joins placement spans to section labels without discarding retained rows", async () => {
    const history = new FakeHistoryRepository();
    const service = new EnrollmentHistoryApplicationService(history, {
      list: async () => SECTIONS,
    });

    const result = await service.listForLearner("  learner-1  ");

    expect(history.learnerIds).toEqual(["learner-1"]);
    expect(result).toEqual([
      {
        membershipId: "mem-1",
        sectionName: "Mabini",
        gradeLevel: "6",
        schoolYear: "2025-2026",
        startsOn: "2025-06-02",
        endsOn: "2026-04-01",
      },
      {
        membershipId: "mem-2",
        sectionName: null,
        gradeLevel: null,
        schoolYear: null,
        startsOn: "2026-06-01",
        endsOn: null,
      },
    ]);
  });

  it("rejects a blank learner id before either repository is called", async () => {
    const history = new FakeHistoryRepository();
    let sectionCalls = 0;
    const service = new EnrollmentHistoryApplicationService(history, {
      list: async () => {
        sectionCalls += 1;
        return SECTIONS;
      },
    });

    await expect(service.listForLearner("   ")).rejects.toThrow("Learner is required.");
    expect(history.learnerIds).toEqual([]);
    expect(sectionCalls).toBe(0);
  });

  it("returns an authoritative empty history without requiring section labels", async () => {
    let sectionCalls = 0;
    const service = new EnrollmentHistoryApplicationService(
      { listByLearner: async () => [] },
      {
        list: async () => {
          sectionCalls += 1;
          throw new Error("section directory unavailable");
        },
      },
    );

    await expect(service.listForLearner("learner-1")).resolves.toEqual([]);
    expect(sectionCalls).toBe(0);
  });
});
