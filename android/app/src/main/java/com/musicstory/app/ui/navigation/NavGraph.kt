package com.musicstory.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.compose.runtime.rememberCoroutineScope
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.ui.screens.HistoryScreen
import com.musicstory.app.ui.screens.HomeScreen
import com.musicstory.app.ui.screens.OnboardingScreen
import com.musicstory.app.ui.screens.SettingsScreen
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.launch

object Routes {
    const val ONBOARDING = "onboarding"
    const val HOME = "home"
    const val SETTINGS = "settings"
    const val HISTORY = "history"
}

@Composable
fun MusicStoryNavGraph(
    navController: NavHostController,
    startDestination: String,
    @Suppress("UNUSED_PARAMETER") hasNotificationAccess: Boolean,
    onNotificationAccessChanged: () -> Unit,
    modifier: Modifier = Modifier,
) {
    NavHost(
        navController = navController,
        startDestination = startDestination,
        modifier = modifier,
    ) {
        composable(Routes.ONBOARDING) {
            val context = LocalContext.current
            val app = context.applicationContext as MusicStoryApp
            val scope = rememberCoroutineScope()
            OnboardingScreen(
                onAccessGranted = {
                    onNotificationAccessChanged()
                    scope.launch {
                        app.settingsDataStore.setSettingsTourPending(true)
                    }
                    navController.navigate(Routes.SETTINGS) {
                        popUpTo(Routes.ONBOARDING) { inclusive = true }
                    }
                },
            )
        }
        composable(Routes.HOME) {
            HomeScreen(
                onOpenSettings = { navController.navigate(Routes.SETTINGS) },
                onOpenHistory = { navController.navigate(Routes.HISTORY) },
                onRequestNotificationAccess = {
                    navController.navigate(Routes.ONBOARDING)
                },
            )
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(
                onBack = {
                    if (!navController.popBackStack()) {
                        navController.navigate(Routes.HOME) {
                            launchSingleTop = true
                        }
                    }
                },
            )
        }
        composable(Routes.HISTORY) {
            HistoryScreen(onBack = { navController.popBackStack() })
        }
    }
}
