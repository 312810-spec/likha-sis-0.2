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
 * plain `CurrentSession`-shaped object passed as a prop to `AppShell`
 * for display purposes -- the exact same thing this app's own test
 * suite already does in every screen's `.test.tsx` file. No
 * `SessionManager`, no Rust `auth::login`, no persisted `sessions`
 * table row, no Tauri IPC call of any kind is ever made from this file
 * or anything it constructs.
 */
import type { AttendanceRepository } from "../domain/ports/attendance-repository";
import type { AuthRepository } from "../domain/ports/auth-repository";
import type { ExportRepository } from "../domain/ports/export-repository";
import type { GradingRepository } from "../domain/ports/grading-repository";
import type { LearnerRepository } from "../domain/ports/learner-repository";
import type { SectionRepository } from "../domain/ports/section-repository";
import type {
  AttendanceRecord,
  AttendanceRosterEntry,
  AttendanceStatus,
  MonthlyAttendanceReport,
  MonthlyLearnerAttendance,
} from "../domain/attendance";
import type {
  LearnerRosterExportResult,
  ReportCardExportResult,
  Sf2ExportResult,
} from "../domain/export";
import type { GradingPeriod, GradingPolicy, GradingPolicyPeriod } from "../domain/grading";
import type { Learner } from "../domain/learner";
import type { Section, SectionMembership, SectionRosterMember } from "../domain/section";
import type { AuditLogEntry, CurrentSession } from "../domain/session";

/** A plain data object, not a real session -- see this file's own doc
 * comment. Rendered only as a prop to `AppShell`/`TeacherWorkspaceScreen`
 * for display, never passed through any authentication code path. */
export const FIXTURE_SESSION: CurrentSession = {
  userId: "fixture-user",
  username: "juan.delacruz",
  displayName: "Juan Dela Cruz (Synthetic)",
  schoolId: "fixture-school",
  schoolName: "Bagong Pag-Asa Elementary School (Synthetic)",
  expiresAtUnixMs: Date.now() + 8 * 60 * 60_000,
  idleExpiresAtUnixMs: Date.now() + 30 * 60_000,
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

  async exportClassRecordReportCard(): Promise<ReportCardExportResult | null> {
    throw new Error(
      "dev-preview fixture: exportClassRecordReportCard() is not wired -- read-only fixture",
    );
  }

  async exportLearnerRoster(): Promise<LearnerRosterExportResult | null> {
    throw new Error("dev-preview fixture: exportLearnerRoster() is not wired -- read-only fixture");
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
