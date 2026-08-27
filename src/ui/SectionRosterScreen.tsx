import { useEffect, useRef, useState } from "react";
import type { SectionApplicationService } from "../application/section-service";
import type { Section, SectionRosterMember } from "../domain/section";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface SectionRosterScreenProps {
  sectionService: SectionApplicationService;
  /** The section whose roster to show. Supplied by the Sections workflow
   * (App.tsx state handoff), never a URL/route param — the same
   * narrowly-typed pattern AttendanceScreen uses for `initialSectionId`.
   * It is verified against the actually-loaded section list before use, so
   * a stale or removed id lands on a clear recovery state, not a blank or
   * wrong roster. */
  sectionId: string;
  /** Return to the Sections screen (its "Back" button and its
   * empty-roster call to action both use this). Section context is the
   * caller's to restore. */
  onBack: () => void;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2025-06-02` -> `2 Jun 2025`. Deliberately a tiny local formatter (no
 * `Intl`/timezone surprises, deterministic in tests) rather than a shared
 * helper — the app has no shared date utility yet, and inventing one is
 * out of scope for this screen. Falls back to the raw string if it is not
 * the expected shape. */
function formatIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return iso;
  return `${Number(day)} ${monthName} ${year}`;
}

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * A read-only "open my class roster" view: the learners whose placement in
 * one section is currently open (half-open membership interval contains
 * today). Deliberately narrow this wave — no transfer, no end-enrollment,
 * no bulk/import. Those are the next increment and hang off the same
 * command/domain seam: a selected roster row → a membership action
 * (transfer / end enrollment), never a client-side mutation of roster
 * state.
 *
 * Opening the screen makes two sequential command calls — `listSections()`
 * then `roster()` — on purpose: the section list is re-fetched (rather than
 * trusting a handed-in `Section`) so a section deleted/renamed since the
 * Sections screen was last loaded lands on a clear recovery state instead
 * of a stale header.
 *
 * Ordering is family name then given name — decided once, in the
 * repository query, matching `export::report_card` / `formgen::sf1`; this
 * screen never re-sorts. No search box: one section is tens of learners, a
 * stable sorted list scans faster than it filters, and adding a query
 * surface now would be speculative (see Wave 2O notes).
 */
export function SectionRosterScreen({
  sectionService,
  sectionId,
  onBack,
}: SectionRosterScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Fixed for the lifetime of the screen: the roster is "who is enrolled
  // right now", evaluated once on open. Lazy initialiser so it is stable
  // without reading a ref during render.
  const [asOfDate] = useState(todayAsIsoDate);

  const [section, setSection] = useState<Section | null>(null);
  const [sectionState, setSectionState] = useState<"loading" | "ready" | "not-found" | "error">(
    "loading",
  );
  const [members, setMembers] = useState<SectionRosterMember[]>([]);
  const [rosterState, setRosterState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  // Bumped on every (re)load so a slow, stale response cannot overwrite a
  // newer one -- same guard AttendanceScreen uses for its roster fetch.
  const requestRef = useRef(0);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function focusHeading() {
    headingRef.current?.focus();
  }

  function loadRoster(forSection: Section) {
    const requestId = ++requestRef.current;
    setRosterState("loading");
    sectionService
      .roster(forSection.id, asOfDate)
      .then((result) => {
        if (requestRef.current !== requestId) return;
        setMembers(result);
        setRosterState("ready");
      })
      .catch(() => {
        if (requestRef.current === requestId) setRosterState("error");
      });
  }

  function loadSection() {
    const requestId = ++requestRef.current;
    setSectionState("loading");
    sectionService
      .listSections()
      .then((sections) => {
        if (requestRef.current !== requestId) return;
        const found = sections.find((candidate) => candidate.id === sectionId) ?? null;
        if (!found) {
          setSectionState("not-found");
          return;
        }
        setSection(found);
        setSectionState("ready");
        loadRoster(found);
      })
      .catch(() => {
        if (requestRef.current === requestId) setSectionState("error");
      });
  }

  useEffect(() => {
    // loadSection() sets loading/ready/error state as its fetch settles --
    // the same deliberate load-on-mount-or-target-change pattern
    // MonthlySummaryScreen/AttendanceScreen use, not a cascading-render
    // risk (the requestRef guard drops stale responses). asOfDate is fixed
    // for the screen's lifetime.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionService, sectionId]);

  const rosterStatusMessage =
    rosterState === "ready"
      ? members.length === 0
        ? `No learners are enrolled as of ${formatIsoDate(asOfDate)}.`
        : `${members.length} learner${members.length === 1 ? "" : "s"} enrolled as of ${formatIsoDate(asOfDate)}.`
      : "";

  return (
    <section aria-label="Section roster">
      <button type="button" className="section-roster-back" onClick={onBack}>
        <span aria-hidden="true">← </span>Back to sections
      </button>

      <h2 ref={headingRef} tabIndex={-1}>
        {section ? `${section.name} — roster` : "Section roster"}
      </h2>

      {section && (
        <p className="section-roster-context">
          Grade {section.gradeLevel} · {section.schoolYear}
        </p>
      )}

      {/* Announced to assistive tech when the roster settles; visually the
          count line below already carries this. */}
      <p className="visually-hidden" role="status">
        {rosterStatusMessage}
      </p>

      {sectionState === "loading" && <Loading label="Loading section…" />}

      {sectionState === "not-found" && (
        <Alert tone="error">
          <p>
            This section could not be found. It may have been removed since you last opened it. Use
            &ldquo;Back to sections&rdquo; above to choose another.
          </p>
        </Alert>
      )}

      {sectionState === "error" && (
        <Alert tone="error">
          <p>Could not load this section. Check your device and try again.</p>
          <button type="button" onClick={loadSection}>
            Retry
          </button>
        </Alert>
      )}

      {sectionState === "ready" && section && (
        <>
          <p className="section-roster-intro">
            The learners enrolled in this section as of {formatIsoDate(asOfDate)}.
          </p>
          {mode === "guided" && (
            <p className="field-hint" id="section-roster-guided-note">
              A learner who has transferred out, or whose enrollment starts on a later date, is not
              shown — this is always your class as it stands today. &ldquo;Enrolled since&rdquo; is
              the date each learner&rsquo;s current placement in this section began.
              &ldquo;LRN&rdquo; is the 12-digit Learner Reference Number — add a missing one on the
              Learners screen.
            </p>
          )}

          {rosterState === "loading" && <Loading label="Loading roster…" />}

          {rosterState === "error" && (
            <Alert tone="error">
              <p>Could not load the roster for this section. Your other work is not affected.</p>
              <button
                type="button"
                onClick={() => {
                  loadRoster(section);
                  focusHeading();
                }}
              >
                Retry
              </button>
            </Alert>
          )}

          {rosterState === "ready" && members.length === 0 && (
            <EmptyState>
              <span>
                No learners are enrolled in {section.name} as of {formatIsoDate(asOfDate)}. When you
                enroll learners into this section on the Sections screen, they will appear here.
              </span>
              <button type="button" onClick={onBack}>
                Go to Sections to enroll a learner
              </button>
            </EmptyState>
          )}

          {rosterState === "ready" && members.length > 0 && (
            <>
              <p className="section-roster-count">
                <strong>
                  {members.length} learner{members.length === 1 ? "" : "s"} enrolled
                </strong>{" "}
                · as of {formatIsoDate(asOfDate)}
              </p>
              <table
                className="section-roster"
                role="table"
                aria-describedby={mode === "guided" ? "section-roster-guided-note" : undefined}
              >
                <caption className="visually-hidden">
                  Learners currently enrolled in {section.name}, ordered by family name
                </caption>
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" scope="col">
                      Learner
                    </th>
                    <th role="columnheader" scope="col">
                      LRN
                    </th>
                    <th role="columnheader" scope="col">
                      Enrolled since
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {members.map((member) => (
                    <tr role="row" key={member.learnerId}>
                      <th role="rowheader" scope="row">
                        {member.familyName}, {member.givenName}
                      </th>
                      <td role="cell" data-label="LRN">
                        {member.lrn ?? <span className="section-roster-missing">Not recorded</span>}
                      </td>
                      <td role="cell" data-label="Enrolled since">
                        {formatIsoDate(member.startsOn)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </section>
  );
}
