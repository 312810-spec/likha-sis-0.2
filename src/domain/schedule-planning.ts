/**
 * CTOS M09 — the Teacher Load Maker's domain shapes, mirroring the Rust
 * scheduling layer field-for-field, including every nullability and every
 * tagged-enum encoding serde uses on the wire.
 *
 * Nothing here is derived or invented client-side. Every value is either
 * read from the plan the trusted boundary returned, or collected from a
 * form the School Head explicitly submitted. The workflow is
 *
 * ```text
 * Prepare → Confirm → Lock → Generate → Compare → Repair → Validate → Publish
 * ```
 *
 * and each step has its own type so the screen cannot render a state the
 * backend did not report — the same division `schedule-meeting.ts`
 * established for `CreateMeetingOutcome`.
 *
 * @public Consumed by the application service, the Tauri adapter and the
 * planner screen; kept exported so each can name these directly.
 */

/** The school's bell grid and workload limits. Mirrors Rust's
 * `repository::scheduling_inputs::ScheduleSettings`. One row per school,
 * materialized server-side with national-policy defaults, so a school that
 * has never opened the planner still has a full grid. */
export interface ScheduleSettings {
  schoolId: string;
  dayStartsAt: string;
  dayEndsAt: string;
  /** Weekdays in session, counted from Monday. The generator lays meetings
   * onto exactly the first `schoolDays` weekdays. */
  schoolDays: number;
  periodMinutes: number;
  passingMinutes: number;
  /** DepEd Order No. 005 s. 2024's six-hour classroom-teaching ceiling, as
   * minutes per day, editable by the school. */
  maxDailyTeachingMinutes: number;
  maxWeeklyTeachingMinutes: number;
  updatedAt: string;
}

/** The write shape for `ScheduleSettings` — all eight fields at once,
 * because the grid is one coherent thing, not eight independent knobs. */
export interface ScheduleSettingsUpdate {
  dayStartsAt: string;
  dayEndsAt: string;
  schoolDays: number;
  periodMinutes: number;
  passingMinutes: number;
  maxDailyTeachingMinutes: number;
  maxWeeklyTeachingMinutes: number;
}

/** A recurring weekly window a teacher is NOT available for classroom
 * teaching. Blocked windows, not free ones: a fully-available teacher is
 * simply absent from this list, which is the common case. */
export interface TeacherUnavailability {
  id: string;
  schoolId: string;
  teacherUserId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  createdAt: string;
}

/** A schedulable room or lab. The generator picks from this registry and
 * the checker validates against it; `schedule_meetings.room` predates it
 * and stays free text, so it never retroactively constrains rows the
 * school already wrote. */
export interface ScheduleRoom {
  id: string;
  schoolId: string;
  name: string;
  isLab: boolean;
  createdAt: string;
}

/** How many weekly instructional minutes a subject demands — the demand
 * side of the load maker. */
export interface SubjectScheduleRequirement {
  subjectId: string;
  schoolId: string;
  requiredWeeklyMinutes: number;
  updatedAt: string;
}

/** One plan revision: a draft until it is published, then the live
 * timetable, then superseded by the next publication. Mirrors Rust's
 * `repository::schedule_plan::SchedulePlan`. */
export interface SchedulePlan {
  id: string;
  schoolId: string;
  revision: number;
  status: SchedulePlanStatus;
  /** SHA-256 over every constraint input as it stood at generation — the
   * Lock step. A plan whose fingerprint no longer matches the school is
   * stale and is refused at publication. */
  inputFingerprint: string;
  generatorNote: string | null;
  createdAt: string;
  publishedAt: string | null;
  publishedByUserId: string | null;
}

/** `draft` while a School Head is working on it, `published` while it is
 * the live timetable, `superseded` once a newer plan replaced it. */
type SchedulePlanStatus = "draft" | "published" | "superseded";

/** One placement inside a plan, with the names a repair screen or a
 * violation message has to quote already joined in. */
export interface PlanPlacement {
  id: string;
  planId: string;
  teachingAssignmentId: string;
  teacherName: string;
  sectionId: string;
  sectionName: string;
  subjectName: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  room: string | null;
}

/** Every reason publication can decline. These are outcomes, not errors: a
 * stale or violating plan is the workflow speaking, and the screen switches
 * on `outcome` the way `CreateMeetingOutcome`'s callers already do. */
