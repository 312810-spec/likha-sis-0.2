import { useEffect, useRef, useState } from "react";
import type { AdviserMonthlyAttendanceApplicationService } from "../application/adviser-monthly-attendance-service";
import type { MonthlyAttendanceReport } from "../domain/attendance";
import type { Sf2ExportResult } from "../domain/export";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";

interface AdviserMonthlyAttendancePanelProps {
  service: AdviserMonthlyAttendanceApplicationService;
  sectionId: string;
  asOfDate: string;
  sectionName: string;
}

function monthFromIsoDate(asOfDate: string): { year: number; month: number } {
  const [year, month] = asOfDate.split("-").map(Number);
  return { year: year ?? 0, month: month ?? 0 };
}

function statusLabel(status: "present" | "absent" | "tardy" | null): string {
  if (status === "present") return "P";
  if (status === "absent") return "A";
  if (status === "tardy") return "T";
  return "—";
}

export function AdviserMonthlyAttendancePanel({
  service,
  sectionId,
  asOfDate,
  sectionName,
}: AdviserMonthlyAttendancePanelProps) {
  const requestRef = useRef(0);
  const [report, setReport] = useState<MonthlyAttendanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<Sf2ExportResult | null>(null);
  const { year, month } = monthFromIsoDate(asOfDate);

  function loadMonthlyPreview() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    setExportResult(null);
    service
      .summary(sectionId, year, month)
      .then((result) => {
        if (requestRef.current !== requestId) return;
        setReport(result);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setReport(null);
        setError(
          "Could not load the monthly attendance preview. Your advisory assignment or permission may have changed.",
        );
      })
      .finally(() => {
        if (requestRef.current === requestId) setLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReport(null);
    loadMonthlyPreview();
    return () => {
      requestRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, sectionId, year, month]);

  async function exportSf2Inspired() {
    setExporting(true);
    setExportResult(null);
    setError(null);
    try {
      const result = await service.exportSf2(sectionId, year, month);
      setExportResult(result);
    } catch {
      setError(
        "Could not create the SF2-inspired export. Your advisory assignment or permission may have changed.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <section aria-labelledby="monthly-attendance-heading">
      <h2 id="monthly-attendance-heading">Monthly attendance preview</h2>
      <p className="field-hint">
        Preview official advisory attendance for this calendar month. The export is SF2-inspired and
        is not a submission-ready official SF2.
      </p>

      {error && (
        <Alert tone="error">
          <p>{error}</p>
          <button type="button" onClick={loadMonthlyPreview}>
            Retry monthly preview
          </button>
        </Alert>
      )}

      {loading ? (
        <Loading label="Loading monthly attendance preview…" />
      ) : error ? null : !report ? null : report.learners.length === 0 ? (
        <EmptyState>No enrolled learners are available in this monthly preview.</EmptyState>
      ) : (
        <>
          <div className="table-scroll" tabIndex={0} aria-label="Scrollable monthly attendance grid">
            <table className="attendance-roster">
              <caption className="visually-hidden">
                Monthly official attendance preview for {sectionName}, {year}-{String(month).padStart(2, "0")}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Learner</th>
                  {report.schoolDays.map((day) => (
                    <th key={day} scope="col">{day}</th>
                  ))}
                  <th scope="col">P</th>
                  <th scope="col">A</th>
                  <th scope="col">T</th>
                </tr>
              </thead>
              <tbody>
                {report.learners.map((learner) => (
                  <tr key={learner.learnerId}>
                    <th scope="row">{learner.givenName} {learner.familyName}</th>
                    {learner.days.map((status, index) => (
                      <td key={report.schoolDays[index] ?? index}>{statusLabel(status)}</td>
                    ))}
                    <td>{learner.presentCount}</td>
                    <td>{learner.absentCount}</td>
                    <td>{learner.tardyCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field-hint">P = Present · A = Absent · T = Tardy · — = not marked</p>
          <button type="button" onClick={() => void exportSf2Inspired()} disabled={exporting}>
            {exporting ? "Creating export…" : "Export SF2-inspired CSV"}
          </button>
        </>
      )}

      {exportResult && (
        <Alert tone="info">
          <p>Export created: {exportResult.filePath}</p>
          <p>
            Populated fields: {exportResult.disclosure.populatedFields.length}. Omitted fields: {exportResult.disclosure.omittedFields.length}.
          </p>
          {exportResult.disclosure.omittedFields.length > 0 && (
            <ul>
              {exportResult.disclosure.omittedFields.map((item) => (
                <li key={`${item.field}:${item.reason}`}><strong>{item.field}</strong>: {item.reason}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
    </section>
  );
}
