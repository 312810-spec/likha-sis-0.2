import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyAppearance, readStoredAppearance } from "./ui/theme/appearance";

// Apply the stored Light/System/Dark preference (ADR-0070) to <html>
// before the first paint, so a teacher who chose Dark never sees a
// light flash on launch (and vice-versa). AppearanceProvider re-asserts
// this on mount and owns it thereafter.
applyAppearance(document.documentElement, readStoredAppearance());

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
