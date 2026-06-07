package com.musicstory.app.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
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
import com.musicstory.app.ui.theme.GoldBright
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
                        val linked = app.settingsDataStore.accountLinked.first()
                        if (linked) {
                            app.settingsDataStore.setHomeTourPending(true)
                            navController.navigate(Routes.HOME) {
                                popUpTo(Routes.ONBOARDING) { inclusive = true }
                            }
                        } else {
                            navController.navigate(Routes.ACCOUNT_LOGIN) {
                                popUpTo(Routes.ONBOARDING) { inclusive = true }
                            }
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
                        app.settingsDataStore.setHomeTourPending(true)
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
            )
        }
        composable(Routes.HISTORY) {
            HistoryScreen(onBack = { navController.popBackStack() })
        }
    }
}

@Composable
fun rememberMusicStoryStartDestination(
    hasNotificationAccess: Boolean,
): String? {
    val context = LocalContext.current
    val app = context.applicationContext as MusicStoryApp
    val accountLinked by app.settingsDataStore.accountLinked.collectAsState(initial = null)
    var resolved by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(hasNotificationAccess, accountLinked) {
        if (accountLinked == null) return@LaunchedEffect
        resolved = when {
            !hasNotificationAccess -> Routes.ONBOARDING
            accountLinked == true -> Routes.HOME
            else -> Routes.ACCOUNT_LOGIN
        }
    }

    return resolved
}

@Composable
fun MusicStoryStartupGate(
    hasNotificationAccess: Boolean,
    onNotificationAccessChanged: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val startDestination = rememberMusicStoryStartDestination(hasNotificationAccess)
    if (startDestination == null) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = GoldBright)
        }
        return
    }

    val navController = androidx.navigation.compose.rememberNavController()
    MusicStoryNavGraph(
        navController = navController,
        startDestination = startDestination,
        hasNotificationAccess = hasNotificationAccess,
        onNotificationAccessChanged = onNotificationAccessChanged,
        modifier = modifier,
    )
}
