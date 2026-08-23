import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SetupApplicationService } from "../application/setup-service";
import { ValidationError } from "../domain/errors";
import type { CurrentSession } from "../domain/session";
import { useTeacherMode } from "./theme/useTeacherMode";

interface FirstRunSetupScreenProps {
  setupService: SetupApplicationService;
  onSetupComplete: (session: CurrentSession) => void;
}

export function FirstRunSetupScreen({ setupService, onSetupComplete }: FirstRunSetupScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [schoolName, setSchoolName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // See LoginScreen/LearnerListScreen's equivalent effect.
    headingRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await setupService.completeSetup({
        schoolName,
        username,
        displayName,
        password,
        confirmPassword,
      });
      onSetupComplete(session);
    } catch (err) {
      setError(
        err instanceof ValidationError
          ? err.message
          : "We couldn't finish setting up LIKHA-SIS. Please check your details and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const passwordFieldType = showPasswords ? "text" : "password";

  return (
    <div>
      <h2 ref={headingRef} tabIndex={-1}>
        Welcome to LIKHA-SIS
      </h2>
      <p>
        Let's get your school set up. LIKHA-SIS works right on this computer — you don't need an
        internet connection to use it. This only takes a minute, and you'll be ready to start adding
        learners right after.
      </p>

      <form onSubmit={handleSubmit} aria-label="Set up your school">
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        <h3>Your school</h3>
        <div className="field">
          <label htmlFor="setup-school-name">School name</label>
          <input
            id="setup-school-name"
            type="text"
            value={schoolName}
            onChange={(event) => setSchoolName(event.target.value)}
            aria-describedby={mode === "guided" ? "setup-school-name-hint" : undefined}
            required
          />
          {mode === "guided" && (
            <p id="setup-school-name-hint" className="field-hint">
              You can change this later. Enter the name your school is commonly known by.
            </p>
          )}
        </div>

        <h3>Your account</h3>
        {mode === "guided" && (
          <p className="field-hint">
            This is the first account for your school, so it's set up as your school's main account.
            You'll use this to sign in every time you open LIKHA-SIS.
          </p>
        )}
        <div className="field">
          <label htmlFor="setup-display-name">Your name</label>
          <input
            id="setup-display-name"
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="setup-username">Choose a username</label>
          <input
            id="setup-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            aria-describedby={mode === "guided" ? "setup-username-hint" : undefined}
            required
          />
          {mode === "guided" && (
            <p id="setup-username-hint" className="field-hint">
              You'll use this every time you sign in. Other teachers you add later will each choose
              their own username.
            </p>
          )}
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="setup-password">Choose a password</label>
            <input
              id="setup-password"
              type={passwordFieldType}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby="setup-password-hint"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="setup-confirm-password">Confirm password</label>
            <input
              id="setup-confirm-password"
              type={passwordFieldType}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              aria-describedby="setup-password-hint"
              required
            />
          </div>
        </div>
        <p id="setup-password-hint" className="field-hint">
          At least 8 characters. Choose something you'll remember — you'll need it every time you
          sign in.
        </p>
        <div className="field">
          <label htmlFor="setup-show-passwords">
            <input
              id="setup-show-passwords"
              type="checkbox"
              checked={showPasswords}
              onChange={(event) => setShowPasswords(event.target.checked)}
            />{" "}
            Show passwords
          </label>
        </div>

        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Setting up…" : "Finish setup"}
        </button>
      </form>
    </div>
  );
}
