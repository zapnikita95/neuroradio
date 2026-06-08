package com.musicstory.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.R
import com.musicstory.app.ui.components.PaymentCheckoutSheet
import com.musicstory.app.ui.components.PrimaryStoryButton
import com.musicstory.app.ui.components.SecondaryStoryButton
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.DeepVoid
import com.musicstory.app.ui.theme.ErrorCoral
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.MutedLavender
import com.musicstory.app.data.local.toCached
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountScreen(
    onBack: () -> Unit,
    onOpenAccountLogin: () -> Unit,
    initialTab: Int = 0,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val app = context.applicationContext as MusicStoryApp
    val scope = rememberCoroutineScope()
    var tab by remember { mutableIntStateOf(initialTab) }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = DeepVoid,
        topBar = {
            TopAppBar(
                title = { Text(context.getString(R.string.nav_account), color = CreamText) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = GoldBright)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = DeepVoid.copy(alpha = 0.92f)),
            )
        },
    ) { padding ->
        Column(modifier = Modifier.padding(padding)) {
            TabRow(selectedTabIndex = tab, containerColor = DeepVoid) {
                Tab(
                    selected = tab == 0,
                    onClick = { tab = 0 },
                    text = { Text(context.getString(R.string.settings_auth_section)) },
                )
                Tab(
                    selected = tab == 1,
                    onClick = { tab = 1 },
                    text = { Text(context.getString(R.string.billing_tab)) },
                )
            }
            when (tab) {
                0 -> Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                ) {
                    AccountStatusSection(app = app, onOpenLogin = onOpenAccountLogin)
                }
                1 -> BillingTab(app = app)
            }
        }
    }
}

@Composable
private fun BillingTab(app: MusicStoryApp) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var backendUrl by remember { mutableStateOf("") }
    var premiumActive by remember { mutableStateOf(false) }
    var premiumUntil by remember { mutableStateOf<Long?>(null) }
    var autoRenew by remember { mutableStateOf(false) }
    var cardSaved by remember { mutableStateOf(false) }
    var showUnlinkConfirm by remember { mutableStateOf(false) }
    var unlinkLoading by remember { mutableStateOf(false) }
    var unlinkMessage by remember { mutableStateOf<String?>(null) }
    var paymentUrl by remember { mutableStateOf<String?>(null) }

    suspend fun refreshBilling() {
        try {
            val status = app.apiClient.fetchBillingStatus(backendUrl)
            premiumActive = status.premium == true
            premiumUntil = status.entitlement?.premiumUntil
            autoRenew = status.entitlement?.autoRenew == true
            cardSaved = status.entitlement?.cardSaved == true
        } catch (_: Exception) {
            // billing status optional until auth warms up
        }
    }

    LaunchedEffect(Unit) {
        backendUrl = app.settingsDataStore.backendUrl.first()
        email = app.settingsDataStore.cachedAccountEmail.first()
            .ifBlank { app.settingsDataStore.readCachedAccountProfile()?.email.orEmpty() }
        refreshBilling()
        app.accountAuthManager.fetchProfile(backendUrl)?.let { profile ->
            profile.email?.let { email = it }
            app.settingsDataStore.saveAccountProfile(profile.toCached())
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            text = context.getString(R.string.billing_intro),
            style = MaterialTheme.typography.bodyMedium,
            color = MutedLavender,
        )

        if (premiumActive) {
            val until = premiumUntil?.let {
                java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale("ru"))
                    .format(java.util.Date(it))
            }
            Text(
                text = if (until != null) {
                    "Расширенный доступ активен до $until"
                } else {
                    context.getString(R.string.settings_auth_premium)
                },
                style = MaterialTheme.typography.labelLarge,
                color = GoldBright,
            )
        }

        if (cardSaved || autoRenew) {
            Text(
                text = "Карта привязана — подписка продлевается автоматически.",
                style = MaterialTheme.typography.bodySmall,
                color = MutedLavender,
            )
        }

        SecondaryStoryButton(
            text = context.getString(R.string.billing_unlink_card),
            onClick = { showUnlinkConfirm = true },
            enabled = !unlinkLoading && !loading,
            modifier = Modifier.fillMaxWidth(),
        )

        unlinkMessage?.let {
            Text(
                text = it,
                color = if (it.contains("отвязан", ignoreCase = true) || it.contains("Карта", ignoreCase = true)) {
                    GoldBright
                } else {
                    ErrorCoral
                },
                style = MaterialTheme.typography.bodySmall,
            )
        }

        if (showUnlinkConfirm) {
            AlertDialog(
                onDismissRequest = { if (!unlinkLoading) showUnlinkConfirm = false },
                title = { Text(context.getString(R.string.billing_unlink_card_title)) },
                text = { Text(context.getString(R.string.billing_unlink_card_body)) },
                confirmButton = {
                    PrimaryStoryButton(
                        text = context.getString(R.string.billing_unlink_card_confirm),
                        onClick = {
                            scope.launch {
                                unlinkLoading = true
                                unlinkMessage = null
                                try {
                                    val resp = app.apiClient.unlinkCard(backendUrl)
                                    if (resp.ok == true) {
                                        unlinkMessage = resp.message ?: context.getString(R.string.billing_unlink_card_done)
                                        autoRenew = false
                                        cardSaved = false
                                        showUnlinkConfirm = false
                                        refreshBilling()
                                    } else {
                                        unlinkMessage = resp.error ?: context.getString(R.string.billing_unlink_card_failed)
                                    }
                                } catch (e: Exception) {
                                    unlinkMessage = e.message ?: context.getString(R.string.billing_unlink_card_failed)
                                } finally {
                                    unlinkLoading = false
                                }
                            }
                        },
                        enabled = !unlinkLoading,
                    )
                },
                dismissButton = {
                    SecondaryStoryButton(
                        text = context.getString(R.string.action_cancel),
                        onClick = { showUnlinkConfirm = false },
                        enabled = !unlinkLoading,
                    )
                },
                containerColor = DeepVoid,
                titleContentColor = CreamText,
                textContentColor = MutedLavender,
            )
        }

        PaymentCheckoutSheet(
            visible = paymentUrl != null,
            checkoutUrl = paymentUrl.orEmpty(),
            onDismiss = { paymentUrl = null },
            onPaymentComplete = {
                paymentUrl = null
                scope.launch { refreshBilling() }
            },
        )

        OutlinedTextField(
            value = email,
            onValueChange = { email = it.trim() },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(context.getString(R.string.settings_auth_email)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = CreamText,
                unfocusedTextColor = CreamText,
                focusedBorderColor = GoldBright,
            ),
            singleLine = true,
        )

        Text(
            text = "Email нужен для активации подписки и отправки чека после оплаты.",
            style = MaterialTheme.typography.bodySmall,
            color = MutedLavender,
        )

        TierCard(
            title = context.getString(R.string.billing_basic_title),
            price = context.getString(R.string.billing_basic_price),
            bullets = listOf(
                context.getString(R.string.billing_basic_1),
                context.getString(R.string.billing_basic_2),
                context.getString(R.string.billing_basic_3),
            ),
            highlighted = false,
        )
        TierCard(
            title = context.getString(R.string.billing_premium_title),
            price = context.getString(R.string.billing_premium_from),
            bullets = listOf(
                context.getString(R.string.billing_premium_1),
                context.getString(R.string.billing_premium_2),
                context.getString(R.string.billing_premium_3),
                context.getString(R.string.billing_premium_4),
            ),
            highlighted = true,
        )

        Text(
            text = context.getString(R.string.billing_plans_heading),
            style = MaterialTheme.typography.titleMedium,
            color = CreamText,
        )

        PlanButton(
            label = context.getString(R.string.billing_plan_month),
            price = "199 ₽",
            oldPrice = null,
            featured = false,
            enabled = !loading,
        ) {
            scope.launch {
                pay(app, backendUrl, email, "month", { loading = it }, { error = it }) { url ->
                    paymentUrl = url
                }
            }
        }
        PlanButton(
            label = context.getString(R.string.billing_plan_year),
            price = "1999 ₽",
            oldPrice = "2388 ₽",
            featured = true,
            enabled = !loading,
        ) {
            scope.launch {
                pay(app, backendUrl, email, "year", { loading = it }, { error = it }) { url ->
                    paymentUrl = url
                }
            }
        }
        PlanButton(
            label = context.getString(R.string.billing_plan_quarter),
            price = "499 ₽",
            oldPrice = "597 ₽",
            featured = false,
            enabled = !loading,
        ) {
            scope.launch {
                pay(app, backendUrl, email, "quarter", { loading = it }, { error = it }) { url ->
                    paymentUrl = url
                }
            }
        }

        if (loading) {
            CircularProgressIndicator(color = GoldBright, modifier = Modifier.padding(8.dp))
        }
        error?.let {
            Text(text = it, color = ErrorCoral, style = MaterialTheme.typography.bodySmall)
        }
    }
}

