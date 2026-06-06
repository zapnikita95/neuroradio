package com.musicstory.app.ui.components

import android.annotation.SuppressLint
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import org.json.JSONObject

@SuppressLint("SetJavaScriptEnabled")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TelegramLoginWidgetSheet(
    visible: Boolean,
    botUsername: String,
    widgetBaseUrl: String,
    onDismiss: () -> Unit,
    onAuthPayload: (JSONObject) -> Unit,
) {
    if (!visible) return

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val safeBot = botUsername.trim().removePrefix("@")
    val baseUrl = widgetBaseUrl.trim().trimEnd('/') + "/"
    val html = buildTelegramWidgetHtml(safeBot)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
    ) {
        Text(
            text = "Вход через Telegram",
            modifier = Modifier.fillMaxWidth(),
        )
        AndroidView(
            modifier = Modifier
                .fillMaxWidth()
                .height(280.dp),
            factory = { context ->
                WebView(context).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    webViewClient = WebViewClient()
                    addJavascriptInterface(
                        object {
                            @JavascriptInterface
                            fun onTelegramAuth(json: String) {
                                runCatching { JSONObject(json) }.getOrNull()?.let(onAuthPayload)
                            }
                        },
                        "MusicStoryAndroid",
                    )
                    loadDataWithBaseURL(baseUrl, html, "text/html", "UTF-8", null)
                }
            },
        )
    }
}
