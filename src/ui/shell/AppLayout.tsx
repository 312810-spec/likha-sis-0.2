import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { CurrentSession } from "../../domain/session";
import type { SignedInTab } from "../components/workbench-nav-data";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

interface AppLayoutProps {
  session: CurrentSession;
  activeTab: SignedInTab;
  onNavigate: (tab: SignedInTab) => void;
  onLogout: () => void;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const PHONE_QUERY = "(max-width: 860px)";

export function AppLayout({ session, activeTab, onNavigate, onLogout, children }: AppLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isPhone, setIsPhone] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(PHONE_QUERY).matches;
  });
  const sidebarWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(PHONE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsPhone(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    // Return focus to whatever opened the drawer.
    const toggle = document.querySelector<HTMLElement>("[data-drawer-toggle]");
    toggle?.focus();
  }, []);

  const navigate = useCallback(
    (tab: SignedInTab) => {
      setDrawerOpen(false);
      onNavigate(tab);
    },
    [onNavigate],
  );

  useEffect(() => {
    if (!drawerOpen) return;
    const wrap = sidebarWrapRef.current;
    const first = wrap?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDrawer();
        return;
      }
      if (e.key !== "Tab" || !wrap) return;
      const items = [...wrap.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (!firstEl || !lastEl) return;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, closeDrawer]);

  const sidebarInert = isPhone && !drawerOpen;
  const mainInert = isPhone && drawerOpen;

  return (
    <div className="app-layout" data-drawer={drawerOpen ? "open" : "closed"}>
      <div className="app-layout-scrim" onClick={closeDrawer} aria-hidden="true" />
      <div
        className="app-layout-sidebar"
        ref={sidebarWrapRef}
        inert={sidebarInert}
        aria-hidden={sidebarInert || undefined}
      >
        <Sidebar activeTab={activeTab} onNavigate={navigate} />
      </div>
      <div className="app-layout-main" inert={mainInert} aria-hidden={mainInert || undefined}>
        <TopBar
          session={session}
          activeTab={activeTab}
          onLogout={onLogout}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
        <main className="app-canvas">{children}</main>
      </div>
      <BottomNav
        activeTab={activeTab}
        onNavigate={navigate}
        onOpenMore={() => setDrawerOpen(true)}
      />
    </div>
  );
}
