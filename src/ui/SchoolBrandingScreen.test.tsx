import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SchoolCoordinatesApplicationService } from "../application/school-coordinates-service";
import { SchoolLogoApplicationService } from "../application/school-logo-service";
import type { SchoolCoordinatesRepository } from "../domain/ports/school-coordinates-repository";
import type { SchoolLogoRepository } from "../domain/ports/school-logo-repository";
import type { SchoolCoordinates } from "../domain/school-coordinates";
import type { SchoolLogo } from "../domain/school-logo";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { SchoolBrandingScreen } from "./SchoolBrandingScreen";

// jsdom has no real Blob/createObjectURL image decoding -- stub just
// enough of the URL API for the preview `<img>` src to be assignable.
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:mock-url";
}
if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = () => {};
}

class FakeSchoolLogoRepository implements SchoolLogoRepository {
  logo: SchoolLogo | null = null;
  setCalls: Array<{ mime: string; bytes: Uint8Array }> = [];
  setResult: "ok" | "reject" = "ok";
  clearCalls = 0;
  clearResult: "ok" | "reject" = "ok";

  async get(): Promise<SchoolLogo | null> {
    return this.logo;
  }

  async set(mime: string, bytes: Uint8Array): Promise<void> {
    this.setCalls.push({ mime, bytes });
    if (this.setResult === "reject") {
      throw new Error("unauthorized");
    }
    this.logo = { mime, bytes };
  }

  async clear(): Promise<void> {
    this.clearCalls += 1;
    if (this.clearResult === "reject") {
      throw new Error("unauthorized");
    }
    this.logo = null;
  }
}

class FakeSchoolCoordinatesRepository implements SchoolCoordinatesRepository {
  coordinates: SchoolCoordinates | null = null;
  setCalls: Array<{ latitude: number; longitude: number }> = [];
  clearCalls = 0;

  async get(): Promise<SchoolCoordinates | null> {
    return this.coordinates;
  }

  async set(latitude: number, longitude: number): Promise<void> {
    this.setCalls.push({ latitude, longitude });
    this.coordinates = { latitude, longitude };
  }

  async clear(): Promise<void> {
    this.clearCalls += 1;
    this.coordinates = null;
  }
}

function renderScreen(
  repo: FakeSchoolLogoRepository = new FakeSchoolLogoRepository(),
  coordinatesRepo?: FakeSchoolCoordinatesRepository,
) {
  return render(
    <ModeProvider>
      <SchoolBrandingScreen
        schoolLogoService={new SchoolLogoApplicationService(repo)}
        schoolCoordinatesService={
          coordinatesRepo ? new SchoolCoordinatesApplicationService(coordinatesRepo) : undefined
        }
      />
    </ModeProvider>,
  );
}

