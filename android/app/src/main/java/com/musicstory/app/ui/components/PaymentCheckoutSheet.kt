package com.musicstory.app.ui.components

import android.annotation.SuppressLint
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.GoldBright

private fun isPaymentReturnUrl(url: String): Boolean {
    val u = url.lowercase()
    return u.contains("efir-ai.ru") &&
        (u.contains("payment=success") || u.contains("payment=succeeded") || u.contains("payment=ok"))
}

@SuppressLint("SetJavaScriptEnabled")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaymentCheckoutSheet(
    visible: Boolean,
    checkoutUrl: String,
    onDismiss: () -> Unit,
    onPaymentComplete: () -> Unit,
) {
    if (!visible || checkoutUrl.isBlank()) return

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            IconButton(
                onClick = onDismiss,
                modifier = Modifier.padding(start = 4.dp, end = 4.dp, bottom = 4.dp),
            ) {
                Icon(Icons.Default.Close, contentDescription = null, tint = GoldBright)
            }
            Text(
                text = "Оплата",
                color = CreamText,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
            AndroidView(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 420.dp, max = 640.dp)
                    .padding(start = 8.dp, end = 8.dp, bottom = 24.dp),
                factory = { context ->
                    WebView(context).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.loadWithOverviewMode = true
                        settings.useWideViewPort = true
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(
                                view: WebView,
                                request: WebResourceRequest,
                            ): Boolean {
                                val url = request.url.toString()
                                if (isPaymentReturnUrl(url)) {
                                    onPaymentComplete()
                                    return true
                                }
                                return false
                            }
                        }
                        loadUrl(checkoutUrl)
                    }
                },
            )
        }
    }
}
