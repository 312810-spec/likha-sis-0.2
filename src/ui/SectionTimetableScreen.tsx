import { useEffect, useMemo, useRef, useState } from "react";
import type { TeachingAssignmentApplicationService } from "../application/teaching-assignment-service";
import {
  autoSeedWeeklySlots,
  detectTimetableConflicts,
  validateSubjectWeeklyMinutes,
  type AvailableSlot,
  type TimetableSlotInput,
} from "../domain/timetable";
import { ValidationError } from "../domain/errors";
import { WEEKDAY_LABELS, type ScheduleMeeting } from "../domain/schedule-meeting";
import type { TeachingAssignmentDetail } from "../domain/teaching-assignment";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface SectionTimetableScreenProps {
  teachingAssignmentService: TeachingAssignmentApplicationService;
  sectionId: string;
  sectionName: string;
  onBack: () => void;
}

const CONFLICT_MESSAGES: Record<string, string> = {
  unknownAssignment: "This class could not be found. Try reloading the page.",
  invalidWeekday: "Weekday must be between Sunday and Saturday.",
  invalidTime: "Start and end time must be valid, with the end time after the start time.",
  teacherConflict: "This teacher already has another class scheduled at this time.",
  sectionConflict: "This section already has another class scheduled at this time.",
  roomConflict: "This room is already booked for another class at this time.",
  duplicate: "This exact meeting has already been scheduled.",
};

const GRID_WEEKDAYS = [1, 2, 3, 4, 5]; // Monday..Friday -- a school program week
const GRID_HOURS = Array.from({ length: 10 }, (_, i) => 7 + i); // 07:00..16:00, one column per hour

function hourLabel(hour: number, endHour: number): { startsAt: string; endsAt: string } {
  return {
    startsAt: `${String(hour).padStart(2, "0")}:00`,
    endsAt: `${String(endHour).padStart(2, "0")}:00`,
  };
}

interface CellMeeting extends TimetableSlotInput {
  meetingId: string;
  subjectName: string;
}

/**
 * Batch 4 (Tier 3.2): the section-wide Visual Timetable / Class Program
 * Builder. Reuses this codebase's existing per-class scheduling
 * (`TeachingAssignmentApplicationService.listMeetings/createMeeting/
 * removeMeeting`, Wave 2Z) -- no new Rust persistence -- and adds a
 * whole-section grid view over it, client-side live conflict preview
 * (`detectTimetableConflicts`), and one-click auto-seed
 * (`autoSeedWeeklySlots`), both pure `src/domain/timetable.ts` functions.
 *
 * Interaction is click-to-arm / click-to-place, NOT drag-and-drop --
 * see `docs/adr/0075-visual-timetable-and-theme-tokens.md` for why: a
 * real drag-and-drop library (`@dnd-kit/core`, `react-dnd`, ...) is a
 * new dependency this batch's constraints require flagging rather than
 * silently adding, and click-to-arm needs none. It is also usable
 * without a mouse, which a drag gesture is not, and keeps full
 * Efficient/Comfortable/Guided parity (Guided mode gets a spelled-out
 * hint; the interaction itself never changes).
 */
