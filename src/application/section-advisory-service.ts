import { ValidationError } from "../domain/errors";
import type { SectionAdvisoryRepository } from "../domain/ports/section-advisory-repository";
import type {
  AssignAdviserOutcome,
  EndAdvisoryOutcome,
  SectionAdvisory,
} from "../domain/section-advisory";

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} is required.`);
  }
  return trimmed;
}

/** Wave 3G: assign/reassign a section's adviser. Validates shape/
 * non-empty input only, matching every other `*ApplicationService`'s
 * convention -- the backend stays authoritative on authorization
 * (School-Head-only `ManageSectionAdvisories` for writes) and every
 * domain rule ("at most one active adviser per section," a teacher
 * must be a member of the school). Reassignment is deliberately
 * explicit end-then-assign, not a one-step "replace" -- the same
 * convention `TeachingAssignmentApplicationService` already
 * established for its own remove-then-create shape. */
export class SectionAdvisoryApplicationService {
  constructor(private readonly sectionAdvisories: SectionAdvisoryRepository) {}

  async currentAdviser(sectionId: string, asOfDate: string): Promise<SectionAdvisory | null> {
    const section = requireNonEmpty(sectionId, "Section");
    const date = requireNonEmpty(asOfDate, "Date");
    return this.sectionAdvisories.currentAdviser(section, date);
  }

  async assign(
    sectionId: string,
    teacherUserId: string,
    startsOn: string,
  ): Promise<AssignAdviserOutcome> {
    const section = requireNonEmpty(sectionId, "Section");
    const teacher = requireNonEmpty(teacherUserId, "Teacher");
    const starts = requireNonEmpty(startsOn, "Start date");
    return this.sectionAdvisories.assign(section, teacher, starts);
  }

  async end(sectionId: string, advisoryId: string, endsOn: string): Promise<EndAdvisoryOutcome> {
    const section = requireNonEmpty(sectionId, "Section");
    const advisory = requireNonEmpty(advisoryId, "Advisory");
    const ends = requireNonEmpty(endsOn, "End date");
    return this.sectionAdvisories.end(section, advisory, ends);
  }
}
