# Android implementation checkpoint

Android device keys are wrapped with AES-256-GCM by a non-exportable Android
Keystore key. The envelope carries a format marker, 12-byte IV and authenticated
ciphertext. AtomicFile preserves the old envelope on interrupted writes and
recovers its `.bak` file. Missing wrapping keys, invalid envelopes and a database
without a protected key fail closed. Neither SQLCipher keys nor plaintext
backups are written to shared storage.

A local Tauri mobile plugin packages the Kotlin implementation. Register
`.plugin(tauri_plugin_likha_keystore::init())` before database setup. Direct JNI
calls use the Activity's class loader, including calls from background threads;
startup does not wait for WebView IPC or a main-thread plugin dispatch.

Android backup/recovery accepts document-provider `content://` selections.
Only encrypted archives pass through a bounded private staging file, removed
when the operation returns. Provider access remains the system picker's grant.
Recovery never overwrites an initialized installation. An export failure can
leave a partial selected document; the app reports failure, and the source
installation is unchanged.

Minimum Android SDK is 24. Keep Android application ID and signing certificate
stable across upgrades. OS application backup is disabled for the key plugin;
portable password-encrypted backups provide replacement-device recovery.
The Windows offline installer configuration is
`tauri.windows.offline.conf.json`; build with that additional config on Windows
to include the WebView2 installer for schools with limited connectivity.

Implementation is not Android release evidence. Still run an actual APK build,
SQLCipher native-library/16-KiB page compatibility checks, fresh install,
process-death and forced-write interruption, key invalidation, signed upgrade,
SAF export/import with real document providers and replacement-device recovery.
No physical-device or APK result is asserted by this checkpoint.
