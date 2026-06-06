package com.musicstory.app.ui.components

import android.annotation.SuppressLint
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import org.json.JSONObject

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun TelegramLoginWebView(
    widgetUrl: String,
    onAuthPayload: (JSONObject) -> Unit,
    modifier: Modifier = Modifier,
) {
    AndroidView(
        modifier = modifier
            .fillMaxWidth()
            .height(320.dp),
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
                loadUrl(widgetUrl)
            }
        },
    )
}
