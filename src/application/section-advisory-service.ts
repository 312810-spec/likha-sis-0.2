import { ValidationError } from "../domain/errors";
import type { SectionAdvisoryRepository } from "../domain/ports/section-advisory-repository";
import type {
  AssignAdviserOutcome,
  EndAdvisoryOutcome,
  SectionAdvisory,
} from "../domain/section-advisory";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} is required.`);
  }
  return trimmed;
}

function requireIsoDate(value: string, label: string): string {
  if (!DATE_PATTERN.test(value)) {
    throw new ValidationError(`${label} must be in YYYY-MM-DD format.`);
  }
  return value;
}

/**
 * Application service for section advisory operations.
 * Validates input shapes only; authorization and business rules (e.g. at most
 * one active adviser per section, school isolation) remain authoritative on
 * the Rust backend.
 */
export class SectionAdvisoryApplicationService {
  constructor(private readonly sectionAdvisories: SectionAdvisoryRepository) {}

  async getCurrentAdviser(sectionId: string, asOfDate: string): Promise<SectionAdvisory | null> {
    const section = requireNonEmpty(sectionId, "Section");
    const date = requireIsoDate(asOfDate, "Date");
    return this.sectionAdvisories.getCurrentAdviser(section, date);
  }

  async assignAdviser(
    sectionId: string,
    teacherUserId: string,
    startsOn: string,
  ): Promise<AssignAdviserOutcome> {
    const section = requireNonEmpty(sectionId, "Section");
    const teacher = requireNonEmpty(teacherUserId, "Teacher");
    const date = requireIsoDate(startsOn, "Start date");
    return this.sectionAdvisories.assignAdviser(section, teacher, date);
  }

  async endAdviser(
    sectionId: string,
    advisoryId: string,
    endsOn: string,
  ): Promise<EndAdvisoryOutcome> {
    const section = requireNonEmpty(sectionId, "Section");
    const advisory = requireNonEmpty(advisoryId, "Advisory");
    const date = requireIsoDate(endsOn, "End date");
    return this.sectionAdvisories.endAdviser(section, advisory, date);
  }
}
