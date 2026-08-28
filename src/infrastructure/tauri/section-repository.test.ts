import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type {
  CorrectPlacementResult,
  EndEnrollmentResult,
  EnrollMembershipResult,
  EnrollmentCandidate,
  Section,
  SectionMembership,
  SectionRosterMember,
  TransferResult,
} from "../../domain/section";
import { TauriSectionRepository } from "./section-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriSectionRepository", () => {
  it("list invokes list_sections_by_school with no arguments (scope comes from the session)", async () => {
    const sections: Section[] = [
      {
        id: "sec-1",
        schoolId: "s1",
        schoolYear: "2025-2026",
        gradeLevel: "7",
        name: "Mabini",
        createdAt: "now",
      },
    ];
    mockInvoke.mockResolvedValueOnce(sections);

    const result = await new TauriSectionRepository().list();

    expect(mockInvoke).toHaveBeenCalledWith("list_sections_by_school");
    expect(result).toEqual(sections);
  });

  it("create invokes create_section with schoolYear/gradeLevel/name", async () => {
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    mockInvoke.mockResolvedValueOnce(section);

    const result = await new TauriSectionRepository().create("2025-2026", "7", "Mabini");

    expect(mockInvoke).toHaveBeenCalledWith("create_section", {
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
    });
    expect(result).toEqual(section);
  });

  it("enroll invokes enroll_learner_in_section with sectionId/learnerId/startsOn", async () => {
    const membership: SectionMembership = {
      id: "mem-1",
      schoolId: "s1",
      sectionId: "sec-1",
      learnerId: "l1",
      startsOn: "2026-08-01",
      endsOn: null,
      createdAt: "now",
    };
    mockInvoke.mockResolvedValueOnce(membership);

    const result = await new TauriSectionRepository().enroll("sec-1", "l1", "2026-08-01");

    expect(mockInvoke).toHaveBeenCalledWith("enroll_learner_in_section", {
      sectionId: "sec-1",
      learnerId: "l1",
      startsOn: "2026-08-01",
    });
    expect(result).toEqual(membership);
  });

  it("enroll returns null when the section or learner does not resolve within the caller's school", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriSectionRepository().enroll("sec-1", "unknown", "2026-08-01");

    expect(result).toBeNull();
  });

  it("roster invokes section_roster with sectionId/asOfDate", async () => {
    const roster: SectionRosterMember[] = [
      {
        membershipId: "mem-1",
        learnerId: "l1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: "123456789012",
        startsOn: "2026-08-01",
      },
    ];
    mockInvoke.mockResolvedValueOnce(roster);

    const result = await new TauriSectionRepository().roster("sec-1", "2026-08-24");

    expect(mockInvoke).toHaveBeenCalledWith("section_roster", {
      sectionId: "sec-1",
      asOfDate: "2026-08-24",
    });
    expect(result).toEqual(roster);
  });

  it("transferMembership invokes transfer_learner_membership with the whole input object", async () => {
    const result: TransferResult = {
      kind: "transferred",
      membership: {
        id: "mem-2",
        schoolId: "s1",
        sectionId: "sec-2",
        learnerId: "l1",
        startsOn: "2026-10-01",
        endsOn: null,
        createdAt: "now",
      },
    };
    mockInvoke.mockResolvedValueOnce(result);

    const input = {
      learnerId: "l1",
      fromMembershipId: "mem-1",
      toSectionId: "sec-2",
      effectiveOn: "2026-10-01",
    };
    const got = await new TauriSectionRepository().transferMembership(input);

    expect(mockInvoke).toHaveBeenCalledWith("transfer_learner_membership", input);
    expect(got).toEqual(result);
  });

  it("transferMembership passes a structured negative outcome back unchanged", async () => {
    const result: TransferResult = { kind: "notCurrent" };
    mockInvoke.mockResolvedValueOnce(result);

    const got = await new TauriSectionRepository().transferMembership({
      learnerId: "l1",
      fromMembershipId: "mem-1",
      toSectionId: "sec-2",
      effectiveOn: "2026-10-01",
    });

    expect(got).toEqual({ kind: "notCurrent" });
  });

  it("endMembership invokes end_learner_membership with the whole input object", async () => {
    const result: EndEnrollmentResult = {
      kind: "ended",
      membership: {
        id: "mem-1",
        schoolId: "s1",
        sectionId: "sec-1",
        learnerId: "l1",
        startsOn: "2026-08-01",
        endsOn: "2026-10-01",
        createdAt: "now",
      },
    };
    mockInvoke.mockResolvedValueOnce(result);

    const input = { learnerId: "l1", membershipId: "mem-1", effectiveOn: "2026-10-01" };
    const got = await new TauriSectionRepository().endMembership(input);

    expect(mockInvoke).toHaveBeenCalledWith("end_learner_membership", input);
    expect(got).toEqual(result);
  });

  it("listEnrollableLearners invokes list_enrollable_learners with no arguments", async () => {
    const rows: EnrollmentCandidate[] = [
      {
        learnerId: "l1",
        givenName: "Ana",
        familyName: "Cruz",
        lrn: null,
        currentMembershipId: null,
        currentSectionId: null,
        currentSectionName: null,
        currentStartsOn: null,
      },
    ];
    mockInvoke.mockResolvedValueOnce(rows);

    const got = await new TauriSectionRepository().listEnrollableLearners();

    expect(mockInvoke).toHaveBeenCalledWith("list_enrollable_learners");
    expect(got).toEqual(rows);
  });

  it("enrollMembership invokes enroll_learner_membership with the whole input object", async () => {
    const result: EnrollMembershipResult = { kind: "overlappingMembership" };
    mockInvoke.mockResolvedValueOnce(result);

    const input = { learnerId: "l1", sectionId: "sec-1", startsOn: "2026-08-24" };
    const got = await new TauriSectionRepository().enrollMembership(input);

    expect(mockInvoke).toHaveBeenCalledWith("enroll_learner_membership", input);
    expect(got).toEqual(result);
  });

  it("correctSameDayPlacement invokes correct_same_day_placement with the whole input object", async () => {
    const result: CorrectPlacementResult = {
      kind: "corrected",
      membership: {
        id: "mem-1",
        schoolId: "s1",
        sectionId: "sec-2",
        learnerId: "l1",
        startsOn: "2026-08-24",
        endsOn: null,
        createdAt: "now",
      },
    };
    mockInvoke.mockResolvedValueOnce(result);

    const input = {
      learnerId: "l1",
      membershipId: "mem-1",
      toSectionId: "sec-2",
      asOfDate: "2026-08-24",
    };
    const got = await new TauriSectionRepository().correctSameDayPlacement(input);

    expect(mockInvoke).toHaveBeenCalledWith("correct_same_day_placement", input);
    expect(got).toEqual(result);
  });

  it("correctSameDayPlacement passes a structured negative outcome back unchanged", async () => {
    const result: CorrectPlacementResult = { kind: "alreadyCorrected" };
    mockInvoke.mockResolvedValueOnce(result);

    const got = await new TauriSectionRepository().correctSameDayPlacement({
      learnerId: "l1",
      membershipId: "mem-1",
      toSectionId: "sec-2",
      asOfDate: "2026-08-24",
    });

    expect(got).toEqual({ kind: "alreadyCorrected" });
  });
});
