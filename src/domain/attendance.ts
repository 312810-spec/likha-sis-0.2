/**
 * DepEd's actual per-day attendance codes, verified against a real
 * `CONSO SF v2025.xlsx` School Form 2 workbook: Present, Absent, Tardy —
 * there is no official "Excused" code. An earlier version of this app had a
 * 4th `Late`/`Excused` pairing that did not match DepEd; see
 * `docs/adr/0008-section-foundation-and-attendance-semantics.md`.
 */
export type AttendanceStatus = "present" | "absent" | "tardy";

export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = ["present", "absent", "tardy"];

export interface AttendanceRecord {
  id: string;
  schoolId: string;
  sectionId: string;
  learnerId: string;
  attendanceDate: string;
  status: AttendanceStatus;
  recordedAt: string;
}

/** One roster row: a learner paired with their status for a given date, or
 * `null` if nobody has marked them yet. */
export interface AttendanceRosterEntry {
  learnerId: string;
  givenName: string;
  familyName: string;
  status: AttendanceStatus | null;
  recordedAt: string | null;
}

/**
 * One learner's attendance across a calendar month: `days` is parallel to
 * `MonthlyAttendanceReport.schoolDays` (index 0 corresponds to the first
 * school day in that list, not necessarily day 1 of the month), `null`
 * for an unmarked day.
 */
export interface MonthlyLearnerAttendance {
  learnerId: string;
  givenName: string;
  familyName: string;
  days: (AttendanceStatus | null)[];
  presentCount: number;
  absentCount: number;
  tardyCount: number;
}

/**
 * One section's monthly attendance overview — DepEd-SF2-*inspired*
 * (monthly grid, per-learner totals, school-day-only columns), not a
 * verified reproduction of the official per-section SF2 template. See
 * `docs/product/M8-DECISION.md` for exactly what was and wasn't verified
 * against a real DepEd source.
 */
export interface MonthlyAttendanceReport {
  year: number;
  month: number;
  /** Calendar day-of-month numbers that are school days (Mon-Fri) this
   * month, in order. */
  schoolDays: number[];
  learners: MonthlyLearnerAttendance[];
}
