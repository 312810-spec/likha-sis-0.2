export type TeacherMode = "efficient" | "comfortable" | "guided";

export const TEACHER_MODES: readonly TeacherMode[] = ["efficient", "comfortable", "guided"];

export const DEFAULT_TEACHER_MODE: TeacherMode = "comfortable";

export const TEACHER_MODE_LABELS: Record<TeacherMode, string> = {
  efficient: "Efficient",
  comfortable: "Comfortable",
  guided: "Guided",
};

export function isTeacherMode(value: string): value is TeacherMode {
  return (TEACHER_MODES as readonly string[]).includes(value);
}
