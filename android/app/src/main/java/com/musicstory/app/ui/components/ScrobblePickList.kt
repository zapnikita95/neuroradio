package com.musicstory.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.MutedLavender

@Composable
fun ScrobblePickList(
    items: List<String>,
    selected: Set<String>,
    emptyHint: String,
    onToggle: (String) -> Unit,
    modifier: Modifier = Modifier,
    subtitleFor: (String) -> String? = { null },
) {
    Column(modifier = modifier.fillMaxWidth()) {
        if (selected.isNotEmpty()) {
            Text(
                text = LocalizedSelectedCount(selected.size),
                style = MaterialTheme.typography.labelMedium,
                color = GoldBright,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }
        if (items.isEmpty()) {
            Text(
                text = emptyHint,
                style = MaterialTheme.typography.bodySmall,
                color = MutedLavender,
            )
            return
        }
        items.forEach { item ->
            val isSelected = selected.any { it.equals(item, ignoreCase = true) }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .clickable { onToggle(item) }
                    .padding(vertical = 8.dp, horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = if (isSelected) "✓" else "○",
                    style = MaterialTheme.typography.titleMedium,
                    color = if (isSelected) GoldBright else MutedLavender,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = item,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (isSelected) CreamText else CreamText.copy(alpha = 0.88f),
                    )
                    subtitleFor(item)?.let { subtitle ->
                        Text(
                            text = subtitle,
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedLavender,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LocalizedSelectedCount(count: Int): String {
    val context = androidx.compose.ui.platform.LocalContext.current
    return context.getString(com.musicstory.app.R.string.settings_pick_selected_count, count)
}
