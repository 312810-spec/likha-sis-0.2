/**
 * School Calendar & Philippine Holidays — hardcoded offline reference
 * table for one specific, named school year.
 *
 * Source: Malacañang Proclamation No. 727, s. 2025 ("Declaring Regular
 * Holidays, Special (Non-Working) Days, and Special (Working) Day for
 * the Year 2026") and Proclamation No. 665, s. 2025 (2025 holidays),
 * both published via the Official Gazette (officialgazette.gov.ph),
 * cross-checked against DepEd's School Calendar for SY 2025-2026
 * (DepEd Order, "School Calendar and Activities for School Year
 * 2025-2026"). Islamic holidays (Eid'l Fitr, Eid'l Adha) are proclaimed
 * separately each year based on lunar-calendar sighting and are
 * transcribed here from the same proclamations' estimated/confirmed
 * dates — treat the Islamic-holiday dates as APPROXIMATE until the
 * year's specific proclamation confirms them.
 *
 * This is public reference data, not sensitive, but it goes stale every
 * year: flagged here and in `docs/VERIFICATION-DEBT.md` as needing
 * periodic manual update for each new school year and whenever a new
 * proclamation is issued (e.g. an added special non-working day for a
 * local event). Do not silently extend this table to a school year it
 * doesn't cover without updating the source citation above.
 */

/** @public — only consumed structurally, via `PhilippineHoliday.kind`. */
export type HolidayKind = "regular" | "special-non-working" | "special-working" | "islamic";

export interface PhilippineHoliday {
  date: string; // ISO yyyy-mm-dd
  name: string;
  kind: HolidayKind;
}

/** Covers school year 2025-2026 (June 2025 - May 2026) only. See module
 * doc comment for sourcing and the periodic-update caveat. */
export const PHILIPPINE_HOLIDAYS_SY_2025_2026: readonly PhilippineHoliday[] = [
  { date: "2025-08-21", name: "Ninoy Aquino Day", kind: "special-non-working" },
  { date: "2025-08-25", name: "National Heroes Day", kind: "regular" },
  { date: "2025-10-31", name: "Additional special (non-working) day", kind: "special-non-working" },
  { date: "2025-11-01", name: "All Saints' Day", kind: "special-non-working" },
  { date: "2025-11-30", name: "Bonifacio Day", kind: "regular" },
  {
    date: "2025-12-08",
    name: "Feast of the Immaculate Conception of Mary",
    kind: "special-non-working",
  },
  { date: "2025-12-25", name: "Christmas Day", kind: "regular" },
  { date: "2025-12-30", name: "Rizal Day", kind: "regular" },
  { date: "2025-12-31", name: "Last Day of the Year", kind: "special-non-working" },
  { date: "2026-01-01", name: "New Year's Day", kind: "regular" },
  {
    date: "2026-02-25",
    name: "EDSA People Power Revolution Anniversary",
    kind: "special-non-working",
  },
  {
    date: "2026-03-19",
    name: "Eid'l Fitr (approximate — confirm against the year's proclamation)",
    kind: "islamic",
  },
  { date: "2026-04-02", name: "Maundy Thursday", kind: "regular" },
  { date: "2026-04-03", name: "Good Friday", kind: "regular" },
  { date: "2026-04-04", name: "Black Saturday", kind: "special-non-working" },
  { date: "2026-04-09", name: "Araw ng Kagitingan", kind: "regular" },
  { date: "2026-05-01", name: "Labor Day", kind: "regular" },
  {
    date: "2026-05-27",
    name: "Eid'l Adha (approximate — confirm against the year's proclamation)",
    kind: "islamic",
  },
];

export function holidaysInRange(
  startDate: string,
  endDate: string,
  table: readonly PhilippineHoliday[] = PHILIPPINE_HOLIDAYS_SY_2025_2026,
): PhilippineHoliday[] {
  return table.filter((h) => h.date >= startDate && h.date <= endDate);
}

export function findHoliday(
  date: string,
  table: readonly PhilippineHoliday[] = PHILIPPINE_HOLIDAYS_SY_2025_2026,
): PhilippineHoliday | null {
  return table.find((h) => h.date === date) ?? null;
}

export function isNonWorkingDay(
  date: string,
  table: readonly PhilippineHoliday[] = PHILIPPINE_HOLIDAYS_SY_2025_2026,
): boolean {
  const holiday = findHoliday(date, table);
  return holiday !== null && holiday.kind !== "special-working";
}
