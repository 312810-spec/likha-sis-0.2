import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DevPreviewApp } from "./DevPreviewApp";

/**
 * Development-only entry point. Not referenced by `index.html`,
 * `src/main.tsx`, or any production build entry -- see
 * `src/dev-preview/DevPreviewApp.tsx`'s doc comment and
 * `docs/adr/0032-teacher-workspace-polish.md`. This guard is a second,
 * independent line of defense: even if something were ever misconfigured
 * to bundle this file into a production build, it refuses to render.
 */
if (import.meta.env.PROD) {
  throw new Error(
    "dev-preview must never run in a production build -- this is a development-only visual fixture.",
  );
}

const rootElement = document.getElementById("dev-preview-root");
if (!rootElement) {
  throw new Error("dev-preview root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <DevPreviewApp />
  </StrictMode>,
);
