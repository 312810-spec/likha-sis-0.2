import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AuthApplicationService } from "../application/auth-service";
import type { SchoolApplicationService } from "../application/school-service";
import { ValidationError } from "../domain/errors";
import type { School } from "../domain/school";
import type { CurrentSession } from "../domain/session";
import { useTeacherMode } from "./theme/useTeacherMode";

interface LoginScreenProps {
  authService: AuthApplicationService;
  schoolService: SchoolApplicationService;
  onLoggedIn: (session: CurrentSession) => void;
}

export function LoginScreen({ authService, schoolService, onLoggedIn }: LoginScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [schoolId, setSchoolId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Moves focus to this screen whenever it mounts (e.g. after logging
    // out returns here) so keyboard/screen-reader users get a clear
    // signal the screen changed, instead of focus silently landing
    // nowhere. See the M5 accessibility review.
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    schoolService
      .listAll()
      .then((result) => {
        if (cancelled) return;
        setSchools(result);
        setSchoolId((current) => current || (result[0]?.id ?? ""));
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the list of schools.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSchools(false);
      });
    return () => {
      cancelled = true;
    };
  }, [schoolService]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await authService.login(username, password, schoolId);
      onLoggedIn(session);
    } catch (err) {
      setError(
        err instanceof ValidationError
          ? err.message
          : "We couldn't sign you in. Check your username, password, and school, then try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Sign in">
      <h2 ref={headingRef} tabIndex={-1}>
        Sign in
      </h2>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <div className="field">
        <label htmlFor="login-school">School</label>
        <select
          id="login-school"
          value={schoolId}
          onChange={(event) => setSchoolId(event.target.value)}
          aria-describedby={mode === "guided" ? "login-school-hint" : undefined}
          required
        >
          {loadingSchools && (
            <option value="" disabled>
              Loading schools…
            </option>
          )}
          {!loadingSchools && schools.length === 0 && (
            <option value="" disabled>
              No schools available
            </option>
          )}
          {schools.map((school) => (
            <option key={school.id} value={school.id}>
              {school.name}
            </option>
          ))}
        </select>
        {mode === "guided" && (
          <p id="login-school-hint" className="field-hint">
            Choose the school you want to sign in for. If you teach at more than one school, make
            sure you pick the right one.
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="login-username">Username</label>
        <input
          id="login-username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          aria-describedby={mode === "guided" ? "login-username-hint" : undefined}
          required
        />
        {mode === "guided" && (
          <p id="login-username-hint" className="field-hint">
            This is the LIKHA-SIS username your school gave you — not your email address.
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby={mode === "guided" ? "login-password-hint" : undefined}
          required
        />
        {mode === "guided" && (
          <p id="login-password-hint" className="field-hint">
            Passwords are case-sensitive. Ask a colleague or your school administrator if you've
            forgotten yours.
          </p>
        )}
      </div>

      <button type="submit" className="button-primary" disabled={submitting}>
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
