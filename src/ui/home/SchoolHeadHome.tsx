import { useEffect, useRef, useState, type JSX } from "react";
import type { LearnerApplicationService } from "../../application/learner-service";
import type { SectionApplicationService } from "../../application/section-service";
import type { Sf1ImportApplicationService } from "../../application/sf1-import-service";
import type { Learner } from "../../domain/learner";
import type { Section } from "../../domain/section";
import type { Sf1ImportHistoryEntry } from "../../domain/sf1-import";
import { Alert } from "../components/Alert";
import { BentoGrid, Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { Kpi, KpiStrip } from "../components/KpiStrip";
import { Loading } from "../components/Loading";
import { Page } from "../components/Page";

interface SchoolHeadHomeProps {
  schoolName: string;
  sectionService: SectionApplicationService;
  learnerService: LearnerApplicationService;
  sf1ImportService: Sf1ImportApplicationService;
  onManageSections: () => void;
  onOpenSf1Import: () => void;
}

const RECENT_IMPORT_LIMIT = 5;

function formatImportDate(createdAt: string): string {
  const parsed = new Date(createdAt);
  return Number.isNaN(parsed.getTime()) ? createdAt : parsed.toLocaleDateString();
}

function sharedSchoolYear(sections: Section[]): string {
  const years = new Set(sections.map((section) => section.schoolYear));
  return years.size === 1 ? ([...years][0] ?? "—") : "—";
}

/**
 * A read-only, school-wide overview for a school head — section and
 * learner totals, the school year in use, and the most recent SF1
 * imports. Every figure comes from an existing school-scoped read
 * (`listSections` / `listLearners` / `listImportHistory`); this screen
 * adds no backend and writes nothing.
 */
export function SchoolHeadHome({
  schoolName,
  sectionService,
  learnerService,
  sf1ImportService,
  onManageSections,
  onOpenSf1Import,
}: SchoolHeadHomeProps): JSX.Element {
  const [sections, setSections] = useState<Section[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [history, setHistory] = useState<Sf1ImportHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);

    Promise.all([
      sectionService.listSections(),
      learnerService.listLearners(),
      sf1ImportService.listImportHistory(RECENT_IMPORT_LIMIT),
    ])
      .then(([sectionResult, learnerResult, historyResult]) => {
        if (requestRef.current !== requestId) return;
        setSections(sectionResult);
        setLearners(learnerResult);
        setHistory(historyResult);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setError("Could not load the school overview.");
      })
      .finally(() => {
        if (requestRef.current !== requestId) return;
        setLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionService, learnerService, sf1ImportService]);

  return (
    <Page
      title="School overview"
      hint={<p className="field-hint">A school-wide summary for {schoolName}.</p>}
    >
      {error && (
        <Alert tone="error">
          <p>{error}</p>
          <button type="button" onClick={load}>
            Retry
          </button>
        </Alert>
      )}

      {loading ? (
        <Loading label="Loading school overview…" />
      ) : error ? null : (
        <>
          <KpiStrip>
            <Kpi label="Sections" value={sections.length} />
            <Kpi label="Learners" value={learners.length} tone="productive" />
            <Kpi label="School year" value={sharedSchoolYear(sections)} />
          </KpiStrip>

          <BentoGrid>
            <Card
              title="Recent SF1 imports"
              span={6}
              keepHalf
              actions={
                <button type="button" onClick={onOpenSf1Import}>
                  History
                </button>
              }
            >
              {history.length === 0 ? (
                <EmptyState>No imports yet.</EmptyState>
              ) : (
                <ul className="learner-list">
                  {history.slice(0, RECENT_IMPORT_LIMIT).map((entry) => (
                    <li key={entry.id}>
                      {entry.sourceFilename} · {entry.rowsCommitted} rows ·{" "}
                      {formatImportDate(entry.createdAt)}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Manage" span={6} keepHalf>
              <button type="button" onClick={onManageSections}>
                Manage sections
              </button>{" "}
              <button type="button" onClick={onOpenSf1Import}>
                SF1 import
              </button>
            </Card>
          </BentoGrid>
        </>
      )}
    </Page>
  );
}
