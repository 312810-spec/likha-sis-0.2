/**
 * Shared UI copy vocabulary (CTOS M03).
 *
 * The components in `src/ui/components` (`Loading`, `EmptyState`, `Alert`,
 * `StatusChip`, `RequiresInternetGate`) already centralize the *markup* and
 * ARIA semantics of the four shared states. Before this module, the *words*
 * were still written inline at every call site, with no consistent voice —
 * loading copy in particular varied between "Loading…", "Loading classes…",
 * and "Checking your connection…".
 *
 * What is here, and deliberately what is not:
 *
 * - Loading, offline and error copy each get one canonical phrasing, so a
 *   teacher meeting the same situation on two different screens reads the same
 *   words.
 * - There is no `emptyCopy` export, and that is a conclusion rather than an
 *   omission. The 45 `<EmptyState>` call sites each name the missing thing and
 *   what to do about it — "No learners enrolled in this section yet." carries
 *   real context (which section, which action) that a generic string would
 *   throw away. Every candidate generic phrasing drawn here had no honest call
 *   site to serve, so the empty state keeps its per-screen phrasing. This
 *   module covers the state, not the subject matter.
 *
 * Voice, applied consistently: plain, calm, no exclamation, no blame of the
 * teacher, and a next action where one exists.
 */

/** Loading / progress. `role="status"` copy — announced, not interrupting. */
export const loadingCopy = {
  /** Generic progress, when the subject is already clear from surrounding UI. */
  loading: "Loading…",
  /** Checking a precondition before a result can be shown. */
  checkingConnection: "Checking your connection…",
  /** Saving teacher work locally; the word "locally" matters to this app. */
  saving: "Saving…",
} as const;

/**
 * Offline / connectivity. Kept separate from `errorCopy` because being offline
 * is not an error condition in this app — almost everything works offline, so
 * the copy must not read as if something has gone wrong.
 */
export const offlineCopy = {
  /** A feature that genuinely requires the network is unavailable. */
  needsConnection:
    "This tool needs an internet connection to generate content, and no internet connection was found right now.",
  /** Action label to re-check connectivity after the teacher reconnects. */
  tryAgain: "Try again",
} as const;

/**
 * Error copy for the generic failure shapes. Screen-specific failures keep
 * their own phrasing so they can name what failed and what the teacher can
 * salvage.
 */
export const errorCopy = {
  /** Something the teacher asked for could not be found, not their fault. */
  notFound: "This could not be found.",
} as const;
