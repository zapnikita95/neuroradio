package com.musicstory.app.ui.screens

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.musicstory.app.R
import com.musicstory.app.service.MediaNotificationListener
import com.musicstory.app.ui.components.GlassCard
import com.musicstory.app.ui.components.MusicStoryBackground
import com.musicstory.app.ui.components.PrimaryStoryButton
import com.musicstory.app.ui.components.SecondaryStoryButton
import com.musicstory.app.ui.components.VinylDisc
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.MutedLavender
import androidx.compose.ui.platform.LocalContext

@Composable
fun OnboardingScreen(
    onAccessGranted: () -> Unit,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current

    MusicStoryBackground(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                painter = painterResource(R.mipmap.ic_launcher_foreground),
                contentDescription = null,
                modifier = Modifier.size(96.dp),
                contentScale = ContentScale.Fit,
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "Music Story",
                style = MaterialTheme.typography.labelLarge,
                color = GoldBright,
            )
            Text(
                text = context.getString(R.string.onboarding_title),
                style = MaterialTheme.typography.displaySmall,
                textAlign = TextAlign.Center,
                color = CreamText,
            )

            Spacer(modifier = Modifier.height(12.dp))

            VinylDisc(size = 120.dp, isSpinning = true)

            Spacer(modifier = Modifier.height(20.dp))

            GlassCard(accentBorder = true) {
                Text(
                    text = context.getString(R.string.onboarding_description),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MutedLavender,
                    textAlign = TextAlign.Start,
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Spotify · Яндекс Музыка · нейрорадио о каждом треке",
                    style = MaterialTheme.typography.labelMedium,
                    color = GoldBright,
                )
            }

            Spacer(modifier = Modifier.height(28.dp))

            PrimaryStoryButton(
                text = context.getString(R.string.onboarding_open_settings),
                onClick = {
                    context.startActivity(
                        Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        },
                    )
                    MediaNotificationListener.requestRebind(context)
                },
            )

            Spacer(modifier = Modifier.height(12.dp))

            SecondaryStoryButton(
                text = context.getString(R.string.onboarding_continue),
                onClick = {
                    if (Settings.Secure.getString(
                            context.contentResolver,
                            "enabled_notification_listeners",
                        )?.contains(context.packageName) == true
                    ) {
                        onAccessGranted()
                    } else {
                        onSkip()
                    }
                },
            )
        }
    }
}
