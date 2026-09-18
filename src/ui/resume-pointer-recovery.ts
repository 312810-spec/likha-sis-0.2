import type { AdvisoryWorkContext, TeacherClassWorkContext } from "./work-context";
import { clearResumePointer, readResumePointer, type ResumePointerStorage } from "./resume-pointer";

export type ResumeRecovery =
  | { destination: "class"; context: TeacherClassWorkContext }
  | { destination: "advisory"; context: AdvisoryWorkContext };

export interface ResumePointerAuthority {
  findAuthorizedClass(teachingAssignmentId: string): Promise<TeacherClassWorkContext | null>;
  isAuthorizedAdvisorySection(sectionId: string): Promise<boolean>;
}

/**
 * Restores navigation only after current trusted scope has been checked.
 * The persisted pointer is never authorization evidence and contains no
 * learner, score, attendance, grade, subject, section-name, or room data.
 */
export async function recoverResumePointer(
  userId: string,
  authority: ResumePointerAuthority,
  storage?: ResumePointerStorage,
): Promise<ResumeRecovery | null> {
  const pointer = readResumePointer(storage);
  if (!pointer) return null;

  if (pointer.userId !== userId) {
    clearResumePointer(storage);
    return null;
  }

  try {
    if (pointer.destination === "class" && pointer.teachingAssignmentId) {
      const context = await authority.findAuthorizedClass(pointer.teachingAssignmentId);
      if (context) return { destination: "class", context };
    }

    if (pointer.destination === "advisory" && pointer.advisorySectionId) {
      if (await authority.isAuthorizedAdvisorySection(pointer.advisorySectionId)) {
        return { destination: "advisory", context: { sectionId: pointer.advisorySectionId } };
      }
    }
  } catch {
    // Fail closed. A pointer that cannot be revalidated must not restore UI scope.
  }

  clearResumePointer(storage);
  return null;
}
