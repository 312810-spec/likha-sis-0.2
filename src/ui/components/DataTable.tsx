import type { ReactNode } from "react";

export interface DataColumn {
  key: string;
  header: ReactNode;
  align?: "start" | "end";
  /** Fallback for the phone-reflow `data-label` when `header` is not a string. */
  label?: string;
}

export interface DataRow {
  key: string;
  cells: Record<string, ReactNode>;
  /** `key` of the column whose cell is the row's `<th scope="row">`. */
  rowHeader?: string;
}

export interface DataTableProps {
  caption: string;
  /** Default false -> the caption is rendered but visually hidden. */
  captionVisible?: boolean;
  columns: DataColumn[];
  rows: DataRow[];
  /** When set, CSS reflows the table to one labelled block per row at max-width:640px. */
  reflowAt?: 640;
}

/**
 * Table-in-card primitive (ADR-0057 Wave 2). Real table semantics are kept
 * in every mode: the phone reflow is CSS-only (`display: block` driven by
 * the `data-reflow` attribute). `display: block` would otherwise drop the
 * implicit ARIA table roles in real browsers, so every role is set
 * explicitly (`table` / `rowgroup` / `row` / `columnheader` / `rowheader` /
 * `cell`) and survives the reflow -- never a swap to non-table roles. The
 * caller renders its own `EmptyState` when `rows` is empty.
 */
export function DataTable({
  caption,
  captionVisible = false,
  columns,
  rows,
  reflowAt,
}: DataTableProps) {
  return (
    <div className="data-table-scroll">
      <table role="table" className="data-table" data-reflow={reflowAt ? "" : undefined}>
        <caption className={captionVisible ? undefined : "visually-hidden"}>{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((column) => (
              <th
                key={column.key}
                role="columnheader"
                scope="col"
                className={column.align === "end" ? "num" : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr key={row.key} role="row">
              {columns.map((column) => {
                const content = row.cells[column.key];
                if (column.key === row.rowHeader) {
                  return (
                    <th key={column.key} role="rowheader" scope="row">
                      {content}
                    </th>
                  );
                }
                const labelText =
                  column.label ?? (typeof column.header === "string" ? column.header : "");
                return (
                  <td
                    key={column.key}
                    role="cell"
                    className={column.align === "end" ? "num" : undefined}
                    data-label={labelText}
                  >
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
