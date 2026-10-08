/**
 * M09 candidate: independent checker for a proposed weekly timetable.
 *
 * This pure function does not authorize publication. The trusted Rust
 * publication path must re-check the saved revision and all constraints.
 */
export interface ProposedMeeting {
  id: string;
  teacherId: string;
  sectionId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  roomId: string | null;
}

export type TimetableIssueCode =
  | "invalidInterval"
  | "teacherConflict"
  | "sectionConflict"
  | "roomConflict"
  | "teacherDailyLimit";

export interface TimetableIssue {
  code: TimetableIssueCode;
  meetingIds: readonly string[];
  weekday: number;
}

export interface TimetableCheckInput {
  meetings: readonly ProposedMeeting[];
  teacherDailyLimits: Readonly<Record<string, number>>;
}

export function checkProposedTimetable(input: TimetableCheckInput): TimetableIssue[] {
  const issues: TimetableIssue[] = [];
  const valid: ProposedMeeting[] = [];
  for (const meeting of input.meetings) {
    if (
      !Number.isInteger(meeting.weekday) ||
      meeting.weekday < 0 ||
      meeting.weekday > 6 ||
      !Number.isInteger(meeting.startMinute) ||
      !Number.isInteger(meeting.endMinute) ||
      meeting.startMinute < 0 ||
      meeting.endMinute > 1440 ||
      meeting.startMinute >= meeting.endMinute
    ) {
      issues.push({ code: "invalidInterval", meetingIds: [meeting.id], weekday: meeting.weekday });
      continue;
    }
    valid.push(meeting);
  }

  for (let i = 0; i < valid.length; i += 1) {
    const a = valid[i];
    for (let j = i + 1; j < valid.length; j += 1) {
      const b = valid[j];
      if (
        a.weekday !== b.weekday ||
        !(a.startMinute < b.endMinute && b.startMinute < a.endMinute)
      ) {
        continue;
      }
      const meetingIds = [a.id, b.id];
      if (a.teacherId === b.teacherId) {
        issues.push({ code: "teacherConflict", meetingIds, weekday: a.weekday });
      }
      if (a.sectionId === b.sectionId) {
        issues.push({ code: "sectionConflict", meetingIds, weekday: a.weekday });
      }
      if (a.roomId !== null && a.roomId === b.roomId) {
        issues.push({ code: "roomConflict", meetingIds, weekday: a.weekday });
      }
    }
  }

  const days = new Map<string, { minutes: number; ids: string[]; weekday: number; teacherId: string }>();
  for (const meeting of valid) {
    const key = JSON.stringify([meeting.teacherId, meeting.weekday]);
    const day = days.get(key) ?? {
      minutes: 0,
      ids: [],
      weekday: meeting.weekday,
      teacherId: meeting.teacherId,
    };
    day.minutes += meeting.endMinute - meeting.startMinute;
    day.ids.push(meeting.id);
    days.set(key, day);
  }
  for (const day of days.values()) {
    const limit = input.teacherDailyLimits[day.teacherId];
    // An absent/invalid limit is unresolved configuration, never implied 360 minutes.
    if (limit !== undefined && Number.isInteger(limit) && limit >= 0 && day.minutes > limit) {
      issues.push({
        code: "teacherDailyLimit",
        meetingIds: day.ids,
        weekday: day.weekday,
      });
    }
  }
  return issues;
}
