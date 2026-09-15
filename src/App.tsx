import { useEffect, useState } from "react";
import {
  assessmentService,
  attendanceService,
  authService,
  classRecordService,
  conflictReviewService,
  deviceSyncService,
  enrollmentHistoryService,
  exportService,
  formGenerationService,
  gradingService,
  learnerScoreService,
  lessonPlanService,
  learnerService,
  myDayService,
  onSessionExpired,
  schoolAttendanceService,
  schoolLogoService,
  schoolMemberService,
  schoolService,
  sectionAdvisoryService,
  sectionService,
  setupService,
  sf1ImportService,
  subjectAttendanceService,
  subjectService,
  syncStatusService,
  teachingAssignmentService,
} from "./composition";
import type { CurrentSession } from "./domain/session";
import { AttendanceScreen } from "./ui/AttendanceScreen";
import { AdminPasswordResetScreen } from "./ui/AdminPasswordResetScreen";
import { AdviserViewScreen } from "./ui/AdviserViewScreen";
import { AuditLogScreen } from "./ui/AuditLogScreen";
import { ClassRecordsJourneyScreen } from "./ui/ClassRecordsJourneyScreen";
import { ClassRecordsScreen } from "./ui/ClassRecordsScreen";
import { ConflictReviewScreen } from "./ui/ConflictReviewScreen";
import { DeviceManagementScreen } from "./ui/DeviceManagementScreen";
import { SchoolBrandingScreen } from "./ui/SchoolBrandingScreen";
import { SchoolMembershipScreen } from "./ui/SchoolMembershipScreen";
import { FirstRunSetupScreen } from "./ui/FirstRunSetupScreen";
import { LearnerListScreen } from "./ui/LearnerListScreen";
import { LoginScreen } from "./ui/LoginScreen";
import { GradingPeriodsScreen } from "./ui/GradingPeriodsScreen";
import { HomeScreen } from "./ui/HomeScreen";
import { IdleTimeoutWarning } from "./ui/IdleTimeoutWarning";
import { LessonPlanScreen } from "./ui/LessonPlanScreen";
import { MonthlySummaryScreen } from "./ui/MonthlySummaryScreen";
import { MyDayScreen } from "./ui/MyDayScreen";
import { ScheduleMeetingsScreen } from "./ui/ScheduleMeetingsScreen";
import { SectionAdviserScreen } from "./ui/SectionAdviserScreen";
import { SectionRosterScreen } from "./ui/SectionRosterScreen";
import { SectionsScreen } from "./ui/SectionsScreen";
import { Sf1ImportScreen } from "./ui/Sf1ImportScreen";
import { SubjectAttendanceJourneyScreen } from "./ui/SubjectAttendanceJourneyScreen";
import { SubjectMonitorScreen } from "./ui/SubjectMonitorScreen";
import { SyncStatusScreen } from "./ui/SyncStatusScreen";
import { TeacherLoadScreen } from "./ui/TeacherLoadScreen";
import { TeachingAssignmentsScreen } from "./ui/TeachingAssignmentsScreen";
import { TodaysClassesScreen } from "./ui/TodaysClassesScreen";
import type { TeacherClassWorkContext } from "./ui/work-context";
import { AppLayout } from "./ui/shell/AppLayout";
import { TAB_LABELS, type SignedInTab } from "./ui/components/workbench-nav-data";
import { ModeProvider } from "./ui/theme/ModeContext";
import "./ui/theme/styles.css";

