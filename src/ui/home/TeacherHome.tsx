import { useEffect, useState } from "react";
import type { AttendanceApplicationService } from "../../application/attendance-service";
import type { AuthApplicationService } from "../../application/auth-service";
import type { GradingApplicationService } from "../../application/grading-service";
import type { SectionApplicationService } from "../../application/section-service";
import type { SubjectAttendanceApplicationService } from "../../application/subject-attendance-service";
import type { SyncStatusApplicationService } from "../../application/sync-status-service";
import type { GradingPeriod } from "../../domain/grading";
import type { Section } from "../../domain/section";
import type { AuditLogEntry } from "../../domain/session";
import { Alert } from "../components/Alert";
import { EmptyState } from "../components/EmptyState";
import { Loading } from "../components/Loading";
import { Page } from "../components/Page";
import { StatusChip, type StatusChipTone } from "../components/StatusChip";
import { PERSISTENCE_STATUS, type PersistenceState } from "../components/persistence-status";
import { useTeacherMode } from "../theme/useTeacherMode";
import {
  todaysClassesForTeacher,
  type TodaysClassOccurrence,
  type TodaysClassStatus,
} from "./todays-classes";

/** @public — props are supplied by `HomeScreen`, which is the only
 * caller; consumed structurally, not imported by name elsewhere. */
export interface TeacherHomeProps {
  displayName: string;
  username: string;
  teacherUserId: string;
  attendanceService: AttendanceApplicationService;
  authService: AuthApplicationService;
  gradingService: GradingApplicationService;
  sectionService: SectionApplicationService;
  subjectAttendanceService: SubjectAttendanceApplicationService;
  syncStatusService: SyncStatusApplicationService;
  onOpenAttendance: (sectionId: string) => void;
  onOpenSubjectAttendance: (teachingAssignmentId: string) => void;
  onManageSections: () => void;
  onOpenClassRecords: () => void;
  onViewSyncStatus: () => void;
}

// ---- Zone 1: "what needs you today" -----------------------------------

type HomeroomState = "not-started" | "partial" | "complete" | "no-learners";

function homeroomState(marked: number, total: number): HomeroomState {
  if (total === 0) return "no-learners";
  if (marked === 0) return "not-started";
  if (marked < total) return "partial";
  return "complete";
}

type Duty =
  | { kind: "homeroom"; key: string; section: Section; marked: number; total: number }
  | { kind: "subject"; key: string; occ: TodaysClassOccurrence };

/** Urgency rank shared across both duty kinds — the thing a teacher most
 * needs to act on sorts first. Not-yet-started work (homeroom
 * "not-started", subject "not_checked") is most urgent; partly-done work
 * next; finished work sinks; a section with no learners / a class marked
 * "no class" has no task and sorts last. Ties break by time (subject) or
 * section name (homeroom) so the order is deterministic, not fetch-order. */
const HOMEROOM_RANK: Record<HomeroomState, number> = {
  "not-started": 0,
  partial: 2,
  complete: 4,
  "no-learners": 5,
};
const SUBJECT_RANK: Record<TodaysClassStatus, number> = {
  not_checked: 1,
  held: 4,
  no_class: 5,
};

function dutyRank(duty: Duty): number {
  return duty.kind === "homeroom"
    ? HOMEROOM_RANK[homeroomState(duty.marked, duty.total)]
    : SUBJECT_RANK[duty.occ.status];
}

function dutyTiebreak(duty: Duty): string {
  return duty.kind === "homeroom" ? `1:${duty.section.name}` : `0:${duty.occ.startsAt}`;
}

function sortDuties(duties: Duty[]): Duty[] {
  return [...duties].sort((a, b) => {
    const r = dutyRank(a) - dutyRank(b);
    return r !== 0 ? r : dutyTiebreak(a).localeCompare(dutyTiebreak(b));
  });
}

const HOMEROOM_CHIP: Record<
  HomeroomState,
  { tone: StatusChipTone; label: (m: number, t: number) => string }
> = {
  "not-started": { tone: "warning", label: () => "not yet marked today" },
  partial: { tone: "productive", label: (m, t) => `${m} of ${t} marked` },
  complete: { tone: "success", label: (_m, t) => `all ${t} marked` },
  "no-learners": { tone: "neutral", label: () => "no learners enrolled" },
};
const SUBJECT_CHIP: Record<TodaysClassStatus, { tone: StatusChipTone; label: string }> = {
  not_checked: { tone: "warning", label: "not checked" },
  held: { tone: "success", label: "checked" },
  no_class: { tone: "neutral", label: "no class today" },
};

// ---- Zone 3 + account line ------------------------------------------------

function deviceState(status: {
  enrolled: boolean;
  openConflictCount: number;
  hasPendingSyncTrouble: boolean;
  pendingChangeCount: number;
}): PersistenceState {
  if (!status.enrolled) return "offline";
  if (status.openConflictCount > 0) return "conflict";
  if (status.hasPendingSyncTrouble) return "failed";
  if (status.pendingChangeCount > 0) return "pending-sync";
  return "synced";
}

