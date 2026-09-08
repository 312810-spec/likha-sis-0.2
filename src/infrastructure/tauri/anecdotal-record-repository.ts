import type {
  AnecdotalRecord,
  AnecdotalRecordFollowup,
  AnecdotalRecordFollowupInput,
  AnecdotalRecordInput,
} from "../../domain/anecdotal-record";
import type { AnecdotalRecordRepository } from "../../domain/ports/anecdotal-record-repository";
import { invoke } from "./invoke";

/** Tauri adapter for `record_anecdotal_entry`/
 * `list_anecdotal_records_for_section`/`add_anecdotal_record_followup`/
 * `list_anecdotal_record_followups`
 * (`src-tauri/src/commands/anecdotal_record.rs`). */
export class TauriAnecdotalRecordRepository implements AnecdotalRecordRepository {
  record(input: AnecdotalRecordInput): Promise<AnecdotalRecord> {
    return invoke<AnecdotalRecord>("record_anecdotal_entry", {
      learnerId: input.learnerId,
      sectionId: input.sectionId,
      category: input.category,
      entryDate: input.entryDate,
      narrative: input.narrative,
    });
  }

  listForSection(sectionId: string, asOfDate: string): Promise<AnecdotalRecord[]> {
    return invoke<AnecdotalRecord[]>("list_anecdotal_records_for_section", {
      sectionId,
      asOfDate,
    });
  }

  addFollowup(input: AnecdotalRecordFollowupInput): Promise<AnecdotalRecordFollowup> {
    return invoke<AnecdotalRecordFollowup>("add_anecdotal_record_followup", {
      anecdotalRecordId: input.anecdotalRecordId,
      sectionId: input.sectionId,
      asOfDate: input.asOfDate,
      note: input.note,
    });
  }

  listFollowups(
    anecdotalRecordId: string,
    sectionId: string,
    asOfDate: string,
  ): Promise<AnecdotalRecordFollowup[]> {
    return invoke<AnecdotalRecordFollowup[]>("list_anecdotal_record_followups", {
      anecdotalRecordId,
      sectionId,
      asOfDate,
    });
  }
}
