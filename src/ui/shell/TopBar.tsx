import { useEffect, useId, useRef, useState } from "react";
import type { CurrentSession } from "../../domain/session";
import { Icon } from "../components/icons";
import { TAB_LABELS, type SignedInTab } from "../components/workbench-nav-data";
import { ShellAccountPreferences } from "./ShellAccountPreferences";

interface TopBarProps {
  session: CurrentSession;
  activeTab: SignedInTab;
  onLogout: () => void;
  onOpenDrawer: () => void;
  logoUrl?: string | null;
}
export function TopBar({ session, activeTab, onLogout, onOpenDrawer, logoUrl }: TopBarProps) {
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!accountOpen) return;
    panelRef.current?.querySelector<HTMLElement>("select, button")?.focus();
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !accountRef.current?.contains(event.target)) {
        setAccountOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setAccountOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);
  return (
    <header className="app-topbar">
      <button
        type="button"
        className="app-topbar-menu"
        data-drawer-toggle
        aria-label="Open navigation"
        onClick={onOpenDrawer}
      >
        <Icon name="menu" />
      </button>
      <div className="app-topbar-school">
        {logoUrl && <img src={logoUrl} alt="" className="app-topbar-logo" />}
        <span>
          <strong>{session.schoolName}</strong>
          <small>LIKHA-SIS</small>
        </span>
      </div>
      <div className="app-topbar-title">
        <strong>{TAB_LABELS[activeTab]}</strong>
      </div>
      <div className="app-topbar-spacer" />
      <div
        className="app-account"
        ref={accountRef}
        onBlur={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            !event.currentTarget.contains(event.relatedTarget)
          ) {
            setAccountOpen(false);
          }
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          className="app-account-trigger"
          aria-label={`Account preferences for ${session.displayName}`}
          aria-haspopup="dialog"
          aria-expanded={accountOpen}
          aria-controls={accountOpen ? panelId : undefined}
          onClick={() => setAccountOpen((open) => !open)}
        >
          <span className="app-account-avatar">
            <Icon name="learners" />
          </span>
          <span className="app-account-name">{session.displayName}</span>
          <span className="app-account-chevron">
            <Icon name="chevron" />
          </span>
        </button>
        {accountOpen && (
          <div
            ref={panelRef}
            id={panelId}
            className="app-account-panel"
            role="dialog"
            aria-label="Account preferences"
          >
            <ShellAccountPreferences session={session} onLogout={onLogout} />
          </div>
        )}
      </div>
    </header>
  );
}
