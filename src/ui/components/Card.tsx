import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  headingLevel?: 2 | 3 | 4;
  actions?: ReactNode;
  span?: 4 | 6 | 8 | 12;
  keepHalf?: boolean;
  children: ReactNode;
}

export function Card({
  title,
  headingLevel = 3,
  actions,
  span = 12,
  keepHalf,
  children,
}: CardProps) {
  const Heading = `h${headingLevel}` as const;

  return (
    <section className="card" data-span={span} data-keep-half={keepHalf ? "" : undefined}>
      {title ? (
        <div className="card-header">
          <Heading>{title}</Heading>
          {actions ? <div className="card-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function BentoGrid({ children }: { children: ReactNode }) {
  return <div className="bento">{children}</div>;
}
