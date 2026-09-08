import { useEffect, useState } from "react";
import type { SchoolCoordinatesApplicationService } from "../application/school-coordinates-service";
import type { WeatherApplicationService } from "../application/weather-service";
import type { WeatherAdvisory } from "../domain/weather-hazard";
import { Alert } from "./components/Alert";

interface WeatherAdvisoryBannerProps {
  schoolCoordinatesService: SchoolCoordinatesApplicationService;
  weatherService: WeatherApplicationService;
}

/**
 * Small, best-effort weather/hazard advisory affordance (Batch 8 item 5,
 * ADR-0079). Renders NOTHING -- not a loading state, not an error
 * banner -- in every one of these cases: coordinates not yet configured
 * for this school, the Open-Meteo fetch failing for any reason
 * (offline, timeout, malformed response), or the current conditions not
 * crossing either hazard threshold. It only ever becomes visible when
 * there is a genuine advisory to show, and even then it is explicit that
 * this is not a suspension decision -- only a school head/LGU can make
 * that call (see `domain/weather-hazard.ts`'s own doc comment).
 */
export function WeatherAdvisoryBanner({
  schoolCoordinatesService,
  weatherService,
}: WeatherAdvisoryBannerProps) {
  const [advisory, setAdvisory] = useState<WeatherAdvisory | null>(null);

  useEffect(() => {
    let cancelled = false;
    schoolCoordinatesService
      .getCoordinates()
      .then((coordinates) => {
        if (cancelled || !coordinates) return null;
        return weatherService.getSuspensionAdvisory(coordinates.latitude, coordinates.longitude);
      })
      .then((result) => {
        if (cancelled || !result) return;
        if (result.status === "ok" && result.advisory.level === "advisory") {
          setAdvisory(result.advisory);
        }
      })
      .catch(() => {
        // Coordinates fetch itself failing is just as "cleanly absent"
        // as an unavailable weather result -- never surfaced as an error.
      });
    return () => {
      cancelled = true;
    };
  }, [schoolCoordinatesService, weatherService]);

  if (!advisory) return null;

  return (
    <Alert tone="warning">
      Weather advisory: {advisory.reasons.join(" ")} This is not a class-suspension decision -- only
      your school head or local government can suspend classes.
    </Alert>
  );
}
