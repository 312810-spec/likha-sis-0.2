package org.likhasis.keystore

import android.app.Activity
import android.content.Context
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Plugin
import java.io.File
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@TauriPlugin
class KeystorePlugin(activity: Activity) : Plugin(activity)

/** Synchronous native bridge: no WebView, main-thread dispatch, or IPC wait. */
object NativeBridge {
    private const val ALIAS = "likha.sis.device-wrap.v1"
    private val MAGIC = byteArrayOf(76, 75, 65, 49)
    private const val MAX_ARCHIVE = 256L * 1024 * 1024 + 1024

    private fun privateFile(context: Context, path: String): File {
        val file = File(path).canonicalFile
        val root = context.filesDir.parentFile!!.canonicalFile
        require(file.path.startsWith(root.path + File.separator)) { "outside private storage" }
        return file
    }
    private fun wrappingKey(create: Boolean): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = store.getKey(ALIAS, null)
        if (existing != null) return existing as SecretKey
        check(create) { "device wrapping key missing" }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build())
        }.generateKey()
    }
    private fun writeKey(file: File, value: ByteArray) {
        require(value.size == 32)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, wrappingKey(true))
        cipher.updateAAD(MAGIC)
        val sealed = MAGIC + cipher.iv + cipher.doFinal(value)
        val atomic = AtomicFile(file)
        val output = atomic.startWrite()
        try { output.write(sealed); atomic.finishWrite(output) }
        catch (error: Throwable) { atomic.failWrite(output); throw error }
        finally { sealed.fill(0) }
    }
    private fun readKey(file: File): ByteArray {
        val atomic = AtomicFile(file)
        val bytes = atomic.openRead().use { input ->
            val data = ByteArray(65)
            var length = 0
            while (length < data.size) {
                val count = input.read(data, length, data.size - length)
                if (count < 0) break
                length += count
            }
            require(length == 64) { "invalid key envelope" }
            data.copyOf(64)
        }
        try {
            require(bytes.copyOfRange(0, 4).contentEquals(MAGIC))
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, wrappingKey(false), GCMParameterSpec(128, bytes.copyOfRange(4,16)))
            cipher.updateAAD(MAGIC)
            return cipher.doFinal(bytes.copyOfRange(16,64)).also { require(it.size == 32) }
        } finally { bytes.fill(0) }
    }
    @JvmStatic @Synchronized
    fun execute(context: Context, operation: Int, path: String, payload: ByteArray, extra: String): ByteArray {
        require(operation in 0..4) { "unknown native storage operation" }
        if (operation <= 2) {
            val file = privateFile(context, path)
            val exists = file.exists() || File(path + ".bak").exists()
            if (operation == 0 && exists) return readKey(file)
            if (operation == 2) check(!exists) { "recovery key already exists" }
            val key = if (operation == 2) payload.copyOf() else ByteArray(32).also { SecureRandom().nextBytes(it) }
            try { writeKey(file, key); return key.copyOf() }
            finally { key.fill(0); if (operation == 2) payload.fill(0) }
        }
        val uri = Uri.parse(path)
        require(uri.scheme == "content")
        val file = privateFile(context, extra)
        if (operation == 3) {
            context.contentResolver.openInputStream(uri)!!.use { input ->
                file.outputStream().use { output ->
                    val buffer = ByteArray(8192)
                    var total = 0L
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        require(total <= MAX_ARCHIVE) { "backup too large" }
                        output.write(buffer, 0, count)
                    }
                }
            }
        } else {
            require(operation == 4 && file.length() <= MAX_ARCHIVE)
            context.contentResolver.openOutputStream(uri, "wt")!!.use { output ->
                file.inputStream().use { it.copyTo(output) }
            }
        }
        return byteArrayOf()
    }
}
