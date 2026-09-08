import { useEffect, useRef, useState } from "react";
import type { AnecdotalRecordApplicationService } from "../application/anecdotal-record-service";
import type { SectionApplicationService } from "../application/section-service";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { AnecdotalCategory, AnecdotalRecord } from "../domain/anecdotal-record";
import { ANECDOTAL_CATEGORIES, AnecdotalRecordValidationError } from "../domain/anecdotal-record";
import { ValidationError } from "../domain/errors";
import type { Section } from "../domain/section";
import type { SectionRosterMember } from "../domain/section";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface GuidanceRecordsScreenProps {
  anecdotalRecordService: AnecdotalRecordApplicationService;
  subjectAttendanceService: SubjectAttendanceApplicationService;
  sectionService: SectionApplicationService;
}

const CATEGORY_LABELS: Record<AnecdotalCategory, string> = {
  positive: "Positive",
  negative: "Negative",
  neutral: "Neutral",
};

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function learnerLabel(row: SectionRosterMember): string {
  return `${row.familyName}, ${row.givenName}`;
}

/**
 * Guidance Records (Batch 12, ADR-0083) -- an adviser's own per-learner
 * guidance narrative log, plus its append-only follow-up trail. Only the
 * signed-in adviser's own advisory section(s), or a School Head's, are
 * offered (the picker mirrors `AdviserViewScreen`'s own
 * `listAdviserViewSections` scoping convention) -- the actual boundary
 * is enforced server-side by
 * `auth::authorize_child_protection_access_for_section`, reused
 * unchanged from DO 006 Child Protection (ADR-0072); this screen's
 * filtered picker is usability, not the security boundary. `category`
 * is a generic positive/negative/neutral classification, not a
 * disciplinary-only one -- see `docs/adr/0083-anecdotal-guidance-records.md`.
 */
