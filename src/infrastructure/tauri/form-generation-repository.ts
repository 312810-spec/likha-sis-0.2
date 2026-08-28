import { invoke } from "./invoke";
import type { Sf1GenerationResult, Sf9GenerationResult } from "../../domain/form-generation";
import type { FormGenerationRepository } from "../../domain/ports/form-generation-repository";

/** Tauri/SQLite implementation of {@link FormGenerationRepository}. */
export class TauriFormGenerationRepository implements FormGenerationRepository {
  generateSf1(sectionId: string, asOfDate: string): Promise<Sf1GenerationResult | null> {
    return invoke<Sf1GenerationResult | null>("generate_sf1_form", { sectionId, asOfDate });
  }

  generateSf9(
    sectionId: string,
    learnerId: string,
    asOfDate: string,
  ): Promise<Sf9GenerationResult | null> {
    return invoke<Sf9GenerationResult | null>("generate_sf9_form", {
      sectionId,
      learnerId,
      asOfDate,
    });
  }
}
