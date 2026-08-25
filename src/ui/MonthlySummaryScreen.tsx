import { useEffect, useRef, useState } from "react";
import type { AttendanceApplicationService } from "../application/attendance-service";
import type { ExportApplicationService } from "../application/export-service";
import type { SectionApplicationService } from "../application/section-service";
import type { AttendanceStatus, MonthlyAttendanceReport } from "../domain/attendance";
import { ValidationError } from "../domain/errors";
import type { Sf2ExportResult } from "../domain/export";
import type { Section } from "../domain/section";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface MonthlySummaryScreenProps {
  attendanceService: AttendanceApplicationService;
  sectionService: SectionApplicationService;
  exportService: ExportApplicationService;
  schoolName: string;
  /** A section to select by default instead of the first loaded section --
   * set when a teacher arrives here via AttendanceScreen's "View monthly
   * summary" transition for the section/month they were just working in.
   * Verified against the actually-loaded section list before use, exactly
   * like AttendanceScreen's own `initialSectionId` -- never trusted
   * blindly. See docs/adr/0033-daily-attendance-and-monthly-summary-polish.md. */
  initialSectionId?: string;
  /** The year/month to select by default instead of the current month --
   * paired with `initialSectionId` for the same context-preserving
   * transition. Both or neither should be supplied. */
  initialYearMonth?: { year: number; month: number };
}