function App() {
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [activeTab, setActiveTab] = useState<SignedInTab>("workspace");
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | null>(null);
  const [attendanceSectionId, setAttendanceSectionId] = useState<string | null>(null);
  const [rosterSectionId, setRosterSectionId] = useState<string | null>(null);
  const [monthlySummaryContext, setMonthlySummaryContext] = useState<{
    sectionId: string;
    year: number;
    month: number;
  } | null>(null);
  const [subjectAttendanceAssignmentId, setSubjectAttendanceAssignmentId] = useState<string | null>(
    null,
  );
  const [classWorkContext, setClassWorkContext] = useState<TeacherClassWorkContext | null>(null);
  const [teachingAssignmentsSection, setTeachingAssignmentsSection] = useState<{
    sectionId: string;
    sectionName: string;
  } | null>(null);
  const [sectionAdviserSection, setSectionAdviserSection] = useState<{
    sectionId: string;
    sectionName: string;
  } | null>(null);
  const [scheduleMeetingsAssignment, setScheduleMeetingsAssignment] = useState<{
    teachingAssignmentId: string;
    subjectName: string;
  } | null>(null);

  function clearClassWorkContext() {
    setClassWorkContext(null);
    setSubjectAttendanceAssignmentId(null);
  }

  function handleSessionExpired() {
    clearClassWorkContext();
    setSession(null);
    setSessionExpiredNotice("Your session has expired. Please sign in again.");
  }

  useEffect(() => {
    return onSessionExpired(handleSessionExpired);
  }, []);

  useEffect(() => {
    document.title = session ? `${TAB_LABELS[activeTab]} · LIKHA-SIS` : "LIKHA-SIS";
  }, [session, activeTab]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([setupService.installationStatus(), authService.currentSession()])
      .then(([status, currentSession]) => {
        if (cancelled) return;
        setNeedsSetup(status.needsSetup);
        setSession(currentSession);
      })
      .finally(() => {
        if (!cancelled) setCheckingStatus(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await authService.logout();
    clearClassWorkContext();
    setSessionExpiredNotice(null);
    setSession(null);
  }

  function handleSetupComplete(newSession: CurrentSession) {
    clearClassWorkContext();
    setNeedsSetup(false);
    setSession(newSession);
  }

  function handleLoggedIn(newSession: CurrentSession) {
    clearClassWorkContext();
    setSessionExpiredNotice(null);
    setSession(newSession);
  }

  async function handleReturnToClass() {
    const context = classWorkContext;
    if (!session || !context) {
      clearClassWorkContext();
      setActiveTab("my-day");
      return;
    }

    try {
      const assignments = await subjectAttendanceService.listMyAssignments(session.userId);
      const stillAuthorized = assignments.some(
        (assignment) => assignment.id === context.teachingAssignmentId,
      );
      if (!stillAuthorized) clearClassWorkContext();
    } catch {
      clearClassWorkContext();
    }

    setActiveTab("my-day");
  }

  const bootBrand = <h1 className="app-boot-brand">LIKHA-SIS</h1>;

  return (
    <ModeProvider>
      {checkingStatus ? (
        <div className="app-boot">
          {bootBrand}
          <p role="status">Loading…</p>
        </div>
      ) : needsSetup ? (
        <div className="app-boot">
          {bootBrand}
          <FirstRunSetupScreen setupService={setupService} onSetupComplete={handleSetupComplete} />
        </div>
      ) : session ? (
        <AppLayout
          session={session}
          activeTab={activeTab}
          onNavigate={setActiveTab}
          onLogout={handleLogout}
          schoolLogoService={schoolLogoService}
        >
          <IdleTimeoutWarning authService={authService} onExpired={handleSessionExpired} />
          {activeTab === "workspace" ? (
            <HomeScreen
              roles={session.roles}
              displayName={session.displayName}
              schoolName={session.schoolName}
              attendanceService={attendanceService}
              authService={authService}
              gradingService={gradingService}
              learnerService={learnerService}
              sectionService={sectionService}
              sf1ImportService={sf1ImportService}
              schoolAttendanceService={schoolAttendanceService}
              sectionAdvisoryService={sectionAdvisoryService}
              schoolMemberService={schoolMemberService}
              teachingAssignmentService={teachingAssignmentService}
              onOpenAttendance={(sectionId) => {
                setAttendanceSectionId(sectionId);
                setActiveTab("attendance");
              }}
              onManageSections={() => setActiveTab("sections")}
              onViewAuditLog={() => setActiveTab("audit-log")}
              onOpenSf1Import={() => setActiveTab("sf1-import")}
            />
          ) : activeTab === "learners" ? (
            <LearnerListScreen
              learnerService={learnerService}
              exportService={exportService}
              enrollmentHistoryService={enrollmentHistoryService}
            />
          ) : activeTab === "sections" ? (
            <SectionsScreen
              sectionService={sectionService}
              learnerService={learnerService}
              exportService={exportService}
              onOpenRoster={(sectionId) => {
                setRosterSectionId(sectionId);
                setActiveTab("section-roster");
              }}
              onManageAssignments={(sectionId, sectionName) => {
                setTeachingAssignmentsSection({ sectionId, sectionName });
                setActiveTab("teaching-assignments");
              }}
              onManageAdviser={(sectionId, sectionName) => {
                setSectionAdviserSection({ sectionId, sectionName });
                setActiveTab("section-adviser");
              }}
            />
          ) : activeTab === "section-roster" ? (
            rosterSectionId ? (
              <SectionRosterScreen
                sectionService={sectionService}
                formGenerationService={formGenerationService}
                exportService={exportService}
                sectionId={rosterSectionId}
                onBack={() => setActiveTab("sections")}
                onOpenAttendance={(sectionId) => {
                  setAttendanceSectionId(sectionId);
                  setActiveTab("attendance");
                }}
              />
            ) : (
              <SectionsScreen
                sectionService={sectionService}
                learnerService={learnerService}
                exportService={exportService}
                onOpenRoster={(sectionId) => {
                  setRosterSectionId(sectionId);
                  setActiveTab("section-roster");
                }}
                onManageAssignments={(sectionId, sectionName) => {
                  setTeachingAssignmentsSection({ sectionId, sectionName });
                  setActiveTab("teaching-assignments");
                }}
                onManageAdviser={(sectionId, sectionName) => {
                  setSectionAdviserSection({ sectionId, sectionName });
                  setActiveTab("section-adviser");
                }}
              />
            )
          ) : activeTab === "teaching-assignments" ? (
            teachingAssignmentsSection ? (
              <TeachingAssignmentsScreen
                teachingAssignmentService={teachingAssignmentService}
                subjectService={subjectService}
                schoolMemberService={schoolMemberService}
                sectionId={teachingAssignmentsSection.sectionId}
                sectionName={teachingAssignmentsSection.sectionName}
                onBack={() => setActiveTab("sections")}
                onManageSchedule={(teachingAssignmentId, subjectName) => {
                  setScheduleMeetingsAssignment({ teachingAssignmentId, subjectName });
                  setActiveTab("schedule-meetings");
                }}
              />
            ) : (
              <SectionsScreen
                sectionService={sectionService}
                learnerService={learnerService}
                exportService={exportService}
                onOpenRoster={(sectionId) => {
                  setRosterSectionId(sectionId);
                  setActiveTab("section-roster");
                }}
                onManageAssignments={(sectionId, sectionName) => {
                  setTeachingAssignmentsSection({ sectionId, sectionName });
                  setActiveTab("teaching-assignments");
                }}
                onManageAdviser={(sectionId, sectionName) => {
                  setSectionAdviserSection({ sectionId, sectionName });
                  setActiveTab("section-adviser");
                }}
              />
            )
          ) : activeTab === "section-adviser" ? (
            sectionAdviserSection ? (
              <SectionAdviserScreen
                sectionAdvisoryService={sectionAdvisoryService}
                schoolMemberService={schoolMemberService}
                sectionId={sectionAdviserSection.sectionId}
                sectionName={sectionAdviserSection.sectionName}
                onBack={() => setActiveTab("sections")}
              />
            ) : (
              <SectionsScreen
                sectionService={sectionService}
                learnerService={learnerService}
                exportService={exportService}
                onOpenRoster={(sectionId) => {
                  setRosterSectionId(sectionId);
                  setActiveTab("section-roster");
                }}
                onManageAssignments={(sectionId, sectionName) => {
                  setTeachingAssignmentsSection({ sectionId, sectionName });
                  setActiveTab("teaching-assignments");
                }}
                onManageAdviser={(sectionId, sectionName) => {
                  setSectionAdviserSection({ sectionId, sectionName });
                  setActiveTab("section-adviser");
                }}
              />
            )
          ) : activeTab === "schedule-meetings" ? (
            scheduleMeetingsAssignment && teachingAssignmentsSection ? (
              <ScheduleMeetingsScreen
                teachingAssignmentService={teachingAssignmentService}
                teachingAssignmentId={scheduleMeetingsAssignment.teachingAssignmentId}
                subjectName={scheduleMeetingsAssignment.subjectName}
                sectionName={teachingAssignmentsSection.sectionName}
                onBack={() => setActiveTab("teaching-assignments")}
              />
            ) : (
              <SectionsScreen
                sectionService={sectionService}
                learnerService={learnerService}
                exportService={exportService}
                onOpenRoster={(sectionId) => {
                  setRosterSectionId(sectionId);
                  setActiveTab("section-roster");
                }}
                onManageAssignments={(sectionId, sectionName) => {
                  setTeachingAssignmentsSection({ sectionId, sectionName });
                  setActiveTab("teaching-assignments");
                }}
                onManageAdviser={(sectionId, sectionName) => {
                  setSectionAdviserSection({ sectionId, sectionName });
                  setActiveTab("section-adviser");
                }}
              />
            )
          ) : activeTab === "sf1-import" ? (
            <Sf1ImportScreen sf1ImportService={sf1ImportService} sectionService={sectionService} />
          ) : activeTab === "attendance" ? (
            <AttendanceScreen
              attendanceService={attendanceService}
              sectionService={sectionService}
              initialSectionId={attendanceSectionId ?? undefined}
              onViewMonthlySummary={(sectionId, year, month) => {
                setMonthlySummaryContext({ sectionId, year, month });
                setActiveTab("monthly-summary");
              }}
            />
          ) : activeTab === "my-day" ? (
            <MyDayScreen
              myDayService={myDayService}
              selectedClassContext={classWorkContext}
              onOpenClassContext={setClassWorkContext}
              onBackToToday={() => setClassWorkContext(null)}
              onCheckAttendance={(teachingAssignmentId) => {
                setSubjectAttendanceAssignmentId(teachingAssignmentId);
                setActiveTab("subject-attendance");
              }}
              onOpenClassRecords={(teachingAssignmentId) => {
                if (classWorkContext?.teachingAssignmentId === teachingAssignmentId) {
                  setActiveTab("class-records");
                }
              }}
              onReviewConflicts={() => setActiveTab("conflict-review")}
            />
          ) : activeTab === "today-classes" ? (
            <TodaysClassesScreen
              subjectAttendanceService={subjectAttendanceService}
              teacherUserId={session.userId}
              onCheckAttendance={(teachingAssignmentId) => {
                setClassWorkContext(null);
                setSubjectAttendanceAssignmentId(teachingAssignmentId);
                setActiveTab("subject-attendance");
              }}
            />
          ) : activeTab === "subject-attendance" ? (
            <SubjectAttendanceJourneyScreen
              subjectAttendanceService={subjectAttendanceService}
              teacherUserId={session.userId}
              initialAssignmentId={subjectAttendanceAssignmentId ?? undefined}
              classContext={classWorkContext}
              onBackToClass={classWorkContext ? handleReturnToClass : undefined}
            />
          ) : activeTab === "subject-monitor" ? (
            <SubjectMonitorScreen
              subjectAttendanceService={subjectAttendanceService}
              teacherUserId={session.userId}
            />
          ) : activeTab === "adviser-view" ? (
            <AdviserViewScreen subjectAttendanceService={subjectAttendanceService} />
          ) : activeTab === "teacher-load" ? (
            <TeacherLoadScreen
              teachingAssignmentService={teachingAssignmentService}
              subjectAttendanceService={subjectAttendanceService}
              schoolMemberService={schoolMemberService}
              teacherUserId={session.userId}
            />
          ) : activeTab === "monthly-summary" ? (
            <MonthlySummaryScreen
              attendanceService={attendanceService}
              sectionService={sectionService}
              exportService={exportService}
              schoolName={session.schoolName}
              initialSectionId={monthlySummaryContext?.sectionId}
              initialYearMonth={
                monthlySummaryContext
                  ? { year: monthlySummaryContext.year, month: monthlySummaryContext.month }
                  : undefined
              }
            />
          ) : activeTab === "grading-periods" ? (
            <GradingPeriodsScreen gradingService={gradingService} />
          ) : activeTab === "class-records" ? (
            classWorkContext ? (
              <ClassRecordsJourneyScreen
                classContext={classWorkContext}
                teacherUserId={session.userId}
                subjectAttendanceService={subjectAttendanceService}
                classRecordService={classRecordService}
                gradingService={gradingService}
                assessmentService={assessmentService}
                learnerScoreService={learnerScoreService}
                exportService={exportService}
                onBackToClass={handleReturnToClass}
              />
            ) : (
              <ClassRecordsScreen
                classRecordService={classRecordService}
                sectionService={sectionService}
                subjectService={subjectService}
                gradingService={gradingService}
                assessmentService={assessmentService}
                learnerScoreService={learnerScoreService}
                exportService={exportService}
              />
            )
          ) : activeTab === "lesson-plans" ? (
            <LessonPlanScreen
              lessonPlanService={lessonPlanService}
              subjectAttendanceService={subjectAttendanceService}
              teacherUserId={session.userId}
            />
          ) : activeTab === "audit-log" ? (
            <AuditLogScreen authService={authService} />
          ) : activeTab === "admin-password-reset" ? (
            <AdminPasswordResetScreen schoolMemberService={schoolMemberService} />
          ) : activeTab === "school-members" ? (
            <SchoolMembershipScreen schoolMemberService={schoolMemberService} />
          ) : activeTab === "devices" ? (
            <DeviceManagementScreen deviceSyncService={deviceSyncService} />
          ) : activeTab === "school-branding" ? (
            <SchoolBrandingScreen schoolLogoService={schoolLogoService} />
          ) : activeTab === "conflict-review" ? (
            <ConflictReviewScreen conflictReviewService={conflictReviewService} />
          ) : activeTab === "sync-status" ? (
            <SyncStatusScreen
              syncStatusService={syncStatusService}
              onReviewConflicts={() => setActiveTab("conflict-review")}
            />
          ) : null}
        </AppLayout>
      ) : (
        <div className="app-boot">
          {bootBrand}
          <LoginScreen
            authService={authService}
            schoolService={schoolService}
            onLoggedIn={handleLoggedIn}
            notice={sessionExpiredNotice}
          />
        </div>
      )}
    </ModeProvider>
  );
}

export default App;