import { describe, expect, it } from "vitest";
import type {
  AnecdotalRecord,
  AnecdotalRecordFollowup,
  AnecdotalRecordFollowupInput,
  AnecdotalRecordInput,
} from "../domain/anecdotal-record";
import { AnecdotalRecordValidationError } from "../domain/anecdotal-record";
import { ValidationError } from "../domain/errors";
import type { AnecdotalRecordRepository } from "../domain/ports/anecdotal-record-repository";
import { AnecdotalRecordApplicationService } from "./anecdotal-record-service";

const VALID_RECORD_INPUT: AnecdotalRecordInput = {
  learnerId: "l1",
  sectionId: "sec1",
  category: "positive",
  entryDate: "2026-09-01",
  narrative: "Helped a classmate with a reading exercise.",
};

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

class FakeAnecdotalRecordRepository implements AnecdotalRecordRepository {
  recordCalls: AnecdotalRecordInput[] = [];
  listForSectionCalls: [string, string][] = [];
  addFollowupCalls: AnecdotalRecordFollowupInput[] = [];
  listFollowupsCalls: [string, string, string][] = [];
  recordResult: AnecdotalRecord = RECORD;
  followupResult: AnecdotalRecordFollowup = FOLLOWUP;
  recordsToReturn: AnecdotalRecord[] = [];
  followupsToReturn: AnecdotalRecordFollowup[] = [];

  async record(input: AnecdotalRecordInput): Promise<AnecdotalRecord> {
    this.recordCalls.push(input);
    return this.recordResult;
  }

  async listForSection(sectionId: string, asOfDate: string): Promise<AnecdotalRecord[]> {
    this.listForSectionCalls.push([sectionId, asOfDate]);
    return this.recordsToReturn;
  }

  async addFollowup(input: AnecdotalRecordFollowupInput): Promise<AnecdotalRecordFollowup> {
    this.addFollowupCalls.push(input);
    return this.followupResult;
  }

  async listFollowups(
    anecdotalRecordId: string,
    sectionId: string,
    asOfDate: string,
  ): Promise<AnecdotalRecordFollowup[]> {
    this.listFollowupsCalls.push([anecdotalRecordId, sectionId, asOfDate]);
    return this.followupsToReturn;
  }
}

describe("AnecdotalRecordApplicationService", () => {
  it("trims and forwards a valid record", async () => {
    const repo = new FakeAnecdotalRecordRepository();
    const service = new AnecdotalRecordApplicationService(repo);

    await service.record({ ...VALID_RECORD_INPUT, narrative: "  Helped a classmate.  " });

    expect(repo.recordCalls).toHaveLength(1);
    expect(repo.recordCalls.at(0)?.narrative).toBe("Helped a classmate.");
  });

  it("rejects an invalid category before reaching the repository", async () => {
    const repo = new FakeAnecdotalRecordRepository();
    const service = new AnecdotalRecordApplicationService(repo);

    await expect(
      service.record({
        ...VALID_RECORD_INPUT,
        // @ts-expect-error -- deliberately not one of the generic three
        category: "disciplinary",
      }),
    ).rejects.toThrow(AnecdotalRecordValidationError);
    expect(repo.recordCalls).toHaveLength(0);
  });

  it("rejects a blank narrative before reaching the repository", async () => {
    const repo = new FakeAnecdotalRecordRepository();
    const service = new AnecdotalRecordApplicationService(repo);

    await expect(service.record({ ...VALID_RECORD_INPUT, narrative: "   " })).rejects.toThrow(
      AnecdotalRecordValidationError,
    );
    expect(repo.recordCalls).toHaveLength(0);
  });

  it("forwards listForSection with trimmed arguments", async () => {
    const repo = new FakeAnecdotalRecordRepository();
    repo.recordsToReturn = [RECORD];
    const service = new AnecdotalRecordApplicationService(repo);

    const result = await service.listForSection("  sec1  ", "  2026-09-01  ");

    expect(repo.listForSectionCalls).toEqual([["sec1", "2026-09-01"]]);
    expect(result).toEqual([RECORD]);
  });

  it("rejects an empty section id for listForSection", async () => {
    const repo = new FakeAnecdotalRecordRepository();
    const service = new AnecdotalRecordApplicationService(repo);

    await expect(service.listForSection("   ", "2026-09-01")).rejects.toThrow(ValidationError);
    expect(repo.listForSectionCalls).toHaveLength(0);
  });

  it("trims and forwards a valid follow-up", async () => {
    const repo = new FakeAnecdotalRecordRepository();
    const service = new AnecdotalRecordApplicationService(repo);

    await service.addFollowup({
      anecdotalRecordId: "ar1",
      sectionId: "sec1",
      asOfDate: "2026-09-01",
      note: "  Brief check-in.  ",
    });

    expect(repo.addFollowupCalls).toHaveLength(1);
    expect(repo.addFollowupCalls.at(0)?.note).toBe("Brief check-in.");
  });

  it("rejects a blank follow-up note before reaching the repository", async () => {
    const repo = new FakeAnecdotalRecordRepository();
    const service = new AnecdotalRecordApplicationService(repo);

    await expect(
      service.addFollowup({
        anecdotalRecordId: "ar1",
        sectionId: "sec1",
        asOfDate: "2026-09-01",
        note: "   ",
      }),
    ).rejects.toThrow(AnecdotalRecordValidationError);
    expect(repo.addFollowupCalls).toHaveLength(0);
  });

  it("forwards listFollowups with trimmed arguments", async () => {
    const repo = new FakeAnecdotalRecordRepository();
    repo.followupsToReturn = [FOLLOWUP];
    const service = new AnecdotalRecordApplicationService(repo);

    const result = await service.listFollowups("  ar1  ", "  sec1  ", "  2026-09-01  ");

    expect(repo.listFollowupsCalls).toEqual([["ar1", "sec1", "2026-09-01"]]);
    expect(result).toEqual([FOLLOWUP]);
  });

  it("rejects an empty anecdotal record id for listFollowups", async () => {
    const repo = new FakeAnecdotalRecordRepository();
    const service = new AnecdotalRecordApplicationService(repo);

    await expect(service.listFollowups("   ", "sec1", "2026-09-01")).rejects.toThrow(
      ValidationError,
    );
    expect(repo.listFollowupsCalls).toHaveLength(0);
  });
});
