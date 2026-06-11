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
        return file.isFile && file.length() > 512L
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
                    if (temp.length() < 512L) {
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
