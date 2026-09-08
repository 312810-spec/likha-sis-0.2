import type {
  AnecdotalRecord,
  AnecdotalRecordFollowup,
  AnecdotalRecordFollowupInput,
  AnecdotalRecordInput,
} from "../domain/anecdotal-record";
import {
  validateAnecdotalRecordFollowupInput,
  validateAnecdotalRecordInput,
} from "../domain/anecdotal-record";
import { ValidationError } from "../domain/errors";
import type { AnecdotalRecordRepository } from "../domain/ports/anecdotal-record-repository";

/**
 * Orchestrates Anecdotal / Guidance Records (Batch 12, ADR-0083). Per
 * `.claude/rules/architecture.md`'s `*-service.ts` convention, this is
 * where input is validated before ever reaching a repository port.
 * School/authorization scope is never a parameter here -- it comes from
 * the caller's authenticated session on the Rust side, matching
 * `FormativeAssessmentApplicationService`'s own convention.
 */
export class AnecdotalRecordApplicationService {
  constructor(private readonly anecdotalRecords: AnecdotalRecordRepository) {}

  async record(input: AnecdotalRecordInput): Promise<AnecdotalRecord> {
    const validated = validateAnecdotalRecordInput(input);
    return this.anecdotalRecords.record(validated);
  }

  async listForSection(sectionId: string, asOfDate: string): Promise<AnecdotalRecord[]> {
    const trimmedSectionId = sectionId.trim();
    if (trimmedSectionId.length === 0) {
      throw new ValidationError("A section is required.");
    }
    const trimmedDate = asOfDate.trim();
    if (trimmedDate.length === 0) {
      throw new ValidationError("A date is required.");
    }
    return this.anecdotalRecords.listForSection(trimmedSectionId, trimmedDate);
  }

  async addFollowup(input: AnecdotalRecordFollowupInput): Promise<AnecdotalRecordFollowup> {
    const validated = validateAnecdotalRecordFollowupInput(input);
    return this.anecdotalRecords.addFollowup(validated);
  }

  async listFollowups(
    anecdotalRecordId: string,
    sectionId: string,
    asOfDate: string,
  ): Promise<AnecdotalRecordFollowup[]> {
    const trimmedRecordId = anecdotalRecordId.trim();
    if (trimmedRecordId.length === 0) {
      throw new ValidationError("An anecdotal record is required.");
    }
    const trimmedSectionId = sectionId.trim();
    if (trimmedSectionId.length === 0) {
      throw new ValidationError("A section is required.");
    }
    const trimmedDate = asOfDate.trim();
    if (trimmedDate.length === 0) {
      throw new ValidationError("A date is required.");
    }
    return this.anecdotalRecords.listFollowups(trimmedRecordId, trimmedSectionId, trimmedDate);
  }
}
