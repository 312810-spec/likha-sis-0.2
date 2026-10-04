//! Android device key wrapping uses native Keystore; files contain only AES-GCM envelopes.
use std::path::Path;
use jni::{jni_sig, jni_str, objects::{JByteArray, JClass, JObject, JValue}, JavaVM};
use zeroize::Zeroizing;
use crate::error::{AppError, AppResult};
use super::{KeyStore, KEY_LEN};

pub(crate) struct AndroidKeyStore;

/// Direct JNI is intentional: database initialization runs during Tauri setup,
/// where waiting for main-thread plugin IPC can deadlock. JVM exceptions are
/// cleared by attach_current_thread and exposed only as a generic category.
pub(crate) fn execute(operation: i32, path: &str, payload: &[u8], extra: &str) -> AppResult<Vec<u8>> {
    let context = ndk_context::android_context();
    // ndk-context supplies the process JVM and global Android Activity reference.
    let vm = unsafe { JavaVM::from_raw(context.vm().cast()) };
    let result = vm.attach_current_thread(|env| -> jni::errors::Result<Vec<u8>> {
        let activity = unsafe { JObject::from_raw(env, context.context().cast()) };
        let loader = env.call_method(&activity, jni_str!("getClassLoader"), jni_sig!("()Ljava/lang/ClassLoader;"), &[])?.l()?;
        let class_name = env.new_string("org.likhasis.keystore.NativeBridge")?;
        let class = env.call_method(&loader, jni_str!("loadClass"), jni_sig!("(Ljava/lang/String;)Ljava/lang/Class;"), &[JValue::Object(class_name.as_ref())])?.l()?;
        let class = env.cast_local::<JClass>(class)?;
        let path = env.new_string(path)?;
        let extra = env.new_string(extra)?;
        let payload = env.byte_array_from_slice(payload)?;
        let output = env.call_static_method(&class, jni_str!("execute"), jni_sig!("(Landroid/content/Context;ILjava/lang/String;[BLjava/lang/String;)[B"), &[
            JValue::Object(&activity), JValue::Int(operation), JValue::Object(path.as_ref()), JValue::Object(payload.as_ref()), JValue::Object(extra.as_ref())
        ])?.l()?;
        let output = env.cast_local::<JByteArray>(output)?;
        env.convert_byte_array(&output)
    });
    result.map_err(|_| AppError::key_store("Android native protected storage failed"))
}

fn key(operation: i32, path: &Path, payload: &[u8]) -> AppResult<[u8; KEY_LEN]> {
    let path = path.to_str().ok_or_else(|| AppError::key_store("invalid key path"))?;
    let bytes = Zeroizing::new(execute(operation, path, payload, "")?);
    bytes.as_slice().try_into().map_err(|_| AppError::key_store("invalid protected key length"))
}
impl KeyStore for AndroidKeyStore {
    fn load_or_create_key(&self, path: &Path) -> AppResult<[u8; KEY_LEN]> { key(0, path, &[]) }
    fn rotate_key(&self, path: &Path) -> AppResult<[u8; KEY_LEN]> { key(1, path, &[]) }
    fn store_recovery_key(&self, path: &Path, value: &[u8; KEY_LEN]) -> AppResult<()> { key(2, path, value).map(|_| ()) }
}
