import type {
  AdvisoryWorkContext,
  TeacherClassWorkContext,
} from "./work-context";

const RESUME_POINTER_KEY = "likha.resume-pointer.v1";
const RESUME_POINTER_VERSION = 1 as const;

export type ResumeDestination = "class" | "advisory";

export interface ResumePointer {
  version: typeof RESUME_POINTER_VERSION;
  userId: string;
  destination: ResumeDestination;
  teachingAssignmentId?: string;
  advisorySectionId?: string;
}

export interface ResumePointerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): ResumePointerStorage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

function isResumePointer(value: unknown): value is ResumePointer {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ResumePointer>;
  if (
    candidate.version !== RESUME_POINTER_VERSION ||
    typeof candidate.userId !== "string" ||
    !candidate.userId.trim() ||
    (candidate.destination !== "class" && candidate.destination !== "advisory")
  ) {
    return false;
  }

  if (candidate.destination === "class") {
    return (
      typeof candidate.teachingAssignmentId === "string" &&
      !!candidate.teachingAssignmentId.trim()
    );
  }

  return (
    typeof candidate.advisorySectionId === "string" &&
    !!candidate.advisorySectionId.trim()
  );
}

export function readResumePointer(
  storage = defaultStorage(),
): ResumePointer | null {
  if (!storage) return null;
  let raw: string | null;
  try { raw = storage.getItem(RESUME_POINTER_KEY); } catch { return null; }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isResumePointer(parsed)) return parsed;
  } catch {
    // Corrupt navigation state is disposable. Academic records are not stored here.
  }

  try { storage.removeItem(RESUME_POINTER_KEY); } catch { /* Navigation storage is optional. */ }
  return null;
}

export function writeClassResumePointer(
  userId: string,
  context: TeacherClassWorkContext,
  storage = defaultStorage(),
): void {
  if (!storage) return;
  const pointer: ResumePointer = {
    version: RESUME_POINTER_VERSION,
    userId,
    destination: "class",
    teachingAssignmentId: context.teachingAssignmentId,
  };
  try { storage.setItem(RESUME_POINTER_KEY, JSON.stringify(pointer)); } catch { /* Navigation storage is optional. */ }
}

export function writeAdvisoryResumePointer(
  userId: string,
  context: AdvisoryWorkContext,
  storage = defaultStorage(),
): void {
  if (!storage) return;
  const pointer: ResumePointer = {
    version: RESUME_POINTER_VERSION,
    userId,
    destination: "advisory",
    advisorySectionId: context.sectionId,
  };
  try { storage.setItem(RESUME_POINTER_KEY, JSON.stringify(pointer)); } catch { /* Navigation storage is optional. */ }
}

export function clearResumePointer(storage = defaultStorage()): void {
  try { storage?.removeItem(RESUME_POINTER_KEY); } catch { /* Navigation storage is optional. */ }
}
