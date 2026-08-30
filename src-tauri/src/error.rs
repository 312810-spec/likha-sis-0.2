use serde::Serialize;

/// Application-wide error type. Wraps lower-level errors so Tauri commands
/// can return a single serializable error shape to the frontend.
#[derive(Debug)]
pub enum AppError {
    Database(rusqlite::Error),
    Migration(rusqlite_migration::Error),
    Io(std::io::Error),
    /// The encryption key could not be created, read, or protected. Callers
    /// must treat this as fatal for the current operation and must never
    /// fall back to generating a fresh key when one was expected to already
    /// exist — see `crypto::KeyStore`.
    KeyStore(String),
    /// A login attempt failed (unknown username or wrong password). The two
    /// cases are intentionally indistinguishable here — see `auth::password`
    /// for why — never add a variant that lets a caller tell them apart.
    AuthenticationFailed,
    /// A login attempt was made against a known username currently within
    /// its lockout window (see `repository::user::verify_credentials` and
    /// `docs/adr/0019-account-lockout.md`). Deliberately distinct from
    /// `AuthenticationFailed` — a disclosed exception to the rule above,
    /// not a violation of it: this only ever fires for a username that
    /// already required `MAX_FAILED_LOGIN_ATTEMPTS` wrong guesses to
    /// reach, a real cost paid first, and it never reveals a correct vs.
    /// incorrect password for that attempt.
    AccountLocked,
    /// A protected operation was attempted with no session, an expired
    /// session, or a session scoped to a different school than the data
    /// being requested. Fail closed: this must never be bypassed by a
    /// caller-supplied parameter.
    Unauthorized,
    /// First-run bootstrap was attempted on an installation that already
    /// has at least one user. Distinct from `Unauthorized` — this isn't a
    /// permissions problem, the one-time setup capability is simply gone
    /// (see `auth::bootstrap_installation`).
    AlreadyInitialized,
    /// An uploaded school logo could not be decoded (unsupported/corrupt
    /// format) or exceeded the size limit — see `branding::logo`. The
    /// message is a fixed, generic category-safe string, never the
    /// underlying decoder's own error text.
    InvalidImage(String),
    /// A bulk-import request was structurally invalid (bad CSV header, or
    /// a commit decision referencing a row/learner that doesn't resolve)
    /// — see `import::learner`/`repository::learner_import`. Deliberately
    /// carries no message: every case here is a caller/programming error
    /// on an already-Rust-validated preview step, not something to
    /// explain to a teacher.
    InvalidImport,
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::Database(e) => write!(f, "database error: {e}"),
            AppError::Migration(e) => write!(f, "migration error: {e}"),
            AppError::Io(e) => write!(f, "io error: {e}"),
            AppError::KeyStore(msg) => write!(f, "key store error: {msg}"),
            AppError::AuthenticationFailed => write!(f, "authentication failed"),
            AppError::AccountLocked => write!(f, "account locked"),
            AppError::Unauthorized => write!(f, "unauthorized"),
            AppError::AlreadyInitialized => write!(f, "already initialized"),
            AppError::InvalidImage(msg) => write!(f, "invalid image: {msg}"),
            AppError::InvalidImport => write!(f, "invalid import request"),
        }
    }
}

impl std::error::Error for AppError {}

impl AppError {
    pub fn key_store(msg: impl Into<String>) -> Self {
        let msg = msg.into();
        log::error!("key store error: {msg}");
        AppError::KeyStore(msg)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        log::error!("database error: {e}");
        AppError::Database(e)
    }
}

impl From<rusqlite_migration::Error> for AppError {
    fn from(e: rusqlite_migration::Error) -> Self {
        log::error!("migration error: {e}");
        AppError::Migration(e)
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        log::error!("io error: {e}");
        AppError::Io(e)
    }
}

/// Serializes to a stable, generic category only — never the underlying
/// error text. `rusqlite`/IO errors can embed raw SQL, file paths, or other
/// internals; the full detail goes to the server-side log (see the `From`
/// impls above), not across the Tauri IPC boundary to the frontend.
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let category = match self {
            AppError::Database(_) => "database_error",
            AppError::Migration(_) => "migration_error",
            AppError::Io(_) => "io_error",
            AppError::KeyStore(_) => "key_store_error",
            AppError::AuthenticationFailed => "authentication_failed",
            AppError::AccountLocked => "account_locked",
            AppError::Unauthorized => "unauthorized",
            AppError::AlreadyInitialized => "already_initialized",
            AppError::InvalidImage(_) => "invalid_image",
            AppError::InvalidImport => "invalid_import",
        };
        serializer.serialize_str(category)
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialization_never_leaks_underlying_error_detail() {
        let sensitive_path = r"C:\Users\secret-teacher\AppData\likha-sis.db";
        let io_err = std::io::Error::other(format!("cannot open {sensitive_path}"));
        let app_err = AppError::from(io_err);

        let json = serde_json::to_string(&app_err).unwrap();

        assert_eq!(json, "\"io_error\"");
        assert!(!json.contains("secret-teacher"));
    }

    #[test]
    fn key_store_error_serializes_to_a_generic_category_only() {
        let app_err = AppError::key_store("CryptUnprotectData failed: some Windows detail");

        let json = serde_json::to_string(&app_err).unwrap();

        assert_eq!(json, "\"key_store_error\"");
    }
}
