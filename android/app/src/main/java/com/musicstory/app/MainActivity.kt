package com.musicstory.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.navigation.compose.rememberNavController
import com.musicstory.app.ui.navigation.MusicStoryNavGraph
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

                LaunchedEffect(Unit) {
                    hasNotificationAccess = app.mediaControllerManager.hasNotificationAccess()
                }

                val startDestination = if (hasNotificationAccess) Routes.HOME else Routes.ONBOARDING
                val navController = rememberNavController()

                MusicStoryNavGraph(
                    navController = navController,
                    startDestination = startDestination,
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
