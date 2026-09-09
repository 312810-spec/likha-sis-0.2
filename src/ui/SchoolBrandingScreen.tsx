import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SchoolCoordinatesApplicationService } from "../application/school-coordinates-service";
import type { SchoolLogoApplicationService } from "../application/school-logo-service";
import { ValidationError } from "../domain/errors";
import { ALLOWED_LOGO_MIME_TYPES, type SchoolLogo } from "../domain/school-logo";
import type { SchoolCoordinates } from "../domain/school-coordinates";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";

interface SchoolBrandingScreenProps {
  schoolLogoService: SchoolLogoApplicationService;
  /** Optional for backwards compatibility with any existing caller/test
   * that only exercises the logo half of this screen -- when omitted,
   * the "School location" section below simply doesn't render (same
   * "absent, not broken" convention `WeatherAdvisoryBanner` follows). */
  schoolCoordinatesService?: SchoolCoordinatesApplicationService;
}

function logoObjectUrl(logo: SchoolLogo): string {
  // `Uint8Array<ArrayBufferLike>` (what crosses the IPC boundary) isn't
  // directly assignable to `BlobPart` under TS's stricter typed-array
  // generics -- a plain copy into a fresh `Uint8Array<ArrayBuffer>`
  // sidesteps that without any behavioral change.
  const bytes = Uint8Array.from(logo.bytes);
  return URL.createObjectURL(new Blob([bytes], { type: logo.mime }));
}

/**
 * In-app school branding (2026-09-06): lets a School Head upload, replace,
 * or remove the logo shown in the app shell (`Sidebar`/`TopBar`). In-app
 * display only -- the product owner confirmed "school branding" also
 * covers official-form export, but this session's DepEd research found
 * SF10's official-form rule restricts official forms to DepEd's own
 * seal/logo, and DepEd's visual identity manual prohibits combining it
 * with other lockups, so that half stays out of scope pending further
 * DepEd clarification (see `docs/CURRENT-HANDOFF.md`).
 *
 * Any authenticated school member sees this screen (matching
 * `DeviceManagementScreen`/`AdminPasswordResetScreen`'s established
 * convention of not hiding a screen behind client-side role checks);
 * the backend alone enforces that only a School Head
 * (`ManageSchoolBranding`) may actually change the logo -- security must
 * not rely on UI hiding.
 */
