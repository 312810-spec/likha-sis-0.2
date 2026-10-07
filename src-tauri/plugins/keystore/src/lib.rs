pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("likha-keystore")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _api.register_android_plugin("org.likhasis.keystore", "KeystorePlugin")?;
            Ok(())
        })
        .build()
}
