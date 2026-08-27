import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { SectionApplicationService } from "../application/section-service";
import { ValidationError } from "../domain/errors";
import type {
  EndEnrollmentResult,
  Section,
  SectionRosterMember,
  TransferResult,
} from "../domain/section";
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

/** The effective date a transfer/end panel opens with. `asOfDate` (the
 * roster's frozen "today") is passed in rather than read fresh, so the
 * panel default and the header date can never disagree on a machine left
 * open past midnight. If the placement itself starts in the future, that
 * start date is the earliest the change can take effect. */
function defaultEffectiveOn(member: SectionRosterMember, asOfDate: string): string {
  return asOfDate < member.startsOn ? member.startsOn : asOfDate;
}

type ActionKind = "transfer" | "end";

interface ActiveAction {
  member: SectionRosterMember;
  kind: ActionKind;
}

/** Which field, if any, an inline `panelError` belongs to — drives
 * `aria-invalid` so a screen reader ties the message to the control. */
type PanelErrorField = "destination" | "effectiveOn" | null;

/**
 * "Open my class roster" plus the two membership changes that hang off a
 * roster row: transfer a currently-enrolled learner to another section, or
 * end their enrollment. Both are effective-dated, preserve the prior
 * placement as history (the Rust side sets an end date, never deletes),
 * and are enforced at the Tauri command boundary — this screen only
 * gathers the effective date / destination and shows the outcome.
 *
 * Every membership change targets the exact `membershipId` carried on the
 * roster row. If the placement changed in another tab/session since this
 * roster loaded, the command refuses (returns `notCurrent` /
 * `membershipNotFound` / `destinationNotFound`) rather than acting on a
 * different membership, and this screen shows a "refresh and try again"
 * recovery instead of a silent wrong write.
 *
 * Opening the screen makes two sequential command calls — `listSections()`
 * then `roster()` — on purpose: the section list is re-fetched (rather than
 * trusting a handed-in `Section`) so a section deleted/renamed since the
 * Sections screen was last loaded lands on a clear recovery state instead
 * of a stale header. The full section list is also what the transfer
 * destination picker offers.
 *
 * Ordering is family name then given name — decided once, in the
 * repository query, matching `export::report_card` / `formgen::sf1`; this
 * screen never re-sorts.
 */
