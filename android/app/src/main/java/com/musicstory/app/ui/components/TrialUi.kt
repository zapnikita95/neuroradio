package com.musicstory.app.ui.components

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.musicstory.app.R
import com.musicstory.app.domain.TierAccess
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.GoldWarm
import com.musicstory.app.ui.theme.MutedLavender

object TrialUi {
    private const val MS_PER_DAY = 86_400_000L

    fun remainingMs(trialUntil: Long?): Long? {
        if (trialUntil == null || trialUntil <= 0L) return null
        val rem = trialUntil - System.currentTimeMillis()
        return rem.takeIf { it > 0L }
    }

    fun isTrialExpired(trialUntil: Long?, tier: String?): Boolean {
        if (trialUntil == null || trialUntil <= 0L) return false
        if (TierAccess.isPremiumLike(tier)) return false
        return trialUntil <= System.currentTimeMillis()
    }

    fun formatRemaining(context: Context, ms: Long): String {
        val totalSec = (ms / 1000).coerceAtLeast(0)
        val days = totalSec / 86_400
        val hours = (totalSec % 86_400) / 3600
        val mins = (totalSec % 3600) / 60
        return when {
            days > 0 -> context.getString(R.string.trial_countdown_days_hours, days.toInt(), hours.toInt())
            hours > 0 -> context.getString(R.string.trial_countdown_hours_mins, hours.toInt(), mins.toInt())
            else -> context.getString(R.string.trial_countdown_mins, mins.coerceAtLeast(1).toInt())
        }
    }

    /** Milestone banner: 3 days left and 1 day left before trial ends. */
    fun bannerMilestoneDays(remainingMs: Long): Int? = when {
        remainingMs <= MS_PER_DAY -> 1
        remainingMs <= 3 * MS_PER_DAY -> 3
        else -> null
    }

    fun shouldShowTrialBanner(remainingMs: Long?, dismissedMilestones: Set<Int>): Boolean {
        if (remainingMs == null || remainingMs <= 0L) return false
        val milestone = bannerMilestoneDays(remainingMs) ?: return false
        return milestone !in dismissedMilestones
    }
}

@Composable
fun TrialCountdownBanner(
    remainingMs: Long,
    onDismiss: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(GoldWarm.copy(alpha = 0.12f))
            .padding(start = 14.dp, end = 6.dp, top = 10.dp, bottom = 10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = context.getString(R.string.trial_countdown_title),
                    style = MaterialTheme.typography.labelMedium,
                    color = GoldWarm,
                )
                Text(
                    text = context.getString(
                        R.string.trial_countdown_body,
                        TrialUi.formatRemaining(context, remainingMs),
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = CreamText,
                    modifier = Modifier.padding(top = 4.dp),
                )
                Text(
                    text = context.getString(R.string.trial_countdown_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MutedLavender,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            if (onDismiss != null) {
                IconButton(onClick = onDismiss) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = context.getString(R.string.trial_countdown_dismiss),
                        tint = MutedLavender,
                    )
                }
            }
        }
    }
}
