import { invoke } from "./invoke";
import type { LearnerPhoto } from "../../domain/learner-photo";
import type { LearnerPhotoRepository } from "../../domain/ports/learner-photo-repository";

/** Tauri/SQLite implementation of {@link LearnerPhotoRepository}. */
export class TauriLearnerPhotoRepository implements LearnerPhotoRepository {
  async get(learnerId: string): Promise<LearnerPhoto | null> {
    const result = await invoke<[number[], string] | null>("get_learner_photo", { learnerId });
    if (result === null) {
      return null;
    }
    const [bytes, mimeType] = result;
    return { bytes: new Uint8Array(bytes), mimeType };
  }

  set(learnerId: string, photoBytes: Uint8Array, mimeType: string): Promise<boolean> {
    return invoke<boolean>("set_learner_photo", {
      learnerId,
      photoBytes: Array.from(photoBytes),
      photoMime: mimeType,
    });
  }

  clear(learnerId: string): Promise<boolean> {
    return invoke<boolean>("clear_learner_photo", { learnerId });
  }
}
