import axe from "axe-core";
import { expect } from "vitest";

/**
 * Runs axe-core against a rendered container and fails the test with a
 * readable summary if it finds any violations. jsdom has no real layout
 * engine, so layout/contrast-dependent rules are unreliable here — this
 * catches missing labels, bad ARIA usage, and similar structural issues,
 * not visual/contrast problems. Not a substitute for a human accessibility
 * pass on the real rendered app.
 */
export async function expectNoAccessibilityViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    rules: {
      // These rules depend on browser layout/font rendering. axe-core's
      // label-content-name-mismatch rule creates a canvas to distinguish
      // text from icon ligatures; jsdom intentionally has no canvas
      // implementation and logs a warning on every run. The real-browser
      // accessibility gate remains responsible for both checks.
      "color-contrast": { enabled: false },
      "label-content-name-mismatch": { enabled: false },
    },
  });
  if (results.violations.length > 0) {
    const summary = results.violations
      .map(
        (violation) => `- ${violation.id}: ${violation.help} (${violation.nodes.length} node(s))`,
      )
      .join("\n");
    expect.fail(`Accessibility violations found:\n${summary}`);
  }
}
