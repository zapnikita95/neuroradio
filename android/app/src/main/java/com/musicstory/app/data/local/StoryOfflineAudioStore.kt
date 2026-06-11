package com.musicstory.app.data.local

import android.content.Context
import com.musicstory.app.util.NetworkUtils
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/** Saves story audio (OGG or WAV) on device for premium offline replay. */
class StoryOfflineAudioStore(context: Context) {

    private val appContext = context.applicationContext
    private val storiesDir = File(appContext.filesDir, "offline_stories").also { it.mkdirs() }

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    fun isNetworkAvailable(): Boolean = NetworkUtils.isConnected(appContext)

    fun isWifi(): Boolean = NetworkUtils.isWifi(appContext)

    fun extensionFromUrl(url: String): String =
        when {
            url.contains(".wav", ignoreCase = true) -> "wav"
            url.contains(".ogg", ignoreCase = true) -> "ogg"
            else -> "ogg"
        }

    fun localFileForTrack(trackKey: String, extension: String = "ogg"): File =
        File(storiesDir, "${hashTrackKey(trackKey)}.${extension.lowercase()}")

    fun hasLocalFile(path: String?): Boolean {
        if (path.isNullOrBlank()) return false
        val file = File(path)
        return file.isFile && file.length() > 512L && isLikelyValidAudio(file)
    }

    /** Reject stale cache (e.g. WAV bytes saved as .ogg after backend format change). */
    fun isLikelyValidAudio(file: File): Boolean {
        if (!file.isFile || file.length() < 512L) return false
        return try {
            file.inputStream().use { ins ->
                val header = ByteArray(4)
                if (ins.read(header) < 4) return false
                val isOgg = header[0] == 'O'.code.toByte() &&
                    header[1] == 'g'.code.toByte() &&
                    header[2] == 'g'.code.toByte() &&
                    header[3] == 'S'.code.toByte()
                val isWav = header[0] == 'R'.code.toByte() &&
                    header[1] == 'I'.code.toByte() &&
                    header[2] == 'F'.code.toByte() &&
                    header[3] == 'F'.code.toByte()
                isOgg || isWav
            }
        } catch (_: Exception) {
            false
        }
    }

    fun deleteFile(path: String?) {
        if (path.isNullOrBlank()) return
        val file = File(path)
        if (file.isFile) {
            file.delete()
            StoryLog.i("Offline cache deleted ${file.name}")
        }
    }

    fun evictAllForTrack(trackKey: String) {
        val hash = hashTrackKey(trackKey)
        storiesDir.listFiles()?.forEach { file ->
            if (file.isFile && file.name.startsWith(hash)) {
                file.delete()
                StoryLog.i("Offline cache evicted ${file.name}")
            }
        }
    }

    fun evictAll() {
        storiesDir.listFiles()?.forEach { file ->
            if (file.isFile) {
                file.delete()
            }
        }
        StoryLog.i("Offline cache wiped")
    }

    fun localFileUri(path: String): String = File(path).toURI().toString()

    /** Remove other extensions for the same track (e.g. stale .ogg when server now serves .wav). */
    fun evictOtherExtensions(trackKey: String, keepExtension: String) {
        val hash = hashTrackKey(trackKey)
        val keep = keepExtension.lowercase()
        storiesDir.listFiles()?.forEach { file ->
            if (!file.isFile) return@forEach
            val name = file.name
            if (name.startsWith(hash) && name.substringAfterLast('.', "") != keep) {
                file.delete()
                StoryLog.i("Offline cache evicted stale ${file.name}")
            }
        }
    }

    suspend fun downloadToTrack(url: String, trackKey: String): String? = withContext(Dispatchers.IO) {
        if (url.isBlank()) return@withContext null
        val ext = extensionFromUrl(url)
        evictOtherExtensions(trackKey, ext)
        val target = localFileForTrack(trackKey, ext)
        val temp = File(target.parentFile, "${target.name}.part")
        try {
            repeat(3) { attempt ->
                if (attempt > 0) Thread.sleep(400L * attempt)
                client.newCall(
                    Request.Builder()
                        .url(url)
                        .header("User-Agent", "MusicStory/OfflineCache (Android)")
                        .get()
                        .build(),
                ).execute().use { response ->
                    if (!response.isSuccessful) {
                        StoryLog.w("Offline audio download HTTP ${response.code} attempt=${attempt + 1}")
                        return@use
                    }
                    val body = response.body ?: return@use
                    temp.outputStream().use { out ->
                        body.byteStream().copyTo(out)
                    }
                    if (temp.length() < 512L || !isLikelyValidAudio(temp)) {
                        StoryLog.w("Offline audio download invalid format — discarding")
                        temp.delete()
                        return@use
                    }
                    if (target.exists()) target.delete()
                    if (!temp.renameTo(target)) {
                        temp.copyTo(target, overwrite = true)
                        temp.delete()
                    }
                    StoryLog.i("Offline audio saved: ${target.name} (${target.length()} bytes)")
                    return@withContext target.absolutePath
                }
            }
            null
        } catch (e: Exception) {
            StoryLog.w("Offline audio download failed: ${e.message}")
            temp.delete()
            null
        }
    }

    suspend fun enforceStorageLimit(maxBytes: Long = MAX_CACHE_BYTES) = withContext(Dispatchers.IO) {
        val files = storiesDir.listFiles()?.filter {
            it.isFile && it.extension.lowercase() in AUDIO_EXTENSIONS
        } ?: return@withContext
        var total = files.sumOf { it.length() }
        if (total <= maxBytes) return@withContext
        files.sortedBy { it.lastModified() }.forEach { file ->
            if (total <= maxBytes) return@forEach
            total -= file.length()
            file.delete()
            StoryLog.i("Offline cache LRU evicted ${file.name}")
        }
    }

    private fun hashTrackKey(trackKey: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val bytes = digest.digest(trackKey.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }.take(32)
    }

    companion object {
        const val MAX_CACHE_BYTES = 500L * 1024L * 1024L
        private val AUDIO_EXTENSIONS = setOf("ogg", "wav")
    }
}
