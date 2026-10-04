interface ScheduleWindow {
  weekday: number;
  startsAt: string;
  endsAt: string;
}
interface ScheduleTeacher {
  id: string;
  dailyLimitMinutes: number;
  unavailable: ScheduleWindow[];
}
interface ScheduleRoom {
  id: string;
  name: string;
  capacity: number;
  kind: string;
  unavailable: ScheduleWindow[];
}
interface ScheduleCourse {
  id: string;
  sectionId: string;
  subjectId: string;
  eligibleTeacherIds: string[];
  roomIds: string[];
  learnerCount: number;
  meetingsPerWeek: number;
  durationMinutes: number;
  maxMeetingsPerDay: number;
}
interface ScheduleMeetingLock {
  courseId: string;
  meetingIndex: number;
  teacherId: string;
  weekday: number;
  startsAt: string;
  roomId: string;
}
export interface SchedulePlanInput {
  label: string;
  schoolYear: string;
  termLabel: string;
  effectiveFrom: string;
  effectiveUntil: string;
  dataConfirmed: boolean;
  teachers: ScheduleTeacher[];
  rooms: ScheduleRoom[];
  slots: ScheduleWindow[];
  courses: ScheduleCourse[];
  locks: ScheduleMeetingLock[];
}
interface ScheduleMeetingProposal {
  courseId: string;
  meetingIndex: number;
  teacherId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  roomId: string;
}
interface GenerationResult {
  status: "feasible" | "infeasible" | "unknown";
  meetings: ScheduleMeetingProposal[];
  issues: string[];
  exploredNodes: number;
}
export interface SchedulePlan {
  id: string;
  revision: number;
  status: "draft" | "published";
  input: SchedulePlanInput;
  result: GenerationResult | null;
  publishedAt: string | null;
}
export interface PublishedTeacherMeeting {
  planId: string;
  planLabel: string;
  publishedAt: string;
  effectiveFrom: string;
  effectiveUntil: string;
  courseId: string;
  teachingAssignmentId: string;
  sectionId: string;
  subjectId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  roomId: string;
}
