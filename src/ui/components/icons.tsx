import type { JSX } from "react";

export type IconName =
  | "home"
  | "today"
  | "check"
  | "calendar"
  | "learners"
  | "sections"
  | "import"
  | "clock"
  | "grid"
  | "shield"
  | "menu"
  | "chevron";

// Stroke-only 24x24 glyphs, drawn with currentColor so they inherit the
// nav item's text colour (including the active/inverted state). Decorative:
// every nav destination also renders its text label.
const PATHS: Record<IconName, JSX.Element> = {
  home: <path d="M3 11 12 3l9 8M5 10v10h14V10" />,
  today: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3" />
    </>
  ),
  check: <path d="m5 13 4 4L19 7" />,
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3M8 14h.01M12 14h.01M16 14h.01" />
    </>
  ),
  learners: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
    </>
  ),
  sections: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </>
  ),
  import: <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  grid: (
    <>
      <path d="M4 5h16M4 12h16M4 19h16" />
    </>
  ),
  shield: <path d="M12 3 5 6v6c0 4.4 3 8 7 9 4-1 7-4.6 7-9V6l-7-3Z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  chevron: <path d="m6 9 6 6 6-6" />,
};

export function Icon({ name }: { name: IconName }): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
