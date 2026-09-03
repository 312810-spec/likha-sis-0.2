import type { ReactNode } from "react";

export type KpiTone = "neutral" | "productive" | "success" | "warning" | "danger";

interface KpiProps {
  label: string;
  value: string | number;
  tone?: KpiTone;
  foot?: ReactNode;
  hint?: ReactNode;
}

export function Kpi({ label, value, tone, foot, hint }: KpiProps) {
  return (
    <div className="kpi" data-tone={tone ?? "neutral"}>
      <span className="kpi-label">{label}</span>
      {hint ? <span className="kpi-hint">{hint}</span> : null}
      <span className="kpi-value">{value}</span>
      {foot ? <span className="kpi-foot">{foot}</span> : null}
    </div>
  );
}

export function KpiStrip({ children }: { children: ReactNode }) {
  return <div className="kpi-strip">{children}</div>;
}
