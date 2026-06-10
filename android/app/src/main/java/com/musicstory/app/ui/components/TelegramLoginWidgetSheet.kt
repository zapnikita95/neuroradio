package com.musicstory.app.ui.components

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.musicstory.app.util.normalizeHttpsOrigin
import com.musicstory.app.ui.theme.ErrorCoral
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.MutedLavender
import org.json.JSONObject

private class TelegramAuthBridge(
    private val onAuthPayload: (JSONObject) -> Unit,
) {
    @JavascriptInterface
    fun onTelegramAuth(json: String) {
        Handler(Looper.getMainLooper()).post {
            runCatching { JSONObject(json) }.getOrNull()?.let(onAuthPayload)
        }
    }
}

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
    val baseOrigin = normalizeHttpsOrigin(widgetBaseUrl) ?: widgetBaseUrl.trim().trimEnd('/')
    val pageUrl = remember(baseOrigin, botUsername) {
        "$baseOrigin/telegram-login?embed=android&bot=${botUsername.trim().removePrefix("@")}"
    }
    var loading by remember(pageUrl) { mutableStateOf(true) }
    var loadError by remember(pageUrl) { mutableStateOf<String?>(null) }

    val allowedHosts = remember(baseOrigin) {
        buildSet {
            fun addHost(raw: String) {
                raw.removePrefix("https://").removePrefix("http://").substringBefore('/').lowercase()
                    .takeIf { it.isNotBlank() }?.let { add(it) }
            }
            addHost(baseOrigin)
            add("telegram.org")
            add("oauth.telegram.org")
            add("t.me")
            val host = baseOrigin.removePrefix("https://").removePrefix("http://").substringBefore('/').lowercase()
            if (host.startsWith("www.")) add(host.removePrefix("www."))
            else add("www.$host")
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        containerColor = androidx.compose.ui.graphics.Color(0xFF1A1520),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 380.dp, max = 520.dp)
                .padding(start = 8.dp, end = 8.dp, bottom = 24.dp),
        ) {
            AndroidView(
                modifier = Modifier.fillMaxWidth(),
                factory = { context ->
                    WebView(context).apply {
                        setBackgroundColor(Color.parseColor("#1A1520"))
                        CookieManager.getInstance().setAcceptCookie(true)
                        CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.javaScriptCanOpenWindowsAutomatically = true
                        settings.setSupportMultipleWindows(true)
                        settings.loadsImagesAutomatically = true

                        webChromeClient = WebChromeClient()

                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(
                                view: WebView,
                                request: WebResourceRequest,
                            ): Boolean {
                                val uri = request.url ?: return false
                                val scheme = uri.scheme?.lowercase() ?: return false
                                if (scheme in setOf("tg", "intent")) {
                                    runCatching {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                                    }
                                    return true
                                }
                                if (scheme !in setOf("http", "https")) return true
                                val host = uri.host?.lowercase() ?: return true
                                val allowed = allowedHosts.any { host == it || host.endsWith(".$it") }
                                return !allowed
                            }

                            override fun onPageFinished(view: WebView?, url: String?) {
                                loading = false
                            }

                            override fun onReceivedError(
                                view: WebView,
                                request: WebResourceRequest,
                                error: WebResourceError,
                            ) {
                                if (!request.isForMainFrame) return
                                loading = false
                                loadError = error.description?.toString()?.takeIf { it.isNotBlank() }
                                    ?: "Не удалось загрузить страницу входа"
                            }
                        }

                        addJavascriptInterface(
                            TelegramAuthBridge(onAuthPayload),
                            "MusicStoryAndroid",
                        )
                        loadUrl(pageUrl)
                    }
                },
                update = { webView ->
                    if (webView.url != pageUrl) {
                        loading = true
                        loadError = null
                        webView.loadUrl(pageUrl)
                    }
                },
            )

            if (loading && loadError == null) {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = GoldBright,
                )
            }

            loadError?.let { err ->
                Text(
                    text = err,
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(16.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = ErrorCoral,
                )
            }
        }

        Text(
            text = "Если кнопка Telegram не появилась — проверьте интернет или войдите через Email.",
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            style = MaterialTheme.typography.labelMedium,
            color = MutedLavender,
        )
    }
}
