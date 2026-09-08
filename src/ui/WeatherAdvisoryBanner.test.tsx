import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SchoolCoordinatesApplicationService } from "../application/school-coordinates-service";
import { WeatherApplicationService } from "../application/weather-service";
import type { SchoolCoordinatesRepository } from "../domain/ports/school-coordinates-repository";
import type { WeatherClientPort } from "../domain/ports/weather-client";
import type { SchoolCoordinates } from "../domain/school-coordinates";
import type { WeatherSnapshot } from "../domain/weather-hazard";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { WeatherAdvisoryBanner } from "./WeatherAdvisoryBanner";

class FakeSchoolCoordinatesRepository implements SchoolCoordinatesRepository {
  constructor(private readonly coordinates: SchoolCoordinates | null) {}
  async get(): Promise<SchoolCoordinates | null> {
    return this.coordinates;
  }
  async set(): Promise<void> {
    throw new Error("not used in this test");
  }
  async clear(): Promise<void> {
    throw new Error("not used in this test");
  }
}

class FakeWeatherClient implements WeatherClientPort {
  constructor(
    private readonly behavior: { mode: "resolve"; snapshot: WeatherSnapshot } | { mode: "reject" },
  ) {}
  async fetchSnapshot(): Promise<WeatherSnapshot> {
    if (this.behavior.mode === "reject") throw new Error("network down");
    return this.behavior.snapshot;
  }
}

function renderBanner(coordinates: SchoolCoordinates | null, snapshot: WeatherSnapshot | "reject") {
  const schoolCoordinatesService = new SchoolCoordinatesApplicationService(
    new FakeSchoolCoordinatesRepository(coordinates),
  );
  const weatherService = new WeatherApplicationService(
    new FakeWeatherClient(
      snapshot === "reject" ? { mode: "reject" } : { mode: "resolve", snapshot },
    ),
  );
  return render(
    <WeatherAdvisoryBanner
      schoolCoordinatesService={schoolCoordinatesService}
      weatherService={weatherService}
    />,
  );
}

describe("WeatherAdvisoryBanner", () => {
  it("renders nothing when the school has no coordinates configured", async () => {
    const { container } = renderBanner(null, {
      precipitationMm: 999,
      windSpeedKph: 999,
      observedAt: "now",
    });

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders nothing when the weather fetch fails (never an error state)", async () => {
    const { container } = renderBanner({ latitude: 14.6, longitude: 121.0 }, "reject");

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders nothing when conditions are normal", async () => {
    const { container } = renderBanner(
      { latitude: 14.6, longitude: 121.0 },
      { precipitationMm: 1, windSpeedKph: 5, observedAt: "now" },
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders an advisory, and never claims classes are suspended, when a threshold is exceeded", async () => {
    renderBanner(
      { latitude: 14.6, longitude: 121.0 },
      { precipitationMm: 40, windSpeedKph: 5, observedAt: "now" },
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/exceeds the 30mm advisory threshold/i);
    expect(alert).toHaveTextContent(/not a class-suspension decision/i);
    expect(screen.queryByText(/classes are suspended/i)).not.toBeInTheDocument();
  });

  it("has no axe-detectable accessibility violations when visible", async () => {
    const { container } = renderBanner(
      { latitude: 14.6, longitude: 121.0 },
      { precipitationMm: 40, windSpeedKph: 5, observedAt: "now" },
    );
    await screen.findByRole("alert");

    await expectNoAccessibilityViolations(container);
  });
});
