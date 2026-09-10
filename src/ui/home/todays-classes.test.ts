import { describe, expect, it, vi } from "vitest";
import { todaysClassesForTeacher } from "./todays-classes";
import type { SubjectAttendanceApplicationService } from "../../application/subject-attendance-service";

const TODAY = "2026-08-29";
const WEEKDAY = 6; // Saturday, matching 2026-08-29

function fakeService(over: {
  assignments?: unknown[];
  meetingsByAssignment?: Record<string, unknown[]>;
  sessionsByAssignment?: Record<string, unknown[]>;
}): SubjectAttendanceApplicationService {
  return {
    listMyAssignments: vi.fn().mockResolvedValue(over.assignments ?? []),
    listMeetings: vi.fn((id: string) => Promise.resolve(over.meetingsByAssignment?.[id] ?? [])),
    listSessions: vi.fn((id: string) => Promise.resolve(over.sessionsByAssignment?.[id] ?? [])),
  } as unknown as SubjectAttendanceApplicationService;
}

const MATH = { id: "ta-math", subjectName: "Mathematics", sectionName: "Mabini" };

describe("todaysClassesForTeacher", () => {
  it("returns no occurrences when nothing meets today", async () => {
    const service = fakeService({
      assignments: [MATH],
      meetingsByAssignment: { "ta-math": [{ weekday: (WEEKDAY + 1) % 7, startsAt: "08:00" }] },
    });
    expect(await todaysClassesForTeacher(service, "t1", TODAY, WEEKDAY)).toEqual([]);
  });

  it("marks a class with no session today as not_checked", async () => {
    const service = fakeService({
      assignments: [MATH],
      meetingsByAssignment: {
        "ta-math": [{ weekday: WEEKDAY, startsAt: "08:00", endsAt: "09:00", room: "101" }],
      },
    });
    const result = await todaysClassesForTeacher(service, "t1", TODAY, WEEKDAY);
    const occ = result[0]!;
    expect(occ.status).toBe("not_checked");
    expect(occ.assignment).toBe(MATH);
  });

  it("distinguishes held from no_class by today's session status", async () => {
    const service = fakeService({
      assignments: [MATH],
      meetingsByAssignment: { "ta-math": [{ weekday: WEEKDAY, startsAt: "08:00" }] },
      sessionsByAssignment: { "ta-math": [{ sessionDate: TODAY, status: "no_class" }] },
    });
    const result = await todaysClassesForTeacher(service, "t1", TODAY, WEEKDAY);
    const occ = result[0]!;
    expect(occ.status).toBe("no_class");
  });

  it("orders occurrences by start time", async () => {
    const service = fakeService({
      assignments: [MATH],
      meetingsByAssignment: {
        "ta-math": [
          { weekday: WEEKDAY, startsAt: "13:00" },
          { weekday: WEEKDAY, startsAt: "07:30" },
        ],
      },
    });
    const result = await todaysClassesForTeacher(service, "t1", TODAY, WEEKDAY);
    expect(result.map((o) => o.startsAt)).toEqual(["07:30", "13:00"]);
  });
});
