import { useEffect, useState } from "react";
import type { CurrentSession } from "../domain/session";
import type { Section } from "../domain/section";
import type { Subject } from "../domain/subject";
import type { SchoolMember } from "../domain/school-member";
import {
  schoolMemberService,
  sectionService,
  subjectService,
  subjectAttendanceService,
  schedulePlanService,
  schoolResourcesService,
  schoolPlanningService,
  reviewWorkflowService,
  schoolOfferingsService,
} from "../composition";
import { SchedulePlannerScreen } from "./SchedulePlannerScreen";
import { PublishedScheduleScreen } from "./PublishedScheduleScreen";
import { AttachmentsScreen } from "./AttachmentsScreen";
import { SchoolResourcesScreen } from "./SchoolResourcesScreen";
import { SchoolPlanningScreen } from "./SchoolPlanningScreen";
import { ReviewWorkspaceScreen } from "./ReviewWorkspaceScreen";
import { SchoolOfferingsScreen } from "./SchoolOfferingsScreen";
import { Loading } from "./components/Loading";
import { Alert } from "./components/Alert";

export type NewSchoolDestination =
  | "schedule-planner"
  | "published-schedule"
  | "attachments"
  | "school-resources"
  | "school-planning"
  | "review-workspace"
  | "school-offerings";
export function NewSchoolWorkspace({
  destination,
  session,
  onOpenClass,
}: {
  destination: NewSchoolDestination;
  session: CurrentSession;
  onOpenClass: (id: string) => void;
}) {
  const [data, setData] = useState<{
    sections: Section[];
    subjects: Subject[];
    members: SchoolMember[];
    learners: { id: string; label: string }[];
  } | null>(null);
  const [error, setError] = useState(false);
  const isHead = session.roles.includes("school_head");
  const adminRecords = isHead || session.roles.includes("registrar");
  useEffect(() => {
    let active = true;
    const today = new Date().toLocaleDateString("en-CA");
    const load = async () => {
      if (["published-schedule", "attachments"].includes(destination))
        return { sections: [], subjects: [], members: [], learners: [] };
      const advisory = adminRecords
        ? []
        : await subjectAttendanceService.listAdviserViewSections(today);
      let sections = adminRecords ? await sectionService.listSections() : advisory;
      if (!adminRecords && destination === "school-resources") {
        const assigned = await subjectAttendanceService.listMyAssignments(session.userId);
        const all = await sectionService.listSections();
        const ids = new Set([...sections.map((s) => s.id), ...assigned.map((a) => a.sectionId)]);
        sections = all.filter((s) => ids.has(s.id));
      }
      const [subjects, members] = await Promise.all([
        ["schedule-planner", "school-offerings"].includes(destination)
          ? subjectService.listSubjects()
          : Promise.resolve([]),
        ["schedule-planner", "school-planning", "review-workspace"].includes(destination)
          ? schoolMemberService.listMembers()
          : Promise.resolve([]),
      ]);
      const roster =
        destination === "school-resources"
          ? (await Promise.all(sections.map((s) => sectionService.roster(s.id, today)))).flat()
          : [];
      const learners = [
        ...new Map(
          roster.map((r) => [
            r.learnerId,
            { id: r.learnerId, label: `${r.familyName}, ${r.givenName}` },
          ]),
        ).values(),
      ];
      return { sections, subjects, members, learners };
    };
    void load()
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [destination, session.userId, adminRecords]);
  if (destination === "schedule-planner" && !isHead)
    return <Alert tone="error">The School Head manages published teacher loads.</Alert>;
  if (error)
    return (
      <Alert tone="error">
        Could not load your authorized workspace. Reopen this page to retry.
      </Alert>
    );
  if (!data) return <Loading label="Loading your workspace…" />;
  switch (destination) {
    case "schedule-planner":
      return (
        <SchedulePlannerScreen
          service={schedulePlanService}
          members={data.members}
          sections={data.sections}
          subjects={data.subjects}
        />
      );
    case "published-schedule":
      return <PublishedScheduleScreen service={schedulePlanService} onOpenClass={onOpenClass} />;
    case "attachments":
      return <AttachmentsScreen service={schoolResourcesService} />;
    case "school-resources":
      return <SchoolResourcesScreen service={schoolResourcesService} learners={data.learners} />;
    case "school-planning":
      return (
        <SchoolPlanningScreen
          service={schoolPlanningService}
          members={data.members}
          canManage={isHead}
        />
      );
    case "review-workspace":
      return (
        <ReviewWorkspaceScreen
          service={reviewWorkflowService}
          resourcesService={schoolResourcesService}
          sections={data.sections}
          members={data.members}
          userId={session.userId}
          isSchoolHead={isHead}
        />
      );
    case "school-offerings":
      return (
        <SchoolOfferingsScreen
          service={schoolOfferingsService}
          subjects={data.subjects}
          canManage={isHead}
        />
      );
  }
}