export type PublishOutcome =
  | { outcome: "published"; revision: number; meetingCount: number }
  | { outcome: "stale"; storedFingerprint: string; currentFingerprint: string }
  | { outcome: "violations"; violations: Violation[] }
  | { outcome: "notADraft"; status: string }
  | { outcome: "unknownPlan" };

/** One row of any of the three published views. A single shape serves all
 * three so the screen renders one component three ways. */
interface ViewRow {
  teacherName: string;
  sectionName: string;
  subjectName: string;
  room: string | null;
  weekday: number;
  startsAt: string;
  endsAt: string;
}

/** The teacher, section and room views of the currently published plan,
 * read from the SAME published revision in one call — there is no way for
 * a teacher's view and a room's view to disagree about which timetable is
 * live. */
export interface PublishedViews {
  plan: SchedulePlan;
  byTeacher: ViewRow[];
  bySection: ViewRow[];
  byRoom: ViewRow[];
}

/** One generated meeting, before it is staged into a plan. */
interface Placement {
  teachingAssignmentId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  room: string | null;
}

/** The numeric proof that a set of constraints cannot be satisfied — not
 * "the search gave up", but the minutes the assignment demands against the
 * minutes the week holds. */
interface ImpossibilityProof {
  teachingAssignmentId: string;
  teacherName: string;
  sectionName: string;
  subjectName: string;
  requiredWeeklyMinutes: number;
  availableWeeklyMinutes: number;
}

/** An assignment the search did not fully place, with how many minutes are
 * still outstanding. */
interface UnplacedAssignment {
  teachingAssignmentId: string;
  teacherName: string;
  sectionName: string;
  subjectName: string;
  requiredWeeklyMinutes: number;
  stillNeededMinutes: number;
}

/** The three states CTOS.md §M09's "Required states" clause demands, and
 * no others — each carrying what a teacher needs to act on it. */
export type GenerationOutcome =
  | { outcome: "valid"; placements: Placement[]; notes: string[] }
  | { outcome: "impossible"; placements: Placement[]; proofs: ImpossibilityProof[] }
  | {
      outcome: "stopped";
      placements: Placement[];
      unplaced: UnplacedAssignment[];
      stepsUsed: number;
    };

/** The result of a Generate run: the plan the placements were staged into,
 * and which of the three states the generator landed in. The plan exists in
 * every case — a partial timetable alongside a proof is still worth
 * repairing. */
export interface GenerationResponse {
  planId: string;
  revision: number;
  outcome: GenerationOutcome;
}

/**
 * One constraint the independent checker found violated. Every variant
 * names the constraint and the people and times involved, because an
 * unexplained rejection is not repairable.
 *
 * Mirrors Rust's `scheduling::check::Violation`
 * (`#[serde(tag = "kind", rename_all = "camelCase")]`) exactly.
 *
 * @public Consumed structurally by the planner screen's violation list.
 */
export type Violation =
  | {
      kind: "teacherConflict";
      teacherName: string;
      weekday: number;
      startsAt: string;
      endsAt: string;
      conflictingStartsAt: string;
      conflictingEndsAt: string;
    }
  | {
      kind: "sectionConflict";
      sectionName: string;
      weekday: number;
      startsAt: string;
      endsAt: string;
      conflictingStartsAt: string;
      conflictingEndsAt: string;
    }
  | {
      kind: "roomConflict";
      room: string;
      weekday: number;
      startsAt: string;
      endsAt: string;
      conflictingStartsAt: string;
      conflictingEndsAt: string;
    }
  | {
      kind: "teacherUnavailable";
      teacherName: string;
      weekday: number;
      startsAt: string;
      endsAt: string;
      unavailableStartsAt: string;
      unavailableEndsAt: string;
    }
  | {
      kind: "teacherDailyOverload";
      teacherName: string;
      weekday: number;
      minutes: number;
      limit: number;
    }
  | { kind: "teacherWeeklyOverload"; teacherName: string; minutes: number; limit: number }
  | {
      kind: "missingPassingBuffer";
      teacherName: string;
      weekday: number;
      gapMinutes: number;
      required: number;
    }
  | {
      kind: "sharedLearners";
      sectionName: string;
      conflictingSectionName: string;
      weekday: number;
      startsAt: string;
      endsAt: string;
    }
  | {
      kind: "requirementShortfall";
      subjectName: string;
      sectionName: string;
      requiredMinutes: number;
      scheduledMinutes: number;
    }
  | { kind: "unknownRoom"; room: string; weekday: number; startsAt: string }
  | { kind: "legacyConflict"; weekday: number; startsAt: string; endsAt: string };
