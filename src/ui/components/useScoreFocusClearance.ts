import { useEffect, useState } from "react";

/** Keep the active score control inside the actual visible work area.
 * Read rendered chrome/visual viewport; never infer a footer height from density.
 * Scrolling changes no academic state and is immediate, including reduced motion. */
export function useScoreFocusClearance() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!container) return;
    let frame = 0;
    const clear = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !container.contains(active)) return;
        const viewport = window.visualViewport;
        const top = viewport?.offsetTop ?? 0;
        let bottom = top + (viewport?.height ?? window.innerHeight);
        const nav = document.querySelector(".app-bottomnav");
        if (nav instanceof HTMLElement && getComputedStyle(nav).position === "fixed") {
          const bounds = nav.getBoundingClientRect();
          if (bounds.height > 0 && bounds.top < bottom) bottom = bounds.top;
        }
        const gap = parseFloat(getComputedStyle(container).getPropertyValue("--spacing-unit")) || 0;
        const bounds = active.getBoundingClientRect();
        // Scroll only the amount needed, preserving the teacher's place.
        const delta =
          bounds.bottom > bottom - gap
            ? bounds.bottom - bottom + gap
            : bounds.top < top + gap
              ? bounds.top - top - gap
              : 0;
        if (delta) window.scrollBy({ top: delta, behavior: "instant" });
      });
    };
    container.addEventListener("focusin", clear);
    window.addEventListener("resize", clear);
    window.visualViewport?.addEventListener("resize", clear);
    window.visualViewport?.addEventListener("scroll", clear);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(clear);
    observer?.observe(container);
    const nav = document.querySelector(".app-bottomnav");
    if (nav) observer?.observe(nav);
    clear();
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("focusin", clear);
      window.removeEventListener("resize", clear);
      window.visualViewport?.removeEventListener("resize", clear);
      window.visualViewport?.removeEventListener("scroll", clear);
      observer?.disconnect();
    };
  }, [container]);
  return setContainer;
}
