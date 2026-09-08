import { PHILIPPINE_HOLIDAYS_SY_2025_2026, type HolidayKind } from "../domain/ph-holidays";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

const KIND_LABELS: Record<HolidayKind, string> = {
  regular: "Regular holiday",
  "special-non-working": "Special (non-working) day",
  "special-working": "Special (working) day",
  islamic: "Islamic holiday (approximate)",
};

/**
 * Displays `domain/ph-holidays.ts`'s SY 2025-2026 reference table, with
 * its source citation visible in the UI (not only in the module's code
 * comment) -- Malacañang Proclamation No. 727, s. 2025 and Proclamation
 * No. 665, s. 2025, cross-checked against DepEd's School Calendar for SY
 * 2025-2026. Read-only, hardcoded reference data; no repository/service
 * involved.
 */
export function CalendarScreen() {
  const { mode } = useTeacherMode();
  const sorted = [...PHILIPPINE_HOLIDAYS_SY_2025_2026].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Page
      title="School Calendar"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Philippine national holidays for School Year 2025-2026, for reference when planning
            lessons and attendance. This table covers SY 2025-2026 only.
          </p>
        ) : undefined
      }
    >
      <p className="field-hint">
        Source: Malacañang Proclamation No. 727, s. 2025 ("Declaring Regular Holidays, Special
        (Non-Working) Days, and Special (Working) Day for the Year 2026") and Proclamation No. 665,
        s. 2025 (2025 holidays), both published via the Official Gazette (officialgazette.gov.ph),
        cross-checked against DepEd's School Calendar for SY 2025-2026. Islamic holiday dates (Eid'l
        Fitr, Eid'l Adha) are approximate until each year's specific proclamation confirms them.
        This table covers SY 2025-2026 only and requires periodic manual update for later school
        years.
      </p>

      <table className="attendance-roster">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Holiday</th>
            <th scope="col">Type</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((holiday) => (
            <tr key={holiday.date}>
              <th scope="row">{holiday.date}</th>
              <td className={holiday.kind === "regular" ? "calendar-holiday-regular" : undefined}>
                {holiday.name}
              </td>
              <td>{KIND_LABELS[holiday.kind]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Page>
  );
}
