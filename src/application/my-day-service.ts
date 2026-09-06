import type { MyDaySummary } from "../domain/my-day";
import type { MyDayRepository } from "../domain/ports/my-day-repository";

/** `getSummary` takes only the caller's own local weekday/date to
 * validate — no other input, matching every other same-session
 * reference-data read in this codebase (see `SyncStatusApplicationService`). */
export class MyDayApplicationService {
  constructor(private readonly repository: MyDayRepository) {}

  getSummary(todayWeekday: number, todayDate: string): Promise<MyDaySummary> {
    return this.repository.getSummary(todayWeekday, todayDate);
  }
}
