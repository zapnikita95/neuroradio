package com.musicstory.app.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import com.musicstory.app.ui.theme.AccentCyan
import com.musicstory.app.ui.theme.AccentPink
import com.musicstory.app.ui.theme.AccentViolet
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val MusicStoryColorScheme = darkColorScheme(
    primary = AccentViolet,
    onPrimary = DeepVoid,
    primaryContainer = NightPlum,
    onPrimaryContainer = CreamText,
    secondary = AccentPink,
    onSecondary = DeepVoid,
    tertiary = AccentCyan,
    background = DeepVoid,
    onBackground = CreamText,
    surface = SurfaceElevated,
    onSurface = CreamText,
    surfaceVariant = SurfaceGlass,
    onSurfaceVariant = MutedLavender,
    outline = GlassBorder,
    outlineVariant = MutedLavender.copy(alpha = 0.4f),
    error = ErrorCoral,
    onError = DeepVoid,
)

@Composable
fun MusicStoryTheme(
    darkTheme: Boolean = true,
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = DeepVoid.toArgb()
            window.navigationBarColor = DeepVoid.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }

    MaterialTheme(
        colorScheme = MusicStoryColorScheme,
        typography = Typography,
        content = content,
    )
}
