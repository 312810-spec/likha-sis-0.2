/**
 * Custom Seating Chart — pure arrangement-state logic.
 *
 * Session-local by design (see
 * `docs/adr/0075-visual-timetable-and-theme-tokens.md`'s "session-local
 * tool" precedent from Batch 4's timetable auto-seed preview, and
 * `docs/CURRENT-HANDOFF.md`'s Batch 5 scope note): this module holds no
 * persistence of its own. A screen keeps a `SeatingArrangement` in React
 * state and discards it on navigation/reload unless a later slice adds
 * an explicit save. No new learner field is read or written here — a
 * seating chart only ever needs `learnerId` + display name, both already
 * available from the existing roster.
 *
 * Interaction is click-to-place (select a seat, then a learner, or vice
 * versa) — consistent with Batch 4's precedent of avoiding native HTML5
 * drag-and-drop for accessibility/keyboard-navigation reasons. If a
 * screen built on this module ever adds drag-and-drop, that is a
 * deviation from this precedent and should be flagged as such.
 */

export interface SeatPosition {
  seatId: string;
  row: number;
  column: number;
}

export interface SeatingArrangement {
  sectionId: string;
  seats: readonly SeatPosition[];
  /** seatId -> learnerId. A seat absent from this map is empty. */
  assignments: Readonly<Record<string, string>>;
}

export function createEmptyArrangement(
  sectionId: string,
  seats: readonly SeatPosition[],
): SeatingArrangement {
  return { sectionId, seats, assignments: {} };
}

export class SeatingChartError extends Error {}

/** Places `learnerId` into `seatId`, moving them off any seat they
 * already occupied (a learner can only sit in one seat at a time).
 * Throws if `seatId` does not exist in the arrangement's seat layout, or
 * if `seatId` is already occupied by a different learner. */
export function placeLearnerInSeat(
  arrangement: SeatingArrangement,
  seatId: string,
  learnerId: string,
): SeatingArrangement {
  if (!arrangement.seats.some((s) => s.seatId === seatId)) {
    throw new SeatingChartError(`Seat ${seatId} does not exist in this arrangement's layout.`);
  }
  const occupant = arrangement.assignments[seatId];
  if (occupant !== undefined && occupant !== learnerId) {
    throw new SeatingChartError(`Seat ${seatId} is already occupied.`);
  }

  const nextAssignments: Record<string, string> = {};
  for (const [existingSeatId, existingLearnerId] of Object.entries(arrangement.assignments)) {
    if (existingLearnerId === learnerId) continue; // vacate the learner's old seat
    nextAssignments[existingSeatId] = existingLearnerId;
  }
  nextAssignments[seatId] = learnerId;

  return { ...arrangement, assignments: nextAssignments };
}

/** Clears whichever seat `learnerId` currently occupies, if any. A no-op
 * (returns the arrangement unchanged, same reference) if the learner is
 * not currently seated. */
export function removeLearnerFromSeat(
  arrangement: SeatingArrangement,
  learnerId: string,
): SeatingArrangement {
  const seatId = Object.entries(arrangement.assignments).find(
    ([, occupant]) => occupant === learnerId,
  )?.[0];
  if (seatId === undefined) return arrangement;

  const nextAssignments = { ...arrangement.assignments };
  delete nextAssignments[seatId];
  return { ...arrangement, assignments: nextAssignments };
}

export interface SeatingSummary {
  totalSeats: number;
  occupiedSeats: number;
  unseatedLearnerIds: string[];
}

/** Summarizes how many of a roster's learners are placed vs. still
 * unseated — the "is this chart finished" check a screen shows the
 * teacher, without duplicating roster-fetch logic here. */
export function summarizeArrangement(
  arrangement: SeatingArrangement,
  rosterLearnerIds: readonly string[],
): SeatingSummary {
  const seatedLearnerIds = new Set(Object.values(arrangement.assignments));
  return {
    totalSeats: arrangement.seats.length,
    occupiedSeats: Object.keys(arrangement.assignments).length,
    unseatedLearnerIds: rosterLearnerIds.filter((id) => !seatedLearnerIds.has(id)),
  };
}
