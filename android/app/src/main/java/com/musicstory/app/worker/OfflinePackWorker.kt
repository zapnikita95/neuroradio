package com.musicstory.app.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.util.NetworkUtils
import com.musicstory.app.util.StoryLog

class OfflinePackWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        if (!NetworkUtils.isConnected(applicationContext)) {
            StoryLog.w("OfflinePackWorker: no network, retry later")
            return Result.retry()
        }
        val sessionId = inputData.getLong(KEY_SESSION_ID, 0L)
        if (sessionId <= 0L) return Result.failure()

        val app = applicationContext as MusicStoryApp
        return try {
            val ok = app.offlinePackRepository.generatePack(sessionId)
            if (ok) Result.success() else Result.failure()
        } catch (e: Exception) {
            StoryLog.e("OfflinePackWorker failed", e)
            Result.retry()
        }
    }

    companion object {
        private const val WORK_NAME = "offline_pack_generate"
        private const val KEY_SESSION_ID = "session_id"

        fun enqueue(context: Context, sessionId: Long) {
            val request = OneTimeWorkRequestBuilder<OfflinePackWorker>()
                .setInputData(workDataOf(KEY_SESSION_ID to sessionId))
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                WORK_NAME,
                androidx.work.ExistingWorkPolicy.REPLACE,
                request,
            )
        }
    }
}