export function GuidanceRecordsScreen({
  anecdotalRecordService,
  subjectAttendanceService,
  sectionService,
}: GuidanceRecordsScreenProps) {
  const { mode } = useTeacherMode();
  const sectionsRequestRef = useRef(0);
  const rosterRequestRef = useRef(0);
  const recordsRequestRef = useRef(0);
  const followupsRequestRef = useRef(0);

  const [date, setDate] = useState(todayAsIsoDate);
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [sectionsError, setSectionsError] = useState<string | null>(null);

  const [roster, setRoster] = useState<SectionRosterMember[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  const [records, setRecords] = useState<AnecdotalRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  const [followups, setFollowups] = useState<{ id: string; note: string; createdAt: string }[]>([]);
  const [followupsLoading, setFollowupsLoading] = useState(false);
  const [followupNote, setFollowupNote] = useState("");
  const [followupSaving, setFollowupSaving] = useState(false);

  const [learnerId, setLearnerId] = useState("");
  const [category, setCategory] = useState<AnecdotalCategory>("neutral");
  const [entryDate, setEntryDate] = useState(todayAsIsoDate);
  const [narrative, setNarrative] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  function loadSections() {
    const requestId = ++sectionsRequestRef.current;
    setSectionsLoading(true);
    setSectionsError(null);
    subjectAttendanceService
      .listAdviserViewSections(date)
      .then((result) => {
        if (sectionsRequestRef.current !== requestId) return;
        setSections(result);
        setSectionId((current) =>
          result.some((section) => section.id === current) ? current : (result[0]?.id ?? ""),
        );
      })
      .catch(() => {
        if (sectionsRequestRef.current !== requestId) return;
        setSections([]);
        setSectionId("");
        setSectionsError("Could not load your advisory sections.");
      })
      .finally(() => {
        if (sectionsRequestRef.current !== requestId) return;
        setSectionsLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectAttendanceService, date]);

  function loadRoster() {
    if (!sectionId) {
      setRoster([]);
      setLearnerId("");
      return;
    }
    const requestId = ++rosterRequestRef.current;
    setRosterLoading(true);
    sectionService
      .roster(sectionId, date)
      .then((result) => {
        if (rosterRequestRef.current !== requestId) return;
        setRoster(result);
        setLearnerId((current) =>
          result.some((r) => r.learnerId === current) ? current : (result[0]?.learnerId ?? ""),
        );
      })
      .catch(() => {
        if (rosterRequestRef.current !== requestId) return;
        setError("Could not load this section's roster.");
      })
      .finally(() => {
        if (rosterRequestRef.current !== requestId) return;
        setRosterLoading(false);
      });
  }

  function loadRecords() {
    if (!sectionId) {
      setRecords([]);
      return;
    }
    const requestId = ++recordsRequestRef.current;
    setRecordsLoading(true);
    setRecordsError(null);
    anecdotalRecordService
      .listForSection(sectionId, date)
      .then((result) => {
        if (recordsRequestRef.current !== requestId) return;
        setRecords(result);
      })
      .catch(() => {
        if (recordsRequestRef.current !== requestId) return;
        setRecords([]);
        setRecordsError("Could not load guidance records for this section.");
      })
      .finally(() => {
        if (recordsRequestRef.current !== requestId) return;
        setRecordsLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedRecordId(null);
    loadRoster();
    loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anecdotalRecordService, sectionService, sectionId, date]);

  function loadFollowups(recordId: string) {
    const requestId = ++followupsRequestRef.current;
    setFollowupsLoading(true);
    anecdotalRecordService
      .listFollowups(recordId, sectionId, date)
      .then((result) => {
        if (followupsRequestRef.current !== requestId) return;
        setFollowups(result);
      })
      .catch(() => {
        if (followupsRequestRef.current !== requestId) return;
        setFollowups([]);
      })
      .finally(() => {
        if (followupsRequestRef.current !== requestId) return;
        setFollowupsLoading(false);
      });
  }

  function selectRecord(recordId: string) {
    setSelectedRecordId(recordId);
    setFollowupNote("");
    loadFollowups(recordId);
  }

  function resetForm() {
    setCategory("neutral");
    setEntryDate(todayAsIsoDate());
    setNarrative("");
    setError(null);
  }

  async function handleSave() {
    if (saving || !sectionId || !learnerId) return;
    setSaving(true);
    setError(null);
    try {
      await anecdotalRecordService.record({
        learnerId,
        sectionId,
        category,
        entryDate,
        narrative,
      });
      setConfirmation("Guidance record saved.");
      resetForm();
      loadRecords();
    } catch (err) {
      setError(
        err instanceof AnecdotalRecordValidationError || err instanceof ValidationError
          ? err.message
          : "Could not save this guidance record.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAddFollowup() {
    if (followupSaving || !selectedRecordId || followupNote.trim().length === 0) return;
    setFollowupSaving(true);
    setError(null);
    try {
      await anecdotalRecordService.addFollowup({
        anecdotalRecordId: selectedRecordId,
        sectionId,
        asOfDate: date,
        note: followupNote,
      });
      setFollowupNote("");
      loadFollowups(selectedRecordId);
    } catch (err) {
      setError(
        err instanceof AnecdotalRecordValidationError || err instanceof ValidationError
          ? err.message
          : "Could not save this follow-up.",
      );
    } finally {
      setFollowupSaving(false);
    }
  }

  function learnerNameFor(id: string): string {
    const row = roster.find((r) => r.learnerId === id);
    return row ? learnerLabel(row) : id;
  }

  const canSave =
    !saving && sectionId.length > 0 && learnerId.length > 0 && narrative.trim().length > 0;
  const selectedRecord = records.find((r) => r.id === selectedRecordId) ?? null;

  return (
    <Page
      title="Guidance Records"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Record a guidance note for a learner in your advisory section — a commendation, a
            concern, or a routine observation. Once saved, a note&apos;s text cannot be edited; add
            a follow-up entry instead to keep a full history.
          </p>
        ) : undefined
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}
      {sectionsError && (
        <Alert tone="error">
          <p>{sectionsError}</p>
          <button type="button" onClick={loadSections}>
            Retry
          </button>
        </Alert>
      )}

      <div className="form-row">
        <div className="field">
          <label htmlFor="guidance-date">As of</label>
          <input
            id="guidance-date"
            type="date"
            value={date}
            max={todayAsIsoDate()}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        {sections.length > 0 && (
          <div className="field">
            <label htmlFor="guidance-section">Advisory section</label>
            <select
              id="guidance-section"
              value={sectionId}
              onChange={(event) => setSectionId(event.target.value)}
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  Grade {section.gradeLevel} — {section.name} ({section.schoolYear})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {sectionsLoading ? (
        <Loading label="Loading your advisory sections…" />
      ) : sectionsError ? null : sections.length === 0 ? (
        <EmptyState>
          No advisory section is assigned to you for this date. A School Head can assign the section
          adviser.
        </EmptyState>
      ) : (
        <>
          {rosterLoading ? (
            <Loading label="Loading roster…" />
          ) : roster.length === 0 ? (
            <EmptyState>No learners enrolled in this section yet.</EmptyState>
          ) : (
            <>
              <div className="field">
                <label htmlFor="guidance-learner">Learner</label>
                <select
                  id="guidance-learner"
                  value={learnerId}
                  onChange={(event) => setLearnerId(event.target.value)}
                >
                  {roster.map((row) => (
                    <option key={row.membershipId} value={row.learnerId}>
                      {learnerLabel(row)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <span id="guidance-category-label">Category</span>
                <div role="group" aria-labelledby="guidance-category-label" className="form-row">
                  {ANECDOTAL_CATEGORIES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={category === value}
                      onClick={() => setCategory(value)}
                    >
                      {CATEGORY_LABELS[value]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label htmlFor="guidance-entry-date">Entry date</label>
                <input
                  id="guidance-entry-date"
                  type="date"
                  value={entryDate}
                  max={todayAsIsoDate()}
                  onChange={(event) => setEntryDate(event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="guidance-narrative">Narrative</label>
                <textarea
                  id="guidance-narrative"
                  value={narrative}
                  onChange={(event) => setNarrative(event.target.value)}
                />
              </div>

              <button
                type="button"
                className="button-primary"
                aria-disabled={!canSave}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving…" : "Save guidance record"}
              </button>
            </>
          )}

          <h3>Guidance records for this section</h3>
          {recordsError && (
            <Alert tone="error">
              <p>{recordsError}</p>
              <button type="button" onClick={loadRecords}>
                Retry
              </button>
            </Alert>
          )}
          {recordsLoading ? (
            <Loading label="Loading guidance records…" />
          ) : recordsError ? null : records.length === 0 ? (
            <EmptyState>No guidance records recorded yet for this section.</EmptyState>
          ) : (
            <ul className="guidance-record-list">
              {records.map((record) => (
                <li key={record.id}>
                  <button
                    type="button"
                    aria-pressed={selectedRecordId === record.id}
                    onClick={() => selectRecord(record.id)}
                  >
                    {learnerNameFor(record.learnerId)} — {CATEGORY_LABELS[record.category]} —{" "}
                    {record.entryDate}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selectedRecord && (
            <section aria-label="Guidance record detail">
              <h4>
                {learnerNameFor(selectedRecord.learnerId)} —{" "}
                {CATEGORY_LABELS[selectedRecord.category]} ({selectedRecord.entryDate})
              </h4>
              <p>{selectedRecord.narrative}</p>

              <h5>Follow-up history</h5>
              {followupsLoading ? (
                <Loading label="Loading follow-up history…" />
              ) : followups.length === 0 ? (
                <EmptyState>No follow-up entries yet.</EmptyState>
              ) : (
                <ul className="guidance-followup-list">
                  {followups.map((entry) => (
                    <li key={entry.id}>
                      <p>{entry.note}</p>
                      <p className="field-hint">{entry.createdAt}</p>
                    </li>
                  ))}
                </ul>
              )}

              <div className="field">
                <label htmlFor="guidance-followup-note">Add a follow-up</label>
                <textarea
                  id="guidance-followup-note"
                  value={followupNote}
                  onChange={(event) => setFollowupNote(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="button-primary"
                aria-disabled={followupSaving || followupNote.trim().length === 0}
                onClick={() => void handleAddFollowup()}
              >
                {followupSaving ? "Saving…" : "Save follow-up"}
              </button>
            </section>
          )}
        </>
      )}
    </Page>
  );
}