private suspend fun pay(
    app: MusicStoryApp,
    backendUrl: String,
    email: String,
    plan: String,
    setLoading: (Boolean) -> Unit,
    setError: (String?) -> Unit,
    onOpenCheckout: (String) -> Unit,
) {
    val context = app.applicationContext
    if (email.isBlank() || !email.contains('@')) {
        setError(context.getString(R.string.billing_email_required))
        return
    }
    if (backendUrl.isBlank()) {
        setError(context.getString(R.string.billing_no_backend))
        return
    }
    setLoading(true)
    setError(null)
    try {
        val resp = app.apiClient.createPayment(backendUrl, email, plan)
        val url = resp.confirmationUrl
        if (url.isNullOrBlank()) {
            setError(context.getString(R.string.billing_payment_failed))
        } else {
            onOpenCheckout(url)
        }
    } catch (e: Exception) {
        setError(e.message ?: context.getString(R.string.billing_payment_failed))
    } finally {
        setLoading(false)
    }
}

@Composable
private fun TierCard(
    title: String,
    price: String,
    bullets: List<String>,
    highlighted: Boolean,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (highlighted) GoldBright.copy(alpha = 0.12f) else DeepVoid.copy(alpha = 0.6f),
        ),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(title, style = MaterialTheme.typography.titleMedium, color = CreamText)
                Text(price, style = MaterialTheme.typography.labelLarge, color = GoldBright)
            }
            Spacer(modifier = Modifier.height(8.dp))
            bullets.forEach { line ->
                Text("• $line", style = MaterialTheme.typography.bodySmall, color = MutedLavender)
            }
        }
    }
}

@Composable
private fun PlanButton(
    label: String,
    price: String,
    oldPrice: String?,
    featured: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (featured) GoldBright.copy(alpha = 0.18f) else DeepVoid.copy(alpha = 0.5f),
        ),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(label, color = CreamText, style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(price, color = GoldBright, style = MaterialTheme.typography.titleMedium)
                oldPrice?.let {
                    Text(it, color = MutedLavender, style = MaterialTheme.typography.bodySmall)
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            PrimaryStoryButton(text = "Оформить", onClick = onClick, enabled = enabled)
        }
    }
}
