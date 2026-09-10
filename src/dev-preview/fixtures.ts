/**
 * Synthetic, in-memory-only data and fake repository ports for the
 * development-only visual fixture (`src/dev-preview/`). See
 * `docs/adr/0032-teacher-workspace-polish.md` for the safety
 * requirements this file exists to satisfy.
 *
 * Every fake repository below implements the exact same port interface
 * production's `TauriXRepository` classes do, so the real application
 * services (`TeacherWorkspaceScreen`'s props) behave identically here as
 * in the shipped app — no drifting duplicate logic. `login`/
 * `extendSession`/`logout` on the fake auth repository deliberately
 * throw: this fixture never issues, forges, persists, or bypasses a
 * real session. The "signed in" state it renders is nothing more than a
 * plain `CurrentSession`-shaped object passed as a prop to `AppLayout`
 * for display purposes -- the exact same thing this app's own test
 * suite already does in every screen's `.test.tsx` file. No
 * `SessionManager`, no Rust `auth::login`, no persisted `sessions`
 * table row, no Tauri IPC call of any kind is ever made from this file
 * or anything it constructs.
 */
import type { AssessmentRepository } from "../domain/ports/assessment-repository";
import type { AttendanceRepository } from "../domain/ports/attendance-repository";
import type { AuthRepository } from "../domain/ports/auth-repository";
import type { ClassRecordRepository } from "../domain/ports/class-record-repository";
import type { ExportRepository } from "../domain/ports/export-repository";
import type { EnrollmentHistoryRepository } from "../domain/ports/enrollment-history-repository";
import type { GradingRepository } from "../domain/ports/grading-repository";
import type { LearnerRepository } from "../domain/ports/learner-repository";
import type { LearnerScoreRepository } from "../domain/ports/learner-score-repository";
import type { SectionRepository } from "../domain/ports/section-repository";
import type { SubjectRepository } from "../domain/ports/subject-repository";
import type { SyncStatusRepository } from "../domain/ports/sync-status-repository";
import type { SyncStatus } from "../domain/sync-status";
import type {
  AssessmentCategory,
  AssessmentCategorySet,
  AssessmentItem,
  AssessmentItemDetail,
} from "../domain/assessment";
import type {
  AttendanceRecord,
  AttendanceRosterEntry,
  AttendanceStatus,
  MonthlyAttendanceReport,
  MonthlyLearnerAttendance,
} from "../domain/attendance";
import type { ClassRecord, ClassRecordDetail, GradingWeightPolicy } from "../domain/class-record";
import type {
  LearnerRosterExportResult,
  ReportCardExportResult,
  Sf2ExportResult,
} from "../domain/export";
import type { GradingPeriod, GradingPolicy, GradingPolicyPeriod } from "../domain/grading";
import type { CreateLearnerResult, Learner } from "../domain/learner";
import type {
  ComputedTermGrade,
  LearnerScore,
  LearnerScoreRosterEntry,
  LearnerScoreStatus,
} from "../domain/learner-score";
import type { Section, SectionMembership, SectionRosterMember } from "../domain/section";
import type { AuditLogEntry, CurrentSession } from "../domain/session";
import type { Subject } from "../domain/subject";
import type { SchoolMemberRepository } from "../domain/ports/school-member-repository";
import type { SectionAdvisoryRepository } from "../domain/ports/section-advisory-repository";
import type { SchoolMember } from "../domain/school-member";
import type {
  AssignAdviserOutcome,
  EndAdvisoryOutcome,
  SectionAdvisory,
} from "../domain/section-advisory";
import type { SubjectAttendanceRepository } from "../domain/ports/subject-attendance-repository";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type {
  AdviserAttendanceOverview,
  EntryStatus,
  RecordEntryOutcome,
  SubjectAttendanceMonitor,
  SubjectAttendanceMonitorRow,
  SubjectAttendanceRosterRow,
  SubjectAttendanceSession,
  TeachingAssignmentSummary,
} from "../domain/subject-attendance";
import type { CreateMeetingOutcome, ScheduleMeeting } from "../domain/schedule-meeting";
import type { TeacherLoad } from "../domain/teacher-load";
import type { TeachingAssignment, TeachingAssignmentDetail } from "../domain/teaching-assignment";

/** A plain data object, not a real session -- see this file's own doc
 * comment. Rendered only as a prop to `AppLayout`/`TeacherWorkspaceScreen`
 * for display, never passed through any authentication code path. */
export const FIXTURE_SESSION: CurrentSession = {
  userId: "fixture-user",
  username: "juan.delacruz",
  displayName: "Juan Dela Cruz (Synthetic)",
  schoolId: "fixture-school",
  schoolName: "Bagong Pag-Asa Elementary School (Synthetic)",
  expiresAtUnixMs: Date.now() + 8 * 60 * 60_000,
  idleExpiresAtUnixMs: Date.now() + 30 * 60_000,
  roles: ["teacher"],
};

function todayAsIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const TODAY = todayAsIsoDate();

