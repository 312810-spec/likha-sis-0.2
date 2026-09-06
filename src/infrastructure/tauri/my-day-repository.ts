import type { MyDaySummary } from "../../domain/my-day";
import type { MyDayRepository } from "../../domain/ports/my-day-repository";
import { invoke } from "./invoke";

/** Tauri adapter for `get_my_day_summary` (`src-tauri/src/commands/my_day.rs`). */
export class TauriMyDayRepository implements MyDayRepository {
  getSummary(todayWeekday: number, todayDate: string): Promise<MyDaySummary> {
    return invoke<MyDaySummary>("get_my_day_summary", { todayWeekday, todayDate });
  }
}
