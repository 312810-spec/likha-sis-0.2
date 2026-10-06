//! Platform key protection. Android requires a real native Keystore adapter.
use super::KeyStore;
use crate::error::AppResult;
// Only referenced by the `#[cfg(not(windows))]` branch below, so a plain
// import is dead code (and a clippy error) when building for Windows.
#[cfg(not(windows))]
use crate::error::AppError;

pub(crate) fn key_store() -> AppResult<Box<dyn KeyStore>> {
    #[cfg(windows)]
    {
        Ok(Box::new(super::DpapiKeyStore))
    }
    #[cfg(not(windows))]
    {
        Err(AppError::key_store(
            "no encryption key store is implemented for this platform",
        ))
    }
}
