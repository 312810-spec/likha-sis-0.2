import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ExportApplicationService } from "../application/export-service";
import type { FormGenerationApplicationService } from "../application/form-generation-service";
import type { SectionApplicationService } from "../application/section-service";
import { ValidationError } from "../domain/errors";
import type { Sf5ExportResult } from "../domain/export";
import type { Sf1GenerationResult, Sf9GenerationResult } from "../domain/form-generation";
import type {
  CorrectPlacementResult,
  DependentRecordKind,
  EndEnrollmentResult,
  EnrollmentCandidate,
  Section,
  SectionRosterMember,
  TransferResult,
} from "../domain/section";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface SectionRosterScreenProps {
  sectionService: SectionApplicationService;
  /** Generates the SF1 (School Register) / SF9 (Progress Report Card)
   * official-form workbooks this screen's "Generate SF1" and per-row
   * "Generate SF9" actions trigger. A separate service (not folded into
   * `sectionService`) — form generation is a distinct concern from
   * membership management, matching the codebase's established
   * one-port-per-concern convention (e.g. `EnrollmentHistoryRepository`
   * staying separate from `SectionRepository`). */
  formGenerationService: FormGenerationApplicationService;
  /** Generates the SF5 (Report on Promotion and Level of Proficiency)
   * End-of-School-Year export. Optional for backwards compatibility with
   * tests/callers that only test roster mutations. */
  exportService?: ExportApplicationService;
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

/** Plain-language message for a `dependentRecordConflict` outcome. Names
 * the category of blocking data (never the records themselves) and points
 * the teacher at the fix: pick a later date. */
function dependentRecordMessage(record: DependentRecordKind, joinedOn: string): string {
  const noun = record === "attendance" ? "attendance records" : "grades";
  return `This date is before ${noun} already recorded for this learner in this section (on or after ${formatIsoDate(
    joinedOn,
  )}). Choose a later date so those records stay within the enrollment.`;
}

/** Plain-language message for a `dependentRecordConflict` outcome on a
 * same-day correction. Unlike a backdated transfer/end, there is no later
 * date to pick — the fix is to leave the placement as recorded and use an
 * ordinary transfer once it is no longer today's placement. */
function correctionDependentRecordMessage(record: DependentRecordKind): string {
  const noun = record === "attendance" ? "attendance records" : "grades";
  return `This learner already has ${noun} recorded for this placement, so the section can no longer be corrected this way. Use “Transfer” instead once today has passed.`;
}

type ActionKind = "transfer" | "end" | "correct";

interface ActiveAction {
  member: SectionRosterMember;
  kind: ActionKind;
}

/** Which field, if any, an inline `panelError` belongs to — drives
 * `aria-invalid` so a screen reader ties the message to the control. */
type PanelErrorField = "destination" | "effectiveOn" | null;

/**
 * "Open my class roster" plus the membership changes that hang off a
 * roster row: transfer a currently-enrolled learner to another section, end
 * their enrollment, or — only for a placement entered *today* — correct it
 * into the right section. Transfer/end are effective-dated and preserve the
 * prior placement as history (the Rust side sets an end date, never
 * deletes); a same-day correction has no effective date at all — it
 * updates the same placement's section in place, once, because the strict
 * half-open interval policy refuses a same-day transfer as a zero-length
 * interval (see `docs/adr/0042-*`'s Wave 2S addendum). All three are
 * enforced at the Tauri command boundary — this screen only gathers the
 * inputs and shows the outcome.
 *
 * Every membership change targets the exact `membershipId` carried on the
 * roster row. If the placement changed in another tab/session since this
 * roster loaded, the command refuses (returns `notCurrent` /
 * `membershipNotFound` / `destinationNotFound` / `alreadyCorrected` /
 * `notEnteredToday`) rather than acting on a different membership, and this
 * screen shows a "refresh and try again" recovery instead of a silent
 * wrong write.
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
  formGenerationService,
  exportService,
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

  // --- "Enroll learner": place an existing eligible learner into this
  // section. A separate inline panel (not a row action) opened from a
  // button above the table. `enrollMembership` on the Rust side is
  // authoritative on every eligibility rule; this only gathers the
  // learner + start date and maps the typed outcome.
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollCandidates, setEnrollCandidates] = useState<EnrollmentCandidate[]>([]);
  const [enrollLoadState, setEnrollLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [enrollSearch, setEnrollSearch] = useState("");
  const [enrollLearnerId, setEnrollLearnerId] = useState("");
  const [enrollStartsOn, setEnrollStartsOn] = useState("");
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollErrorField, setEnrollErrorField] = useState<"learner" | "startsOn" | null>(null);
  const enrollTriggerRef = useRef<HTMLButtonElement | null>(null);
  const enrollHeadingRef = useRef<HTMLParagraphElement>(null);
  const enrollRestoreFocusRef = useRef(false);
  const enrollRequestRef = useRef(0);

  // --- Official-form generation: "Generate SF1" (section-level, above
  // the table), "Export SF5" (EOSY promotion summary, above the table),
  // and a per-row "Generate SF9" action. Neither mutates
  // membership state or needs confirmation -- both write a file and
  // report the result via the same top-of-screen banner area every
  // other action here already uses. Only one form generates at a time,
  // and it disables every membership action (and vice versa) so a
  // teacher never has two writes in flight together.
  const [sf1Generating, setSf1Generating] = useState(false);
  const [sf1Result, setSf1Result] = useState<Sf1GenerationResult | null>(null);
  const [sf1Error, setSf1Error] = useState<string | null>(null);
  const [sf5Exporting, setSf5Exporting] = useState(false);
  const [sf5Result, setSf5Result] = useState<Sf5ExportResult | null>(null);
  const [sf5Error, setSf5Error] = useState<string | null>(null);
  const [revealingSf5, setRevealingSf5] = useState(false);
  const [revealSf5Error, setRevealSf5Error] = useState<string | null>(null);
  const [sf9GeneratingLearnerId, setSf9GeneratingLearnerId] = useState<string | null>(null);
  const [sf9Result, setSf9Result] = useState<{
    member: SectionRosterMember;
    result: Sf9GenerationResult;
  } | null>(null);
  const [sf9Error, setSf9Error] = useState<{ member: SectionRosterMember; message: string } | null>(
    null,
  );

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
    if (anyActionInFlight) return;
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

  // --- Enroll-learner panel ---

  useEffect(() => {
    if (enrollOpen) {
      enrollHeadingRef.current?.focus();
      return;
    }
    if (enrollRestoreFocusRef.current) {
      enrollRestoreFocusRef.current = false;
      enrollTriggerRef.current?.focus();
    }
  }, [enrollOpen]);

  function loadEnrollCandidates() {
    const requestId = ++enrollRequestRef.current;
    setEnrollLoadState("loading");
    sectionService
      .listEnrollableLearners()
      .then((list) => {
        if (enrollRequestRef.current !== requestId) return;
        setEnrollCandidates(list);
        setEnrollLoadState("ready");
      })
      .catch(() => {
        if (enrollRequestRef.current === requestId) setEnrollLoadState("error");
      });
  }

  function openEnroll() {
    if (anyActionInFlight) return;
    setConfirmation(null);
    setEnrollError(null);
    setEnrollErrorField(null);
    setEnrollSearch("");
    setEnrollLearnerId("");
    setEnrollStartsOn(asOfDate);
    setEnrollOpen(true);
    loadEnrollCandidates();
  }

  function closeEnroll(restoreFocus: boolean) {
    enrollRestoreFocusRef.current = restoreFocus;
    setEnrollOpen(false);
    setEnrollError(null);
    setEnrollErrorField(null);
  }

  function showEnrollFieldError(field: "learner" | "startsOn", message: string) {
    setEnrollError(message);
    setEnrollErrorField(field);
    enrollHeadingRef.current?.focus();
  }

  const enrollSelected = enrollCandidates.find((c) => c.learnerId === enrollLearnerId) ?? null;
  const enrollSelectedInThisSection = enrollSelected?.currentSectionId === sectionId;
  const enrollSelectedElsewhere =
    enrollSelected?.currentMembershipId != null && enrollSelected.currentSectionId !== sectionId;
  const enrollConfirmDisabled =
    enrollSubmitting ||
    enrollSelected == null ||
    enrollSelectedInThisSection ||
    enrollSelectedElsewhere;

  async function handleEnrollConfirm(event: FormEvent) {
    event.preventDefault();
    if (!section) return;
    if (enrollConfirmDisabled || enrollLoadState !== "ready") return;
    if (!enrollSelected) {
      showEnrollFieldError("learner", "Choose a learner to enroll.");
      return;
    }
    setEnrollError(null);
    setEnrollErrorField(null);
    setEnrollSubmitting(true);
    try {
      const result = await sectionService.enrollMembership({
        learnerId: enrollSelected.learnerId,
        sectionId: section.id,
        startsOn: enrollStartsOn,
      });
      switch (result.kind) {
        case "enrolled":
          setConfirmation(
            `${enrollSelected.familyName}, ${enrollSelected.givenName} was enrolled in ${section.name}, effective ${formatIsoDate(
              enrollStartsOn,
            )}.`,
          );
          closeEnroll(false);
          loadRoster(section);
          headingRef.current?.focus();
          return;
        case "alreadyEnrolled":
          if (result.currentSectionId === section.id) {
            showEnrollFieldError("learner", "This learner is already enrolled in this section.");
          } else {
            const inName = enrollSelected.currentSectionName ?? "another section";
            showEnrollFieldError(
              "learner",
              `This learner is currently enrolled in ${inName}. Moving them here is a transfer — open ${inName}'s roster and use “Transfer” on their row. They are not enrolled here now.`,
            );
          }
          break;
        case "learnerNotFound":
        case "sectionNotFound":
          setEnrollError(
            "The learner list was out of date, so nothing was changed. It has been refreshed — check it and try again.",
          );
          setEnrollErrorField(null);
          setEnrollLearnerId("");
          loadEnrollCandidates();
          enrollHeadingRef.current?.focus();
          break;
        case "overlappingMembership":
          showEnrollFieldError(
            "startsOn",
            "This learner has another enrollment that overlaps this start date. Check their enrollment history, or choose a start date that does not overlap it.",
          );
          break;
        case "invalidStartDate":
          showEnrollFieldError("startsOn", "Enter the start date as a real calendar date.");
          break;
        case "dependentRecordConflict": {
          const noun = result.record === "attendance" ? "attendance records" : "grades";
          showEnrollFieldError(
            "startsOn",
            `This learner already has ${noun} in this section dated before your chosen start. Pick an earlier start date so those records fall within the enrollment.`,
          );
          break;
        }
        default: {
          const exhaustive: never = result;
          throw new Error(`unhandled enroll outcome: ${String(exhaustive)}`);
        }
      }
    } catch (err) {
      setEnrollError(
        err instanceof ValidationError
          ? err.message
          : "This learner could not be enrolled. Check your device and try again.",
      );
      setEnrollErrorField(null);
      enrollHeadingRef.current?.focus();
    } finally {
      setEnrollSubmitting(false);
    }
  }

  const enrollFiltered = (() => {
    const q = enrollSearch.trim().toLowerCase();
    if (q.length === 0) return enrollCandidates;
    return enrollCandidates.filter((c) => {
      const hay = `${c.familyName} ${c.givenName} ${c.lrn ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  })();

  // True while any write -- a membership change or a form generation --
  // is in flight, or a membership panel is open. Every action button
  // disables on this, so a teacher never has two writes racing.
  const anyActionInFlight =
    activeAction !== null ||
    sf1Generating ||
    sf5Exporting ||
    sf9GeneratingLearnerId !== null ||
    enrollOpen;

  async function handleGenerateSf1() {
    if (!section || anyActionInFlight) return;
    setSf1Error(null);
    setSf1Result(null);
    setSf5Result(null);
    setSf5Error(null);
    setSf9Result(null);
    setSf9Error(null);
    setSf1Generating(true);
    try {
      const result = await formGenerationService.generateSf1(section.id, asOfDate);
      if (result) {
        setSf1Result(result);
      } else {
        setSf1Error(
          "This section could not be found. It may have been removed since you opened this roster — use “Back to sections” and try again.",
        );
      }
    } catch (err) {
      setSf1Error(
        err instanceof ValidationError
          ? err.message
          : "This form could not be generated. Check your device and try again.",
      );
    } finally {
      setSf1Generating(false);
    }
  }

  async function handleExportSf5() {
    if (!section || !exportService || anyActionInFlight) return;
    setSf5Error(null);
    setSf5Result(null);
    setRevealSf5Error(null);
    setSf1Result(null);
    setSf1Error(null);
    setSf9Result(null);
    setSf9Error(null);
    setSf5Exporting(true);
    try {
      const result = await exportService.exportSectionEosySf5(section.id, section.schoolYear);
      if (result) {
        setSf5Result(result);
      } else {
        setSf5Error(
          "This section could not be found. It may have been removed since you opened this roster — use “Back to sections” and try again.",
        );
      }
    } catch (err) {
      setSf5Error(
        err instanceof ValidationError
          ? err.message
          : "Could not export SF5 — you may not have permission to export this section (only the assigned class adviser or School Head can export it), or learning records are incomplete.",
      );
    } finally {
      setSf5Exporting(false);
    }
  }

  async function handleRevealSf5() {
    if (!exportService || revealingSf5 || !sf5Result) return;
    setRevealSf5Error(null);
    setRevealingSf5(true);
    try {
      await exportService.revealExportedFile(sf5Result.filePath);
    } catch {
      setRevealSf5Error("Could not open the folder for this file.");
    } finally {
      setRevealingSf5(false);
    }
  }

  async function handleGenerateSf9(member: SectionRosterMember) {
    if (anyActionInFlight) return;
    setSf9Error(null);
    setSf9Result(null);
    setSf1Result(null);
    setSf1Error(null);
    setSf5Result(null);
    setSf5Error(null);
    setSf9GeneratingLearnerId(member.learnerId);
    try {
      const result = await formGenerationService.generateSf9(sectionId, member.learnerId, asOfDate);
      if (result) {
        setSf9Result({ member, result });
      } else {
        setSf9Error({
          member,
          message:
            "This learner's placement could not be confirmed. Refresh the roster and try again.",
        });
      }
    } catch (err) {
      setSf9Error({
        member,
        message:
          err instanceof ValidationError
            ? err.message
            : "This report card could not be generated. Check your device and try again.",
      });
    } finally {
      setSf9GeneratingLearnerId(null);
    }
  }

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    if (!activeAction || !section) return;
    const { member, kind } = activeAction;
    if (submitting || ((kind === "transfer" || kind === "correct") && otherSections.length === 0)) {
      return;
    }
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
        applyTransferFailure(result, member);
      } else if (kind === "end") {
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
        applyEndFailure(result, member);
      } else {
        const result = await sectionService.correctSameDayPlacement({
          learnerId: member.learnerId,
          membershipId: member.membershipId,
          toSectionId: destinationId,
          asOfDate,
        });
        if (result.kind === "corrected") {
          const destination = otherSections.find((candidate) => candidate.id === destinationId);
          setConfirmation(
            `${member.familyName}, ${member.givenName}'s placement today was corrected to ${
              destination ? destination.name : "the selected section"
            }.`,
          );
          closeAction(false);
          loadRoster(section);
          headingRef.current?.focus();
          return;
        }
        applyCorrectionFailure(result);
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
    result: Exclude<TransferResult, { kind: "transferred" }>,
    member: SectionRosterMember,
  ) {
    switch (result.kind) {
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
      case "zeroLengthInterval":
        showFieldError(
          "effectiveOn",
          `The effective date must be after the day this learner joined the section (${formatIsoDate(
            member.startsOn,
          )}). Choose a later date — or, if this placement was entered today by mistake, cancel and use “Correct today's placement” instead.`,
        );
        break;
      case "dependentRecordConflict":
        showFieldError("effectiveOn", dependentRecordMessage(result.record, member.startsOn));
        break;
      default: {
        const exhaustive: never = result;
        throw new Error(`unhandled transfer outcome: ${String(exhaustive)}`);
      }
    }
  }

  function applyEndFailure(
    result: Exclude<EndEnrollmentResult, { kind: "ended" }>,
    member: SectionRosterMember,
  ) {
    switch (result.kind) {
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
      case "zeroLengthInterval":
        showFieldError(
          "effectiveOn",
          `The effective date must be after the day this learner joined the section (${formatIsoDate(
            member.startsOn,
          )}). Choose a later date — or, if this placement was entered today by mistake, cancel and use “Correct today's placement” instead.`,
        );
        break;
      case "dependentRecordConflict":
        showFieldError("effectiveOn", dependentRecordMessage(result.record, member.startsOn));
        break;
      default: {
        const exhaustive: never = result;
        throw new Error(`unhandled end-enrollment outcome: ${String(exhaustive)}`);
      }
    }
  }

  function applyCorrectionFailure(result: Exclude<CorrectPlacementResult, { kind: "corrected" }>) {
    switch (result.kind) {
      case "notFound":
      case "notCurrent":
      case "notEnteredToday":
      case "alreadyCorrected":
      case "destinationNotFound":
        // The roster you acted from is out of date -- the placement moved,
        // was already corrected, or is no longer today's. One recovery:
        // refresh and start over.
        enterStaleConflict();
        break;
      case "sameSection":
        showFieldError(
          "destination",
          "That is the section this placement is already recorded in. Choose a different section.",
        );
        break;
      case "dependentRecordConflict":
        showFieldError("destination", correctionDependentRecordMessage(result.record));
        break;
      default: {
        const exhaustive: never = result;
        throw new Error(`unhandled correction outcome: ${String(exhaustive)}`);
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
    <Page
      title={section ? `${section.name} — roster` : "Section roster"}
      headingRef={headingRef}
      hint={
        mode === "guided" ? (
          <p className="field-hint" id="section-roster-guided-note">
            A learner who has transferred out, or whose enrollment starts on a later date, is not
            shown — this is always your class as it stands today. &ldquo;Enrolled since&rdquo; is
            the date each learner&rsquo;s current placement in this section began. &ldquo;LRN&rdquo;
            is the 12-digit Learner Reference Number — add a missing one on the Learners screen. Use
            &ldquo;Enroll learner&rdquo; to add an existing learner to this section,
            &ldquo;Transfer&rdquo; to move a learner to another section, or &ldquo;End
            enrollment&rdquo; when they leave — all keep the learner&rsquo;s history and take effect
            from the date you choose.
          </p>
        ) : undefined
      }
    >
      <button type="button" className="section-roster-back" onClick={onBack}>
        <span aria-hidden="true">← </span>Back to sections
      </button>

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

          <div className="section-roster-enroll">
            {!enrollOpen && (
              <button
                type="button"
                ref={enrollTriggerRef}
                className="section-roster-enroll-trigger"
                aria-disabled={anyActionInFlight}
                aria-expanded={false}
                onClick={openEnroll}
              >
                Enroll learner
              </button>
            )}
            {enrollOpen && (
              <form
                className="section-roster-action-panel"
                onSubmit={handleEnrollConfirm}
                aria-label={`Enroll a learner in ${section.name}`}
              >
                <p
                  className="section-roster-action-heading"
                  ref={enrollHeadingRef}
                  role="heading"
                  aria-level={3}
                  tabIndex={-1}
                >
                  Enroll a learner in {section.name}
                </p>
                <p className="section-roster-action-context">
                  {section.name} · Grade {section.gradeLevel} · {section.schoolYear}
                </p>

                {enrollLoadState === "loading" && <Loading label="Loading learners…" />}

                {enrollLoadState === "error" && (
                  <Alert tone="error">
                    <p>Could not load the list of learners. Your other work is not affected.</p>
                    <button type="button" onClick={loadEnrollCandidates}>
                      Retry
                    </button>
                  </Alert>
                )}

                {enrollLoadState === "ready" && enrollCandidates.length === 0 && (
                  <p className="field-hint">
                    There are no learners in this school yet. Add learners on the Learners screen
                    first, then come back to enroll them.
                  </p>
                )}

                {enrollLoadState === "ready" && enrollCandidates.length > 0 && (
                  <>
                    <div className="field">
                      <label htmlFor="section-roster-enroll-search">Find a learner</label>
                      <input
                        id="section-roster-enroll-search"
                        type="search"
                        value={enrollSearch}
                        placeholder="Type a name or LRN"
                        onChange={(event) => setEnrollSearch(event.target.value)}
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="section-roster-enroll-learner">Learner</label>
                      {mode === "guided" && (
                        <p className="field-hint" id="section-roster-enroll-learner-hint">
                          Pick the learner to place in this section. Learners already in another
                          section are marked — moving one of those here is a transfer, done from
                          that section&rsquo;s roster.
                        </p>
                      )}
                      {enrollFiltered.length === 0 ? (
                        <p className="field-hint">
                          No learners match &ldquo;{enrollSearch}&rdquo;.
                        </p>
                      ) : (
                        <select
                          id="section-roster-enroll-learner"
                          size={Math.min(6, Math.max(2, enrollFiltered.length))}
                          value={enrollLearnerId}
                          onChange={(event) => {
                            setEnrollLearnerId(event.target.value);
                            setEnrollError(null);
                            setEnrollErrorField(null);
                          }}
                          aria-invalid={enrollErrorField === "learner" ? true : undefined}
                          aria-describedby={
                            [
                              mode === "guided" ? "section-roster-enroll-learner-hint" : "",
                              enrollErrorField === "learner" ? "section-roster-enroll-error" : "",
                            ]
                              .filter(Boolean)
                              .join(" ") || undefined
                          }
                        >
                          {enrollFiltered.map((candidate) => {
                            const state =
                              candidate.currentSectionId === sectionId
                                ? " — already in this section"
                                : candidate.currentMembershipId != null
                                  ? ` — in ${candidate.currentSectionName ?? "another section"}`
                                  : "";
                            return (
                              <option key={candidate.learnerId} value={candidate.learnerId}>
                                {candidate.familyName}, {candidate.givenName}
                                {candidate.lrn ? ` · LRN ${candidate.lrn}` : " · no LRN"}
                                {state}
                              </option>
                            );
                          })}
                        </select>
                      )}
                    </div>

                    {enrollSelectedInThisSection && (
                      <p className="section-roster-action-consequence">
                        {enrollSelected?.givenName} is already enrolled in this section. Choose a
                        different learner.
                      </p>
                    )}
                    {enrollSelectedElsewhere && (
                      <p className="section-roster-action-consequence">
                        {enrollSelected?.givenName} is currently enrolled in{" "}
                        <strong>{enrollSelected?.currentSectionName ?? "another section"}</strong>.
                        Moving them here is a transfer: open that section&rsquo;s roster and use
                        &ldquo;Transfer&rdquo; on their row. Enrolling them here would not move
                        them.
                      </p>
                    )}

                    <div className="field">
                      <label htmlFor="section-roster-enroll-starts-on">Start date</label>
                      <p className="field-hint" id="section-roster-enroll-starts-on-hint">
                        The day this learner&rsquo;s enrollment in {section.name} begins. This is
                        usually today — set an earlier date only if they actually joined earlier.
                      </p>
                      <input
                        id="section-roster-enroll-starts-on"
                        type="date"
                        value={enrollStartsOn}
                        max={asOfDate}
                        onChange={(event) => setEnrollStartsOn(event.target.value)}
                        aria-describedby={
                          enrollErrorField === "startsOn"
                            ? "section-roster-enroll-starts-on-hint section-roster-enroll-error"
                            : "section-roster-enroll-starts-on-hint"
                        }
                        aria-invalid={enrollErrorField === "startsOn" ? true : undefined}
                        required
                      />
                    </div>

                    {mode === "guided" && (
                      <p className="field-hint">
                        This adds the learner to this section from the start date. It does not
                        create a new learner or change any of their past records.
                      </p>
                    )}
                  </>
                )}

                {enrollError && (
                  <p className="field-error" id="section-roster-enroll-error" role="alert">
                    {enrollError}
                  </p>
                )}

                <div className="section-roster-action-buttons">
                  <button
                    type="submit"
                    className="button-primary"
                    aria-disabled={enrollConfirmDisabled || enrollLoadState !== "ready"}
                  >
                    {enrollSubmitting ? "Enrolling…" : "Confirm enrollment"}
                  </button>
                  <button
                    type="button"
                    aria-disabled={enrollSubmitting}
                    onClick={() => {
                      if (enrollSubmitting) return;
                      closeEnroll(true);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="section-roster-forms">
            <button type="button" aria-disabled={anyActionInFlight} onClick={handleGenerateSf1}>
              {sf1Generating ? "Generating…" : "Generate SF1 (School Register)"}
            </button>
            {exportService && (
              <button type="button" aria-disabled={anyActionInFlight} onClick={handleExportSf5}>
                {sf5Exporting ? "Exporting SF5…" : "Export SF5 (Promotion & Level of Proficiency)"}
              </button>
            )}
            <p className="field-hint">
              SF1 and SF9 use a synthetic, DepEd-style template — neither has been verified against
              an official DepEd source. Confirm your school&rsquo;s actual SF1/SF9 requirements
              before treating a generated file as an official record.
            </p>
            {mode === "guided" && (
              <p className="field-hint">
                SF5 (Report on Promotion and Level of Proficiency) computes final subject ratings,
                general averages, and promotion decisions for this section&rsquo;s school year (
                {section?.schoolYear ?? ""}). Only the designated class adviser or School Head can
                export SF5.
              </p>
            )}
          </div>

          {sf1Error && <Alert tone="error">{sf1Error}</Alert>}
          {sf1Result && (
            <Alert tone="success">
              <p>
                Saved to <code>{sf1Result.outputPath}</code> ({sf1Result.learnerCount} learner
                {sf1Result.learnerCount === 1 ? "" : "s"}).
              </p>
            </Alert>
          )}
          {sf5Error && <Alert tone="error">{sf5Error}</Alert>}
          {sf5Result && (
            <Alert tone="success">
              <p>
                Saved to <code>{sf5Result.filePath}</code>.
              </p>
              {exportService && (
                <button type="button" aria-disabled={revealingSf5} onClick={handleRevealSf5}>
                  {revealingSf5 ? "Opening…" : "Open folder"}
                </button>
              )}
              {revealSf5Error && <p role="alert">{revealSf5Error}</p>}
              <p>
                This file is a DepEd SF5 End-of-School-Year promotion summary for school year{" "}
                <strong>{section?.schoolYear}</strong>. It does <strong>not</strong> include:
              </p>
              <ul>
                {sf5Result.disclosure.omittedFields.map((omitted) => (
                  <li key={omitted.field}>
                    <strong>{omitted.field}</strong> — {omitted.reason}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
          {sf9Error && (
            <Alert tone="error">
              Could not generate a report card for {sf9Error.member.familyName},{" "}
              {sf9Error.member.givenName}: {sf9Error.message}
            </Alert>
          )}
          {sf9Result && (
            <Alert tone="success">
              <p>
                Report card for {sf9Result.member.familyName}, {sf9Result.member.givenName} saved to{" "}
                <code>{sf9Result.result.outputPath}</code> ({sf9Result.result.subjectCount} subject
                {sf9Result.result.subjectCount === 1 ? "" : "s"}).
              </p>
            </Alert>
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
                No learners are enrolled in {section.name} as of {formatIsoDate(asOfDate)}. Use
                &ldquo;Enroll learner&rdquo; above to add an existing learner to this section.
              </span>
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
                              aria-disabled={anyActionInFlight}
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
                              aria-disabled={anyActionInFlight}
                              aria-expanded={panelOpen && activeAction?.kind === "end"}
                              aria-label={`End enrollment for ${member.familyName}, ${member.givenName}`}
                              onClick={(event) => openAction(member, "end", event.currentTarget)}
                            >
                              End enrollment
                            </button>
                            {member.startsOn === asOfDate && (
                              <button
                                type="button"
                                aria-disabled={anyActionInFlight}
                                aria-expanded={panelOpen && activeAction?.kind === "correct"}
                                aria-label={`Correct today's placement for ${member.familyName}, ${member.givenName}`}
                                onClick={(event) =>
                                  openAction(member, "correct", event.currentTarget)
                                }
                              >
                                Correct today&rsquo;s placement
                              </button>
                            )}
                            <button
                              type="button"
                              aria-disabled={anyActionInFlight}
                              aria-label={`Generate SF9 report card for ${member.familyName}, ${member.givenName}`}
                              onClick={() => handleGenerateSf9(member)}
                            >
                              {sf9GeneratingLearnerId === member.learnerId
                                ? "Generating…"
                                : "Generate SF9 (Report Card)"}
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
                                    : activeAction.kind === "end"
                                      ? `End enrollment for ${member.familyName}, ${member.givenName}`
                                      : `Correct today's placement for ${member.familyName}, ${member.givenName}`
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
                                    : activeAction.kind === "end"
                                      ? `End ${member.familyName}, ${member.givenName}'s enrollment`
                                      : `Correct ${member.familyName}, ${member.givenName}'s placement today`}
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
                                    {(activeAction.kind === "transfer" ||
                                      activeAction.kind === "correct") && (
                                      <div className="field">
                                        <label htmlFor="section-roster-destination">
                                          {activeAction.kind === "transfer"
                                            ? "Move to section"
                                            : "Correct to section"}
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

                                    {activeAction.kind !== "correct" && (
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
                                    )}

                                    <p className="section-roster-action-consequence">
                                      {activeAction.kind === "transfer"
                                        ? `${member.givenName}'s place in ${section.name} ends on this date and their place in the new section begins the same day. The time already spent in ${section.name} stays in their records.`
                                        : activeAction.kind === "end"
                                          ? `${member.givenName} will no longer appear on this section's roster from this date. The enrollment stays in their records — nothing is deleted.`
                                          : `This placement was entered today, in ${section.name}. Correcting it changes the recorded section only — it does not create a new enrollment or a new date, and it can only be done once.`}
                                    </p>

                                    {mode === "guided" && (
                                      <p className="field-hint">
                                        {activeAction.kind === "transfer"
                                          ? "Use this when a learner moves to another class or section within your school. For a learner leaving the school entirely, use “End enrollment” instead."
                                          : activeAction.kind === "end"
                                            ? "Use this when a learner leaves the school or stops attending. It does not remove the learner or any of their past records."
                                            : "Use this only to fix a section chosen by mistake when you enrolled this learner today. For any other change, or once today has passed, use “Transfer” or “End enrollment” instead."}
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
                                        aria-disabled={
                                          submitting ||
                                          ((activeAction.kind === "transfer" ||
                                            activeAction.kind === "correct") &&
                                            otherSections.length === 0)
                                        }
                                      >
                                        {submitting
                                          ? "Saving…"
                                          : activeAction.kind === "transfer"
                                            ? "Confirm transfer"
                                            : activeAction.kind === "end"
                                              ? "Confirm end of enrollment"
                                              : "Confirm correction"}
                                      </button>
                                      <button
                                        type="button"
                                        aria-disabled={submitting}
                                        onClick={() => {
                                          if (submitting) return;
                                          closeAction(true);
                                        }}
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
    </Page>
  );
}

/** A keyable grouping of the member row and its (optional) action-panel
 * row without introducing a DOM node between `<tbody>` and `<tr>` (which
 * would break table semantics). `React.Fragment` accepts only `key`, so a
 * tiny named wrapper keeps the `.map` body readable. */
function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
