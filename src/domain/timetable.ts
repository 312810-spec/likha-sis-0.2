/**
 * Batch 4 (Tier 3.1-3.2): pure domain logic for the Visual Timetable /
 * Class Program Builder. Deliberately reuses the shapes this codebase
 * already persists (`ScheduleMeeting`, via
 * `docs/adr/0039-teacher-load-class-schedule-foundation.md` and Wave 2Z's
 * `ScheduleMeetingsScreen`) rather than inventing a parallel timetable
 * table -- see `docs/adr/0075-visual-timetable-and-theme-tokens.md`.
 *
 * Server-side (Rust) already rejects a colliding
 * teacher/section/room meeting at write time (`CreateMeetingOutcome`).
 * This module is the client-side mirror of that same overlap rule, used
 * for two things the server cannot do on its own: (1) showing a
 * *candidate* placement's conflicts live, before the user commits to it
 * (the grid UI's click-to-arm/click-to-place interaction), and (2) the
 * one-click auto-seed distribution algorithm, which must avoid
 * generating a candidate that the server would reject.
 *
 * No UI or persistence import here -- these are pure functions over
 * plain data, independently testable (`timetable.test.ts`).
 */

/** A placed or candidate weekly meeting. Mirrors the fields
 * `ScheduleMeeting`/`CreateMeetingOutcome` already carry, minus the
 * database-assigned `id` (a candidate has none yet). */
export interface TimetableSlotInput {
  /** The persisted `ScheduleMeeting.id`, when this slot already exists
   * on the board. Absent for a candidate placement that has not been
   * saved yet (a drag-in-progress, or an auto-seed candidate) -- used
   * only to let a caller re-check an *existing* meeting's own new
   * position without it conflicting against its own old one. Two
   * distinct new candidates for the same teaching assignment (e.g. two
   * auto-seeded weekly meetings of one subject) are NOT self-exempted
   * just for sharing a `teachingAssignmentId` -- only an exact
   * `meetingId` match is. */
  meetingId?: string;
  teachingAssignmentId: string;
  teacherUserId: string;
  sectionId: string;
  subjectId: string;
  weekday: number;
  startsAt: string; // "HH:MM", 24-hour
  endsAt: string; // "HH:MM", 24-hour
  room: string | null;
}

/** @public referenced structurally by `TimetableConflict.kind` below --
 * never imported by name elsewhere, but a real, load-bearing type. */
export type TimetableConflictKind = "teacherConflict" | "sectionConflict" | "roomConflict";

