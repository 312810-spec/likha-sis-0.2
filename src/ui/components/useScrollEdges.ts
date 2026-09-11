import { useEffect, useState, type RefObject } from "react";

export interface ScrollEdgeState {
  /** More content exists to the left -- the container has been scrolled
   * right from its start. */
  start: boolean;
  /** More content exists to the right -- the container has not yet been
   * scrolled to its end. */
  end: boolean;
}

/**
 * Tracks whether a horizontally-scrollable element currently has more
 * content off-screen to the left/right, so callers can show a real,
 * scroll-state-driven affordance (e.g. an edge fade) instead of a static
 * always-on/always-off hint. Used by `DataTable` and `MonthlySummaryScreen`'s
 * wide attendance grid -- see docs/ACTIVE-PLAN.md's scroll-affordance fix.
 *
 * `deps` should include whatever changes the scrolled content's size (e.g.
 * `rows`/`columns`) so a fresh render re-measures even without a scroll
 * event.
 */
export function useScrollEdges(
  ref: RefObject<HTMLElement | null>,
  deps: readonly unknown[],
): ScrollEdgeState {
  const [state, setState] = useState<ScrollEdgeState>({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function update() {
      const { scrollLeft, scrollWidth, clientWidth } = el!;
      // 1px tolerance for sub-pixel rounding at either edge.
      const hasOverflow = scrollWidth > clientWidth + 1;
      setState({
        start: hasOverflow && scrollLeft > 1,
        end: hasOverflow && scrollLeft < scrollWidth - clientWidth - 1,
      });
    }

    update();
    el.addEventListener("scroll", update, { passive: true });
    // jsdom (this project's test environment) has no ResizeObserver --
    // feature-detect so tests can still render consumers of this hook; the
    // scroll listener plus the initial `update()` above still cover the
    // real-browser case fully, ResizeObserver only adds "content changed
    // size without a scroll event" coverage.
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : undefined;
    resizeObserver?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      resizeObserver?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps]);

  return state;
}
