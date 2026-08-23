import { describe, expect, it } from "vitest";
import { findViolations, run } from "./check-architecture.mjs";

describe("findViolations", () => {
  it("flags a direct @tauri-apps import from a UI file", () => {
    const violations = findViolations(
      "src/ui/Example.tsx",
      'import { invoke } from "@tauri-apps/api/core";\n',
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("@tauri-apps/api/core");
  });

  it("flags an import reaching into src/infrastructure", () => {
    const violations = findViolations(
      "src/domain/example.ts",
      'import { LearnerRepo } from "../infrastructure/tauri/learner-repository";\n',
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("infrastructure/tauri/learner-repository");
  });

  it("allows an import of a domain port", () => {
    const violations = findViolations(
      "src/application/learner-service.ts",
      'import type { LearnerRepository } from "../domain/ports/learner-repository";\n',
    );
    expect(violations).toEqual([]);
  });

  it("allows a plain react import", () => {
    const violations = findViolations("src/ui/Example.tsx", 'import { useState } from "react";\n');
    expect(violations).toEqual([]);
  });
});

describe("run (against the real repository)", () => {
  it("finds no architecture-boundary violations in src/ui, src/domain, src/application", () => {
    expect(run()).toEqual([]);
  });
});
