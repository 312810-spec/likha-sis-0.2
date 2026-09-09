import { describe, expect, it } from "vitest";
import {
  autoSeedWeeklySlots,
  detectTimetableConflicts,
  validateSubjectWeeklyMinutes,
  type TimetableSlotInput,
} from "./timetable";

function slot(overrides: Partial<TimetableSlotInput> = {}): TimetableSlotInput {
  return {
    teachingAssignmentId: "assign-1",
    teacherUserId: "teacher-1",
    sectionId: "section-1",
    subjectId: "subject-1",
    weekday: 1,
    startsAt: "08:00",
    endsAt: "09:00",
    room: "Room 1",
    ...overrides,
  };
}

describe("detectTimetableConflicts", () => {
  it("finds no conflicts against an empty board", () => {
    expect(detectTimetableConflicts(slot(), [])).toEqual([]);
  });

  it("flags a teacher double-booking on an overlapping time", () => {
    const existing = slot({
      teachingAssignmentId: "assign-2",
      sectionId: "section-2",
      room: "Room 2",
    });
    const candidate = slot({
      teachingAssignmentId: "assign-1",
      startsAt: "08:30",
      endsAt: "09:30",
    });
    const conflicts = detectTimetableConflicts(candidate, [existing]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe("teacherConflict");
  });

  it("flags a section conflict when the same section already meets then", () => {
    const existing = slot({
      teachingAssignmentId: "assign-2",
      teacherUserId: "teacher-2",
      room: "Room 2",
    });
    const candidate = slot({ teachingAssignmentId: "assign-1", teacherUserId: "teacher-1" });
    const conflicts = detectTimetableConflicts(candidate, [existing]);
    expect(conflicts.map((c) => c.kind)).toContain("sectionConflict");
  });

  it("flags a room conflict (case-insensitive) even for different teacher and section", () => {
    const existing = slot({
      teachingAssignmentId: "assign-2",
      teacherUserId: "teacher-2",
      sectionId: "section-2",
      room: "room 1",
    });
    const candidate = slot({ teachingAssignmentId: "assign-1" });
    const conflicts = detectTimetableConflicts(candidate, [existing]);
    expect(conflicts.map((c) => c.kind)).toEqual(["roomConflict"]);
  });

  it("can report more than one conflict kind at once", () => {
    const existing = slot({ teachingAssignmentId: "assign-2" }); // same teacher, section, room
    const candidate = slot({ teachingAssignmentId: "assign-1" });
    const conflicts = detectTimetableConflicts(candidate, [existing]);
    expect(conflicts.map((c) => c.kind).sort()).toEqual(
      ["roomConflict", "sectionConflict", "teacherConflict"].sort(),
    );
  });

  it("does not conflict with its own prior position when a meetingId is shared (dragging an existing meeting)", () => {
    const existing = slot({ meetingId: "meeting-1" });
    const candidate = slot({ meetingId: "meeting-1", startsAt: "08:15", endsAt: "09:15" });
    expect(detectTimetableConflicts(candidate, [existing])).toEqual([]);
  });

  it("still conflicts between two different unsaved candidates for the same teaching assignment", () => {
    // Auto-seed regression: sharing a teachingAssignmentId alone must
    // never be treated as "self" -- only an exact meetingId match may.
    const existing = slot({ startsAt: "08:00", endsAt: "09:00" });
    const candidate = slot({ startsAt: "08:15", endsAt: "09:15" });
    expect(detectTimetableConflicts(candidate, [existing]).length).toBeGreaterThan(0);
  });

  it("does not conflict when times only touch end-to-start", () => {
    const existing = slot({ teachingAssignmentId: "assign-2", startsAt: "07:00", endsAt: "08:00" });
    const candidate = slot({
      teachingAssignmentId: "assign-1",
      startsAt: "08:00",
      endsAt: "09:00",
    });
    expect(detectTimetableConflicts(candidate, [existing])).toEqual([]);
  });

  it("does not conflict across different weekdays even at the same time", () => {
    const existing = slot({ teachingAssignmentId: "assign-2", weekday: 2 });
    const candidate = slot({ teachingAssignmentId: "assign-1", weekday: 1 });
    expect(detectTimetableConflicts(candidate, [existing])).toEqual([]);
  });

  it("treats an unset room as never a room conflict", () => {
    const existing = slot({
      teachingAssignmentId: "assign-2",
      teacherUserId: "t2",
      sectionId: "s2",
      room: null,
    });
    const candidate = slot({
      teachingAssignmentId: "assign-1",
      teacherUserId: "t3",
      sectionId: "s3",
      room: null,
    });
    expect(detectTimetableConflicts(candidate, [existing])).toEqual([]);
  });
});

describe("validateSubjectWeeklyMinutes", () => {
  it("reports a shortfall when scheduled time is under the requirement", () => {
    const slots = [slot({ startsAt: "08:00", endsAt: "09:00" })]; // 60 minutes
    const result = validateSubjectWeeklyMinutes("subject-1", slots, 180);
    expect(result).toMatchObject({
      scheduledMinutes: 60,
      requiredMinutes: 180,
      shortfallMinutes: 120,
      overageMinutes: 0,
      satisfied: false,
    });
  });

  it("reports satisfied with zero shortfall once the requirement is met or exceeded", () => {
    const slots = [
      slot({ startsAt: "08:00", endsAt: "09:00" }),
      slot({ startsAt: "10:00", endsAt: "11:00" }),
    ];
    const result = validateSubjectWeeklyMinutes("subject-1", slots, 120);
    expect(result.satisfied).toBe(true);
    expect(result.shortfallMinutes).toBe(0);
    expect(result.overageMinutes).toBe(0);
  });

  it("reports an overage when scheduled time exceeds the requirement", () => {
    const slots = [slot({ startsAt: "08:00", endsAt: "10:00" })]; // 120 minutes
    const result = validateSubjectWeeklyMinutes("subject-1", slots, 60);
    expect(result.overageMinutes).toBe(60);
    expect(result.satisfied).toBe(true);
  });

  it("ignores slots for a different subject", () => {
    const slots = [slot({ subjectId: "other-subject", startsAt: "08:00", endsAt: "10:00" })];
    const result = validateSubjectWeeklyMinutes("subject-1", slots, 60);
    expect(result.scheduledMinutes).toBe(0);
    expect(result.satisfied).toBe(false);
  });
});

describe("autoSeedWeeklySlots", () => {
  const template = {
    teachingAssignmentId: "assign-1",
    teacherUserId: "teacher-1",
    sectionId: "section-1",
    subjectId: "subject-1",
  };

  it("fills exactly the required minutes from evenly-sized available slots", () => {
    const available = [
      { weekday: 1, startsAt: "08:00", endsAt: "09:00", room: "Room 1" },
      { weekday: 2, startsAt: "08:00", endsAt: "09:00", room: "Room 1" },
      { weekday: 3, startsAt: "08:00", endsAt: "09:00", room: "Room 1" },
    ];
    const result = autoSeedWeeklySlots(template, 120, available, []);
    expect(result.placed).toHaveLength(2);
    expect(result.placedMinutes).toBe(120);
    expect(result.fullySeeded).toBe(true);
  });

  it("skips a slot that would overshoot the requirement", () => {
    const available = [
      { weekday: 1, startsAt: "08:00", endsAt: "09:30", room: "Room 1" }, // 90 min
      { weekday: 2, startsAt: "08:00", endsAt: "08:30", room: "Room 1" }, // 30 min
    ];
    // requirement 90: the 90-min slot alone satisfies it; the 30-min slot
    // is never taken because placedMinutes already reached the target.
    const result = autoSeedWeeklySlots(template, 90, available, []);
    expect(result.placedMinutes).toBe(90);
    expect(result.placed).toHaveLength(1);
  });

  it("skips a slot that would conflict with an existing meeting", () => {
    const existing: TimetableSlotInput[] = [
      slot({ teachingAssignmentId: "assign-2", weekday: 1, startsAt: "08:00", endsAt: "09:00" }),
    ];
    const available = [
      { weekday: 1, startsAt: "08:00", endsAt: "09:00", room: "Room 1" }, // conflicts (same teacher)
      { weekday: 2, startsAt: "08:00", endsAt: "09:00", room: "Room 1" }, // free
    ];
    const result = autoSeedWeeklySlots(template, 60, available, existing);
    expect(result.placed).toEqual([available[1]]);
    expect(result.fullySeeded).toBe(true);
  });

  it("never places two of its own chosen slots into conflict with each other", () => {
    const available = [
      { weekday: 1, startsAt: "08:00", endsAt: "09:00", room: "Room 1" },
      { weekday: 1, startsAt: "08:30", endsAt: "09:30", room: "Room 1" }, // overlaps the first
    ];
    const result = autoSeedWeeklySlots(template, 120, available, []);
    expect(result.placed).toHaveLength(1);
    expect(result.fullySeeded).toBe(false);
    expect(result.placedMinutes).toBe(60);
  });

  it("reports a partial result honestly when there is not enough room on the board", () => {
    const available = [{ weekday: 1, startsAt: "08:00", endsAt: "09:00", room: "Room 1" }];
    const result = autoSeedWeeklySlots(template, 300, available, []);
    expect(result.fullySeeded).toBe(false);
    expect(result.placedMinutes).toBe(60);
    expect(result.requiredMinutes).toBe(300);
  });
});
