//! Platform key protection. Android requires a real native Keystore adapter.
use super::KeyStore;
use crate::error::{AppError, AppResult};

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
