/** Three independent numbers, always derived server-side, never stored
 * -- mirrors Rust's `TeacherLoad` exactly. Deliberately never balanced
 * into one combined score; see
 * `docs/adr/0039-teacher-load-class-schedule-foundation.md` for why
 * PRODUCT-CONTRACT §6 requires tracking classroom teaching time and
 * distinct preparation count separately. `weeklyInstructionalMinutes`
 * is 0 whenever none of the teacher's assignments have a schedule
 * meeting yet -- an assignment can legitimately exist before it is
 * scheduled. */
export interface TeacherLoad {
  assignmentCount: number;
  distinctSubjectCount: number;
  weeklyInstructionalMinutes: number;
}