const FIXTURE_LEARNERS: Learner[] = [
  {
    id: "l1",
    schoolId: "fixture-school",
    givenName: "Ana",
    familyName: "Santos",
    lrn: "123456789012",
    sex: "F",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "l2",
    schoolId: "fixture-school",
    givenName: "Bayani",
    familyName: "Cruz",
    lrn: "123456789013",
    sex: "M",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "l3",
    schoolId: "fixture-school",
    givenName: "Maria Corazon",
    familyName: "Dela Peña-Villanueva",
    lrn: null,
    sex: "F",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
];

/** Covers all four Workspace attendance states: not-started, partial,
 * complete, and no-learners-enrolled -- plus one long section/grade
 * name to check for overflow/wrapping. */
const FIXTURE_SECTIONS: Section[] = [
  {
    id: "sec-not-started",
    schoolId: "fixture-school",
    schoolYear: "2026-2027",
    gradeLevel: "7",
    name: "Mabini",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "sec-partial",
    schoolId: "fixture-school",
    schoolYear: "2026-2027",
    gradeLevel: "8",
    name: "Rizal",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "sec-complete",
    schoolId: "fixture-school",
    schoolYear: "2026-2027",
    gradeLevel: "6",
    name: "Bonifacio",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "sec-no-learners",
    schoolId: "fixture-school",
    schoolYear: "2026-2027",
    gradeLevel: "10",
    name: "Grade 10 - Kagitingan sa Pananaliksik at Agham (Synthetic Long Section Name)",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
];

const FIXTURE_ROSTERS: Record<string, AttendanceRosterEntry[]> = {
  "sec-not-started": [
    { learnerId: "l1", givenName: "Ana", familyName: "Santos", status: null, recordedAt: null },
    { learnerId: "l2", givenName: "Bayani", familyName: "Cruz", status: null, recordedAt: null },
  ],
  "sec-partial": [
    {
      learnerId: "l1",
      givenName: "Ana",
      familyName: "Santos",
      status: "present",
      recordedAt: `${TODAY}T07:30:00.000Z`,
    },
    { learnerId: "l2", givenName: "Bayani", familyName: "Cruz", status: null, recordedAt: null },
  ],
  "sec-complete": [
    {
      learnerId: "l3",
      givenName: "Maria Corazon",
      familyName: "Dela Peña-Villanueva",
      status: "present",
      recordedAt: `${TODAY}T07:15:00.000Z`,
    },
  ],
  "sec-no-learners": [],
};

const FIXTURE_GRADING_PERIODS: Record<string, GradingPeriod[]> = {
  "2026-2027": [
    {
      id: "gp1",
      schoolId: "fixture-school",
      schoolYear: "2026-2027",
      policyPeriodId: "pp1",
      label: "1st Term",
      startsOn: "2026-08-01",
      endsOn: "2026-10-15",
      createdAt: "2026-06-01T00:00:00.000Z",
    },
  ],
};

const FIXTURE_AUDIT_LOG: AuditLogEntry[] = [
  {
    id: "a1",
    schoolId: "fixture-school",
    userId: "fixture-user",
    username: "juan.delacruz",
    eventType: "login_success",
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
  {
    id: "a2",
    schoolId: "fixture-school",
    userId: null,
    username: "unknown.attempt",
    eventType: "login_failed",
    createdAt: new Date(Date.now() - 60 * 60_000).toISOString(),
  },
];

export class FixtureLearnerRepository implements LearnerRepository {
  async list(): Promise<Learner[]> {
    return FIXTURE_LEARNERS;
  }
  async create(): Promise<Learner> {
    throw new Error("dev-preview fixture: create() is not wired -- read-only fixture");
  }
  async createWithDuplicateCheck(): Promise<CreateLearnerResult> {
    throw new Error(
      "dev-preview fixture: createWithDuplicateCheck() is not wired -- read-only fixture",
    );
  }
  async updateProfile(): Promise<Learner | null> {
    throw new Error("dev-preview fixture: updateProfile() is not wired -- read-only fixture");
  }
}

export class FixtureSectionRepository implements SectionRepository {
  async list(): Promise<Section[]> {
    return FIXTURE_SECTIONS;
  }
  async create(): Promise<Section> {
    throw new Error("dev-preview fixture: create() is not wired -- read-only fixture");
  }
  async enroll(): Promise<SectionMembership | null> {
    throw new Error("dev-preview fixture: enroll() is not wired -- read-only fixture");
  }
  async roster(): Promise<SectionRosterMember[]> {
    return [];
  }
  async transferMembership(): Promise<never> {
    throw new Error("dev-preview fixture: transferMembership() is not wired -- read-only fixture");
  }
  async endMembership(): Promise<never> {
    throw new Error("dev-preview fixture: endMembership() is not wired -- read-only fixture");
  }
  async listEnrollableLearners(): Promise<never> {
    throw new Error(
      "dev-preview fixture: listEnrollableLearners() is not wired -- read-only fixture",
    );
  }
  async enrollMembership(): Promise<never> {
    throw new Error("dev-preview fixture: enrollMembership() is not wired -- read-only fixture");
  }
  async correctSameDayPlacement(): Promise<never> {
    throw new Error(
      "dev-preview fixture: correctSameDayPlacement() is not wired -- read-only fixture",
    );
  }
}

const FIXTURE_ENROLLMENT_HISTORY: SectionMembership[] = [
  {
    id: "history-l1-past",
    schoolId: "fixture-school",
    sectionId: "sec-complete",
    learnerId: "l1",
    startsOn: "2025-06-02",
    endsOn: "2026-04-01",
    createdAt: "2025-06-02T00:00:00.000Z",
  },
  {
    id: "history-l1-current",
    schoolId: "fixture-school",
    sectionId: "sec-not-started",
    learnerId: "l1",
    startsOn: "2026-06-01",
    endsOn: null,
    createdAt: "2026-06-01T00:00:00.000Z",
  },
];

export class FixtureEnrollmentHistoryRepository implements EnrollmentHistoryRepository {
  async listByLearner(learnerId: string): Promise<SectionMembership[]> {
    return FIXTURE_ENROLLMENT_HISTORY.filter((entry) => entry.learnerId === learnerId);
  }
}

/** A small, deterministic per-learner day pattern so the monthly legend's
 * P/A/T/— all appear somewhere in the fixture, not just one repeated
 * status -- built from each section's own roster (name/id only, not its
 * daily `status` field, since a single day's mark and a month's day-by-
 * day history are different concepts). */
function buildFixtureMonthlyReport(
  sectionId: string,
  year: number,
  month: number,
): MonthlyAttendanceReport {
  const roster = FIXTURE_ROSTERS[sectionId] ?? [];
  const schoolDays = [3, 4, 5, 6, 7];
  const learners: MonthlyLearnerAttendance[] = roster.map((entry, index) => {
    const days: (AttendanceStatus | null)[] = [
      "present",
      index === 0 ? "absent" : "present",
      index === 1 ? "tardy" : "present",
      null,
      "present",
    ];
    return {
      learnerId: entry.learnerId,
      givenName: entry.givenName,
      familyName: entry.familyName,
      days,
      presentCount: days.filter((status) => status === "present").length,
      absentCount: days.filter((status) => status === "absent").length,
      tardyCount: days.filter((status) => status === "tardy").length,
    };
  });
  return { year, month, schoolDays, learners };
}

/** In-memory-only attendance state, mutated by `record()`/
 * `bulkMarkPresent()` so a teacher can genuinely interact with the
 * fixture (mark a learner, switch sections and back, see the mark still
 * there) -- never persisted, never touches Tauri/SQLite. Cloned from the
 * static `FIXTURE_ROSTERS` at construction so each fixture instance
 * starts from the same known synthetic state. */
export class FixtureAttendanceRepository implements AttendanceRepository {
  private rosters: Record<string, AttendanceRosterEntry[]> = structuredClone(FIXTURE_ROSTERS);

  async rosterForDate(sectionId: string): Promise<AttendanceRosterEntry[]> {
    return this.rosters[sectionId] ?? [];
  }

  async record(
    sectionId: string,
    learnerId: string,
    attendanceDate: string,
    status: AttendanceStatus,
  ): Promise<AttendanceRecord | null> {
    const roster = this.rosters[sectionId];
    if (!roster) return null;
    this.rosters[sectionId] = roster.map((entry) =>
      entry.learnerId === learnerId
        ? { ...entry, status, recordedAt: new Date().toISOString() }
        : entry,
    );
    return {
      id: `fixture-record-${sectionId}-${learnerId}`,
      schoolId: "fixture-school",
      sectionId,
      learnerId,
      attendanceDate,
      status,
      recordedAt: new Date().toISOString(),
    };
  }

  async bulkMarkPresent(sectionId: string): Promise<AttendanceRosterEntry[]> {
    const roster = this.rosters[sectionId];
    if (!roster) return [];
    this.rosters[sectionId] = roster.map((entry) =>
      entry.status === null
        ? { ...entry, status: "present", recordedAt: new Date().toISOString() }
        : entry,
    );
    return this.rosters[sectionId];
  }

  async monthlySummary(
    sectionId: string,
    year: number,
    month: number,
  ): Promise<MonthlyAttendanceReport> {
    return buildFixtureMonthlyReport(sectionId, year, month);
  }
}

/** A synthetic SF2 export result -- the fixture never writes a real file;
 * `exportClassRecordReportCard`/`exportLearnerRoster` remain unwired
 * (out of scope for UX-03's dev-preview extension) and throw, matching
 * this file's existing "not wired" convention for untouched methods. */
export class FixtureExportRepository implements ExportRepository {
  async exportSectionMonthlySf2(
    sectionId: string,
    year: number,
    month: number,
  ): Promise<Sf2ExportResult | null> {
    return {
      filePath: `C:\\Users\\teacher\\Documents\\LIKHA-SIS\\SF2_${sectionId}_${year}-${String(month).padStart(2, "0")}.csv (synthetic)`,
      disclosure: {
        populatedFields: ["School Name", "Present/Absent/Tardy per day"],
        omittedFields: [
          { field: "School ID (EBEIS)", reason: "not tracked by this app" },
          { field: "Enrollment/dropout/transfer statistics", reason: "not tracked by this app" },
        ],
      },
    };
  }

  async exportSchoolMonthlyAttendanceSf4(
    year: number,
    month: number,
  ): Promise<import("../domain/export").Sf4ExportResult | null> {
    return {
      filePath: `C:\\Users\\teacher\\Documents\\LIKHA-SIS\\SF4_${year}-${String(month).padStart(2, "0")}.csv (synthetic)`,
      disclosure: {
        populatedFields: ["School Name", "Present/Absent/Tardy per day, whole school"],
        omittedFields: [
          { field: "School ID (EBEIS)", reason: "not tracked by this app" },
          { field: "Enrollment/dropout/transfer statistics", reason: "not tracked by this app" },
        ],
      },
    };
  }

  async exportSectionEosySf5(
    sectionId: string,
    schoolYear: string,
  ): Promise<import("../domain/export").Sf5ExportResult | null> {
    return {
      filePath: `C:\\Users\\teacher\\Documents\\LIKHA-SIS\\SF5_${sectionId}_${schoolYear}.csv (synthetic)`,
      disclosure: {
        populatedFields: ["School Name", "Final grades and promotion decisions"],
        omittedFields: [{ field: "School ID (EBEIS)", reason: "not tracked by this app" }],
      },
    };
  }

  async exportSchoolEosySf6(
    schoolYear: string,
  ): Promise<import("../domain/export").Sf6ExportResult | null> {
    return {
      filePath: `C:\\Users\\teacher\\Documents\\LIKHA-SIS\\SF6_${schoolYear}.csv (synthetic)`,
      disclosure: {
        populatedFields: ["School Name", "School-wide promotion summary"],
        omittedFields: [{ field: "School ID (EBEIS)", reason: "not tracked by this app" }],
      },
    };
  }

  async exportClassRecordReportCard(): Promise<ReportCardExportResult | null> {
    throw new Error(
      "dev-preview fixture: exportClassRecordReportCard() is not wired -- read-only fixture",
    );
  }

  async exportClassRecordSummary(): Promise<
    import("../domain/export").ClassSummaryExportResult | null
  > {
    throw new Error(
      "dev-preview fixture: exportClassRecordSummary() is not wired -- read-only fixture",
    );
  }

  async exportLearnerRoster(): Promise<LearnerRosterExportResult | null> {
    throw new Error("dev-preview fixture: exportLearnerRoster() is not wired -- read-only fixture");
  }

  async exportLearnerPermanentRecordSf10(): Promise<
    import("../domain/export").Sf10ExportResult | null
  > {
    throw new Error(
      "dev-preview fixture: exportLearnerPermanentRecordSf10() is not wired -- read-only fixture",
    );
  }

  async revealExportedFile(): Promise<void> {
    // No real OS file manager in a browser-hosted dev-preview -- a no-op
    // is the honest fixture behavior here, not a throw (unlike the other
    // unwired methods above, clicking "Open folder" in dev-preview isn't
    // a bug to surface, it's simply unavailable in this environment).
  }
}

export class FixtureGradingRepository implements GradingRepository {
  async listPolicies(): Promise<GradingPolicy[]> {
    return [];
  }
  async listPolicyPeriods(): Promise<GradingPolicyPeriod[]> {
    return [];
  }
  async listPeriodsBySchoolYear(schoolYear: string): Promise<GradingPeriod[]> {
    return FIXTURE_GRADING_PERIODS[schoolYear] ?? [];
  }
  async createPeriod(): Promise<GradingPeriod | null> {
    throw new Error("dev-preview fixture: createPeriod() is not wired -- read-only fixture");
  }
}

/**
 * The fixture's auth repository. `login`, `logout`, and `extendSession`
 * throw unconditionally -- this is the safety mechanism, not just a
 * comment: if any code path in this fixture ever tried to actually
 * authenticate, it fails loudly and immediately instead of silently
 * reaching real session infrastructure. `listAuditLog` returns
 * synthetic entries only.
 */
export class FixtureAuthRepository implements AuthRepository {
  async login(): Promise<CurrentSession> {
    throw new Error(
      "dev-preview fixture: login() must never be called -- this fixture never authenticates",
    );
  }
  async logout(): Promise<void> {
    throw new Error(
      "dev-preview fixture: logout() must never be called -- this fixture never authenticates",
    );
  }
  async currentSession(): Promise<CurrentSession | null> {
    throw new Error(
      "dev-preview fixture: currentSession() must never be called -- the fixture session is a plain prop, not a real session lookup",
    );
  }
  async extendSession(): Promise<CurrentSession> {
    throw new Error(
      "dev-preview fixture: extendSession() must never be called -- this fixture never authenticates",
    );
  }
  async listAuditLog(): Promise<AuditLogEntry[]> {
    return FIXTURE_AUDIT_LOG;
  }
}

/*
 * ==== Class Records / Assessments / Learner Scores (UX-04) ====
 *
 * A second, independent slice of mutable in-memory state. Unlike
 * `FixtureAttendanceRepository` above (one repository class, its own
 * private roster), three separate repository classes here --
 * assessment, learner-score, and class-record -- all need to observe
 * the same evolving item/score data (e.g. the Class Records list's
 * Progress column must agree with the workspace's own completion
 * counts), so the underlying items/scores/subjects live at module
 * scope instead of being duplicated per repository instance.
 */

const FIXTURE_SUBJECTS: Subject[] = [
  {
    id: "sub-math",
    schoolId: "fixture-school",
    name: "Mathematics",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "sub-science",
    schoolId: "fixture-school",
    name: "Science",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "sub-mapeh",
    schoolId: "fixture-school",
    name: "MAPEH",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
];

/** Mutable (via `FixtureSubjectRepository.create`) -- shared with the
 * class-record detail resolver below so a newly added subject shows up
 * correctly once used to open a class record. */
let allSubjects: Subject[] = [...FIXTURE_SUBJECTS];

const FIXTURE_WEIGHT_POLICIES: GradingWeightPolicy[] = [
  {
    id: "wp-k10",
    name: "DepEd K-10 Core Subjects Weighting (DO 015, s. 2026)",
    sourceCitation: "DepEd Order No. 015, s. 2026",
    isDefault: true,
  },
  {
    id: "wp-mapeh",
    name: "DepEd EPP/TLE & MAPEH Weighting (DO 015, s. 2026)",
    sourceCitation: "DepEd Order No. 015, s. 2026",
    isDefault: false,
  },
];

const FIXTURE_CATEGORY_SET: AssessmentCategorySet = {
  id: "set-do015",
  name: "DepEd Classroom Assessment (DO 015, s. 2026)",
  sourceCitation: "DepEd Order No. 015, s. 2026",
  isDefault: true,
  createdAt: "2026-06-01T00:00:00.000Z",
};

/** Leaf categories only -- matches what the real
 * `assessment_category::list_categories_for_set` narrows to (a parent
 * like "Examinations" is never itself a selectable option; see
 * ADR-0013), so this fixture's create-item category dropdown behaves
 * the same as production's. */
const FIXTURE_CATEGORIES: AssessmentCategory[] = [
  { id: "cat-ww", setId: "set-do015", sequence: 1, name: "Written Works" },
  { id: "cat-pt", setId: "set-do015", sequence: 2, name: "Performance Tasks" },
  { id: "cat-st1", setId: "set-do015", sequence: 3, name: "Summative Test 1" },
  { id: "cat-st2", setId: "set-do015", sequence: 4, name: "Summative Test 2" },
  { id: "cat-te", setId: "set-do015", sequence: 5, name: "Term Examination" },
];

const CATEGORY_NAME_BY_ID: Record<string, string> = Object.fromEntries(
  FIXTURE_CATEGORIES.map((c) => [c.id, c.name]),
);

interface FixtureAssessmentItemRecord {
  id: string;
  classRecordId: string;
  categoryId: string;
  name: string;
  maxScore: number;
  createdAt: string;
}

/** Which fixture learners are eligible to be scored under each class
 * record -- a simplified stand-in for real section-membership +
 * grading-period-range resolution (see
 * `section_membership::roster_for_section_over_range`), not derived from
 * `FIXTURE_ROSTERS` above (a different concept: that one is daily
 * attendance marks, this one is scoring eligibility). */
const CLASS_RECORD_ROSTER_LEARNER_IDS: Record<string, string[]> = {
  "cr-not-started": ["l1", "l2"],
  "cr-partial": ["l1", "l2", "l3"],
  "cr-complete": ["l1", "l2", "l3"],
};

let nextItemId = 1;

/** Covers the three states a teacher can be in: nothing set up yet
 * (`cr-not-started`), items exist but scoring is incomplete
 * (`cr-partial` -- only one of two items has any recorded score, and
 * that item has only one of three learners scored), and everything
 * scored across every category including the Examinations sub-tests
 * (`cr-complete` -- lets "Show term grades" produce real numbers). */
const CLASS_RECORD_ITEMS: Record<string, FixtureAssessmentItemRecord[]> = {
  "cr-not-started": [],
  "cr-partial": [
    {
      id: "item-ww1",
      classRecordId: "cr-partial",
      categoryId: "cat-ww",
      name: "Quiz 1",
      maxScore: 20,
      createdAt: "2026-08-05T00:00:00.000Z",
    },
    {
      id: "item-pt1",
      classRecordId: "cr-partial",
      categoryId: "cat-pt",
      name: "Project 1",
      maxScore: 50,
      createdAt: "2026-08-10T00:00:00.000Z",
    },
  ],
  "cr-complete": [
    {
      id: "item-c-ww1",
      classRecordId: "cr-complete",
      categoryId: "cat-ww",
      name: "Quiz 1",
      maxScore: 20,
      createdAt: "2026-08-05T00:00:00.000Z",
    },
    {
      id: "item-c-pt1",
      classRecordId: "cr-complete",
      categoryId: "cat-pt",
      name: "Performance Task 1",
      maxScore: 25,
      createdAt: "2026-08-08T00:00:00.000Z",
    },
    {
      id: "item-c-st1",
      classRecordId: "cr-complete",
      categoryId: "cat-st1",
      name: "Summative Test 1",
      maxScore: 20,
      createdAt: "2026-08-12T00:00:00.000Z",
    },
    {
      id: "item-c-st2",
      classRecordId: "cr-complete",
      categoryId: "cat-st2",
      name: "Summative Test 2",
      maxScore: 20,
      createdAt: "2026-08-19T00:00:00.000Z",
    },
    {
      id: "item-c-te",
      classRecordId: "cr-complete",
      categoryId: "cat-te",
      name: "Term Examination",
      maxScore: 40,
      createdAt: "2026-08-26T00:00:00.000Z",
    },
  ],
};

interface FixtureLearnerScoreRecord {
  id: string;
  assessmentItemId: string;
  learnerId: string;
  status: LearnerScoreStatus;
  score: number | null;
  recordedAt: string;
  updatedAt: string;
}

let nextScoreSeq = 1;

function buildFullScoreSet(
  assessmentItemId: string,
  scoresByLearnerId: Record<string, number>,
): FixtureLearnerScoreRecord[] {
  return Object.entries(scoresByLearnerId).map(([learnerId, score]) => ({
    id: `score-seed-${nextScoreSeq++}`,
    assessmentItemId,
    learnerId,
    status: "scored",
    score,
    recordedAt: "2026-08-26T09:00:00.000Z",
    updatedAt: "2026-08-26T09:00:00.000Z",
  }));
}

/** `cr-partial`: only Ana's Quiz 1 scored so far -- the rest (Project 1
 * entirely, and Bo/Maria's Quiz 1) still needs entry, so the workspace's
 * "1 of 3 recorded" and the list's "2 items · 1 of 6 recorded" readouts
 * both have something real to show. `cr-complete`: every learner scored
 * on every item -- Ana does well throughout, Bo sits in the middle, Maria
 * scores low enough on every item to need the 60-point floor, so
 * "Show term grades" demonstrates a normal, a floored, and a
 * freshly-recomputed-after-edit grade all at once. */
const LEARNER_SCORES: FixtureLearnerScoreRecord[] = [
  {
    id: "score-seed-0",
    assessmentItemId: "item-ww1",
    learnerId: "l1",
    status: "scored",
    score: 18,
    recordedAt: "2026-08-06T08:00:00.000Z",
    updatedAt: "2026-08-06T08:00:00.000Z",
  },
  ...buildFullScoreSet("item-c-ww1", { l1: 19, l2: 14, l3: 2 }),
  ...buildFullScoreSet("item-c-pt1", { l1: 24, l2: 18, l3: 3 }),
  ...buildFullScoreSet("item-c-st1", { l1: 18, l2: 12, l3: 1 }),
  ...buildFullScoreSet("item-c-st2", { l1: 19, l2: 13, l3: 1 }),
  ...buildFullScoreSet("item-c-te", { l1: 38, l2: 24, l3: 3 }),
];

function findItem(
  assessmentItemId: string,
): { item: FixtureAssessmentItemRecord; classRecordId: string } | null {
  for (const [classRecordId, items] of Object.entries(CLASS_RECORD_ITEMS)) {
    const item = items.find((i) => i.id === assessmentItemId);
    if (item) return { item, classRecordId };
  }
  return null;
}

function toAssessmentItem(item: FixtureAssessmentItemRecord): AssessmentItem {
  return {
    id: item.id,
    schoolId: "fixture-school",
    classRecordId: item.classRecordId,
    categoryId: item.categoryId,
    name: item.name,
    maxScore: item.maxScore,
    createdAt: item.createdAt,
  };
}

interface ClassRecordSeed {
  id: string;
  sectionId: string;
  subjectId: string;
  gradingPeriodId: string;
  weightPolicyId: string;
  createdAt: string;
}

let classRecordSeeds: ClassRecordSeed[] = [
  {
    id: "cr-not-started",
    sectionId: "sec-not-started",
    subjectId: "sub-science",
    gradingPeriodId: "gp1",
    weightPolicyId: "wp-k10",
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "cr-partial",
    sectionId: "sec-partial",
    subjectId: "sub-math",
    gradingPeriodId: "gp1",
    weightPolicyId: "wp-k10",
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "cr-complete",
    sectionId: "sec-complete",
    subjectId: "sub-mapeh",
    gradingPeriodId: "gp1",
    weightPolicyId: "wp-mapeh",
    createdAt: "2026-08-01T00:00:00.000Z",
  },
];

function classRecordDetailFor(seed: ClassRecordSeed): ClassRecordDetail | null {
  const section = FIXTURE_SECTIONS.find((s) => s.id === seed.sectionId);
  const subject = allSubjects.find((s) => s.id === seed.subjectId);
  const period = (FIXTURE_GRADING_PERIODS[section?.schoolYear ?? ""] ?? []).find(
    (p) => p.id === seed.gradingPeriodId,
  );
  const policy = FIXTURE_WEIGHT_POLICIES.find((p) => p.id === seed.weightPolicyId);
  if (!section || !subject || !period || !policy) return null;

  const items = CLASS_RECORD_ITEMS[seed.id] ?? [];
  const itemIds = new Set(items.map((i) => i.id));
  const recordedCount = LEARNER_SCORES.filter((s) => itemIds.has(s.assessmentItemId)).length;
  const totalEligible = (CLASS_RECORD_ROSTER_LEARNER_IDS[seed.id] ?? []).length;

  return {
    id: seed.id,
    schoolId: "fixture-school",
    sectionId: section.id,
    sectionName: section.name,
    subjectId: subject.id,
    subjectName: subject.name,
    gradingPeriodId: period.id,
    gradingPeriodLabel: period.label,
    schoolYear: section.schoolYear,
    weightPolicyId: policy.id,
    weightPolicyName: policy.name,
    createdAt: seed.createdAt,
    itemCount: items.length,
    recordedCount,
    totalEligible,
  };
}

export class FixtureSubjectRepository implements SubjectRepository {
  async list(): Promise<Subject[]> {
    return allSubjects;
  }
  async create(name: string): Promise<Subject> {
    const subject: Subject = {
      id: `sub-fixture-${allSubjects.length + 1}`,
      schoolId: "fixture-school",
      name,
      createdAt: new Date().toISOString(),
    };
    allSubjects = [...allSubjects, subject];
    return subject;
  }
}

export class FixtureClassRecordRepository implements ClassRecordRepository {
  async list(): Promise<ClassRecordDetail[]> {
    return classRecordSeeds
      .map((seed) => classRecordDetailFor(seed))
      .filter((d): d is ClassRecordDetail => d !== null);
  }

  async create(
    sectionId: string,
    subjectId: string,
    gradingPeriodId: string,
    weightPolicyId: string,
  ): Promise<ClassRecord | null> {
    const section = FIXTURE_SECTIONS.find((s) => s.id === sectionId);
    const subjectExists = allSubjects.some((s) => s.id === subjectId);
    const policyExists = FIXTURE_WEIGHT_POLICIES.some((p) => p.id === weightPolicyId);
    if (!section || !subjectExists || !policyExists) return null;

    const id = `cr-fixture-${classRecordSeeds.length + 1}`;
    const createdAt = new Date().toISOString();
    classRecordSeeds = [
      ...classRecordSeeds,
      { id, sectionId, subjectId, gradingPeriodId, weightPolicyId, createdAt },
    ];
    // A newly opened class record starts with no items yet, but a real
    // (all three fixture learners) roster, so a teacher can actually add
    // items and score them in this fixture, not just see it listed.
    CLASS_RECORD_ITEMS[id] = [];
    CLASS_RECORD_ROSTER_LEARNER_IDS[id] = ["l1", "l2", "l3"];

    return {
      id,
      schoolId: "fixture-school",
      sectionId,
      subjectId,
      gradingPeriodId,
      weightPolicyId,
      createdAt,
    };
  }

  async listGradingWeightPolicies(): Promise<GradingWeightPolicy[]> {
    return FIXTURE_WEIGHT_POLICIES;
  }
}

export class FixtureAssessmentRepository implements AssessmentRepository {
  async listCategorySets(): Promise<AssessmentCategorySet[]> {
    return [FIXTURE_CATEGORY_SET];
  }

  async listCategoriesForSet(): Promise<AssessmentCategory[]> {
    return FIXTURE_CATEGORIES;
  }

  async listItemsByClassRecord(classRecordId: string): Promise<AssessmentItemDetail[]> {
    const items = CLASS_RECORD_ITEMS[classRecordId] ?? [];
    const totalEligible = (CLASS_RECORD_ROSTER_LEARNER_IDS[classRecordId] ?? []).length;
    return items.map((item) => ({
      id: item.id,
      schoolId: "fixture-school",
      classRecordId: item.classRecordId,
      categoryId: item.categoryId,
      categoryName: CATEGORY_NAME_BY_ID[item.categoryId] ?? "",
      name: item.name,
      maxScore: item.maxScore,
      createdAt: item.createdAt,
      recordedCount: LEARNER_SCORES.filter((s) => s.assessmentItemId === item.id).length,
      totalEligible,
    }));
  }

  async createItem(
    classRecordId: string,
    categoryId: string,
    name: string,
    maxScore: number,
  ): Promise<AssessmentItem | null> {
    const items = CLASS_RECORD_ITEMS[classRecordId];
    if (!items) return null;
    const id = `item-fixture-${nextItemId++}`;
    const record: FixtureAssessmentItemRecord = {
      id,
      classRecordId,
      categoryId,
      name,
      maxScore,
      createdAt: new Date().toISOString(),
    };
    CLASS_RECORD_ITEMS[classRecordId] = [...items, record];
    return toAssessmentItem(record);
  }

  async renameItem(id: string, name: string): Promise<AssessmentItem | null> {
    const found = findItem(id);
    if (!found) return null;
    found.item.name = name;
    return toAssessmentItem(found.item);
  }

  async updateItem(
    id: string,
    name: string,
    categoryId: string,
    maxScore: number,
  ): Promise<AssessmentItem | null> {
    const found = findItem(id);
    if (!found) return null;
    const hasScores = LEARNER_SCORES.some((s) => s.assessmentItemId === id);
    if (hasScores) return null;
    found.item.name = name;
    found.item.categoryId = categoryId;
    found.item.maxScore = maxScore;
    return toAssessmentItem(found.item);
  }

  async deleteItem(id: string): Promise<boolean> {
    const found = findItem(id);
    if (!found) return false;
    const hasScores = LEARNER_SCORES.some((s) => s.assessmentItemId === id);
    if (hasScores) return false;
    CLASS_RECORD_ITEMS[found.classRecordId] = (
      CLASS_RECORD_ITEMS[found.classRecordId] ?? []
    ).filter((i) => i.id !== id);
    return true;
  }
}

export class FixtureLearnerScoreRepository implements LearnerScoreRepository {
  async rosterForItem(assessmentItemId: string): Promise<LearnerScoreRosterEntry[] | null> {
    const found = findItem(assessmentItemId);
    if (!found) return null;
    const learnerIds = CLASS_RECORD_ROSTER_LEARNER_IDS[found.classRecordId] ?? [];
    return learnerIds.map((learnerId) => {
      const learner = FIXTURE_LEARNERS.find((l) => l.id === learnerId);
      const score = LEARNER_SCORES.find(
        (s) => s.assessmentItemId === assessmentItemId && s.learnerId === learnerId,
      );
      return {
        learnerId,
        givenName: learner?.givenName ?? "",
        familyName: learner?.familyName ?? "",
        status: score?.status ?? null,
        score: score?.score ?? null,
        updatedAt: score?.updatedAt ?? null,
      };
    });
  }

  async record(
    assessmentItemId: string,
    learnerId: string,
    status: LearnerScoreStatus,
    score: number | null,
  ): Promise<LearnerScore | null> {
    const found = findItem(assessmentItemId);
    if (!found) return null;
    const eligibleIds = CLASS_RECORD_ROSTER_LEARNER_IDS[found.classRecordId] ?? [];
    if (!eligibleIds.includes(learnerId)) return null;

    const now = new Date().toISOString();
    const existingIndex = LEARNER_SCORES.findIndex(
      (s) => s.assessmentItemId === assessmentItemId && s.learnerId === learnerId,
    );
    const existing = existingIndex === -1 ? null : LEARNER_SCORES[existingIndex];
    const updated: FixtureLearnerScoreRecord = {
      id: existing?.id ?? `score-fixture-${nextScoreSeq++}`,
      assessmentItemId,
      learnerId,
      status,
      score,
      recordedAt: existing?.recordedAt ?? now,
      updatedAt: now,
    };
    if (existingIndex === -1) {
      LEARNER_SCORES.push(updated);
    } else {
      LEARNER_SCORES[existingIndex] = updated;
    }

    return {
      id: updated.id,
      schoolId: "fixture-school",
      assessmentItemId,
      learnerId,
      status,
      score,
      recordedByUserId: "fixture-user",
      recordedAt: updated.recordedAt,
      updatedAt: updated.updatedAt,
    };
  }

  /** A simplified stand-in for visual testing only -- this is NOT the
   * real DepEd weighted algorithm (that lives in Rust; see
   * `grading_computation.rs` and ADR-0013). Unweighted average
   * percentage across every item this learner has an actual `Scored`
   * entry for in this class record; `null` if none yet, matching the
   * real algorithm's "never fabricate a grade from nothing" rule at
   * least at the whole-class-record level (though not its per-category
   * completeness rule -- not worth reproducing exactly for a visual
   * fixture). */
  async computeTermGrade(
    classRecordId: string,
    learnerId: string,
  ): Promise<ComputedTermGrade | null> {
    const items = CLASS_RECORD_ITEMS[classRecordId] ?? [];
    const percentages: number[] = [];
    for (const item of items) {
      const s = LEARNER_SCORES.find(
        (s) => s.assessmentItemId === item.id && s.learnerId === learnerId && s.status === "scored",
      );
      if (s && s.score !== null && item.maxScore > 0) {
        percentages.push((s.score / item.maxScore) * 100);
      }
    }
    if (percentages.length === 0) return null;

    const initialGrade = percentages.reduce((a, b) => a + b, 0) / percentages.length;
    const termGrade = Math.max(60, Math.round(initialGrade));
    return {
      initialGrade,
      termGrade,
      wasTransmuted: false,
      wasFloored: termGrade === 60 && initialGrade < 60,
    };
  }
}

const FIXTURE_SCHOOL_MEMBERS: SchoolMember[] = [
  { id: "teacher-ana", username: "ana.cruz", displayName: "Ana Cruz", roles: ["teacher"] },
  {
    id: "teacher-bayani",
    username: "bayani.reyes",
    displayName: "Bayani Reyes",
    roles: ["teacher"],
  },
  {
    id: "head-corazon",
    username: "corazon.santos",
    displayName: "Corazon Santos",
    roles: ["school_head"],
  },
];

export class FixtureSchoolMemberRepository implements SchoolMemberRepository {
  async listMembers(): Promise<SchoolMember[]> {
    return FIXTURE_SCHOOL_MEMBERS;
  }

  async resetPassword(targetUserId: string): Promise<boolean> {
    return FIXTURE_SCHOOL_MEMBERS.some((member) => member.id === targetUserId);
  }

  async removeMember(targetUserId: string): Promise<boolean> {
    return FIXTURE_SCHOOL_MEMBERS.some((member) => member.id === targetUserId);
  }

  async grantRole(targetUserId: string): Promise<boolean> {
    return FIXTURE_SCHOOL_MEMBERS.some((member) => member.id === targetUserId);
  }

  async revokeRole(targetUserId: string): Promise<boolean> {
    return FIXTURE_SCHOOL_MEMBERS.some((member) => member.id === targetUserId);
  }
}

/** In-memory-only advisory state for `sec-not-started` (Wave 3G's own
 * screen), seeded with one already-active advisory so both the
 * "current adviser / end advisory" state and, after ending it, the
 * "no adviser / assign" state are both reachable in one fixture --
 * mutated by `assign()`/`end()` so a School Head can genuinely walk
 * the full end-then-reassign cycle, never persisted, never touches
 * Tauri/SQLite. */
export class FixtureSectionAdvisoryRepository implements SectionAdvisoryRepository {
  private advisory: SectionAdvisory | null = {
    id: "adv-1",
    schoolId: "fixture-school",
    sectionId: "sec-not-started",
    teacherUserId: "teacher-ana",
    startsOn: "2026-06-01",
    endsOn: null,
    createdAt: "2026-06-01T00:00:00.000Z",
  };

  async currentAdviser(sectionId: string): Promise<SectionAdvisory | null> {
    if (this.advisory && this.advisory.sectionId === sectionId) return this.advisory;
    return null;
  }

  async assign(
    sectionId: string,
    teacherUserId: string,
    startsOn: string,
  ): Promise<AssignAdviserOutcome> {
    if (this.advisory && this.advisory.sectionId === sectionId) {
      return { kind: "alreadyHasAnActiveAdviser" };
    }
    const advisory: SectionAdvisory = {
      id: `adv-${Date.now()}`,
      schoolId: "fixture-school",
      sectionId,
      teacherUserId,
      startsOn,
      endsOn: null,
      createdAt: new Date().toISOString(),
    };
    this.advisory = advisory;
    return { kind: "assigned", advisory };
  }

  async end(sectionId: string, advisoryId: string, endsOn: string): Promise<EndAdvisoryOutcome> {
    if (
      !this.advisory ||
      this.advisory.id !== advisoryId ||
      this.advisory.sectionId !== sectionId
    ) {
      return { kind: "notFound" };
    }
    const ended: SectionAdvisory = { ...this.advisory, endsOn };
    this.advisory = null;
    return { kind: "ended", advisory: ended };
  }
}

/*
 * ==== Teaching Assignments / Class Schedule / Teacher Load / Subject
 * Attendance / Subject Monitor / Adviser View ====
 *
 * A third slice of shared in-memory state, seeded consistently with the
 * fixtures above: `teacher-ana` (already `FIXTURE_SCHOOL_MEMBERS`'
 * adviser of `sec-not-started`, per `FixtureSectionAdvisoryRepository`)
 * teaches two assignments, `teacher-bayani` teaches a third with no
 * schedule yet -- so Teacher Load, Teaching Assignments, Class
 * Schedule, Subject Attendance, Subject Monitor, and Adviser View all
 * have real, mutually-consistent synthetic data to render, exactly the
 * same "read-only where unwired, genuinely mutable where a teacher would
 * actually interact" convention every fixture above already follows.
 */

interface TeachingAssignmentSeed {
  id: string;
  teacherUserId: string;
  sectionId: string;
  subjectId: string;
}

let TEACHING_ASSIGNMENTS: TeachingAssignmentSeed[] = [
  { id: "ta-1", teacherUserId: "teacher-ana", sectionId: "sec-not-started", subjectId: "sub-math" },
  {
    id: "ta-2",
    teacherUserId: "teacher-ana",
    sectionId: "sec-partial",
    subjectId: "sub-science",
  },
  {
    id: "ta-3",
    teacherUserId: "teacher-bayani",
    sectionId: "sec-complete",
    subjectId: "sub-mapeh",
  },
];

let SCHEDULE_MEETINGS: ScheduleMeeting[] = [
  {
    id: "meet-1",
    teachingAssignmentId: "ta-1",
    weekday: 1,
    startsAt: "08:00",
    endsAt: "09:00",
    room: "Room 1",
  },
  {
    id: "meet-2",
    teachingAssignmentId: "ta-1",
    weekday: 3,
    startsAt: "08:00",
    endsAt: "09:00",
    room: "Room 1",
  },
  {
    id: "meet-3",
    teachingAssignmentId: "ta-2",
    weekday: 2,
    startsAt: "09:00",
    endsAt: "10:00",
    room: "Room 2",
  },
  // ta-3 deliberately has no meetings yet -- covers Teacher Load's
  // "0 weekly instructional minutes" state and Class Schedule's empty
  // state, both real product states, not oversights.
];

let nextAssignmentId = TEACHING_ASSIGNMENTS.length + 1;
let nextMeetingId = SCHEDULE_MEETINGS.length + 1;

function teachingAssignmentDetailFor(
  seed: TeachingAssignmentSeed,
): TeachingAssignmentDetail | null {
  const section = FIXTURE_SECTIONS.find((s) => s.id === seed.sectionId);
  const subject = allSubjects.find((s) => s.id === seed.subjectId);
  if (!section || !subject) return null;
  return {
    id: seed.id,
    teacherUserId: seed.teacherUserId,
    sectionId: section.id,
    sectionName: section.name,
    schoolYear: section.schoolYear,
    subjectId: subject.id,
    subjectName: subject.name,
  };
}

function teachingAssignmentSummaryFor(
  seed: TeachingAssignmentSeed,
): TeachingAssignmentSummary | null {
  const detail = teachingAssignmentDetailFor(seed);
  if (!detail) return null;
  return {
    id: detail.id,
    sectionId: detail.sectionId,
    sectionName: detail.sectionName,
    schoolYear: detail.schoolYear,
    subjectId: detail.subjectId,
    subjectName: detail.subjectName,
  };
}

export class FixtureTeachingAssignmentRepository implements TeachingAssignmentRepository {
  async listMine(teacherUserId: string): Promise<TeachingAssignmentSummary[]> {
    return TEACHING_ASSIGNMENTS.filter((a) => a.teacherUserId === teacherUserId)
      .map(teachingAssignmentSummaryFor)
      .filter((s): s is TeachingAssignmentSummary => s !== null);
  }

  async listMeetings(teachingAssignmentId: string): Promise<ScheduleMeeting[]> {
    return SCHEDULE_MEETINGS.filter((m) => m.teachingAssignmentId === teachingAssignmentId);
  }

  async listBySection(sectionId: string): Promise<TeachingAssignmentDetail[]> {
    return TEACHING_ASSIGNMENTS.filter((a) => a.sectionId === sectionId)
      .map(teachingAssignmentDetailFor)
      .filter((d): d is TeachingAssignmentDetail => d !== null);
  }

  async create(
    teacherUserId: string,
    sectionId: string,
    subjectId: string,
  ): Promise<TeachingAssignment | null> {
    const section = FIXTURE_SECTIONS.find((s) => s.id === sectionId);
    const subjectExists = allSubjects.some((s) => s.id === subjectId);
    const teacherExists = FIXTURE_SCHOOL_MEMBERS.some((m) => m.id === teacherUserId);
    if (!section || !subjectExists || !teacherExists) return null;
    const alreadyAssigned = TEACHING_ASSIGNMENTS.some(
      (a) => a.sectionId === sectionId && a.subjectId === subjectId,
    );
    if (alreadyAssigned) return null;
    const id = `ta-fixture-${nextAssignmentId++}`;
    TEACHING_ASSIGNMENTS = [...TEACHING_ASSIGNMENTS, { id, teacherUserId, sectionId, subjectId }];
    return { id, teacherUserId, sectionId, subjectId };
  }

  async remove(id: string): Promise<boolean> {
    const existed = TEACHING_ASSIGNMENTS.some((a) => a.id === id);
    if (!existed) return false;
    TEACHING_ASSIGNMENTS = TEACHING_ASSIGNMENTS.filter((a) => a.id !== id);
    SCHEDULE_MEETINGS = SCHEDULE_MEETINGS.filter((m) => m.teachingAssignmentId !== id);
    return true;
  }

  async createMeeting(
    teachingAssignmentId: string,
    weekday: number,
    startsAt: string,
    endsAt: string,
    room: string | null,
  ): Promise<CreateMeetingOutcome> {
    const assignment = TEACHING_ASSIGNMENTS.find((a) => a.id === teachingAssignmentId);
    if (!assignment) return { outcome: "unknownAssignment" };
    if (weekday < 0 || weekday > 6) return { outcome: "invalidWeekday" };
    if (startsAt >= endsAt) return { outcome: "invalidTime" };
    const overlaps = (a: ScheduleMeeting, b: ScheduleMeeting) =>
      a.weekday === b.weekday && a.startsAt < b.endsAt && b.startsAt < a.endsAt;
    const candidate: ScheduleMeeting = {
      id: "",
      teachingAssignmentId,
      weekday,
      startsAt,
      endsAt,
      room,
    };
    for (const existing of SCHEDULE_MEETINGS) {
      if (!overlaps(existing, candidate)) continue;
      if (
        existing.teachingAssignmentId === teachingAssignmentId &&
        existing.startsAt === startsAt &&
        existing.endsAt === endsAt &&
        existing.room === room
      ) {
        return { outcome: "duplicate" };
      }
      const existingAssignment = TEACHING_ASSIGNMENTS.find(
        (a) => a.id === existing.teachingAssignmentId,
      );
      if (existingAssignment?.teacherUserId === assignment.teacherUserId) {
        return { outcome: "teacherConflict" };
      }
      if (existingAssignment?.sectionId === assignment.sectionId) {
        return { outcome: "sectionConflict" };
      }
      if (room !== null && existing.room === room) {
        return { outcome: "roomConflict" };
      }
    }
    const meeting: ScheduleMeeting = { ...candidate, id: `meet-fixture-${nextMeetingId++}` };
    SCHEDULE_MEETINGS = [...SCHEDULE_MEETINGS, meeting];
    return { outcome: "created", meeting };
  }

  async removeMeeting(id: string): Promise<boolean> {
    const existed = SCHEDULE_MEETINGS.some((m) => m.id === id);
    if (!existed) return false;
    SCHEDULE_MEETINGS = SCHEDULE_MEETINGS.filter((m) => m.id !== id);
    return true;
  }

  async getLoad(teacherUserId: string): Promise<TeacherLoad> {
    const assignments = TEACHING_ASSIGNMENTS.filter((a) => a.teacherUserId === teacherUserId);
    const distinctSubjectCount = new Set(assignments.map((a) => a.subjectId)).size;
    const weeklyInstructionalMinutes = SCHEDULE_MEETINGS.filter((m) =>
      assignments.some((a) => a.id === m.teachingAssignmentId),
    ).reduce((total, m) => {
      const [sh = 0, sm = 0] = m.startsAt.split(":").map(Number);
      const [eh = 0, em = 0] = m.endsAt.split(":").map(Number);
      return total + (eh * 60 + em - (sh * 60 + sm));
    }, 0);
    return {
      assignmentCount: assignments.length,
      distinctSubjectCount,
      weeklyInstructionalMinutes,
    };
  }
}

/** Which fixture learners are enrolled, roster-membership-id-keyed, per
 * section -- reuses `l1`/`l2`/`l3` as both learner id and membership id
 * (a simplification also used elsewhere in this file), matching each
 * section's `FIXTURE_ROSTERS` composition above. */
const SECTION_MEMBERSHIP_IDS: Record<string, string[]> = {
  "sec-not-started": ["l1", "l2"],
  "sec-partial": ["l1", "l2", "l3"],
  "sec-complete": ["l3"],
};

function learnerName(learnerId: string): { givenName: string; familyName: string } {
  const learner = FIXTURE_LEARNERS.find((l) => l.id === learnerId);
  return { givenName: learner?.givenName ?? "", familyName: learner?.familyName ?? "" };
}

interface SubjectAttendanceSessionSeed {
  session: SubjectAttendanceSession;
  entries: Map<string, EntryStatus>;
}

let nextSessionSeq = 1;
let nextEntrySeq = 1;

/** `ta-1` (Mabini/Mathematics): two held sessions so Subject Monitor has
 * a real consecutive-absence streak to show for Bayani (absent both
 * times) while Ana stays present -- and a `no_class` day so Subject
 * Attendance's own no-class state is reachable too. `ta-2`/`ta-3` start
 * with no sessions at all, covering the "never opened yet" state. */
const SUBJECT_ATTENDANCE_SESSIONS: Record<string, SubjectAttendanceSessionSeed[]> = {
  "ta-1": [
    {
      session: {
        id: "sa-session-1",
        schoolId: "fixture-school",
        teachingAssignmentId: "ta-1",
        sectionId: "sec-not-started",
        subjectId: "sub-math",
        sessionDate: "2026-08-03",
        status: "held",
        createdByUserId: "teacher-ana",
        createdAt: "2026-08-03T08:00:00.000Z",
        updatedAt: "2026-08-03T08:00:00.000Z",
      },
      entries: new Map([
        ["l1", "present"],
        ["l2", "absent"],
      ]),
    },
    {
      session: {
        id: "sa-session-2",
        schoolId: "fixture-school",
        teachingAssignmentId: "ta-1",
        sectionId: "sec-not-started",
        subjectId: "sub-math",
        sessionDate: "2026-08-04",
        status: "no_class",
        createdByUserId: "teacher-ana",
        createdAt: "2026-08-04T08:00:00.000Z",
        updatedAt: "2026-08-04T08:00:00.000Z",
      },
      entries: new Map(),
    },
    {
      session: {
        id: "sa-session-3",
        schoolId: "fixture-school",
        teachingAssignmentId: "ta-1",
        sectionId: "sec-not-started",
        subjectId: "sub-math",
        sessionDate: "2026-08-05",
        status: "held",
        createdByUserId: "teacher-ana",
        createdAt: "2026-08-05T08:00:00.000Z",
        updatedAt: "2026-08-05T08:00:00.000Z",
      },
      entries: new Map([
        ["l1", "present"],
        ["l2", "absent"],
      ]),
    },
  ],
  "ta-2": [],
  "ta-3": [],
};

function findSession(
  teachingAssignmentId: string,
  sessionId: string,
): SubjectAttendanceSessionSeed | null {
  const seeds = SUBJECT_ATTENDANCE_SESSIONS[teachingAssignmentId] ?? [];
  return seeds.find((s) => s.session.id === sessionId) ?? null;
}

function rosterRowsFor(seed: SubjectAttendanceSessionSeed): SubjectAttendanceRosterRow[] {
  const membershipIds = SECTION_MEMBERSHIP_IDS[seed.session.sectionId] ?? [];
  return membershipIds.map((membershipId) => {
    const { givenName, familyName } = learnerName(membershipId);
    return {
      membershipId,
      learnerId: membershipId,
      givenName,
      familyName,
      entryStatus: seed.entries.get(membershipId) ?? null,
    };
  });
}

export class FixtureSubjectAttendanceRepository implements SubjectAttendanceRepository {
  async openSession(
    teachingAssignmentId: string,
    sessionDate: string,
  ): Promise<SubjectAttendanceSession | null> {
    const assignment = TEACHING_ASSIGNMENTS.find((a) => a.id === teachingAssignmentId);
    if (!assignment) return null;
    const existing = (SUBJECT_ATTENDANCE_SESSIONS[teachingAssignmentId] ?? []).find(
      (s) => s.session.sessionDate === sessionDate,
    );
    if (existing) return existing.session;
    const now = new Date().toISOString();
    const session: SubjectAttendanceSession = {
      id: `sa-session-fixture-${nextSessionSeq++}`,
      schoolId: "fixture-school",
      teachingAssignmentId,
      sectionId: assignment.sectionId,
      subjectId: assignment.subjectId,
      sessionDate,
      status: "held",
      createdByUserId: assignment.teacherUserId,
      createdAt: now,
      updatedAt: now,
    };
    SUBJECT_ATTENDANCE_SESSIONS[teachingAssignmentId] = [
      ...(SUBJECT_ATTENDANCE_SESSIONS[teachingAssignmentId] ?? []),
      { session, entries: new Map() },
    ];
    return session;
  }

  async markNoClass(
    teachingAssignmentId: string,
    sessionDate: string,
  ): Promise<SubjectAttendanceSession | null> {
    const assignment = TEACHING_ASSIGNMENTS.find((a) => a.id === teachingAssignmentId);
    if (!assignment) return null;
    const seeds = SUBJECT_ATTENDANCE_SESSIONS[teachingAssignmentId] ?? [];
    const existing = seeds.find((s) => s.session.sessionDate === sessionDate);
    const now = new Date().toISOString();
    if (existing) {
      existing.session = { ...existing.session, status: "no_class", updatedAt: now };
      return existing.session;
    }
    const session: SubjectAttendanceSession = {
      id: `sa-session-fixture-${nextSessionSeq++}`,
      schoolId: "fixture-school",
      teachingAssignmentId,
      sectionId: assignment.sectionId,
      subjectId: assignment.subjectId,
      sessionDate,
      status: "no_class",
      createdByUserId: assignment.teacherUserId,
      createdAt: now,
      updatedAt: now,
    };
    SUBJECT_ATTENDANCE_SESSIONS[teachingAssignmentId] = [...seeds, { session, entries: new Map() }];
    return session;
  }

  async recordEntry(
    teachingAssignmentId: string,
    sessionId: string,
    membershipId: string,
    status: EntryStatus,
  ): Promise<RecordEntryOutcome> {
    const found = findSession(teachingAssignmentId, sessionId);
    if (!found) return { kind: "sessionNotFound" };
    if (found.session.status === "no_class") return { kind: "sessionIsNoClass" };
    const membershipIds = SECTION_MEMBERSHIP_IDS[found.session.sectionId] ?? [];
    if (!membershipIds.includes(membershipId)) return { kind: "membershipNotInSession" };
    found.entries.set(membershipId, status);
    return {
      kind: "recorded",
      entry: {
        id: `sa-entry-fixture-${nextEntrySeq++}`,
        sessionId,
        membershipId,
        learnerId: membershipId,
        status,
        note: null,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  async markAllPresent(
    teachingAssignmentId: string,
    sessionId: string,
  ): Promise<SubjectAttendanceRosterRow[] | null> {
    const found = findSession(teachingAssignmentId, sessionId);
    if (!found || found.session.status === "no_class") return null;
    for (const membershipId of SECTION_MEMBERSHIP_IDS[found.session.sectionId] ?? []) {
      if (!found.entries.has(membershipId)) found.entries.set(membershipId, "present");
    }
    return rosterRowsFor(found);
  }

  async rosterForSession(
    teachingAssignmentId: string,
    sessionId: string,
  ): Promise<SubjectAttendanceRosterRow[] | null> {
    const found = findSession(teachingAssignmentId, sessionId);
    if (!found) return null;
    return rosterRowsFor(found);
  }

  async listSessions(teachingAssignmentId: string): Promise<SubjectAttendanceSession[]> {
    return (SUBJECT_ATTENDANCE_SESSIONS[teachingAssignmentId] ?? []).map((s) => s.session);
  }

  async monitor(
    teachingAssignmentId: string,
    asOfDate: string,
  ): Promise<SubjectAttendanceMonitor | null> {
    const assignment = TEACHING_ASSIGNMENTS.find((a) => a.id === teachingAssignmentId);
    if (!assignment) return null;
    const seeds = (SUBJECT_ATTENDANCE_SESSIONS[teachingAssignmentId] ?? [])
      .filter((s) => s.session.sessionDate <= asOfDate)
      .sort((a, b) => a.session.sessionDate.localeCompare(b.session.sessionDate));
    const heldSeeds = seeds.filter((s) => s.session.status === "held");
    const membershipIds = SECTION_MEMBERSHIP_IDS[assignment.sectionId] ?? [];
    const rows: SubjectAttendanceMonitorRow[] = membershipIds.map((membershipId) => {
      const { givenName, familyName } = learnerName(membershipId);
      let presentCount = 0;
      let absentCount = 0;
      let lateCount = 0;
      let excusedCount = 0;
      let currentConsecutiveAbsences = 0;
      let streakBroken = false;
      for (let i = heldSeeds.length - 1; i >= 0; i--) {
        const status = heldSeeds[i]?.entries.get(membershipId) ?? null;
        if (status === "present") presentCount++;
        else if (status === "absent") absentCount++;
        else if (status === "late") lateCount++;
        else if (status === "excused") excusedCount++;
        if (!streakBroken) {
          if (status === "absent") currentConsecutiveAbsences++;
          else streakBroken = true;
        }
      }
      return {
        membershipId,
        learnerId: membershipId,
        givenName,
        familyName,
        presentCount,
        absentCount,
        lateCount,
        excusedCount,
        currentConsecutiveAbsences,
      };
    });
    return { heldSessionCount: heldSeeds.length, rows };
  }

  async listAdviserViewSections(): Promise<Section[]> {
    // The fixture's sole seeded advisory (see
    // `FixtureSectionAdvisoryRepository`) covers `sec-not-started` --
    // Adviser View shows only that section, matching the real backend's
    // "sections you currently advise" scope.
    return FIXTURE_SECTIONS.filter((s) => s.id === "sec-not-started");
  }

  async adviserOverview(
    sectionId: string,
    asOfDate: string,
  ): Promise<AdviserAttendanceOverview | null> {
    const section = FIXTURE_SECTIONS.find((s) => s.id === sectionId);
    if (!section) return null;
    const assignments = TEACHING_ASSIGNMENTS.filter((a) => a.sectionId === sectionId);
    const membershipIds = SECTION_MEMBERSHIP_IDS[sectionId] ?? [];
    let heldSessionCount = 0;
    const rows = membershipIds.map((membershipId) => {
      const { givenName, familyName } = learnerName(membershipId);
      let presentCount = 0;
      let absentCount = 0;
      let lateCount = 0;
      let excusedCount = 0;
      const subjectsWithAbsences = new Set<string>();
      let highestCurrentSubjectAbsenceStreak = 0;
      for (const assignment of assignments) {
        const seeds = (SUBJECT_ATTENDANCE_SESSIONS[assignment.id] ?? [])
          .filter((s) => s.session.status === "held" && s.session.sessionDate <= asOfDate)
          .sort((a, b) => a.session.sessionDate.localeCompare(b.session.sessionDate));
        if (assignment === assignments[0]) heldSessionCount += seeds.length;
        let streak = 0;
        let streakBroken = false;
        for (let i = seeds.length - 1; i >= 0; i--) {
          const status = seeds[i]?.entries.get(membershipId) ?? null;
          if (status === "present") presentCount++;
          else if (status === "absent") {
            absentCount++;
            subjectsWithAbsences.add(assignment.subjectId);
          } else if (status === "late") lateCount++;
          else if (status === "excused") excusedCount++;
          if (!streakBroken) {
            if (status === "absent") streak++;
            else streakBroken = true;
          }
        }
        highestCurrentSubjectAbsenceStreak = Math.max(highestCurrentSubjectAbsenceStreak, streak);
      }
      return {
        membershipId,
        learnerId: membershipId,
        givenName,
        familyName,
        presentCount,
        absentCount,
        lateCount,
        excusedCount,
        subjectsWithAbsences: Array.from(subjectsWithAbsences).map(
          (subjectId) => allSubjects.find((s) => s.id === subjectId)?.name ?? subjectId,
        ),
        highestCurrentSubjectAbsenceStreak,
      };
    });
    return {
      sectionId: section.id,
      sectionName: section.name,
      schoolYear: section.schoolYear,
      asOfDate,
      subjectCount: assignments.length,
      heldSessionCount,
      rows,
    };
  }
}

/** This device's sync status for the dev preview. A "waiting to sync"
 * state so `TeacherHome`'s "Your device" zone renders something
 * meaningful. No network, no Tauri -- a plain object. */
export class FixtureSyncStatusRepository implements SyncStatusRepository {
  async getStatus(): Promise<SyncStatus> {
    return {
      enrolled: true,
      lastPullAt: null,
      pendingChangeCount: 2,
      hasPendingSyncTrouble: false,
      openConflictCount: 0,
    };
  }
}
