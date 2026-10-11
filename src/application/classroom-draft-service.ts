import type {
  ClassroomDraft,
  ClassroomDraftFields,
  ClassroomDraftRepository,
  ClassroomDraftScope,
} from "../domain/ports/classroom-draft-repository";
/** Explicit teacher restore/discard; loading a draft never applies it to a record. */
export class ClassroomDraftApplicationService {
  constructor(private readonly repository: ClassroomDraftRepository) {}
  load(scope: ClassroomDraftScope): Promise<ClassroomDraft | null> {
    return this.repository.load(scope);
  }
  save(scope: ClassroomDraftScope, fields: ClassroomDraftFields): Promise<ClassroomDraft> {
    return this.repository.save(scope, fields);
  }
  remove(scope: ClassroomDraftScope): Promise<void> {
    return this.repository.remove(scope);
  }
}
