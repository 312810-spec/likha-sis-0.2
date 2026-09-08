import { describe, expect, it } from "vitest";
import {
  SeatingChartError,
  createEmptyArrangement,
  placeLearnerInSeat,
  removeLearnerFromSeat,
  summarizeArrangement,
  type SeatPosition,
} from "./seating-chart";

const seats: SeatPosition[] = [
  { seatId: "r1c1", row: 1, column: 1 },
  { seatId: "r1c2", row: 1, column: 2 },
];

describe("placeLearnerInSeat", () => {
  it("places a learner into an empty seat", () => {
    const arrangement = createEmptyArrangement("section-1", seats);
    const next = placeLearnerInSeat(arrangement, "r1c1", "learner-1");
    expect(next.assignments).toEqual({ r1c1: "learner-1" });
  });

  it("moves a learner from their old seat when placed in a new one", () => {
    let arrangement = createEmptyArrangement("section-1", seats);
    arrangement = placeLearnerInSeat(arrangement, "r1c1", "learner-1");
    arrangement = placeLearnerInSeat(arrangement, "r1c2", "learner-1");
    expect(arrangement.assignments).toEqual({ r1c2: "learner-1" });
  });

  it("rejects placing into a seat that does not exist in the layout", () => {
    const arrangement = createEmptyArrangement("section-1", seats);
    expect(() => placeLearnerInSeat(arrangement, "does-not-exist", "learner-1")).toThrow(
      SeatingChartError,
    );
  });

  it("rejects placing a different learner into an already-occupied seat", () => {
    let arrangement = createEmptyArrangement("section-1", seats);
    arrangement = placeLearnerInSeat(arrangement, "r1c1", "learner-1");
    expect(() => placeLearnerInSeat(arrangement, "r1c1", "learner-2")).toThrow(SeatingChartError);
  });

  it("allows re-placing the same learner into the seat they already occupy", () => {
    let arrangement = createEmptyArrangement("section-1", seats);
    arrangement = placeLearnerInSeat(arrangement, "r1c1", "learner-1");
    expect(() => placeLearnerInSeat(arrangement, "r1c1", "learner-1")).not.toThrow();
  });
});

describe("removeLearnerFromSeat", () => {
  it("clears the learner's seat", () => {
    let arrangement = createEmptyArrangement("section-1", seats);
    arrangement = placeLearnerInSeat(arrangement, "r1c1", "learner-1");
    arrangement = removeLearnerFromSeat(arrangement, "learner-1");
    expect(arrangement.assignments).toEqual({});
  });

  it("is a no-op for a learner who isn't seated", () => {
    const arrangement = createEmptyArrangement("section-1", seats);
    expect(removeLearnerFromSeat(arrangement, "learner-1")).toBe(arrangement);
  });
});

describe("summarizeArrangement", () => {
  it("reports unseated learners from the roster", () => {
    let arrangement = createEmptyArrangement("section-1", seats);
    arrangement = placeLearnerInSeat(arrangement, "r1c1", "learner-1");
    const summary = summarizeArrangement(arrangement, ["learner-1", "learner-2"]);
    expect(summary).toEqual({
      totalSeats: 2,
      occupiedSeats: 1,
      unseatedLearnerIds: ["learner-2"],
    });
  });
});
