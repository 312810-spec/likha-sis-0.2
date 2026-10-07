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

## Recovery and packaging refinements (4 October 2026)

The backup command recognizes both the protected SSPK envelope and its
`AtomicFile` `.bak` companion. A pending atomic write must not omit the school's
existing payload key from a portable backup. Recovery selection also rejects
folders that redirect outside the installation through symbolic links.
Native regression tests cover these cases; run the full native suite before
accepting this checkpoint.

The plugin ships consumer ProGuard rules that preserve `NativeBridge` and its
method names. Release shrinking cannot discover the Rust JNI string references
on its own. Do not remove those rules when enabling R8.

The current generated Tauri Android project uses Gradle 9.6.1, Android Gradle
Plugin 9.3.1 and API 37. The restored build environment uses official SDK
platform 37.0, build tools 37.0.0, NDK 30.0.16248370 and Rust's
`aarch64-linux-android` target. Archive checksums were checked against Google's
SDK repository metadata. Generated Android files and the plugin’s `.tauri` API copy remain reproducible build
output; the Kotlin plugin, configuration and consumer rules are committed.

To rebuild after restoring the toolchains:

```sh
export ANDROID_HOME=/path/to/android-sdk
export NDK_HOME="$ANDROID_HOME/ndk/30.0.16248370"
npm ci
rustup target add aarch64-linux-android
npm run tauri -- android init --ci --skip-targets-install
# Linux cross builds of vendored OpenSSL use NDK LLVM archive tools.
export AR_aarch64_linux_android="$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-ar"
export RANLIB_aarch64_linux_android="$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-ranlib"
npm run tauri -- android build --debug --target aarch64 --apk --ci
```

These commands generate a debug build for testing. Production release requires
the school's retained signing key and a tested upgrade path. Never substitute a
new signing key for an existing installed school's release certificate.

### Checks actually run on the restored source

The ARM64 native library crosscompiled with Rust 1.99 and NDK
30.0.16248370. `llvm-readelf -lW` reports `0x4000` alignment on every load
segment (16 KiB). This verifies the produced native library's segment alignment,
not installation, SQLCipher startup or packaged APK alignment on a device.
The build required `CARGO_INCREMENTAL=0` after a corrupted zero-byte incremental
object was found. Dependencies remained unchanged; the cache was rebuilt.

APK assembly reached Gradle. Its next observed blocker was a Java runtime that
lacked `javac`: `JAVA_COMPILER` was unavailable in the selected toolchain. A full JDK 17.0.20 was then restored in a temporary build prefix, and Gradle
progressed through buildSrc Kotlin compilation. Use a full compatible JDK at
`JAVA_HOME` when rerunning packaging. A successful native crosscompile
must not be reported as a successful APK build.