export function SectionRosterScreen({
  sectionService,
  sectionId,
  onBack,
}: SectionRosterScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelHeadingRef = useRef<HTMLParagraphElement>(null);
  // The row action button that opened the current panel, so focus can be
  // returned to it on cancel (the button stays in the DOM — the panel is a
  // sibling row, not a replacement). Restored in an effect, not inline in
  // the click handler: the trigger is `disabled` until `activeAction`
  // clears, so `.focus()` has to wait for the re-render.
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef(false);
  // Fixed for the lifetime of the screen: the roster is "who is enrolled
  // right now", evaluated once on open. Lazy initialiser so it is stable
  // without reading a ref during render.
  const [asOfDate] = useState(todayAsIsoDate);

  const [section, setSection] = useState<Section | null>(null);
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [sectionState, setSectionState] = useState<"loading" | "ready" | "not-found" | "error">(
    "loading",
  );
  const [members, setMembers] = useState<SectionRosterMember[]>([]);
  const [rosterState, setRosterState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  // Bumped on every (re)load so a slow, stale response cannot overwrite a
  // newer one -- same guard AttendanceScreen uses for its roster fetch.
  const requestRef = useRef(0);

  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [effectiveOn, setEffectiveOn] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // An inline problem shown inside the open panel that the teacher can fix
  // and retry without losing what they entered (bad date, same section).
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelErrorField, setPanelErrorField] = useState<PanelErrorField>(null);
  // The stronger "someone changed this enrollment while you had the roster
  // open" state — the panel switches to a Refresh action.
  const [staleConflict, setStaleConflict] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (activeAction) {
      panelHeadingRef.current?.focus();
      return;
    }
    // Panel just closed: if it was a cancel/close (not a successful save,
    // which sends focus to the page heading), return focus to the row
    // button that opened it — now re-enabled by this same render.
    if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [activeAction]);

  function loadRoster(forSection: Section) {
    const requestId = ++requestRef.current;
    // Only blank the table to a spinner when there is nothing to show yet.
    // A refresh after a confirmed transfer/end keeps the existing rows
    // visible and lets them update in place, so the class list never
    // appears to vanish.
    setRosterState((current) => (current === "ready" ? "ready" : "loading"));
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
        setAllSections(sections);
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

  const otherSections = allSections.filter((candidate) => candidate.id !== sectionId);

  function openAction(member: SectionRosterMember, kind: ActionKind, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setConfirmation(null);
    setPanelError(null);
    setPanelErrorField(null);
    setStaleConflict(false);
    setEffectiveOn(defaultEffectiveOn(member, asOfDate));
    setDestinationId("");
    setActiveAction({ member, kind });
  }

  function closeAction(restoreFocus: boolean) {
    restoreFocusRef.current = restoreFocus;
    setActiveAction(null);
    setPanelError(null);
    setPanelErrorField(null);
    setStaleConflict(false);
  }

  /** Leave the stale-conflict panel AND reload the roster, so the teacher
   * is never returned to the same out-of-date list they just failed
   * against. `focusHeading` picks the landing spot: the page heading after
   * the explicit "Refresh roster", the trigger button after "Close". */
  function dismissConflict(focusHeading: boolean) {
    if (section) loadRoster(section);
    closeAction(!focusHeading);
    if (focusHeading) headingRef.current?.focus();
  }

  function showFieldError(field: Exclude<PanelErrorField, null>, message: string) {
    setPanelError(message);
    setPanelErrorField(field);
    // The submit button was disabled while the request ran, so focus is on
    // <body>; move it somewhere useful and inside the still-open panel.
    panelHeadingRef.current?.focus();
  }

  function enterStaleConflict() {
    setStaleConflict(true);
    panelHeadingRef.current?.focus();
  }

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    if (!activeAction || !section) return;
    const { member, kind } = activeAction;
    setPanelError(null);
    setPanelErrorField(null);
    setSubmitting(true);
    try {
      if (kind === "transfer") {
        const result = await sectionService.transferMembership({
          learnerId: member.learnerId,
          fromMembershipId: member.membershipId,
          toSectionId: destinationId,
          effectiveOn,
        });
        if (result.kind === "transferred") {
          const destination = otherSections.find((candidate) => candidate.id === destinationId);
          setConfirmation(
            `${member.familyName}, ${member.givenName} was transferred to ${
              destination ? destination.name : "the selected section"
            }, effective ${formatIsoDate(effectiveOn)}.`,
          );
          closeAction(false);
          loadRoster(section);
          headingRef.current?.focus();
          return;
        }
        applyTransferFailure(result.kind, member);
      } else {
        const result = await sectionService.endMembership({
          learnerId: member.learnerId,
          membershipId: member.membershipId,
          effectiveOn,
        });
        if (result.kind === "ended") {
          setConfirmation(
            `${member.familyName}, ${member.givenName}'s enrollment in ${section.name} was ended, effective ${formatIsoDate(
              effectiveOn,
            )}.`,
          );
          closeAction(false);
          loadRoster(section);
          headingRef.current?.focus();
          return;
        }
        applyEndFailure(result.kind, member);
      }
    } catch (err) {
      setPanelError(
        err instanceof ValidationError
          ? err.message
          : "This change could not be saved. Check your device and try again.",
      );
      setPanelErrorField(null);
      panelHeadingRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  function applyTransferFailure(
    kind: Exclude<TransferResult["kind"], "transferred">,
    member: SectionRosterMember,
  ) {
    switch (kind) {
      case "membershipNotFound":
      case "notCurrent":
      case "destinationNotFound":
        // All three mean "the roster you acted from is out of date" — the
        // membership moved, or the section you picked is gone. One
        // recovery: refresh and start over.
        enterStaleConflict();
        break;
      case "sameSection":
        showFieldError(
          "destination",
          "That is the section this learner is already in. Choose a different section.",
        );
        break;
      case "invalidEffectiveDate":
        showFieldError(
          "effectiveOn",
          `The effective date cannot be before this learner joined the section (${formatIsoDate(
            member.startsOn,
          )}).`,
        );
        break;
      default: {
        const exhaustive: never = kind;
        throw new Error(`unhandled transfer outcome: ${String(exhaustive)}`);
      }
    }
  }

  function applyEndFailure(
    kind: Exclude<EndEnrollmentResult["kind"], "ended">,
    member: SectionRosterMember,
  ) {
    switch (kind) {
      case "notFound":
      case "notCurrent":
        enterStaleConflict();
        break;
      case "invalidEffectiveDate":
        showFieldError(
          "effectiveOn",
          `The effective date cannot be before this learner joined the section (${formatIsoDate(
            member.startsOn,
          )}).`,
        );
        break;
      default: {
        const exhaustive: never = kind;
        throw new Error(`unhandled end-enrollment outcome: ${String(exhaustive)}`);
      }
    }
  }

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

      {confirmation && <Alert tone="success">{confirmation}</Alert>}

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
              Learners screen. Use &ldquo;Transfer&rdquo; to move a learner to another section, or
              &ldquo;End enrollment&rdquo; when they leave — both keep the learner&rsquo;s history
              and take effect from the date you choose. If you make a mistake, you can re-enroll the
              learner from the Sections screen.
            </p>
          )}

          {rosterState === "loading" && members.length === 0 && <Loading label="Loading roster…" />}

          {rosterState === "error" && (
            <Alert tone="error">
              <p>Could not load the roster for this section. Your other work is not affected.</p>
              <button
                type="button"
                onClick={() => {
                  loadRoster(section);
                  headingRef.current?.focus();
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

          {members.length > 0 && (rosterState === "ready" || rosterState === "loading") && (
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
                    <th role="columnheader" scope="col">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {members.map((member) => {
                    const panelOpen = activeAction?.member.membershipId === member.membershipId;
                    return (
                      <FragmentRow key={member.membershipId}>
                        <tr role="row">
                          <th role="rowheader" scope="row">
                            {member.familyName}, {member.givenName}
                          </th>
                          <td role="cell" data-label="LRN">
                            {member.lrn ?? (
                              <span className="section-roster-missing">Not recorded</span>
                            )}
                          </td>
                          <td role="cell" data-label="Enrolled since">
                            {formatIsoDate(member.startsOn)}
                          </td>
                          <td role="cell" data-label="Actions" className="section-roster-actions">
                            <button
                              type="button"
                              disabled={activeAction !== null}
                              aria-expanded={panelOpen && activeAction?.kind === "transfer"}
                              aria-label={`Transfer ${member.familyName}, ${member.givenName}`}
                              onClick={(event) =>
                                openAction(member, "transfer", event.currentTarget)
                              }
                            >
                              Transfer
                            </button>
                            <button
                              type="button"
                              disabled={activeAction !== null}
                              aria-expanded={panelOpen && activeAction?.kind === "end"}
                              aria-label={`End enrollment for ${member.familyName}, ${member.givenName}`}
                              onClick={(event) => openAction(member, "end", event.currentTarget)}
                            >
                              End enrollment
                            </button>
                          </td>
                        </tr>
                        {panelOpen && activeAction && (
                          <tr role="row" className="section-roster-action-row">
                            <td role="cell" colSpan={4}>
                              <form
                                className="section-roster-action-panel"
                                onSubmit={handleConfirm}
                                aria-label={
                                  activeAction.kind === "transfer"
                                    ? `Transfer ${member.familyName}, ${member.givenName}`
                                    : `End enrollment for ${member.familyName}, ${member.givenName}`
                                }
                              >
                                <p
                                  className="section-roster-action-heading"
                                  ref={panelHeadingRef}
                                  role="heading"
                                  aria-level={3}
                                  tabIndex={-1}
                                >
                                  {activeAction.kind === "transfer"
                                    ? `Transfer ${member.familyName}, ${member.givenName}`
                                    : `End ${member.familyName}, ${member.givenName}'s enrollment`}
                                </p>
                                <p
                                  className="section-roster-action-context"
                                  id="section-roster-action-context"
                                >
                                  Currently in <strong>{section.name}</strong> since{" "}
                                  {formatIsoDate(member.startsOn)}.
                                </p>

                                {staleConflict ? (
                                  <>
                                    <Alert tone="warning">
                                      <p>
                                        This learner&rsquo;s enrollment changed since you opened
                                        this roster, so this change was not made. The roster is
                                        being refreshed — check it and try again if you still need
                                        to.
                                      </p>
                                    </Alert>
                                    <div className="section-roster-action-buttons">
                                      <button
                                        type="button"
                                        className="button-primary"
                                        onClick={() => dismissConflict(true)}
                                      >
                                        Refresh roster
                                      </button>
                                      <button type="button" onClick={() => dismissConflict(false)}>
                                        Close
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    {activeAction.kind === "transfer" && (
                                      <div className="field">
                                        <label htmlFor="section-roster-destination">
                                          Move to section
                                        </label>
                                        {otherSections.length === 0 ? (
                                          <p
                                            className="field-hint"
                                            id="section-roster-destination-hint"
                                          >
                                            There is no other section to move this learner to.
                                            Create another section first on the Sections screen.
                                          </p>
                                        ) : (
                                          <select
                                            id="section-roster-destination"
                                            value={destinationId}
                                            onChange={(event) =>
                                              setDestinationId(event.target.value)
                                            }
                                            aria-invalid={
                                              panelErrorField === "destination" ? true : undefined
                                            }
                                            aria-describedby={
                                              panelErrorField === "destination"
                                                ? "section-roster-panel-error"
                                                : undefined
                                            }
                                            required
                                          >
                                            <option value="">Choose a section…</option>
                                            {otherSections.map((candidate) => (
                                              <option key={candidate.id} value={candidate.id}>
                                                {candidate.name} — Grade {candidate.gradeLevel},{" "}
                                                {candidate.schoolYear}
                                              </option>
                                            ))}
                                          </select>
                                        )}
                                      </div>
                                    )}

                                    <div className="field">
                                      <label htmlFor="section-roster-effective-on">
                                        Effective date
                                      </label>
                                      <p
                                        className="field-hint"
                                        id="section-roster-effective-on-hint"
                                      >
                                        The day the change takes effect. This is usually today —
                                        change it only if the learner already moved or left on an
                                        earlier date.
                                      </p>
                                      <input
                                        id="section-roster-effective-on"
                                        type="date"
                                        value={effectiveOn}
                                        min={member.startsOn}
                                        max={asOfDate}
                                        onChange={(event) => setEffectiveOn(event.target.value)}
                                        aria-describedby={
                                          panelErrorField === "effectiveOn"
                                            ? "section-roster-effective-on-hint section-roster-panel-error"
                                            : "section-roster-effective-on-hint"
                                        }
                                        aria-invalid={
                                          panelErrorField === "effectiveOn" ? true : undefined
                                        }
                                        required
                                      />
                                    </div>

                                    <p className="section-roster-action-consequence">
                                      {activeAction.kind === "transfer"
                                        ? `${member.givenName}'s place in ${section.name} ends on this date and their place in the new section begins the same day. The time already spent in ${section.name} stays in their records.`
                                        : `${member.givenName} will no longer appear on this section's roster from this date. The enrollment stays in their records — nothing is deleted.`}
                                    </p>

                                    {mode === "guided" && (
                                      <p className="field-hint">
                                        {activeAction.kind === "transfer"
                                          ? "Use this when a learner moves to another class or section within your school. For a learner leaving the school entirely, use “End enrollment” instead."
                                          : "Use this when a learner leaves the school or stops attending. It does not remove the learner or any of their past records."}
                                      </p>
                                    )}

                                    {panelError && (
                                      <p
                                        className="field-error"
                                        id="section-roster-panel-error"
                                        role="alert"
                                      >
                                        {panelError}
                                      </p>
                                    )}

                                    <div className="section-roster-action-buttons">
                                      <button
                                        type="submit"
                                        className="button-primary"
                                        disabled={
                                          submitting ||
                                          (activeAction.kind === "transfer" &&
                                            otherSections.length === 0)
                                        }
                                      >
                                        {submitting
                                          ? "Saving…"
                                          : activeAction.kind === "transfer"
                                            ? "Confirm transfer"
                                            : "Confirm end of enrollment"}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={submitting}
                                        onClick={() => closeAction(true)}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </>
                                )}
                              </form>
                            </td>
                          </tr>
                        )}
                      </FragmentRow>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </section>
  );
}

/** A keyable grouping of the member row and its (optional) action-panel
 * row without introducing a DOM node between `<tbody>` and `<tr>` (which
 * would break table semantics). `React.Fragment` accepts only `key`, so a
 * tiny named wrapper keeps the `.map` body readable. */
function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
