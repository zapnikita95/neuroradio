package com.musicstory.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.ui.screens.AccountScreen
import com.musicstory.app.ui.screens.AccountLoginScreen
import com.musicstory.app.ui.screens.HistoryScreen
import com.musicstory.app.ui.screens.HomeScreen
import com.musicstory.app.ui.screens.OnboardingScreen
import com.musicstory.app.ui.screens.SettingsScreen
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

object Routes {
    const val ONBOARDING = "onboarding"
    const val ACCOUNT_LOGIN = "account_login"
    const val HOME = "home"
    const val SETTINGS = "settings"
    const val ACCOUNT = "account"
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
                        if (!app.settingsDataStore.homeTourCompleted.first()) {
                            app.settingsDataStore.setHomeTourPending(true)
                        }
                        navController.navigate(Routes.HOME) {
                            popUpTo(Routes.ONBOARDING) { inclusive = true }
                        }
                    }
                },
            )
        }
        composable(Routes.ACCOUNT_LOGIN) {
            val context = LocalContext.current
            val app = context.applicationContext as MusicStoryApp
            val scope = rememberCoroutineScope()
            AccountLoginScreen(
                onLoggedIn = {
                    scope.launch {
                        if (!app.settingsDataStore.homeTourCompleted.first()) {
                            app.settingsDataStore.setHomeTourPending(true)
                        }
                        navController.navigate(Routes.HOME) {
                            popUpTo(Routes.ACCOUNT_LOGIN) { inclusive = true }
                            launchSingleTop = true
                        }
                    }
                },
                onSkip = {
                    scope.launch {
                        app.settingsDataStore.setHomeTourPending(true)
                        navController.navigate(Routes.HOME) {
                            popUpTo(Routes.ACCOUNT_LOGIN) { inclusive = true }
                            launchSingleTop = true
                        }
                    }
                },
            )
        }
        composable(Routes.HOME) {
            val context = LocalContext.current
            val app = context.applicationContext as MusicStoryApp
            val scope = rememberCoroutineScope()
            HomeScreen(
                onOpenSettings = { navController.navigate(Routes.SETTINGS) },
                onOpenAccount = { navController.navigate(Routes.ACCOUNT) },
                onOpenHistory = { navController.navigate(Routes.HISTORY) },
                onRequestNotificationAccess = {
                    navController.navigate(Routes.ONBOARDING)
                },
                onHomeTourFinishedOpenSettings = {
                    scope.launch {
                        app.settingsDataStore.setSettingsTourPending(true)
                    }
                    navController.navigate(Routes.SETTINGS)
                },
            )
        }
        composable(Routes.ACCOUNT) {
            AccountScreen(
                onBack = { navController.popBackStack() },
                onOpenAccountLogin = {
                    navController.navigate(Routes.ACCOUNT_LOGIN) { launchSingleTop = true }
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
                onOpenAccountLogin = {
                    navController.navigate(Routes.ACCOUNT_LOGIN) {
                        launchSingleTop = true
                    }
                },
                onOpenAccount = {
                    navController.navigate(Routes.ACCOUNT) { launchSingleTop = true }
                },
            )
        }
        composable(Routes.HISTORY) {
            HistoryScreen(onBack = { navController.popBackStack() })
        }
    }
}

@Composable
fun rememberMusicStoryStartDestination(hasNotificationAccess: Boolean): String =
    if (!hasNotificationAccess) Routes.ONBOARDING else Routes.HOME

@Composable
fun MusicStoryStartupGate(
    hasNotificationAccess: Boolean,
    onNotificationAccessChanged: () -> Unit,
    openListeningPage: Boolean,
    openSettingsPage: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val startDestination = rememberMusicStoryStartDestination(hasNotificationAccess)
    val navController = androidx.navigation.compose.rememberNavController()

    LaunchedEffect(openListeningPage, hasNotificationAccess) {
        if (!openListeningPage || !hasNotificationAccess) return@LaunchedEffect
        navController.navigate(Routes.HOME) {
            popUpTo(Routes.HOME) { inclusive = true }
            launchSingleTop = true
        }
    }

    LaunchedEffect(openSettingsPage, hasNotificationAccess) {
        if (!openSettingsPage || !hasNotificationAccess) return@LaunchedEffect
        navController.navigate(Routes.SETTINGS) { launchSingleTop = true }
    }

    MusicStoryNavGraph(
        navController = navController,
        startDestination = startDestination,
        hasNotificationAccess = hasNotificationAccess,
        onNotificationAccessChanged = onNotificationAccessChanged,
        modifier = modifier,
    )
}
