package com.musicstory.app

import android.content.Context
import android.content.Intent
import android.os.Bundle
import com.musicstory.app.util.LocaleHelper
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
import com.musicstory.app.data.auth.TelegramOAuthCoordinator
import com.musicstory.app.ui.navigation.MusicStoryStartupGate
import com.musicstory.app.ui.theme.MusicStoryTheme

class MainActivity : ComponentActivity() {

    private lateinit var app: MusicStoryApp
    private var openListeningPage by mutableStateOf(false)
    private var openSettingsPage by mutableStateOf(false)

    override fun attachBaseContext(newBase: Context) {
        val language = LocaleHelper.readStoredLanguage(newBase)
        super.attachBaseContext(LocaleHelper.wrapContext(newBase, language))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        app = application as MusicStoryApp
        openListeningPage = intent?.getBooleanExtra(EXTRA_OPEN_LISTENING, false) == true
        openSettingsPage = intent?.getBooleanExtra(EXTRA_OPEN_SETTINGS, false) == true
        handleOAuthIntent(intent)

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
                    openListeningPage = openListeningPage,
                    openSettingsPage = openSettingsPage,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleOAuthIntent(intent)
        if (intent.getBooleanExtra(EXTRA_OPEN_LISTENING, false)) {
            openListeningPage = true
        }
        if (intent.getBooleanExtra(EXTRA_OPEN_SETTINGS, false)) {
            openSettingsPage = true
        }
    }

    private fun handleOAuthIntent(intent: Intent?) {
        TelegramOAuthCoordinator.instance.handleCallback(intent?.data)
    }

    override fun onResume() {
        super.onResume()
        if (::app.isInitialized) {
            app.mediaControllerManager.refreshActiveController()
        }
    }

    companion object {
        const val EXTRA_OPEN_LISTENING = "com.musicstory.app.extra.OPEN_LISTENING"
        const val EXTRA_OPEN_SETTINGS = "com.musicstory.app.extra.OPEN_SETTINGS"
    }
}
