interface NavItemProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

/**
 * One destination inside the app shell's grouped navigation. Active
 * state is signaled both by `aria-pressed` (already this app's
 * established WCAG-1.4.1-safe pattern -- see the `::before` check-mark
 * rule this reuses via the shared `.nav-item` class) and by color, never
 * color alone.
 */
export function NavItem({ label, active, onClick }: NavItemProps) {
  return (
    <button type="button" className="nav-item" aria-pressed={active} onClick={onClick}>
      {label}
    </button>
  );
}
