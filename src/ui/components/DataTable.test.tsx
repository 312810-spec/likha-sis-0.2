import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable, type DataColumn, type DataRow } from "./DataTable";
import { expectNoAccessibilityViolations } from "../../test/a11y";

const columns: DataColumn[] = [
  { key: "learner", header: "Learner" },
  { key: "present", header: "Days present", align: "end" },
  { key: "rate", header: "Attendance rate", align: "end" },
];

const rows: DataRow[] = [
  {
    key: "l1",
    rowHeader: "learner",
    cells: { learner: "Dela Cruz, Maria", present: 38, rate: "95%" },
  },
  {
    key: "l2",
    rowHeader: "learner",
    cells: { learner: "Santos, Jose", present: 34, rate: "85%" },
  },
];

describe("DataTable", () => {
  it("renders column headers as columnheaders", () => {
    render(<DataTable caption="Attendance" columns={columns} rows={rows} />);
    const headers = within(document.body).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual([
      "Learner",
      "Days present",
      "Attendance rate",
    ]);
  });

  it("renders one row per data row with cells", () => {
    const { container } = render(<DataTable caption="Attendance" columns={columns} rows={rows} />);
    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows).toHaveLength(2);
    // First data row: rowheader + two td cells.
    const firstRow = bodyRows[0];
    expect(within(firstRow as HTMLElement).getByRole("rowheader").textContent).toBe(
      "Dela Cruz, Maria",
    );
    expect(within(firstRow as HTMLElement).getAllByRole("cell")).toHaveLength(2);
  });

  it("renders the rowHeader column's cell as th[scope=row] / role rowheader", () => {
    const { container } = render(<DataTable caption="Attendance" columns={columns} rows={rows} />);
    const rowHeaders = Array.from(container.querySelectorAll('tbody th[scope="row"]'));
    expect(rowHeaders).toHaveLength(2);
    expect(rowHeaders[0]?.textContent).toBe("Dela Cruz, Maria");
    const rowHeaderRoles = within(document.body).getAllByRole("rowheader");
    expect(rowHeaderRoles).toHaveLength(2);
  });

  it('puts the "num" class on align:"end" headers and their cells', () => {
    const { container } = render(<DataTable caption="Attendance" columns={columns} rows={rows} />);
    const headerCells = Array.from(container.querySelectorAll("thead th"));
    expect(headerCells[0]?.classList.contains("num")).toBe(false);
    expect(headerCells[1]?.classList.contains("num")).toBe(true);
    expect(headerCells[2]?.classList.contains("num")).toBe(true);

    const firstBodyRow = container.querySelector("tbody tr");
    const tds = firstBodyRow!.querySelectorAll("td");
    expect(tds).toHaveLength(2);
    tds.forEach((td) => expect(td.classList.contains("num")).toBe(true));
  });

  it("renders a table with only the header row when rows is empty", () => {
    const { container } = render(<DataTable caption="Attendance" columns={columns} rows={[]} />);
    expect(container.querySelector("table.data-table")).not.toBeNull();
    expect(container.querySelectorAll("thead tr")).toHaveLength(1);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
  });

  it("adds data-reflow to the table and a non-empty data-label to every td when reflowAt is set", () => {
    const { container } = render(
      <DataTable caption="Attendance" columns={columns} rows={rows} reflowAt={640} />,
    );
    const table = container.querySelector("table.data-table")!;
    expect(table.hasAttribute("data-reflow")).toBe(true);

    const tds = container.querySelectorAll("tbody td");
    expect(tds.length).toBeGreaterThan(0);
    tds.forEach((td) => {
      const label = td.getAttribute("data-label");
      expect(label).toBeTruthy();
      expect(label!.length).toBeGreaterThan(0);
    });
  });

  it("omits data-reflow when reflowAt is not set", () => {
    const { container } = render(<DataTable caption="Attendance" columns={columns} rows={rows} />);
    expect(container.querySelector("table.data-table")!.hasAttribute("data-reflow")).toBe(false);
  });

  it("hides the caption visually by default but keeps it in the DOM", () => {
    const { container } = render(
      <DataTable caption="Attendance summary" columns={columns} rows={rows} />,
    );
    const caption = container.querySelector("caption")!;
    expect(caption.textContent).toBe("Attendance summary");
    expect(caption.classList.contains("visually-hidden")).toBe(true);
  });

  it("shows the caption when captionVisible is true", () => {
    const { container } = render(
      <DataTable caption="Attendance summary" captionVisible columns={columns} rows={rows} />,
    );
    expect(container.querySelector("caption")!.classList.contains("visually-hidden")).toBe(false);
  });

  it("has no axe violations for a normal render", async () => {
    const { container } = render(
      <DataTable caption="Attendance" captionVisible columns={columns} rows={rows} />,
    );
    await expectNoAccessibilityViolations(container);
  });

  it("has no axe violations for a reflowAt render", async () => {
    const { container } = render(
      <DataTable caption="Attendance" columns={columns} rows={rows} reflowAt={640} />,
    );
    await expectNoAccessibilityViolations(container);
  });
});
