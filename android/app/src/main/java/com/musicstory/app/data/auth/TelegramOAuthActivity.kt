package com.musicstory.app.data.auth

import android.annotation.SuppressLint
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import com.musicstory.app.util.StoryLog

/** In-app WebView for Telegram OIDC — Custom Tabs on Huawei/OEM drop oauth.telegram.org query params. */
class TelegramOAuthActivity : ComponentActivity() {

    private var callbackHandled = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val authUrl = intent.getStringExtra(EXTRA_AUTH_URL)?.trim().orEmpty()
        if (authUrl.isBlank()) {
            StoryLog.e("Telegram OAuth activity: missing auth URL")
            TelegramOAuthCoordinator.instance.cancelPending()
            finish()
            return
        }

        StoryLog.i("Telegram OAuth WebView load: ${authUrl.take(160)}")

        val webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0F0F13"))
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.loadsImagesAutomatically = true

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest,
                ): Boolean {
                    val uri = request.url ?: return false
                    return routeOAuthUri(uri)
                }

                @Deprecated("Deprecated in Java")
                override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                    return routeOAuthUri(Uri.parse(url))
                }
            }
            loadUrl(authUrl)
        }
        setContentView(webView)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (!callbackHandled) {
                        TelegramOAuthCoordinator.instance.cancelPending()
                    }
                    finish()
                }
            },
        )
    }

    private fun handleOAuthRedirect(uri: Uri): Boolean {
        if (TelegramOAuthCoordinator.instance.handleCallback(uri)) {
            callbackHandled = true
            finish()
            return true
        }
        return false
    }

    private fun routeOAuthUri(uri: Uri): Boolean {
        if (handleOAuthRedirect(uri)) return true
        val scheme = uri.scheme?.lowercase() ?: return true
        if (scheme !in ALLOWED_SCHEMES) return true
        val host = uri.host?.lowercase() ?: return true
        val allowed = ALLOWED_HOSTS.any { host == it || host.endsWith(".$it") }
        return !allowed
    }

    companion object {
        const val EXTRA_AUTH_URL = "auth_url"

        private val ALLOWED_SCHEMES = setOf("http", "https")
        private val ALLOWED_HOSTS = setOf(
            "efir-ai.ru",
            "www.efir-ai.ru",
            "oauth.telegram.org",
            "telegram.org",
            "t.me",
            "music-story-production.up.railway.app",
            "neuroradio-production.up.railway.app",
        )
    }
}