const DEVICE_SENTENCE: Record<PersistenceState, string> = {
  synced: "All your changes have reached the other devices in your school.",
  "pending-sync": "Your work is saved on this device and is waiting to reach the other devices.",
  failed:
    "Your work is safe on this device. It is having trouble reaching the sync hub and will keep retrying automatically.",
  offline: "This device is not set up to sync. Your work is saved here and stays fully usable.",
  conflict: "A sync conflict needs a person to choose which version to keep.",
  "saved-local": "Your work is saved on this device.",
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayAsIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * The teacher's Home — one operational brief on the Precision
 * Intelligence primitives (ADR-0070 §10). Three zones, one dominant
 * surface: (1) "What needs you today" merges homeroom (daily) and
 * subject attendance into a single urgency-ranked list; (2) "Grading"
 * appears only when a grading period is open; (3) "Your device" is a
 * one-line local-first honesty signal from the Wave C status
 * vocabulary. A single "last sign-in" line replaces the old
 * school-wide activity list. Built entirely from reads other screens
 * already make — no new backend query. Each zone loads independently:
 * one failing never blanks another.
 */
export function TeacherHome({
  displayName,
  username,
  teacherUserId,
  attendanceService,
  authService,
  gradingService,
  sectionService,
  subjectAttendanceService,
  syncStatusService,
  onOpenAttendance,
  onOpenSubjectAttendance,
  onManageSections,
  onOpenClassRecords,
  onViewSyncStatus,
}: TeacherHomeProps) {
  const { mode } = useTeacherMode();

  const [duties, setDuties] = useState<Duty[]>([]);
  const [openPeriods, setOpenPeriods] = useState<{ section: Section; period: GradingPeriod }[]>([]);
  const [dutiesLoading, setDutiesLoading] = useState(true);
  const [dutiesError, setDutiesError] = useState<string | null>(null);
  const [dutiesRetry, setDutiesRetry] = useState(0);

  const [device, setDevice] = useState<PersistenceState | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [deviceRetry, setDeviceRetry] = useState(0);

  const [lastSignIn, setLastSignIn] = useState<AuditLogEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    const today = todayAsIsoDate();
    const weekday = new Date().getDay();

    async function load() {
      setDutiesError(null);
      setDutiesLoading(true);
      try {
        const [sections, classes] = await Promise.all([
          sectionService.listSections(),
          todaysClassesForTeacher(subjectAttendanceService, teacherUserId, today, weekday),
        ]);
        if (cancelled) return;

        const schoolYears = [...new Set(sections.map((s) => s.schoolYear))];
        const periodsByYear = new Map<string, GradingPeriod[]>();
        await Promise.all(
          schoolYears.map(async (year) => {
            periodsByYear.set(year, await gradingService.listPeriodsBySchoolYear(year));
          }),
        );

        const homeroom: Duty[] = await Promise.all(
          sections.map(async (section) => {
            const roster = await attendanceService.rosterForDate(section.id, today);
            return {
              kind: "homeroom" as const,
              key: `hr-${section.id}`,
              section,
              marked: roster.filter((e) => e.status !== null).length,
              total: roster.length,
            };
          }),
        );
        const subject: Duty[] = classes.map((occ, i) => ({
          kind: "subject" as const,
          key: `sub-${occ.assignment.id}-${occ.startsAt}-${i}`,
          occ,
        }));

        const periods = sections
          .map((section) => {
            const period = (periodsByYear.get(section.schoolYear) ?? []).find(
              (p) => p.startsOn <= today && today <= p.endsOn,
            );
            return period ? { section, period } : null;
          })
          .filter((x): x is { section: Section; period: GradingPeriod } => x !== null);

        if (!cancelled) {
          setDuties(sortDuties([...homeroom, ...subject]));
          setOpenPeriods(periods);
        }
      } catch {
        if (!cancelled) setDutiesError("Could not load what needs you today.");
      } finally {
        if (!cancelled) setDutiesLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [
    attendanceService,
    gradingService,
    sectionService,
    subjectAttendanceService,
    teacherUserId,
    dutiesRetry,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      setDeviceError(null);
      setDevice(null);
      try {
        const status = await syncStatusService.getStatus();
        if (!cancelled) setDevice(deviceState(status));
      } catch {
        if (!cancelled) setDeviceError("Could not check this device's sync status.");
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [syncStatusService, deviceRetry]);

  useEffect(() => {
    let cancelled = false;
    authService
      .listAuditLog()
      .then((entries) => {
        if (cancelled) return;
        const mine = entries.find(
          (e) => e.username === username && e.eventType === "login_success",
        );
        setLastSignIn(mine ?? null);
      })
      .catch(() => {
        // A missing "last sign-in" line is not worth an error state.
        if (!cancelled) setLastSignIn(null);
      });
    return () => {
      cancelled = true;
    };
  }, [authService, username]);

  return (
    <Page
      title="Home"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            {`Good day, ${displayName}. This is everything that needs you today — attendance to mark,
            grading periods that are open, and whether this device has finished syncing.`}
          </p>
        ) : undefined
      }
    >
      {/* Zone 1 — dominant surface */}
      <section className="home-zone home-zone-primary" aria-label="What needs you today">
        <h3>What needs you today</h3>
        {dutiesError ? (
          <Alert tone="error">
            <p>{dutiesError}</p>
            <button type="button" onClick={() => setDutiesRetry((k) => k + 1)}>
              Try again
            </button>
          </Alert>
        ) : dutiesLoading ? (
          <Loading label="Loading today…" />
        ) : duties.length === 0 ? (
          <EmptyState>
            No attendance to mark today.{" "}
            <button type="button" onClick={onManageSections}>
              Manage sections
            </button>
          </EmptyState>
        ) : (
          <ul className="home-duty-rail">
            {duties.map((duty) =>
              duty.kind === "homeroom" ? (
                <HomeroomDutyRow
                  key={duty.key}
                  duty={duty}
                  onOpenAttendance={onOpenAttendance}
                  onManageSections={onManageSections}
                />
              ) : (
                <SubjectDutyRow
                  key={duty.key}
                  occ={duty.occ}
                  onOpenSubjectAttendance={onOpenSubjectAttendance}
                />
              ),
            )}
          </ul>
        )}
      </section>

      {/* Zone 2 — contextual: only when a grading period is open */}
      {openPeriods.length > 0 && (
        <section className="home-zone" aria-label="Grading">
          <h3>Grading</h3>
          {mode === "guided" && (
            <p className="field-hint">
              A grading period is open — you can enter class records now.
            </p>
          )}
          <ul className="home-grading-list">
            {openPeriods.map(({ section, period }) => (
              <li key={`${section.id}-${period.id}`}>
                <span>
                  {section.name} — {period.label} is open
                </span>
                <button type="button" onClick={onOpenClassRecords}>
                  Open class records
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Zone 3 — one-line local-first honesty signal */}
      <section className="home-zone home-zone-device" aria-label="Your device">
        <h3>Your device</h3>
        {deviceError ? (
          <Alert tone="error">
            <p>{deviceError}</p>
            <button type="button" onClick={() => setDeviceRetry((k) => k + 1)}>
              Try again
            </button>
          </Alert>
        ) : device === null ? (
          <Loading label="Checking sync status…" />
        ) : (
          <p className="home-device-line">
            <StatusChip tone={PERSISTENCE_STATUS[device].tone}>
              {PERSISTENCE_STATUS[device].label}
            </StatusChip>{" "}
            {DEVICE_SENTENCE[device]}{" "}
            <button type="button" className="link-button" onClick={onViewSyncStatus}>
              View sync status
            </button>
          </p>
        )}
      </section>

      {lastSignIn && (
        <p className="home-last-signin field-hint">
          Last sign-in: {formatWhen(lastSignIn.createdAt)}
        </p>
      )}
    </Page>
  );
}

function HomeroomDutyRow({
  duty,
  onOpenAttendance,
  onManageSections,
}: {
  duty: Extract<Duty, { kind: "homeroom" }>;
  onOpenAttendance: (sectionId: string) => void;
  onManageSections: () => void;
}) {
  const state = homeroomState(duty.marked, duty.total);
  const chip = HOMEROOM_CHIP[state];
  return (
    <li className={`home-duty-item is-${state}`}>
      <div className="home-duty-main">
        <span className="home-duty-what">
          {duty.section.name} — Grade {duty.section.gradeLevel} · homeroom
        </span>
        <StatusChip tone={chip.tone}>{chip.label(duty.marked, duty.total)}</StatusChip>
      </div>
      {state === "no-learners" ? (
        <button type="button" onClick={onManageSections}>
          Manage sections
        </button>
      ) : (
        <button
          type="button"
          className="button-primary"
          onClick={() => onOpenAttendance(duty.section.id)}
        >
          {state === "not-started"
            ? "Mark attendance"
            : state === "partial"
              ? "Continue attendance"
              : "Review attendance"}
        </button>
      )}
    </li>
  );
}

function SubjectDutyRow({
  occ,
  onOpenSubjectAttendance,
}: {
  occ: TodaysClassOccurrence;
  onOpenSubjectAttendance: (teachingAssignmentId: string) => void;
}) {
  const chip = SUBJECT_CHIP[occ.status];
  return (
    <li className={`home-duty-item is-subject-${occ.status}`}>
      <div className="home-duty-main">
        <span className="home-duty-what">
          {occ.startsAt}–{occ.endsAt} · {occ.assignment.subjectName} — {occ.assignment.sectionName}
          {occ.room ? ` · ${occ.room}` : ""}
        </span>
        <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
      </div>
      {occ.status === "no_class" ? null : (
        <button
          type="button"
          className={occ.status === "not_checked" ? "button-primary" : undefined}
          onClick={() => onOpenSubjectAttendance(occ.assignment.id)}
        >
          {occ.status === "not_checked" ? "Check attendance" : "Review attendance"}
        </button>
      )}
    </li>
  );
}
