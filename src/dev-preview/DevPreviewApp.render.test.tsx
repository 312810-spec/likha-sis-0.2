import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DevPreviewApp } from "./DevPreviewApp";

/**
 * Renders the dev-preview app and walks it to each of the seven
 * previously-unwired `SignedInTab` destinations tracked as fixture
 * coverage debt in `docs/VERIFICATION-DEBT.md` (Adviser View, Subject
 * Attendance, Subject Monitor, Teacher Load, Teaching Assignments,
 * Schedule Meetings) — proving the new fixture repositories in
 * `./fixtures.ts` genuinely load and render through the exact same
 * screens/services production uses, not just that they typecheck.
 * `sf1-import` is deliberately not covered here — it remains unwired
 * (see `DevPreviewApp.tsx`'s own doc comment) since it needs a
 * `FilePicker` fixture this dev-preview does not yet have.
 */
describe("DevPreviewApp — new fixture destinations render", () => {
  it("renders Subject Attendance via the sidebar", async () => {
    const user = userEvent.setup();
    render(<DevPreviewApp />);
    await user.click(screen.getByRole("button", { name: "Subject Attendance" }));
    expect(await screen.findByRole("heading", { name: "Subject Attendance" })).toBeInTheDocument();
  });

  it("renders Subject Monitor via the sidebar", async () => {
    const user = userEvent.setup();
    render(<DevPreviewApp />);
    await user.click(screen.getByRole("button", { name: "My Subject Attendance" }));
    expect(await screen.findByRole("heading", { name: "Subject Monitor" })).toBeInTheDocument();
  });

  it("renders Adviser View via the sidebar", async () => {
    const user = userEvent.setup();
    render(<DevPreviewApp />);
    await user.click(screen.getByRole("button", { name: "My Advisory Overview" }));
    expect(await screen.findByRole("heading", { name: "Adviser View" })).toBeInTheDocument();
  });

  it("renders Teacher Load via the sidebar", async () => {
    const user = userEvent.setup();
    render(<DevPreviewApp />);
    await user.click(screen.getByRole("button", { name: "My Teaching Load" }));
    expect(await screen.findByRole("heading", { name: "My Teaching Load" })).toBeInTheDocument();
  });

  it("renders Teaching Assignments and Class Schedule via Sections", async () => {
    const user = userEvent.setup();
    render(<DevPreviewApp />);
    await user.click(screen.getByRole("button", { name: "Sections" }));
    await user.click(
      await screen.findByRole("button", { name: "Manage teaching assignments for Mabini" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Mabini — teaching assignments" }),
    ).toBeInTheDocument();

    await user.click(
      await screen.findByRole("button", { name: "Manage schedule for Mathematics" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Mathematics — Mabini — schedule" }),
    ).toBeInTheDocument();
  });
});
