import { invoke } from "@tauri-apps/api/core";
import type {
  ClassroomDraft,
  ClassroomDraftFields,
  ClassroomDraftRepository,
  ClassroomDraftScope,
} from "../../domain/ports/classroom-draft-repository";
export class TauriClassroomDraftRepository implements ClassroomDraftRepository {
  load(scope: ClassroomDraftScope): Promise<ClassroomDraft | null> {
    return invoke("load_classroom_draft", { ...scope });
  }
  save(scope: ClassroomDraftScope, fields: ClassroomDraftFields): Promise<ClassroomDraft> {
    return invoke("save_classroom_draft", { ...scope, fields });
  }
  remove(scope: ClassroomDraftScope): Promise<void> {
    return invoke("remove_classroom_draft", { ...scope });
  }
}
