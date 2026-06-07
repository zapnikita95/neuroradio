package com.musicstory.app.ui.screens

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.service.MediaNotificationListener
import com.musicstory.app.ui.components.BrandTitle
import com.musicstory.app.ui.components.GlassCard
import com.musicstory.app.ui.components.MusicStoryBackground
import com.musicstory.app.ui.components.PrimaryStoryButton
import com.musicstory.app.ui.components.SecondaryStoryButton
import com.musicstory.app.ui.components.VinylDisc
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.ErrorCoral
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.MutedLavender

@Composable
fun OnboardingScreen(
    onAccessGranted: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val app = context.applicationContext as MusicStoryApp
    var hintMessage by remember { mutableStateOf<String?>(null) }

    fun checkAccess(andEnter: Boolean) {
        val granted = app.mediaControllerManager.hasNotificationAccess()
        if (granted) {
            hintMessage = null
            MediaNotificationListener.requestRebind(context)
            onAccessGranted()
        } else if (andEnter) {
            hintMessage = context.getString(R.string.onboarding_not_granted_yet)
        }
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                // Автовход только если доступ уже выдан — без красной подсказки.
                checkAccess(andEnter = false)
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    MusicStoryBackground(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                painter = painterResource(R.drawable.logo_efir_ai),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxWidth(0.72f)
                    .heightIn(max = 120.dp),
                contentScale = ContentScale.Fit,
            )

            Spacer(modifier = Modifier.height(16.dp))

            BrandTitle()
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
                    text = context.getString(R.string.onboarding_steps),
                    style = MaterialTheme.typography.bodyMedium,
                    color = CreamText,
                    textAlign = TextAlign.Start,
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 52.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (!hintMessage.isNullOrBlank()) {
                    Text(
                        text = hintMessage!!,
                        style = MaterialTheme.typography.bodyMedium,
                        color = ErrorCoral,
                        textAlign = TextAlign.Center,
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            PrimaryStoryButton(
                text = context.getString(R.string.onboarding_open_settings),
                onClick = {
                    hintMessage = null
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
                text = context.getString(R.string.onboarding_check_access),
                onClick = { checkAccess(andEnter = true) },
            )
        }
    }
}
