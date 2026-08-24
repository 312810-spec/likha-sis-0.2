import { useEffect, useRef, useState } from "react";
import type { AttendanceApplicationService } from "../application/attendance-service";
import type { ExportApplicationService } from "../application/export-service";
import type { SectionApplicationService } from "../application/section-service";
import type { AttendanceStatus, MonthlyAttendanceReport } from "../domain/attendance";
import { ValidationError } from "../domain/errors";
import type { Sf2ExportResult } from "../domain/export";
import type { Section } from "../domain/section";
import { useTeacherMode } from "./theme/useTeacherMode";

interface MonthlySummaryScreenProps {
  attendanceService: AttendanceApplicationService;
  sectionService: SectionApplicationService;
  exportService: ExportApplicationService;
  schoolName: string;
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
}: MonthlySummaryScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [{ year, month }, setYearMonth] = useState(currentYearMonth);
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [report, setReport] = useState<MonthlyAttendanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<Sf2ExportResult | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    sectionService
      .listSections()
      .then((result) => {
        if (cancelled) return;
        setSections(result);
        if (result[0]) setSectionId(result[0].id);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load sections.");
      })
      .finally(() => {
        if (!cancelled) setSectionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sectionService]);

  useEffect(() => {
    if (!sectionId) return;
    let cancelled = false;
    attendanceService
      .monthlySummary(sectionId, year, month)
      .then((result) => {
        if (!cancelled) setReport(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ValidationError ? err.message : "Could not load the monthly summary.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attendanceService, sectionId, year, month]);

  function handleMonthChange(value: string) {
    const [newYear, newMonth] = value.split("-").map(Number);
    if (!newYear || !newMonth) return;
    setError(null);
    setLoading(true);
    setExportResult(null);
    setYearMonth({ year: newYear, month: newMonth });
  }

  function handleSectionChange(newSectionId: string) {
    setError(null);
    setLoading(true);
    setExportResult(null);
    setSectionId(newSectionId);
  }

  async function handleExportSf2() {
    setError(null);
    setExporting(true);
    try {
      const result = await exportService.exportSectionMonthlySf2(sectionId, year, month);
      if (result === null) {
        setError("Could not export — this section could not be found.");
      } else {
        setExportResult(result);
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not export this report.");
    } finally {
      setExporting(false);
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

      {mode === "guided" && (
        <p className="field-hint">
          Pick a section and month to see every learner's attendance for that month.
        </p>
      )}

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {sectionsLoading ? (
        <p role="status">Loading sections…</p>
      ) : sections.length === 0 ? (
        <p>No sections created yet. Create a section under "Sections" first.</p>
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

          {exportResult && (
            <div className="confirmation-banner" role="status">
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
            </div>
          )}

          {loading ? (
            <p role="status">Loading summary…</p>
          ) : !report || report.learners.length === 0 ? (
            <p>No learners enrolled in this section yet.</p>
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
                            <span aria-hidden="true">&nbsp;</span>
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
