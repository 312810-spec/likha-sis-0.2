import { useEffect, useMemo, useState } from "react";
import type { SectionApplicationService } from "../application/section-service";
import {
  createEmptyArrangement,
  placeLearnerInSeat,
  removeLearnerFromSeat,
  summarizeArrangement,
  type SeatingArrangement,
  type SeatPosition,
} from "../domain/seating-chart";
import type { Section, SectionRosterMember } from "../domain/section";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface SeatingChartScreenProps {
  sectionService: SectionApplicationService;
}

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** A grid sized to comfortably seat `learnerCount`, at most 6 columns wide
 * -- a simple, predictable default layout rather than a user-configurable
 * one (out of scope for this session-local tool). */
function buildSeatLayout(learnerCount: number): SeatPosition[] {
  const columns = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(Math.max(learnerCount, 1)))));
  const rows = Math.max(1, Math.ceil(Math.max(learnerCount, 1) / columns));
  const seats: SeatPosition[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      seats.push({ seatId: `r${row}c${column}`, row, column });
    }
  }
  return seats;
}

/**
 * Click-to-place Custom Seating Chart over an existing section roster --
 * `domain/seating-chart.ts`. Session-local by that module's own design
 * (no persistence, no save action): the arrangement lives in this
 * screen's React state and is discarded on navigation or reload. See
 * `docs/CURRENT-HANDOFF.md`'s Batch 8 next-task note.
 */
export function SeatingChartScreen({ sectionService }: SeatingChartScreenProps) {
  const { mode } = useTeacherMode();
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [roster, setRoster] = useState<SectionRosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [arrangement, setArrangement] = useState<SeatingArrangement | null>(null);
  const [selectedLearnerId, setSelectedLearnerId] = useState<string | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    sectionService
      .listSections()
      .then((result) => {
        if (cancelled) return;
        setSections(result);
        if (result.length > 0 && !sectionId) setSectionId(result[0]!.id);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load sections.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, [sectionService]);

  useEffect(() => {
    if (!sectionId) return;
    let cancelled = false;
    sectionService
      .roster(sectionId, todayAsIsoDate())
      .then((result) => {
        if (cancelled) return;
        setRoster(result);
        setArrangement(createEmptyArrangement(sectionId, buildSeatLayout(result.length)));
        setSelectedLearnerId(null);
        setChartError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the section roster.");
      });
    return () => {
      cancelled = true;
    };
  }, [sectionService, sectionId]);

  const summary = useMemo(
    () =>
      arrangement
        ? summarizeArrangement(
            arrangement,
            roster.map((m) => m.learnerId),
          )
        : null,
    [arrangement, roster],
  );

  function learnerName(learnerId: string): string {
    const member = roster.find((m) => m.learnerId === learnerId);
    return member ? `${member.givenName} ${member.familyName}` : learnerId;
  }

  function handleSeatClick(seatId: string) {
    if (!arrangement) return;
    setChartError(null);
    const occupant = arrangement.assignments[seatId];
    if (occupant) {
      // Clicking an occupied seat with no learner selected clears it;
      // clicking it while a different learner is selected reassigns it.
      if (!selectedLearnerId || selectedLearnerId === occupant) {
        setArrangement(removeLearnerFromSeat(arrangement, occupant));
        setSelectedLearnerId(null);
        return;
      }
    }
    if (!selectedLearnerId) return;
    try {
      setArrangement(placeLearnerInSeat(arrangement, seatId, selectedLearnerId));
      setSelectedLearnerId(null);
    } catch (err) {
      setChartError(err instanceof Error ? err.message : "Could not place this learner.");
    }
  }

  function handleReset() {
    if (!sectionId) return;
    setArrangement(createEmptyArrangement(sectionId, buildSeatLayout(roster.length)));
    setSelectedLearnerId(null);
    setChartError(null);
  }

  return (
    <Page
      title="Seating Chart"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Pick a learner from the roster, then click a seat to place them -- or click a filled
            seat to clear it. This chart is not saved; it resets when you leave this screen.
          </p>
        ) : undefined
      }
    >
      <Alert tone="info">
        This seating chart is session-local: it is not saved anywhere and will be lost if you
        navigate away or reload.
      </Alert>

      {error && <Alert tone="error">{error}</Alert>}
      {chartError && <Alert tone="error">{chartError}</Alert>}

      {loading ? (
        <Loading label="Loading sections…" />
      ) : sections.length === 0 ? (
        <EmptyState>No sections exist yet.</EmptyState>
      ) : (
        <>
          <div className="form-row">
            <div className="field">
              <label htmlFor="seating-section">Section</label>
              <select
                id="seating-section"
                value={sectionId}
                onChange={(event) => setSectionId(event.target.value)}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.gradeLevel}, {s.schoolYear})
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={handleReset}>
              Clear chart
            </button>
          </div>

          {roster.length === 0 ? (
            <EmptyState>This section has no learners enrolled yet.</EmptyState>
          ) : (
            <>
              {summary && (
                <p className="field-hint">
                  {summary.occupiedSeats} of {summary.totalSeats} seats filled ·{" "}
                  {summary.unseatedLearnerIds.length} learner(s) not yet seated
                </p>
              )}

              <div className="seating-chart-layout">
                <div>
                  <h3>Unseated learners</h3>
                  {summary && summary.unseatedLearnerIds.length === 0 ? (
                    <EmptyState>Everyone is seated.</EmptyState>
                  ) : (
                    <ul className="seating-chart-learner-list">
                      {summary?.unseatedLearnerIds.map((learnerId) => (
                        <li key={learnerId}>
                          <button
                            type="button"
                            aria-pressed={selectedLearnerId === learnerId}
                            onClick={() =>
                              setSelectedLearnerId((current) =>
                                current === learnerId ? null : learnerId,
                              )
                            }
                          >
                            {learnerName(learnerId)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h3>Seats</h3>
                  <div
                    className="seating-chart-grid"
                    role="grid"
                    aria-label="Classroom seating grid"
                  >
                    {arrangement &&
                      Array.from(new Set(arrangement.seats.map((s) => s.row))).map((row) => (
                        <div key={row} role="row" className="seating-chart-row">
                          {arrangement.seats
                            .filter((s) => s.row === row)
                            .map((seat) => {
                              const occupant = arrangement.assignments[seat.seatId];
                              return (
                                <button
                                  key={seat.seatId}
                                  type="button"
                                  role="gridcell"
                                  className="seating-chart-seat"
                                  data-occupied={occupant ? "true" : "false"}
                                  onClick={() => handleSeatClick(seat.seatId)}
                                >
                                  {occupant ? learnerName(occupant) : "Empty"}
                                </button>
                              );
                            })}
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </Page>
  );
}