export interface TimetableConflict {
  kind: TimetableConflictKind;
  /** The existing slot the candidate collides with. */
  with: TimetableSlotInput;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** True when two same-weekday time ranges overlap at all (touching
 * end-to-start, e.g. 08:00-09:00 then 09:00-10:00, is NOT an overlap --
 * matches the server's own half-open-interval convention). */
function overlaps(a: TimetableSlotInput, b: TimetableSlotInput): boolean {
  if (a.weekday !== b.weekday) return false;
  const aStart = toMinutes(a.startsAt);
  const aEnd = toMinutes(a.endsAt);
  const bStart = toMinutes(b.startsAt);
  const bEnd = toMinutes(b.endsAt);
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Real-time conflict detection for a candidate placement against the
 * set of meetings already on the board (which may span multiple
 * sections/teachers -- the caller passes in everything relevant, e.g.
 * "every meeting for this school year", not just the current section's
 * own list, so a teacher already busy elsewhere is still caught).
 *
 * Returns every conflict found (a candidate can conflict on more than
 * one axis at once, e.g. same teacher AND same room).
 */
export function detectTimetableConflicts(
  candidate: TimetableSlotInput,
  existing: readonly TimetableSlotInput[],
): TimetableConflict[] {
  const conflicts: TimetableConflict[] = [];
  for (const other of existing) {
    // A slot never conflicts with its own prior persisted position when
    // it is being moved -- but two different, not-yet-saved candidates
    // for the same teaching assignment (auto-seed) are real, separate
    // meetings and must still be checked against each other.
    if (candidate.meetingId && other.meetingId && other.meetingId === candidate.meetingId) continue;
    if (!overlaps(candidate, other)) continue;
    if (other.teacherUserId === candidate.teacherUserId) {
      conflicts.push({ kind: "teacherConflict", with: other });
    }
    if (other.sectionId === candidate.sectionId) {
      conflicts.push({ kind: "sectionConflict", with: other });
    }
    if (
      candidate.room &&
      other.room &&
      candidate.room.trim().toLowerCase() === other.room.trim().toLowerCase()
    ) {
      conflicts.push({ kind: "roomConflict", with: other });
    }
  }
  return conflicts;
}

/** Subject-hours validation against a curriculum requirement. The
 * required weekly minutes figure is supplied by the caller (this batch
 * does not add a new `curriculum_subject_requirements` persistence
 * table -- flagged in the wave report/ADR as a deliberately deferred
 * follow-up, not a silent gap) rather than invented here. */
export interface SubjectHoursCheck {
  subjectId: string;
  scheduledMinutes: number;
  requiredMinutes: number;
  /** requiredMinutes - scheduledMinutes, floored at 0. */
  shortfallMinutes: number;
  /** scheduledMinutes - requiredMinutes when scheduled exceeds required, else 0. */
  overageMinutes: number;
  satisfied: boolean;
}

export function validateSubjectWeeklyMinutes(
  subjectId: string,
  slotsForSection: readonly TimetableSlotInput[],
  requiredMinutes: number,
): SubjectHoursCheck {
  const scheduledMinutes = slotsForSection
    .filter((s) => s.subjectId === subjectId)
    .reduce((sum, s) => sum + (toMinutes(s.endsAt) - toMinutes(s.startsAt)), 0);
  const shortfallMinutes = Math.max(0, requiredMinutes - scheduledMinutes);
  const overageMinutes = Math.max(0, scheduledMinutes - requiredMinutes);
  return {
    subjectId,
    scheduledMinutes,
    requiredMinutes,
    shortfallMinutes,
    overageMinutes,
    satisfied: scheduledMinutes >= requiredMinutes,
  };
}

/** One open slot on the board the auto-seed algorithm may fill. */
export interface AvailableSlot {
  weekday: number;
  startsAt: string;
  endsAt: string;
  room: string | null;
}

export interface AutoSeedResult {
  /** Slots chosen, in the order they were placed. */
  placed: AvailableSlot[];
  /** Total minutes actually placed (<= requiredMinutes; less only when
   * the available slots ran out). */
  placedMinutes: number;
  requiredMinutes: number;
  /** True only when placedMinutes === requiredMinutes exactly. */
  fullySeeded: boolean;
}

/**
 * One-click auto-seed: greedily distributes `requiredMinutes` of a
 * subject's weekly instructional time across a section's
 * `availableSlots`, skipping any slot that would conflict with
 * `existing` meetings (teacher/section/room, via
 * `detectTimetableConflicts`) and never placing a slot whose duration
 * would push the running total past `requiredMinutes`.
 *
 * Deterministic: `availableSlots` is consumed in the order given, so the
 * caller controls prioritization (e.g. earliest-in-week-first) by how it
 * sorts the input. This keeps the algorithm simple, testable, and free
 * of any hidden randomness or UI dependency.
 */
export function autoSeedWeeklySlots(
  candidateTemplate: Pick<
    TimetableSlotInput,
    "teachingAssignmentId" | "teacherUserId" | "sectionId" | "subjectId"
  >,
  requiredMinutes: number,
  availableSlots: readonly AvailableSlot[],
  existing: readonly TimetableSlotInput[],
): AutoSeedResult {
  const placed: AvailableSlot[] = [];
  const placedAsSlots: TimetableSlotInput[] = [];
  let placedMinutes = 0;

  for (const slot of availableSlots) {
    if (placedMinutes >= requiredMinutes) break;
    const duration = toMinutes(slot.endsAt) - toMinutes(slot.startsAt);
    if (duration <= 0) continue;
    // Don't overshoot the requirement.
    if (placedMinutes + duration > requiredMinutes) continue;

    const candidate: TimetableSlotInput = { ...candidateTemplate, ...slot };
    const conflicts = detectTimetableConflicts(candidate, [...existing, ...placedAsSlots]);
    if (conflicts.length > 0) continue;

    placed.push(slot);
    placedAsSlots.push(candidate);
    placedMinutes += duration;
  }

  return {
    placed,
    placedMinutes,
    requiredMinutes,
    fullySeeded: placedMinutes === requiredMinutes,
  };
}
