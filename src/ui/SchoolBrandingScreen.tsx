import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { SchoolBrandingApplicationService } from "../application/school-branding-service";
import { ValidationError } from "../domain/errors";
import type { SchoolBranding } from "../domain/school-branding";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { applyBranding } from "./theme/applyBranding";
import { useTeacherMode } from "./theme/useTeacherMode";

interface SchoolBrandingScreenProps {
  schoolBrandingService: SchoolBrandingApplicationService;
}

async function fileToBytes(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

const SWATCHES: { key: keyof SchoolBranding; label: string }[] = [
  { key: "primaryColor", label: "Primary" },
  { key: "secondaryColor", label: "Secondary" },
  { key: "accentColor", label: "Accent" },
];

export function SchoolBrandingScreen({ schoolBrandingService }: SchoolBrandingScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [branding, setBranding] = useState<SchoolBranding | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([schoolBrandingService.getCurrent(), schoolBrandingService.getLogo()])
      .then(([currentBranding, logo]) => {
        if (cancelled) return;
        setBranding(currentBranding);
        if (logo) {
          const blob = new Blob([logo.bytes.slice()], { type: logo.mimeType });
          setLogoPreviewUrl(URL.createObjectURL(blob));
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load school branding.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [schoolBrandingService]);

  // Applies whatever branding is currently loaded to the whole document
  // as soon as it changes -- the app shell doesn't need its own separate
  // copy of this logic; this screen owns applying it live for immediate
  // feedback after an upload/reset, and App.tsx applies it once at
  // sign-in for every other screen. See src/ui/theme/applyBranding.ts.
  useEffect(() => {
    applyBranding(branding, document.documentElement);
  }, [branding]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setConfirmation(null);
    setUploading(true);
    try {
      const bytes = await fileToBytes(file);
      const updated = await schoolBrandingService.uploadLogo(bytes, file.type);
      setBranding(updated);
      setLogoPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(file);
      });
      setConfirmation("Logo uploaded — your school's theme has been updated.");
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not upload this logo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleReset() {
    setError(null);
    setConfirmation(null);
    setResetting(true);
    try {
      await schoolBrandingService.resetToDefault();
      setBranding(null);
      setLogoPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
      setConfirmation("Branding reset to the default LIKHA-SIS theme.");
    } catch {
      setError("Could not reset branding.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <section aria-label="School branding">
      <h2 ref={headingRef} tabIndex={-1}>
        School Branding
      </h2>
      {mode === "guided" && (
        <p className="field-hint">
          Upload your school's logo (PNG or JPEG, up to 2 MB). LIKHA-SIS derives a theme from it
          automatically — the color choices always keep enough contrast to stay readable. Status
          colors (success, warning, error) never change, so they stay recognizable everywhere.
        </p>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      {loading ? (
        <Loading label="Loading school branding…" />
      ) : (
        <>
          {logoPreviewUrl && (
            <p>
              <img
                src={logoPreviewUrl}
                alt="Current school logo"
                style={{ maxWidth: "160px", maxHeight: "160px" }}
              />
            </p>
          )}

          {branding && (
            <ul
              aria-label="Derived theme colors"
              style={{ display: "flex", gap: "1rem", listStyle: "none", padding: 0 }}
            >
              {SWATCHES.map(({ key, label }) => (
                <li key={key} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-block",
                      width: "1.25rem",
                      height: "1.25rem",
                      borderRadius: "4px",
                      border: "1px solid var(--color-border)",
                      background: branding[key],
                    }}
                  />
                  {label}
                </li>
              ))}
            </ul>
          )}

          <div className="field">
            <label htmlFor="school-logo-upload">
              {branding ? "Replace logo" : "Upload a logo"}
            </label>
            <input
              id="school-logo-upload"
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </div>

          {branding && (
            <button type="button" onClick={handleReset} disabled={resetting}>
              {resetting ? "Resetting…" : "Reset to default theme"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
