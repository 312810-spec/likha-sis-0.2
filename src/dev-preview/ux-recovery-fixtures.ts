import { LessonPlanApplicationService } from "../application/lesson-plan-service";
import { LearnerSupportApplicationService } from "../application/learner-support-service";
import { ClassOccurrenceApplicationService } from "../application/class-occurrence-service";
import { SchedulePlanningApplicationService } from "../application/schedule-planning-service";
import { Sf1ImportApplicationService } from "../application/sf1-import-service";
import { MyDayApplicationService } from "../application/my-day-service";
import type { LessonPlan } from "../domain/lesson-plan";
import type { LearnerSupportCase } from "../domain/learner-support";
import type { SchedulePlan, PlanPlacement } from "../domain/schedule-planning";
import type { Sf1ImportPreview, Sf1ImportHistoryEntry } from "../domain/sf1-import";

const stamp = "2026-10-10T08:00:00.000Z";
const schoolId = "fixture-school";
const unavailable = async (): Promise<never> => {
  throw new Error("Unsupported synthetic operation");
};

/** Real application services over synthetic memory only; no native commands or database. */
export function recoveryServices(state: string) {
  let lessonReadFails = state === "list-error";
  let plans: LessonPlan[] = [];
  const lessonPlanService = new LessonPlanApplicationService({
    async listByAssignment(id) {
      if (lessonReadFails) {
        lessonReadFails = false;
        throw new Error("Synthetic read failure");
      }
      return plans.filter((plan) => plan.teachingAssignmentId === id);
    },
    async create(teachingAssignmentId, planDate, fields) {
      const plan = {
        ...fields,
        id: `lesson-${plans.length + 1}`,
        schoolId,
        teachingAssignmentId,
        planDate,
        createdByUserId: "teacher-ana",
        createdAt: stamp,
        updatedAt: stamp,
      };
      plans.push(plan);
      lessonReadFails = state === "refresh-error";
      return plan;
    },
    async update(id, teachingAssignmentId, fields) {
      const old = plans.find(
        (plan) => plan.id === id && plan.teachingAssignmentId === teachingAssignmentId,
      );
      if (!old) return null;
      const next = { ...old, ...fields };
      plans = plans.map((plan) => (plan.id === id ? next : plan));
      lessonReadFails = state === "refresh-error";
      return next;
    },
  });
  const seedCase: LearnerSupportCase = {
    id: "support-1",
    schoolId,
    classOccurrenceId: "occurrence-1",
    sectionMembershipId: "membership-1",
    need: "Fraction evidence needs follow-up",
    goal: "Explain equivalent fractions",
    intervention: "Guided practice",
    status: "open",
    participation: null,
    outcome: null,
    openedByUserId: "teacher-ana",
    openedAt: stamp,
    updatedAt: stamp,
    resolvedAt: null,
    learnerGivenName: "Ana",
    learnerFamilyName: "Santos",
  };
  let cases: LearnerSupportCase[] = state === "update-error" ? [seedCase] : [];
  let updateFails = state === "update-error";
  let markerFails = state === "marker-error";
  const learnerSupportService = new LearnerSupportApplicationService({
    async listForOccurrence() {
      return cases;
    },
    async openCase(classOccurrenceId, sectionMembershipId, need, goal, intervention) {
      const result = {
        ...seedCase,
        classOccurrenceId,
        sectionMembershipId,
        need,
        goal,
        intervention,
      };
      cases = [...cases, result];
      return result;
    },
    async recordParticipation(id, participation) {
      const old = cases.find((item) => item.id === id);
      if (!old || old.status !== "open") return null;
      const result: LearnerSupportCase = { ...old, participation, status: "in_progress" };
      cases = cases.map((item) => (item.id === id ? result : item));
      if (updateFails) {
        updateFails = false;
        throw new Error("Synthetic response lost after write");
      }
      return result;
    },
    async resolve(id, outcome) {
      const old = cases.find((item) => item.id === id);
      if (!old || old.status !== "in_progress") return null;
      const result: LearnerSupportCase = { ...old, outcome, status: "resolved", resolvedAt: stamp };
      cases = cases.map((item) => (item.id === id ? result : item));
      return result;
    },
  });
  const classOccurrenceService = new ClassOccurrenceApplicationService({
    start: unavailable,
    capture: unavailable,
    finish: unavailable,
    cancel: unavailable,
    reopen: unavailable,
    getForDate: unavailable,
    listForAssignment: unavailable,
    markFollowup: unavailable,
    listFollowupMarkers: unavailable,
    async clearFollowup(classOccurrenceId, sectionMembershipId) {
      if (markerFails) {
        markerFails = false;
        throw new Error("Synthetic marker failure");
      }
      return {
        id: "marker-1",
        schoolId,
        classOccurrenceId,
        sectionMembershipId,
        reason: seedCase.need,
        clearedAt: stamp,
        markedByUserId: "teacher-ana",
        markedAt: stamp,
      };
    },
  });
  let plan: SchedulePlan = {
    id: "plan-1",
    schoolId,
    revision: 1,
    status: "draft",
    inputFingerprint: "synthetic",
    generatorNote: null,
    createdAt: stamp,
    publishedAt: null,
    publishedByUserId: null,
  };
  let placements: PlanPlacement[] = [
    {
      id: "placement-1",
      planId: plan.id,
      teachingAssignmentId: "ta-1",
      teacherName: "Ana Cruz",
      sectionId: "sec-not-started",
      sectionName: "Mabini",
      subjectName: "Mathematics",
      weekday: 1,
      startsAt: "07:30",
      endsAt: "08:20",
      room: "Room 1",
    },
  ];
  let plannerReadFails = false;
  const schedulePlanningService = new SchedulePlanningApplicationService({
    async getScheduleSettings() {
      return {
        schoolId,
        dayStartsAt: "07:30",
        dayEndsAt: "16:30",
        schoolDays: 5,
        periodMinutes: 50,
        passingMinutes: 10,
        maxDailyTeachingMinutes: 360,
        maxWeeklyTeachingMinutes: 1800,
        updatedAt: stamp,
      };
    },
    updateScheduleSettings: unavailable,
    listTeacherUnavailability: async () => [],
    addTeacherUnavailability: unavailable,
    removeTeacherUnavailability: unavailable,
    listScheduleRooms: async () => [],
    createScheduleRoom: unavailable,
    removeScheduleRoom: unavailable,
    listSubjectScheduleRequirements: async () => [],
    setSubjectScheduleRequirement: unavailable,
    async currentSchedulePlan() {
      if (plannerReadFails) {
        plannerReadFails = false;
        throw new Error("Synthetic schedule read failure");
      }
      return plan;
    },
    async generateSchedulePlan() {
      plan = { ...plan, revision: plan.revision + 1, status: "draft" };
      plannerReadFails = state === "refresh-error";
      return {
        planId: plan.id,
        revision: plan.revision,
        outcome: { outcome: "valid", placements, notes: [] },
      };
    },
    async listSchedulePlanPlacements() {
      return placements;
    },
    async moveSchedulePlanPlacement() {
      return true;
    },
    async removeSchedulePlanPlacement(_planId, id) {
      placements = placements.filter((item) => item.id !== id);
      plannerReadFails = state === "refresh-error";
      return true;
    },
    async validateSchedulePlan() {
      return [];
    },
    async publishSchedulePlan() {
      plan = { ...plan, status: "published", publishedAt: stamp, publishedByUserId: "teacher-ana" };
      plannerReadFails = state === "refresh-error";
      return { outcome: "published", revision: plan.revision, meetingCount: placements.length };
    },
    async listPublishedScheduleViews() {
      return null;
    },
    async listSchedulePlans() {
      return [plan];
    },
  });
  let imported = false;
  const history: Sf1ImportHistoryEntry = {
    id: "import-1",
    schoolId,
    sectionId: "sec-not-started",
    userId: "teacher-ana",
    username: "Ana Cruz",
    sourceFilename: "synthetic-sf1.xlsx",
    sourceFingerprint: "synthetic",
    rowsCommitted: 2,
    newLearnersCreated: 1,
    existingLearnersEnrolled: 1,
    createdAt: stamp,
  };
  const sf1ImportService = new Sf1ImportApplicationService(
    {
      async preview(): Promise<Sf1ImportPreview> {
        const candidate = {
          id: "learner-grace",
          schoolId,
          givenName: "Grace",
          familyName: "Torres",
          lrn: null,
          sex: "F" as const,
          createdAt: stamp,
        };
        return {
          rows: [
            {
              rowNumber: 5,
              givenName: "Ana",
              familyName: "Santos",
              lrn: "111111111111",
              lrnWasPresentButInvalid: false,
              sex: "F",
              sexWasPresentButUnrecognized: false,
              birthdate: null,
              remarks: null,
            },
            {
              rowNumber: 6,
              givenName: "Grace",
              familyName: "Torres",
              lrn: null,
              lrnWasPresentButInvalid: false,
              sex: "F",
              sexWasPresentButUnrecognized: false,
              birthdate: null,
              remarks: null,
            },
          ],
          newRows: imported ? [] : [5],
          exactMatches: imported
            ? [
                {
                  rowNumber: 5,
                  kind: "exact_lrn",
                  candidates: [
                    {
                      ...candidate,
                      id: "learner-ana",
                      givenName: "Ana",
                      familyName: "Santos",
                      lrn: "111111111111",
                    },
                  ],
                  reason: null,
                },
              ]
            : [],
          needsReview: [
            {
              rowNumber: 6,
              kind: "suspected_duplicate",
              candidates: [candidate],
              reason: "Same name; no LRN recorded",
            },
          ],
          errors: [],
          warnings: [],
          previousImport: imported ? history : null,
        };
      },
      async commit() {
        imported = true;
        if (state === "commit-error") throw new Error("Synthetic response lost after import");
        return { rowsCommitted: 2, newLearnersCreated: 1, existingLearnersEnrolled: 1 };
      },
      async listImportHistory() {
        return imported ? [history] : [];
      },
    },
    {
      async pickSf1Workbook() {
        return "/synthetic/synthetic-sf1.xlsx";
      },
    },
  );
  const schedule = {
    teachingAssignmentId: "ta-1",
    subjectName: "Mathematics",
    sectionName: "Mabini",
    startsAt: "07:30",
    endsAt: "08:20",
    room: "Room 1",
  };
  const myDayService = new MyDayApplicationService({
    async getSummary() {
      return {
        schedule: [schedule],
        next: schedule,
        pendingAttendance: [schedule],
        pendingAssignments: [],
        pendingConflicts: [],
        pendingScoring: [
          {
            ...schedule,
            classRecordId: "record-1",
            gradingPeriodLabel: "Quarter 1",
            recordedCount: 1,
            totalCount: 4,
          },
        ],
        pendingFollowups: [
          {
            markerId: "marker-1",
            classOccurrenceId: "occurrence-1",
            sectionMembershipId: "membership-1",
            occurrenceDate: "2026-10-10",
            subjectName: "Mathematics",
            sectionName: "Mabini",
            learnerGivenName: "Ana",
            learnerFamilyName: "Santos",
            reason: seedCase.need,
            markedAt: stamp,
          },
        ],
        hasAnyAssignments: true,
      };
    },
  });
  return {
    lessonPlanService,
    learnerSupportService,
    classOccurrenceService,
    schedulePlanningService,
    sf1ImportService,
    myDayService,
  };
}
