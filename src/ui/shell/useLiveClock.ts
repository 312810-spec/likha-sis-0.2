import { useEffect, useState } from "react";

/** Batch 4 (ADR-0075): the shell header's live clock. Re-renders once a
 * minute, not once a second -- a school SIS header has no legitimate
 * need for seconds-level precision, and a per-minute tick is a much
 * lighter, less distracting re-render load than a per-second one. Pure
 * `Date`/`Intl` -- no new dependency. */
export function useLiveClock(): string {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
}
