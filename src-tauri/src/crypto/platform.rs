//! Platform key protection. Android requires a real native Keystore adapter.
use super::KeyStore;
#[cfg(not(any(windows, target_os = "android")))]
use crate::error::AppError;
use crate::error::AppResult;

pub(crate) fn key_store() -> AppResult<Box<dyn KeyStore>> {
    #[cfg(windows)]
    {
        Ok(Box::new(super::DpapiKeyStore))
    }
    #[cfg(target_os = "android")]
    {
        Ok(Box::new(super::android::AndroidKeyStore))
    }
    #[cfg(not(any(windows, target_os = "android")))]
    {
        Err(AppError::key_store(
            "no encryption key store is implemented for this platform",
        ))
    }
}
