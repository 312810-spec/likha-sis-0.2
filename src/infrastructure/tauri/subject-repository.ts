import { invoke } from "./invoke";
import type { Subject } from "../../domain/subject";
import type { SubjectRepository } from "../../domain/ports/subject-repository";

/** Tauri/SQLite implementation of {@link SubjectRepository}. */
export class TauriSubjectRepository implements SubjectRepository {
  list(): Promise<Subject[]> {
    return invoke<Subject[]>("list_subjects_by_school");
  }

  create(name: string): Promise<Subject> {
    return invoke<Subject>("create_subject", { name });
  }
}
