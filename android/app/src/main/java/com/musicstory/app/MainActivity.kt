package com.musicstory.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.musicstory.app.ui.navigation.MusicStoryStartupGate
import com.musicstory.app.ui.navigation.Routes
import com.musicstory.app.ui.theme.MusicStoryTheme

class MainActivity : ComponentActivity() {

    private lateinit var app: MusicStoryApp

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        app = application as MusicStoryApp

        setContent {
            MusicStoryTheme {
                var hasNotificationAccess by remember {
                    mutableStateOf(app.mediaControllerManager.hasNotificationAccess())
                }

                val lifecycleOwner = LocalLifecycleOwner.current

                DisposableEffect(lifecycleOwner) {
                    val observer = LifecycleEventObserver { _, event ->
                        if (event != Lifecycle.Event.ON_RESUME) return@LifecycleEventObserver
                        val granted = app.mediaControllerManager.hasNotificationAccess()
                        hasNotificationAccess = granted
                    }
                    lifecycleOwner.lifecycle.addObserver(observer)
                    onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
                }

                MusicStoryStartupGate(
                    hasNotificationAccess = hasNotificationAccess,
                    onNotificationAccessChanged = {
                        hasNotificationAccess = app.mediaControllerManager.hasNotificationAccess()
                    },
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (::app.isInitialized) {
            app.mediaControllerManager.refreshActiveController()
        }
    }
}
