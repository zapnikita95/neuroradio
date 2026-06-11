package com.musicstory.app.data.auth

import android.annotation.SuppressLint
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import com.musicstory.app.util.StoryLog

/** WebView fallback when Custom Tabs unavailable — BFF /authorize → oauth.telegram.org. */
class TelegramOAuthActivity : ComponentActivity() {

    private var callbackHandled = false
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var errorText: TextView
    private lateinit var allowedHosts: Set<String>

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

        allowedHosts = buildAllowedHosts(authUrl)
        StoryLog.i("Telegram OAuth WebView load: ${authUrl.take(160)} hosts=${allowedHosts.size}")

        progressBar = ProgressBar(this).apply {
            isIndeterminate = true
        }
        errorText = TextView(this).apply {
            setTextColor(Color.parseColor("#E8EAED"))
            textSize = 15f
            gravity = Gravity.CENTER
            visibility = View.GONE
            setPadding(32, 32, 32, 32)
        }
        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0F0F13"))
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.loadsImagesAutomatically = true
            settings.javaScriptCanOpenWindowsAutomatically = true
            settings.setSupportMultipleWindows(true)
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            settings.userAgentString =
                "Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 " +
                    "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EfirAI/1.5"

            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView?, newProgress: Int) {
                    progressBar.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
                }

                override fun onCreateWindow(
                    view: WebView?,
                    isDialog: Boolean,
                    isUserGesture: Boolean,
                    resultMsg: android.os.Message?,
                ): Boolean {
                    val transport = resultMsg?.obj as? WebView.WebViewTransport ?: return false
                    transport.webView = webView
                    resultMsg.sendToTarget()
                    return true
                }
            }

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

                override fun onPageFinished(view: WebView?, url: String?) {
                    if (!url.isNullOrBlank()) {
                        StoryLog.d("Telegram OAuth page: ${url.take(120)}")
                    }
                }

                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?,
                ) {
                    if (request?.isForMainFrame != true) return
                    val desc = error?.description?.toString().orEmpty()
                    StoryLog.e("Telegram OAuth WebView error: $desc url=${request.url}")
                    showLoadError(desc.ifBlank { "Не удалось загрузить страницу входа" })
                }
            }
            loadUrl(authUrl)
        }

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#0F0F13"))
            addView(
                webView,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                ),
            )
            addView(
                progressBar,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    Gravity.CENTER,
                ),
            )
            addView(
                errorText,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    Gravity.CENTER,
                ),
            )
        }
        setContentView(root)

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

    override fun onDestroy() {
        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }

    private fun showLoadError(message: String) {
        progressBar.visibility = View.GONE
        errorText.text = message
        errorText.visibility = View.VISIBLE
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
        val scheme = uri.scheme?.lowercase().orEmpty()
        if (scheme == CALLBACK_SCHEME) {
            return handleOAuthRedirect(uri)
        }
        if (handleOAuthRedirect(uri)) return true
        if (scheme in setOf("tg", "intent")) {
            runCatching { startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, uri)) }
            return true
        }
        if (scheme !in ALLOWED_SCHEMES) {
            StoryLog.w("Telegram OAuth blocked scheme=$scheme host=${uri.host}")
            return true
        }
        val host = uri.host?.lowercase().orEmpty()
        if (!isHostAllowed(host)) {
            StoryLog.w("Telegram OAuth blocked host=$host")
            return true
        }
        return false
    }

    private fun isHostAllowed(host: String): Boolean {
        if (host.isBlank()) return false
        return allowedHosts.any { allowed ->
            host == allowed || host.endsWith(".$allowed")
        }
    }

    private fun buildAllowedHosts(authUrl: String): Set<String> {
        val hosts = mutableSetOf(
            "efir-ai.ru",
            "oauth.telegram.org",
            "telegram.org",
            "t.me",
            "music-story-production.up.railway.app",
            "neuroradio-production.up.railway.app",
        )
        runCatching { Uri.parse(authUrl).host?.lowercase()?.takeIf { it.isNotBlank() } }
            .getOrNull()
            ?.let { hosts.add(it) }
        return hosts
    }

    companion object {
        const val EXTRA_AUTH_URL = "auth_url"
        private const val CALLBACK_SCHEME = "efirai"
        private val ALLOWED_SCHEMES = setOf("http", "https")
    }
}