const STATUS_ABBREVIATIONS: Record<AttendanceStatus, string> = {
  present: "P",
  absent: "A",
  tardy: "T",
};

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  tardy: "Tardy",
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function MonthlySummaryScreen({
  attendanceService,
  sectionService,
  exportService,
  schoolName,
  initialSectionId,
  initialYearMonth,
}: MonthlySummaryScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [{ year, month }, setYearMonth] = useState(initialYearMonth ?? currentYearMonth());
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  const [report, setReport] = useState<MonthlyAttendanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportError, setReportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<Sf2ExportResult | null>(null);

  // Request identity for the section-list, report, and export requests --
  // guards against an in-flight request whose context (section/month) has
  // since changed from applying its result to the now-current context.
  const sectionsRequestRef = useRef(0);
  const reportRequestRef = useRef(0);
  const exportRequestRef = useRef(0);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function loadSections() {
    const requestId = ++sectionsRequestRef.current;
    setSectionsLoading(true);
    setSectionsError(null);
    sectionService
      .listSections()
      .then((result) => {
        if (sectionsRequestRef.current !== requestId) return;
        setSections(result);
        const preselected =
          initialSectionId && result.some((section) => section.id === initialSectionId)
            ? initialSectionId
            : result[0]?.id;
        if (preselected) setSectionId(preselected);
      })
      .catch(() => {
        if (sectionsRequestRef.current !== requestId) return;
        setSectionsError("Could not load sections.");
      })
      .finally(() => {
        if (sectionsRequestRef.current !== requestId) return;
        setSectionsLoading(false);
      });
  }

  useEffect(() => {
    // initialSectionId is a mount-time-only default -- see AttendanceScreen's
    // identical rationale. loadSections() itself sets loading/error/result
    // state as its fetch settles -- a deliberate load-on-mount-or-service-
    // change pattern, not an accidental cascading-render risk.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionService]);

  function loadReport() {
    if (!sectionId) return;
    const requestId = ++reportRequestRef.current;
    setLoading(true);
    setReportError(null);
    attendanceService
      .monthlySummary(sectionId, year, month)
      .then((result) => {
        if (reportRequestRef.current !== requestId) return;
        setReport(result);
      })
      .catch((err) => {
        if (reportRequestRef.current !== requestId) return;
        setReportError(
          err instanceof ValidationError ? err.message : "Could not load the monthly summary.",
        );
      })
      .finally(() => {
        if (reportRequestRef.current !== requestId) return;
        setLoading(false);
      });
  }

  useEffect(() => {
    // Clear the previous section/month's report immediately -- a failed
    // load must never leave a different context's report rendered as if
    // it belongs to the newly selected section/month. This is a
    // deliberate context-reset-then-reload pattern (see ADR-0033), not an
    // accidental cascading-render risk.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReport(null);
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceService, sectionId, year, month]);

  function handleMonthChange(value: string) {
    const [newYear, newMonth] = value.split("-").map(Number);
    if (!newYear || !newMonth) return;
    // Invalidate any export still in flight for the context being left --
    // its result (success or failure) must never surface under the new
    // month once it arrives.
    exportRequestRef.current += 1;
    setExportResult(null);
    setExportError(null);
    setYearMonth({ year: newYear, month: newMonth });
  }

  function handleSectionChange(newSectionId: string) {
    exportRequestRef.current += 1;
    setExportResult(null);
    setExportError(null);
    setSectionId(newSectionId);
  }

  async function handleExportSf2() {
    const requestId = ++exportRequestRef.current;
    setExportError(null);
    setExporting(true);
    try {
      const result = await exportService.exportSectionMonthlySf2(sectionId, year, month);
      // The teacher may have changed section/month while the export was
      // in flight -- never show a stale export's result (success or
      // failure) once the context it was for is no longer current.
      if (exportRequestRef.current !== requestId) return;
      if (result === null) {
        setExportError("Could not export — this section could not be found.");
      } else {
        setExportResult(result);
      }
    } catch (err) {
      if (exportRequestRef.current !== requestId) return;
      setExportError(
        err instanceof ValidationError ? err.message : "Could not export this report.",
      );
    } finally {
      if (exportRequestRef.current === requestId) setExporting(false);
    }
  }

  const monthInputValue = `${year}-${String(month).padStart(2, "0")}`;
  const maxMonthValue = (() => {
    const { year: y, month: m } = currentYearMonth();
    return `${y}-${String(m).padStart(2, "0")}`;
  })();

  const selectedSection = sections.find((section) => section.id === sectionId) ?? null;

  return (
    <section aria-label="Monthly attendance summary">
      <h2 ref={headingRef} tabIndex={-1}>
        Monthly Attendance Summary
      </h2>

      <p className="field-hint">
        This is a monthly overview inspired by DepEd School Form 2 (SF2) — it is{" "}
        <strong>not</strong> a verified, submission-ready reproduction of the official form. This
        app's Present/Absent/Tardy categories match DepEd's three per-day codes, but section
        rosters, school-day calendars, and holidays are not yet verified against an official source.
        Treat this as a working reference for your own records.
      </p>

      <p className="field-hint">
        Legend: <strong>P</strong> Present · <strong>A</strong> Absent · <strong>T</strong> Tardy ·{" "}
        <strong>—</strong> not recorded (no attendance mark was made for that day — this does not
        mean the learner was present).
      </p>

      {mode === "guided" && (
        <p className="field-hint">
          Pick a section and month to see every learner's attendance for that month.
        </p>
      )}

      {sectionsError && (
        <Alert tone="error">
          <p>{sectionsError}</p>
          <button type="button" onClick={loadSections}>
            Retry
          </button>
        </Alert>
      )}

      {sectionsLoading ? (
        <Loading label="Loading sections…" />
      ) : sections.length === 0 ? (
        sectionsError ? null : (
          <EmptyState>No sections created yet. Create a section under "Sections" first.</EmptyState>
        )
      ) : (
        <>
          <div className="form-row">
            <div className="field">
              <label htmlFor="summary-section">Section</label>
              <select
                id="summary-section"
                value={sectionId}
                onChange={(event) => handleSectionChange(event.target.value)}
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name} — Grade {section.gradeLevel}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="summary-month">Month</label>
              <input
                id="summary-month"
                type="month"
                value={monthInputValue}
                max={maxMonthValue}
                onChange={(event) => handleMonthChange(event.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            className="button-primary"
            disabled={exporting || loading || !report || report.learners.length === 0}
            onClick={handleExportSf2}
          >
            {exporting ? "Exporting…" : "Export SF2 (CSV)"}
          </button>

          {exportError && <Alert tone="error">{exportError}</Alert>}

          {exportResult && (
            <Alert tone="success">
              <p>
                Saved to <code>{exportResult.filePath}</code>.
              </p>
              <p>
                This file is DepEd-SF2-<em>inspired</em>, not a submission-ready reproduction. It
                does <strong>not</strong> include:
              </p>
              <ul>
                {exportResult.disclosure.omittedFields.map((omitted) => (
                  <li key={omitted.field}>
                    <strong>{omitted.field}</strong> — {omitted.reason}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          {reportError && (
            <Alert tone="error">
              <p>{reportError}</p>
              <button type="button" onClick={loadReport}>
                Retry
              </button>
            </Alert>
          )}

          {loading ? (
            <Loading label="Loading summary…" />
          ) : reportError ? null : !report || report.learners.length === 0 ? (
            <EmptyState>No learners enrolled in this section yet.</EmptyState>
          ) : (
            <div className="monthly-summary-scroll">
              <table className="monthly-summary">
                <caption>
                  {schoolName}
                  {selectedSection ? ` — ${selectedSection.name}` : ""} —{" "}
                  {MONTH_NAMES[report.month - 1]} {report.year}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Learner</th>
                    {report.schoolDays.map((day) => (
                      <th scope="col" key={day}>
                        {day}
                      </th>
                    ))}
                    <th scope="col">Present</th>
                    <th scope="col">Absent</th>
                    <th scope="col">Tardy</th>
                  </tr>
                </thead>
                <tbody>
                  {report.learners.map((learner) => (
                    <tr key={learner.learnerId}>
                      <th scope="row">
                        {learner.givenName} {learner.familyName}
                      </th>
                      {learner.days.map((status, index) => (
                        <td key={report.schoolDays[index]}>
                          {status ? (
                            <span
                              aria-label={`${MONTH_NAMES[report.month - 1]} ${report.schoolDays[index]}: ${STATUS_LABELS[status]}`}
                            >
                              {STATUS_ABBREVIATIONS[status]}
                            </span>
                          ) : (
                            <span
                              aria-label={`${MONTH_NAMES[report.month - 1]} ${report.schoolDays[index]}: not recorded`}
                            >
                              —
                            </span>
                          )}
                        </td>
                      ))}
                      <td>{learner.presentCount}</td>
                      <td>{learner.absentCount}</td>
                      <td>{learner.tardyCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