export function SchoolBrandingScreen({
  schoolLogoService,
  schoolCoordinatesService,
}: SchoolBrandingScreenProps) {
  const [logo, setLogo] = useState<SchoolLogo | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [coordinates, setCoordinates] = useState<SchoolCoordinates | null>(null);
  const [coordinatesLoading, setCoordinatesLoading] = useState(true);
  const [coordinatesError, setCoordinatesError] = useState<string | null>(null);
  const [coordinatesConfirmation, setCoordinatesConfirmation] = useState<string | null>(null);
  const [coordinatesSaving, setCoordinatesSaving] = useState(false);
  const [latitudeDraft, setLatitudeDraft] = useState("");
  const [longitudeDraft, setLongitudeDraft] = useState("");

  const requestRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    schoolLogoService
      .getLogo()
      .then((result) => {
        if (requestRef.current !== requestId) return;
        setLogo(result);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setLoadError("Could not load the current school logo. Try again.");
      })
      .finally(() => {
        if (requestRef.current !== requestId) return;
        setLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!logo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewUrl(null);
      return;
    }
    const url = logoObjectUrl(logo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  async function handleFileChosen(file: File) {
    setError(null);
    setConfirmation(null);
    setSaving(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await schoolLogoService.setLogo(file.type, bytes);
      setConfirmation("School logo updated.");
      load();
    } catch (e) {
      setError(
        e instanceof ValidationError
          ? e.message
          : "Could not upload this logo. You may not have permission to change it, or the file could not be read.",
      );
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setError(null);
    setConfirmation(null);
    setSaving(true);
    try {
      await schoolLogoService.clearLogo();
      setConfirmation("School logo removed.");
      load();
    } catch {
      setError("Could not remove the school logo. You may not have permission to change it.");
    } finally {
      setSaving(false);
    }
  }

  function loadCoordinates() {
    if (!schoolCoordinatesService) return;
    setCoordinatesLoading(true);
    setCoordinatesError(null);
    schoolCoordinatesService
      .getCoordinates()
      .then((result) => {
        setCoordinates(result);
        setLatitudeDraft(result ? String(result.latitude) : "");
        setLongitudeDraft(result ? String(result.longitude) : "");
      })
      .catch(() => {
        setCoordinatesError("Could not load the school's coordinates. Try again.");
      })
      .finally(() => {
        setCoordinatesLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCoordinates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolCoordinatesService]);

  async function handleSaveCoordinates(event: FormEvent) {
    event.preventDefault();
    if (!schoolCoordinatesService) return;
    setCoordinatesError(null);
    setCoordinatesConfirmation(null);
    setCoordinatesSaving(true);
    try {
      await schoolCoordinatesService.setCoordinates(Number(latitudeDraft), Number(longitudeDraft));
      setCoordinatesConfirmation("School coordinates updated.");
      loadCoordinates();
    } catch (e) {
      setCoordinatesError(
        e instanceof ValidationError
          ? e.message
          : "Could not save these coordinates. You may not have permission to change them.",
      );
    } finally {
      setCoordinatesSaving(false);
    }
  }

  async function handleClearCoordinates() {
    if (!schoolCoordinatesService) return;
    setCoordinatesError(null);
    setCoordinatesConfirmation(null);
    setCoordinatesSaving(true);
    try {
      await schoolCoordinatesService.clearCoordinates();
      setCoordinatesConfirmation("School coordinates removed.");
      loadCoordinates();
    } catch {
      setCoordinatesError(
        "Could not remove the school's coordinates. You may not have permission to change them.",
      );
    } finally {
      setCoordinatesSaving(false);
    }
  }

  return (
    <Page
      title="School Logo"
      hint={
        <p className="field-hint">
          Shown in the sidebar and header for everyone at this school. Only a School Head can change
          it.
        </p>
      }
    >
      {loading ? (
        <Loading label="Loading school logo…" />
      ) : (
        <>
          {loadError && <Alert tone="error">{loadError}</Alert>}
          {error && <Alert tone="error">{error}</Alert>}
          {confirmation && <Alert tone="success">{confirmation}</Alert>}

          <div className="school-branding-preview">
            {previewUrl ? (
              <img src={previewUrl} alt="Current school logo" width={96} height={96} />
            ) : (
              <div className="school-branding-placeholder" aria-hidden="true">
                No logo
              </div>
            )}
          </div>

          <div className="school-branding-actions">
            <label htmlFor="school-logo-file">Upload a new logo (PNG, JPEG, or WebP)</label>
            <input
              id="school-logo-file"
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_LOGO_MIME_TYPES.join(",")}
              disabled={saving}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFileChosen(file);
              }}
            />
            {logo && (
              <button type="button" onClick={handleRemove} disabled={saving}>
                Remove logo
              </button>
            )}
          </div>
        </>
      )}

      {schoolCoordinatesService && (
        <section aria-label="School location" className="school-coordinates-section">
          <h3>School location</h3>
          <p className="field-hint">
            Used only for the optional weather/hazard advisory shown to teachers -- never for
            anything else. Only a School Head can change it. Leaving this unset simply means no
            advisory is shown; it is never an error.
          </p>

          {coordinatesLoading ? (
            <Loading label="Loading school location…" />
          ) : (
            <>
              {coordinatesError && <Alert tone="error">{coordinatesError}</Alert>}
              {coordinatesConfirmation && <Alert tone="success">{coordinatesConfirmation}</Alert>}

              <form className="form-row" onSubmit={handleSaveCoordinates}>
                <div className="field">
                  <label htmlFor="school-latitude">Latitude</label>
                  <input
                    id="school-latitude"
                    type="number"
                    step="any"
                    min={-90}
                    max={90}
                    value={latitudeDraft}
                    onChange={(event) => setLatitudeDraft(event.target.value)}
                    disabled={coordinatesSaving}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="school-longitude">Longitude</label>
                  <input
                    id="school-longitude"
                    type="number"
                    step="any"
                    min={-180}
                    max={180}
                    value={longitudeDraft}
                    onChange={(event) => setLongitudeDraft(event.target.value)}
                    disabled={coordinatesSaving}
                    required
                  />
                </div>
                <button type="submit" aria-disabled={coordinatesSaving}>
                  {coordinatesSaving ? "Saving…" : "Save location"}
                </button>
                {coordinates && (
                  <button
                    type="button"
                    onClick={handleClearCoordinates}
                    disabled={coordinatesSaving}
                  >
                    Remove location
                  </button>
                )}
              </form>
            </>
          )}
        </section>
      )}
    </Page>
  );
}
