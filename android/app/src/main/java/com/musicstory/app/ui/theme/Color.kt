package com.musicstory.app.ui.theme

import androidx.compose.ui.graphics.Color

// Core palette — aligned with efir-ai.ru (violet / pink / cyan)
val DeepVoid = Color(0xFF08070F)
val NightPlum = Color(0xFF14101F)
val SurfaceElevated = Color(0xFF1A1528)
val SurfaceGlass = Color(0xFF252035)

val AccentViolet = Color(0xFFA855F7)
val AccentPink = Color(0xFFFF5DA2)
val AccentCyan = Color(0xFF38E1FF)
val AccentAmber = Color(0xFFFFB86B)

/** @deprecated Use AccentPink — kept for gradual migration */
val GoldWarm = AccentPink
/** @deprecated Use AccentViolet — kept for gradual migration */
val GoldBright = AccentViolet
/** @deprecated Use AccentCyan */
val Copper = AccentCyan
/** @deprecated Use AccentAmber */
val AmberGlow = AccentAmber

val CreamText = Color(0xFFF5EDE0)
val MutedLavender = Color(0xFF9B8FA8)
val DustyRose = Color(0xFF8B5A6B)

val VinylBlack = Color(0xFF0A0A0C)
val VinylGroove = Color(0xFF1C1C22)
val ErrorCoral = Color(0xFFFF6B6B)
val LiveGreen = Color(0xFF4ADE80)

val GlassBorder = Color(0x33A855F7)
val GlassHighlight = Color(0x14FFFFFF)

// Legacy aliases
val RadioBackground = DeepVoid
val RadioSurface = SurfaceElevated
val RadioAccent = AccentViolet
val RadioAccentDim = AccentPink
val RadioOnSurface = CreamText
val RadioOnSurfaceVariant = MutedLavender
val RadioError = ErrorCoral

val Purple80 = AccentViolet
val PurpleGrey80 = MutedLavender
val Pink80 = AccentPink
val Purple40 = AccentViolet
val PurpleGrey40 = MutedLavender
val Pink40 = AccentCyan
