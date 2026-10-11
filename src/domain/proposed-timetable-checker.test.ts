import { describe, expect, it } from "vitest";
import { checkProposedTimetable, type ProposedMeeting } from "./proposed-timetable-checker";

const a: ProposedMeeting = {
  id: "a",
  teacherId: "t1",
  sectionId: "s1",
  weekday: 1,
  startMinute: 480,
  endMinute: 540,
  roomId: "r1",
};

describe("checkProposedTimetable", () => {
  it("accepts adjacent non-overlapping meetings", () => {
    const b = { ...a, id: "b", sectionId: "s2", startMinute: 540, endMinute: 600 };
    expect(checkProposedTimetable({ meetings: [a, b], teacherDailyLimits: { t1: 120 } })).toEqual(
      [],
    );
  });

  it("reports teacher, section and room conflicts independently", () => {
    const b = { ...a, id: "b", startMinute: 500, endMinute: 550 };
    expect(
      checkProposedTimetable({ meetings: [a, b], teacherDailyLimits: {} }).map((x) => x.code),
    ).toEqual(["teacherConflict", "sectionConflict", "roomConflict"]);
  });

  it("does not treat an unassigned room as a collision", () => {
    const b = { ...a, id: "b", teacherId: "t2", sectionId: "s2", roomId: null };
    expect(
      checkProposedTimetable({
        meetings: [{ ...a, roomId: null }, b],
        teacherDailyLimits: {},
      }),
    ).toEqual([]);
  });

  it("rejects invalid local-day time bounds", () => {
    expect(
      checkProposedTimetable({
        meetings: [{ ...a, startMinute: 540, endMinute: 480 }],
        teacherDailyLimits: {},
      }).map((x) => x.code),
    ).toEqual(["invalidInterval"]);
  });

  it("reports excessive configured teacher daily minutes", () => {
    const b = { ...a, id: "b", sectionId: "s2", roomId: "r2", startMinute: 540, endMinute: 600 };
    expect(
      checkProposedTimetable({ meetings: [a, b], teacherDailyLimits: { t1: 100 } }).map(
        (x) => x.code,
      ),
    ).toEqual(["teacherDailyLimit"]);
  });

  it("does not invent a limit when school settings are absent", () => {
    expect(checkProposedTimetable({ meetings: [a], teacherDailyLimits: {} })).toEqual([]);
  });
});
