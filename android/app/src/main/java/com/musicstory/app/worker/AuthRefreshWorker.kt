package com.musicstory.app.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.musicstory.app.MusicStoryApp
import kotlinx.coroutines.flow.first

class AuthRefreshWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as? MusicStoryApp ?: return Result.failure()
        return try {
            val backendUrl = app.settingsDataStore.backendUrl.first()
            app.backendAuthManager.warmUp(backendUrl)
            Result.success()
        } catch (_: Exception) {
            if (runAttemptCount >= 3) Result.failure() else Result.retry()
        }
    }
}
