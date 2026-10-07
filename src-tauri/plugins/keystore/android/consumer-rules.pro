# NativeBridge is reached through direct JNI and Android's Activity class loader.
# Preserve its JVM class/method names for release builds with R8 enabled.
-keep class org.likhasis.keystore.NativeBridge { *; }
