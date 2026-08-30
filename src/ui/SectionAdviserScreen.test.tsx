import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SchoolMemberApplicationService } from "../application/school-member-service";
import { SectionAdvisoryApplicationService } from "../application/section-advisory-service";
import type { SchoolMemberRepository } from "../domain/ports/school-member-repository";
import type { SectionAdvisoryRepository } from "../domain/ports/section-advisory-repository";
import type { SchoolMember } from "../domain/school-member";
import type {
  AssignAdviserOutcome,
  EndAdvisoryOutcome,
  SectionAdvisory,
} from "../domain/section-advisory";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { SectionAdviserScreen } from "./SectionAdviserScreen";

const MEMBERS: SchoolMember[] = [
  { id: "teacher-1", username: "ana.cruz", displayName: "Ana Cruz", roles: ["teacher"] },
  { id: "head-1", username: "bo.reyes", displayName: "Bo Reyes", roles: ["school_head"] },
];

const ADVISORY: SectionAdvisory = {
  id: "adv-1",
  schoolId: "s1",
  sectionId: "sec-1",
  teacherUserId: "teacher-1",
  startsOn: "2026-08-01",
  endsOn: null,
  createdAt: "now",
};

class FakeSchoolMemberRepository implements SchoolMemberRepository {
  constructor(private members: SchoolMember[] = MEMBERS) {}
  async listMembers() {
    return this.members;
  }
}

class FakeSectionAdvisoryRepository implements SectionAdvisoryRepository {
  current: SectionAdvisory | null;
  assignResult: AssignAdviserOutcome | "reject" = { kind: "assigned", advisory: ADVISORY };
  endResult: EndAdvisoryOutcome | "reject" = { kind: "ended", advisory: ADVISORY };

  constructor(current: SectionAdvisory | null = null) {
    this.current = current;
  }

  async currentAdviser() {
    return this.current;
  }
  async assign(sectionId: string, teacherUserId: string, startsOn: string) {
    if (this.assignResult === "reject") {
      throw new Error("could not assign");
    }
    if (this.assignResult.kind === "assigned") {
      const advisory: SectionAdvisory = {
        id: "adv-new",
        schoolId: "s1",
        sectionId,
        teacherUserId,
        startsOn,
        endsOn: null,
        createdAt: "now",
      };
      this.current = advisory;
      return { kind: "assigned" as const, advisory };
    }
    return this.assignResult;
  }
  async end(_sectionId: string, _advisoryId: string, endsOn: string) {
    if (this.endResult === "reject") {
      throw new Error("could not end");
    }
    if (this.endResult.kind === "ended") {
      const ended = { ...this.endResult.advisory, endsOn };
      this.current = null;
      return { kind: "ended" as const, advisory: ended };
    }
    return this.endResult;
  }
}

function renderScreen(
  options: {
    current?: SectionAdvisory | null;
    members?: SchoolMember[];
    onBack?: () => void;
  } = {},
) {
  const advisoryRepo = new FakeSectionAdvisoryRepository(options.current ?? null);
  const sectionAdvisoryService = new SectionAdvisoryApplicationService(advisoryRepo);
  const schoolMemberService = new SchoolMemberApplicationService(
    new FakeSchoolMemberRepository(options.members ?? MEMBERS),
  );

  const result = render(
    <ModeProvider>
      <SectionAdviserScreen
        sectionAdvisoryService={sectionAdvisoryService}
        schoolMemberService={schoolMemberService}
        sectionId="sec-1"
        sectionName="Mabini"
        onBack={options.onBack ?? (() => {})}
      />
    </ModeProvider>,
  );
  return { ...result, advisoryRepo };
}

describe("SectionAdviserScreen", () => {
  it("shows a no-adviser message and the assign form when nobody is assigned", async () => {
    renderScreen();

    expect(
      await screen.findByText("No adviser is currently assigned to this section."),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Teacher" })).toBeInTheDocument();
  });

  it("only offers members with the teacher role in the picker", async () => {
    renderScreen();
    await screen.findByRole("combobox", { name: "Teacher" });

    expect(screen.getByRole("option", { name: "Ana Cruz" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Bo Reyes" })).not.toBeInTheDocument();
  });

  it("shows the current adviser and an End advisory form instead of the assign form", async () => {
    renderScreen({ current: ADVISORY });

    expect(await screen.findByText(/Ana Cruz — adviser since 2026-08-01/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End advisory" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Teacher" })).not.toBeInTheDocument();
  });

  it("assigns an adviser and shows the confirmation", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("combobox", { name: "Teacher" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Teacher" }), "teacher-1");
    await user.click(screen.getByRole("button", { name: "Assign adviser" }));

    expect(await screen.findByText("Ana Cruz was assigned as adviser.")).toBeInTheDocument();
  });

  it("ends the current advisory and returns to the assign form", async () => {
    const user = userEvent.setup();
    renderScreen({ current: ADVISORY });
    await screen.findByRole("button", { name: "End advisory" });

    await user.click(screen.getByRole("button", { name: "End advisory" }));

    await waitFor(() =>
      expect(screen.getByText("Ana Cruz's advisory was ended.")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("No adviser is currently assigned to this section."),
    ).toBeInTheDocument();
  });

  it("calls onBack when Back to sections is selected", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderScreen({ onBack });
    await screen.findByText("No adviser is currently assigned to this section.");

    await user.click(screen.getByRole("button", { name: "Back to sections" }));

    expect(onBack).toHaveBeenCalled();
  });

  it("has no detectable accessibility violations with an adviser assigned", async () => {
    const { container } = renderScreen({ current: ADVISORY });
    await screen.findByText(/Ana Cruz — adviser since 2026-08-01/);

    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations on the empty state", async () => {
    const { container } = renderScreen();
    await screen.findByText("No adviser is currently assigned to this section.");

    await expectNoAccessibilityViolations(container);
  });
});
