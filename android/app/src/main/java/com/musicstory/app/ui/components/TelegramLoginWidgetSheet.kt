package com.musicstory.app.ui.components

import android.annotation.SuppressLint
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
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
    val baseOrigin = widgetBaseUrl.trim().trimEnd('/')
    // Base URL path sets WebView origin — must match @BotFather /setdomain (usually apex, not www).
    val pageBaseUrl = "$baseOrigin/telegram-login"
    val html = buildTelegramWidgetHtml(safeBot)
    val allowedHosts = buildSet {
        add(baseOrigin.removePrefix("https://").removePrefix("http://").substringBefore('/'))
        add("telegram.org")
        add("oauth.telegram.org")
        add("t.me")
        val host = baseOrigin.removePrefix("https://").removePrefix("http://").substringBefore('/')
        if (host.startsWith("www.")) add(host.removePrefix("www."))
        else add("www.$host")
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
    ) {
        AndroidView(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 360.dp, max = 480.dp)
                .padding(start = 8.dp, end = 8.dp, bottom = 24.dp),
            factory = { context ->
                WebView(context).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(
                            view: WebView,
                            request: WebResourceRequest,
                        ): Boolean {
                            val host = request.url.host?.lowercase() ?: return true
                            val allowed = allowedHosts.any { host == it || host.endsWith(".$it") }
                            return !allowed
                        }
                    }
                    addJavascriptInterface(
                        object {
                            @JavascriptInterface
                            fun onTelegramAuth(json: String) {
                                runCatching { JSONObject(json) }.getOrNull()?.let(onAuthPayload)
                            }
                        },
                        "MusicStoryAndroid",
                    )
                    loadDataWithBaseURL(pageBaseUrl, html, "text/html", "UTF-8", null)
                }
            },
        )
    }
}
