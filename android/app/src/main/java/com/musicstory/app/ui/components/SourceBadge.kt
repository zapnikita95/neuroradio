package com.musicstory.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.musicstory.app.ui.theme.GoldBright

@Composable
fun SourceBadge(
    packageName: String,
    modifier: Modifier = Modifier,
) {
    val label = when {
        packageName.contains("spotify", ignoreCase = true) -> "Spotify"
        packageName.contains("yandex", ignoreCase = true) -> "Яндекс Музыка"
        else -> packageName.substringAfterLast('.')
    }
    Text(
        text = label,
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(GoldBright.copy(alpha = 0.14f))
            .padding(horizontal = 10.dp, vertical = 4.dp),
        style = MaterialTheme.typography.labelMedium,
        color = GoldBright,
    )
}