describe("SchoolBrandingScreen", () => {
  it("shows a placeholder when no logo is uploaded yet", async () => {
    renderScreen();

    expect(await screen.findByText("No logo")).toBeInTheDocument();
    expect(screen.queryByAltText("Current school logo")).not.toBeInTheDocument();
  });

  it("shows the current logo when one is already uploaded", async () => {
    const repo = new FakeSchoolLogoRepository();
    repo.logo = { mime: "image/png", bytes: new Uint8Array([1, 2, 3]) };
    renderScreen(repo);

    expect(await screen.findByAltText("Current school logo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove logo" })).toBeInTheDocument();
  });

  it("uploading a valid file calls the application service and shows confirmation", async () => {
    const user = userEvent.setup();
    const repo = new FakeSchoolLogoRepository();
    renderScreen(repo);
    await screen.findByText("No logo");

    const file = new File([new Uint8Array([1, 2, 3, 4])], "logo.png", { type: "image/png" });
    const input = screen.getByLabelText("Upload a new logo (PNG, JPEG, or WebP)");
    await user.upload(input, file);

    await waitFor(() => expect(repo.setCalls).toHaveLength(1));
    expect(repo.setCalls[0]?.mime).toBe("image/png");
    expect(await screen.findByText("School logo updated.")).toBeInTheDocument();
  });

  // An unsupported-MIME-type rejection is covered at the application-service
  // layer (`school-logo-service.test.ts`) rather than here: the file input's
  // `accept` attribute already stops a real browser (and `user-event`'s
  // simulation of one) from ever selecting a non-matching file, so this
  // screen's own MIME check can never actually observe that path in a DOM
  // test -- it exists purely as defense-in-depth against a direct
  // `setLogo` call bypassing the picker.

  it("shows a generic message when the upload is denied (not a School Head)", async () => {
    const user = userEvent.setup();
    const repo = new FakeSchoolLogoRepository();
    repo.setResult = "reject";
    renderScreen(repo);
    await screen.findByText("No logo");

    const file = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });
    const input = screen.getByLabelText("Upload a new logo (PNG, JPEG, or WebP)");
    await user.upload(input, file);

    expect(
      await screen.findByText(
        "Could not upload this logo. You may not have permission to change it, or the file could not be read.",
      ),
    ).toBeInTheDocument();
  });

  it("removing the logo calls clear and re-shows the placeholder", async () => {
    const user = userEvent.setup();
    const repo = new FakeSchoolLogoRepository();
    repo.logo = { mime: "image/png", bytes: new Uint8Array([1, 2, 3]) };
    renderScreen(repo);
    await screen.findByAltText("Current school logo");

    await user.click(screen.getByRole("button", { name: "Remove logo" }));

    await waitFor(() => expect(repo.clearCalls).toBe(1));
    expect(await screen.findByText("School logo removed.")).toBeInTheDocument();
    expect(await screen.findByText("No logo")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations in its default state", async () => {
    const { container } = renderScreen();
    await screen.findByText("No logo");

    await expectNoAccessibilityViolations(container);
  });

  it("does not render the School location section when no coordinates service is given", async () => {
    renderScreen();
    await screen.findByText("No logo");

    expect(screen.queryByText("School location")).not.toBeInTheDocument();
  });

  it("renders empty coordinate fields when no location is configured yet", async () => {
    renderScreen(new FakeSchoolLogoRepository(), new FakeSchoolCoordinatesRepository());
    await screen.findByText("School location");

    expect(screen.getByLabelText("Latitude")).toHaveValue(null);
    expect(screen.getByLabelText("Longitude")).toHaveValue(null);
    expect(screen.queryByRole("button", { name: "Remove location" })).not.toBeInTheDocument();
  });

  it("saving a location calls the application service and shows confirmation", async () => {
    const user = userEvent.setup();
    const coordinatesRepo = new FakeSchoolCoordinatesRepository();
    renderScreen(new FakeSchoolLogoRepository(), coordinatesRepo);
    await screen.findByText("School location");

    await user.type(screen.getByLabelText("Latitude"), "14.5995");
    await user.type(screen.getByLabelText("Longitude"), "120.9842");
    await user.click(screen.getByRole("button", { name: "Save location" }));

    await waitFor(() => expect(coordinatesRepo.setCalls).toHaveLength(1));
    expect(coordinatesRepo.setCalls[0]).toEqual({ latitude: 14.5995, longitude: 120.9842 });
    expect(await screen.findByText("School coordinates updated.")).toBeInTheDocument();
  });

  it("shows the current location and offers to remove it once configured", async () => {
    const user = userEvent.setup();
    const coordinatesRepo = new FakeSchoolCoordinatesRepository();
    coordinatesRepo.coordinates = { latitude: 14.5995, longitude: 120.9842 };
    renderScreen(new FakeSchoolLogoRepository(), coordinatesRepo);
    await screen.findByText("School location");

    expect(screen.getByLabelText("Latitude")).toHaveValue(14.5995);

    await user.click(screen.getByRole("button", { name: "Remove location" }));

    await waitFor(() => expect(coordinatesRepo.clearCalls).toBe(1));
    expect(await screen.findByText("School coordinates removed.")).toBeInTheDocument();
  });
});
