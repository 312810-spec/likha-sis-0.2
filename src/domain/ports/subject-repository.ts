import type { Subject } from "../subject";

/** Repository port for subjects. Implicitly scoped to the current
 * session's school — no `schoolId` parameter anywhere here, same
 * convention as {@link SectionRepository}. */
export interface SubjectRepository {
  list(): Promise<Subject[]>;
  create(name: string): Promise<Subject>;
}
