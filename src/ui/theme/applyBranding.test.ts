import { describe, expect, it } from "vitest";
import type { SchoolBranding } from "../../domain/school-branding";
import { applyBranding } from "./applyBranding";

const SAMPLE: SchoolBranding = {
  schoolId: "school-1",
  primaryColor: "#204060",
  primaryTextColor: "#ffffff",
  secondaryColor: "#603020",
  secondaryTextColor: "#ffffff",
  accentColor: "#206030",
  accentTextColor: "#ffffff",
  selectedSurfaceColor: "#eef2fb",
  restrainedSurfaceColor: "#f6f8fc",
  updatedAt: "2026-08-29T00:00:00.000Z",
};

describe("applyBranding", () => {
  it("sets every brand token as an inline CSS custom property", () => {
    const el = document.createElement("div");

    applyBranding(SAMPLE, el);

    expect(el.style.getPropertyValue("--color-primary")).toBe("#204060");
    expect(el.style.getPropertyValue("--color-primary-text")).toBe("#ffffff");
    expect(el.style.getPropertyValue("--color-secondary")).toBe("#603020");
    expect(el.style.getPropertyValue("--color-accent")).toBe("#206030");
    expect(el.style.getPropertyValue("--color-selected-surface")).toBe("#eef2fb");
    expect(el.style.getPropertyValue("--color-restrained-surface")).toBe("#f6f8fc");
  });

  it("removes every override when passed null, reverting to the stylesheet defaults", () => {
    const el = document.createElement("div");
    applyBranding(SAMPLE, el);

    applyBranding(null, el);

    expect(el.style.getPropertyValue("--color-primary")).toBe("");
    expect(el.style.getPropertyValue("--color-secondary")).toBe("");
    expect(el.style.getPropertyValue("--color-accent")).toBe("");
    expect(el.style.getPropertyValue("--color-selected-surface")).toBe("");
    expect(el.style.getPropertyValue("--color-restrained-surface")).toBe("");
  });

  it("never sets a property for a semantic status color", () => {
    const el = document.createElement("div");

    applyBranding(SAMPLE, el);

    expect(el.style.getPropertyValue("--color-danger")).toBe("");
    expect(el.style.getPropertyValue("--color-success")).toBe("");
    expect(el.style.getPropertyValue("--color-warning")).toBe("");
  });

  it("re-applying a new branding replaces the previous values, not appends to them", () => {
    const el = document.createElement("div");
    applyBranding(SAMPLE, el);

    applyBranding({ ...SAMPLE, primaryColor: "#111111" }, el);

    expect(el.style.getPropertyValue("--color-primary")).toBe("#111111");
  });
});