export function SectionTimetableScreen({
  teachingAssignmentService,
  sectionId,
  sectionName,
  onBack,
}: SectionTimetableScreenProps) {
  const { mode } = useTeacherMode();

  const [assignments, setAssignments] = useState<TeachingAssignmentDetail[]>([]);
  const [meetingsByAssignment, setMeetingsByAssignment] = useState<
    Record<string, ScheduleMeeting[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [armedAssignmentId, setArmedAssignmentId] = useState<string | null>(null);
  const [room, setRoom] = useState("");
  const [placing, setPlacing] = useState(false);

  const [seedAssignmentId, setSeedAssignmentId] = useState<string | null>(null);
  const [seedMinutes, setSeedMinutes] = useState("120");
  const [seedSlotMinutes, setSeedSlotMinutes] = useState("60");
  const [seeding, setSeeding] = useState(false);

  const requestRef = useRef(0);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    teachingAssignmentService
      .listBySection(sectionId)
      .then(async (list) => {
        if (requestRef.current !== requestId) return;
        setAssignments(list);
        const entries = await Promise.all(
          list.map(
            async (a) => [a.id, await teachingAssignmentService.listMeetings(a.id)] as const,
          ),
        );
        if (requestRef.current !== requestId) return;
        setMeetingsByAssignment(Object.fromEntries(entries));
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setLoadError("Could not load this section's timetable.");
      })
      .finally(() => {
        if (requestRef.current !== requestId) return;
        setLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachingAssignmentService, sectionId]);

  const assignmentById = useMemo(() => new Map(assignments.map((a) => [a.id, a])), [assignments]);

  /** Every meeting across the whole section, flattened for conflict
   * checking and grid rendering -- teacher-only conflicts against
   * another section aren't visible from this screen alone (this screen
   * only loads its own section's assignments), matching this batch's
   * scope: the server remains the authority for a true cross-section
   * teacher conflict at save time. */
  const allMeetings: CellMeeting[] = useMemo(() => {
    const out: CellMeeting[] = [];
    for (const a of assignments) {
      for (const m of meetingsByAssignment[a.id] ?? []) {
        out.push({
          meetingId: m.id,
          teachingAssignmentId: a.id,
          teacherUserId: a.teacherUserId,
          sectionId: a.sectionId,
          subjectId: a.subjectId,
          subjectName: a.subjectName,
          weekday: m.weekday,
          startsAt: m.startsAt,
          endsAt: m.endsAt,
          room: m.room,
        });
      }
    }
    return out;
  }, [assignments, meetingsByAssignment]);

  function meetingAt(weekday: number, hour: number): CellMeeting | undefined {
    return allMeetings.find((m) => {
      if (m.weekday !== weekday) return false;
      const startHour = Number(m.startsAt.split(":")[0]);
      return startHour === hour;
    });
  }

  function previewConflicts(weekday: number, hour: number): string[] {
    if (!armedAssignmentId) return [];
    const assignment = assignmentById.get(armedAssignmentId);
    if (!assignment) return [];
    const { startsAt, endsAt } = hourLabel(hour, hour + 1);
    const candidate: TimetableSlotInput = {
      teachingAssignmentId: assignment.id,
      teacherUserId: assignment.teacherUserId,
      sectionId: assignment.sectionId,
      subjectId: assignment.subjectId,
      weekday,
      startsAt,
      endsAt,
      room: room.trim() || null,
    };
    const conflicts = detectTimetableConflicts(candidate, allMeetings);
    return conflicts.map((c) => CONFLICT_MESSAGES[c.kind] ?? c.kind);
  }

  async function handlePlace(weekday: number, hour: number) {
    if (!armedAssignmentId || placing) return;
    const { startsAt, endsAt } = hourLabel(hour, hour + 1);
    setError(null);
    setConfirmation(null);
    setPlacing(true);
    try {
      const outcome = await teachingAssignmentService.createMeeting(
        armedAssignmentId,
        weekday,
        startsAt,
        endsAt,
        room,
      );
      if (outcome.outcome === "created") {
        setMeetingsByAssignment((current) => ({
          ...current,
          [armedAssignmentId]: [...(current[armedAssignmentId] ?? []), outcome.meeting],
        }));
        setConfirmation("Class placed on the timetable.");
        setArmedAssignmentId(null);
      } else {
        setError(CONFLICT_MESSAGES[outcome.outcome] ?? "Could not place this class.");
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not place this class.");
    } finally {
      setPlacing(false);
    }
  }

  async function handleRemove(meeting: CellMeeting) {
    setError(null);
    setConfirmation(null);
    try {
      const removed = await teachingAssignmentService.removeMeeting(meeting.meetingId);
      if (removed) {
        setMeetingsByAssignment((current) => ({
          ...current,
          [meeting.teachingAssignmentId]: (current[meeting.teachingAssignmentId] ?? []).filter(
            (m) => m.id !== meeting.meetingId,
          ),
        }));
        setConfirmation("Class removed from the timetable.");
      } else {
        setError("Could not remove this class.");
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not remove this class.");
    }
  }

  async function handleAutoSeed() {
    if (!seedAssignmentId || seeding) return;
    const assignment = assignmentById.get(seedAssignmentId);
    const required = Number(seedMinutes);
    const slotLength = Number(seedSlotMinutes);
    if (
      !assignment ||
      !Number.isFinite(required) ||
      required <= 0 ||
      !Number.isFinite(slotLength) ||
      slotLength <= 0
    ) {
      setError("Enter a valid number of weekly minutes and slot length before auto-seeding.");
      return;
    }
    setError(null);
    setConfirmation(null);
    setSeeding(true);
    try {
      const available: AvailableSlot[] = [];
      for (const weekday of GRID_WEEKDAYS) {
        for (const hour of GRID_HOURS) {
          if (meetingAt(weekday, hour)) continue; // already occupied on the board
          const endMinutesFromHour = slotLength / 60;
          const endHour = hour + endMinutesFromHour;
          if (endHour > GRID_HOURS[GRID_HOURS.length - 1]! + 1) continue; // would run past the day
          available.push({
            weekday,
            startsAt: `${String(hour).padStart(2, "0")}:00`,
            endsAt: `${String(Math.floor(endHour)).padStart(2, "0")}:${
              endMinutesFromHour % 1 === 0 ? "00" : "30"
            }`,
            room: room.trim() || null,
          });
        }
      }

      const result = autoSeedWeeklySlots(
        {
          teachingAssignmentId: assignment.id,
          teacherUserId: assignment.teacherUserId,
          sectionId: assignment.sectionId,
          subjectId: assignment.subjectId,
        },
        required,
        available,
        allMeetings,
      );

      let placedCount = 0;
      for (const slot of result.placed) {
        // Sequential by design: each create must land before the next
        // one is issued, since the server (not just the client preview)
        // is the real conflict authority for these writes.
        const outcome = await teachingAssignmentService.createMeeting(
          assignment.id,
          slot.weekday,
          slot.startsAt,
          slot.endsAt,
          slot.room ?? "",
        );
        if (outcome.outcome === "created") {
          placedCount += 1;
          setMeetingsByAssignment((current) => ({
            ...current,
            [assignment.id]: [...(current[assignment.id] ?? []), outcome.meeting],
          }));
        }
      }

      if (placedCount === 0) {
        setError("No open slots were available to auto-seed this subject's weekly minutes.");
      } else if (!result.fullySeeded) {
        setConfirmation(
          `Placed ${placedCount} class period(s), covering ${result.placedMinutes} of the required ${required} minutes. Not enough open slots remained for the rest -- place the remainder manually.`,
        );
      } else {
        setConfirmation(
          `Auto-seeded ${placedCount} class period(s), covering all ${required} required minutes.`,
        );
      }
    } finally {
      setSeeding(false);
    }
  }

  return (
    <Page
      title={`${sectionName} — visual timetable`}
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Pick "Place on grid" next to a class, then click an open cell to schedule it there. A
            preview shows any conflict before you place it. "Auto-seed" fills a subject's required
            weekly minutes into open slots automatically.
          </p>
        ) : undefined
      }
    >
      <button type="button" className="section-roster-back" onClick={onBack}>
        <span aria-hidden="true">← </span>Back to sections
      </button>

      {loadError && (
        <Alert tone="error">
          <p>{loadError}</p>
          <button type="button" onClick={load}>
            Retry
          </button>
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      {loading ? (
        <Loading label="Loading this section's timetable…" />
      ) : loadError ? null : assignments.length === 0 ? (
        <EmptyState>
          No teaching assignments exist for this section yet -- add one first from Teaching
          Assignments.
        </EmptyState>
      ) : (
        <>
          <section aria-label="Classes to place" className="card">
            <div className="card-body">
              <label>
                Room (applies to the next placement or auto-seed)
                <input
                  type="text"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  placeholder="e.g. Room 3"
                />
              </label>
              <ul>
                {assignments.map((a) => {
                  const scheduled = validateSubjectWeeklyMinutes(
                    a.subjectId,
                    allMeetings,
                    Number(seedAssignmentId === a.id ? seedMinutes : 0) || 0,
                  );
                  return (
                    <li key={a.id}>
                      <strong>{a.subjectName}</strong> — {scheduled.scheduledMinutes} min/week
                      scheduled
                      <button
                        type="button"
                        aria-pressed={armedAssignmentId === a.id}
                        onClick={() =>
                          setArmedAssignmentId((current) => (current === a.id ? null : a.id))
                        }
                      >
                        {armedAssignmentId === a.id ? "Placing… (click a cell)" : "Place on grid"}
                      </button>
                      <button
                        type="button"
                        aria-pressed={seedAssignmentId === a.id}
                        onClick={() =>
                          setSeedAssignmentId((current) => (current === a.id ? null : a.id))
                        }
                      >
                        Auto-seed
                      </button>
                      {seedAssignmentId === a.id && (
                        <span>
                          <label>
                            Required minutes/week
                            <input
                              type="number"
                              min={1}
                              value={seedMinutes}
                              onChange={(e) => setSeedMinutes(e.target.value)}
                            />
                          </label>
                          <label>
                            Minutes per class period
                            <input
                              type="number"
                              min={1}
                              value={seedSlotMinutes}
                              onChange={(e) => setSeedSlotMinutes(e.target.value)}
                            />
                          </label>
                          <button type="button" aria-disabled={seeding} onClick={handleAutoSeed}>
                            {seeding ? "Seeding…" : "Run auto-seed"}
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          <div className="timetable-grid-wrap" style={{ overflowX: "auto" }}>
            <table
              className="attendance-roster"
              aria-label={`${sectionName} weekly timetable grid`}
            >
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  {GRID_WEEKDAYS.map((w) => (
                    <th scope="col" key={w}>
                      {WEEKDAY_LABELS[w]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GRID_HOURS.map((hour) => (
                  <tr key={hour}>
                    <th scope="row" className="font-tabular">
                      {String(hour).padStart(2, "0")}:00
                    </th>
                    {GRID_WEEKDAYS.map((weekday) => {
                      const meeting = meetingAt(weekday, hour);
                      const conflicts = armedAssignmentId ? previewConflicts(weekday, hour) : [];
                      if (meeting) {
                        return (
                          <td key={weekday}>
                            <span>{meeting.subjectName}</span>
                            {meeting.room && <span> · {meeting.room}</span>}
                            <button
                              type="button"
                              aria-label={`Remove ${meeting.subjectName} from ${WEEKDAY_LABELS[weekday]} ${hour}:00`}
                              onClick={() => handleRemove(meeting)}
                            >
                              Remove
                            </button>
                          </td>
                        );
                      }
                      return (
                        <td key={weekday}>
                          <button
                            type="button"
                            aria-disabled={!armedAssignmentId || placing}
                            aria-label={`Place armed class on ${WEEKDAY_LABELS[weekday]} at ${hour}:00${
                              conflicts.length > 0 ? `, conflict: ${conflicts.join("; ")}` : ""
                            }`}
                            onClick={() => armedAssignmentId && handlePlace(weekday, hour)}
                          >
                            {conflicts.length > 0
                              ? "⚠ Conflict"
                              : armedAssignmentId
                                ? "+ Place"
                                : "—"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Page>
  );
}
