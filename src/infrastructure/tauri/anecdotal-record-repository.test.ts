import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { AnecdotalRecord, AnecdotalRecordFollowup } from "../../domain/anecdotal-record";
import { TauriAnecdotalRecordRepository } from "./anecdotal-record-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

const RECORD: AnecdotalRecord = {
  id: "ar1",
  schoolId: "s1",
  learnerId: "l1",
  sectionId: "sec1",
  authoredByUserId: "u1",
  category: "positive",
  entryDate: "2026-09-01",
  narrative: "Helped a classmate with a reading exercise.",
  createdAt: "now",
};

const FOLLOWUP: AnecdotalRecordFollowup = {
  id: "f1",
  anecdotalRecordId: "ar1",
  authorUserId: "u1",
  note: "Brief check-in the following week.",
  createdAt: "now",
};

describe("TauriAnecdotalRecordRepository", () => {
  it("record invokes record_anecdotal_entry with every field", async () => {
    mockInvoke.mockResolvedValueOnce(RECORD);

    const returned = await new TauriAnecdotalRecordRepository().record({
      learnerId: "l1",
      sectionId: "sec1",
      category: "positive",
      entryDate: "2026-09-01",
      narrative: "Helped a classmate with a reading exercise.",
    });

    expect(mockInvoke).toHaveBeenCalledWith("record_anecdotal_entry", {
      learnerId: "l1",
      sectionId: "sec1",
      category: "positive",
      entryDate: "2026-09-01",
      narrative: "Helped a classmate with a reading exercise.",
    });
    expect(returned).toEqual(RECORD);
  });

  it("listForSection invokes list_anecdotal_records_for_section with section and date", async () => {
    mockInvoke.mockResolvedValueOnce([RECORD]);

    const returned = await new TauriAnecdotalRecordRepository().listForSection(
      "sec1",
      "2026-09-01",
    );

    expect(mockInvoke).toHaveBeenCalledWith("list_anecdotal_records_for_section", {
      sectionId: "sec1",
      asOfDate: "2026-09-01",
    });
    expect(returned).toEqual([RECORD]);
  });

  it("addFollowup invokes add_anecdotal_record_followup with every field", async () => {
    mockInvoke.mockResolvedValueOnce(FOLLOWUP);

    const returned = await new TauriAnecdotalRecordRepository().addFollowup({
      anecdotalRecordId: "ar1",
      sectionId: "sec1",
      asOfDate: "2026-09-01",
      note: "Brief check-in the following week.",
    });

    expect(mockInvoke).toHaveBeenCalledWith("add_anecdotal_record_followup", {
      anecdotalRecordId: "ar1",
      sectionId: "sec1",
      asOfDate: "2026-09-01",
      note: "Brief check-in the following week.",
    });
    expect(returned).toEqual(FOLLOWUP);
  });

  it("listFollowups invokes list_anecdotal_record_followups with every field", async () => {
    mockInvoke.mockResolvedValueOnce([FOLLOWUP]);

    const returned = await new TauriAnecdotalRecordRepository().listFollowups(
      "ar1",
      "sec1",
      "2026-09-01",
    );

    expect(mockInvoke).toHaveBeenCalledWith("list_anecdotal_record_followups", {
      anecdotalRecordId: "ar1",
      sectionId: "sec1",
      asOfDate: "2026-09-01",
    });
    expect(returned).toEqual([FOLLOWUP]);
  });
});
