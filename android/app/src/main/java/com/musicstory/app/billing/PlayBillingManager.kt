package com.musicstory.app.billing

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/** Google Play product IDs for international (USD) subscriptions. */
object PlayBillingProducts {
    const val MONTH = "efir_premium_month_usd"
    const val QUARTER = "efir_premium_quarter_usd"
    const val YEAR = "efir_premium_year_usd"

    val ALL = listOf(MONTH, QUARTER, YEAR)

    fun productIdForPlan(planId: String): String = when (planId) {
        "month" -> MONTH
        "quarter" -> QUARTER
        "year" -> YEAR
        else -> MONTH
    }
}

data class PlayPurchaseResult(
    val productId: String,
    val purchaseToken: String,
)

class PlayBillingManager(
    context: Context,
) : PurchasesUpdatedListener {

    private val appContext = context.applicationContext
    private var pendingPurchase = CompletableDeferred<PlayPurchaseResult?>()

    private val billingClient: BillingClient = BillingClient.newBuilder(appContext)
        .setListener(this)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder().enableOneTimeProducts().build(),
        )
        .build()

    suspend fun connect(): Boolean = suspendCancellableCoroutine { cont ->
        if (billingClient.isReady) {
            cont.resume(true)
            return@suspendCancellableCoroutine
        }
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                cont.resume(result.responseCode == BillingClient.BillingResponseCode.OK)
            }

            override fun onBillingServiceDisconnected() {
                if (cont.isActive) cont.resume(false)
            }
        })
    }

    suspend fun queryProductDetails(productIds: List<String>): Map<String, ProductDetails> {
        if (!connect()) return emptyMap()
        val products = productIds.map {
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(it)
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        }
        val params = QueryProductDetailsParams.newBuilder().setProductList(products).build()
        return suspendCancellableCoroutine { cont ->
            billingClient.queryProductDetailsAsync(params) { result, list ->
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    cont.resume(emptyMap())
                    return@queryProductDetailsAsync
                }
                cont.resume(list.orEmpty().associateBy { it.productId })
            }
        }
    }

    suspend fun launchSubscriptionPurchase(
        activity: Activity,
        planId: String,
    ): PlayPurchaseResult? {
        if (!connect()) return null
        val productId = PlayBillingProducts.productIdForPlan(planId)
        val details = queryProductDetails(listOf(productId))[productId] ?: return null
        val offerToken = details.subscriptionOfferDetails?.firstOrNull()?.offerToken ?: return null

        pendingPurchase = CompletableDeferred()
        val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(details)
            .setOfferToken(offerToken)
            .build()
        val flowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productParams))
            .build()
        val launchResult = billingClient.launchBillingFlow(activity, flowParams)
        if (launchResult.responseCode != BillingClient.BillingResponseCode.OK) {
            return null
        }
        return pendingPurchase.await()
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        if (result.responseCode != BillingClient.BillingResponseCode.OK || purchases.isNullOrEmpty()) {
            if (pendingPurchase.isActive) pendingPurchase.complete(null)
            return
        }
        val purchase = purchases.firstOrNull { it.purchaseState == Purchase.PurchaseState.PURCHASED }
            ?: run {
                if (pendingPurchase.isActive) pendingPurchase.complete(null)
                return
            }
        val productId = purchase.products.firstOrNull().orEmpty()
        if (!purchase.isAcknowledged) {
            val ackParams = AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.purchaseToken)
                .build()
            billingClient.acknowledgePurchase(ackParams) { ackResult ->
                StoryLog.d("Play acknowledge ${ackResult.responseCode}")
            }
        }
        if (pendingPurchase.isActive) {
            pendingPurchase.complete(
                PlayPurchaseResult(productId = productId, purchaseToken = purchase.purchaseToken),
            )
        }
    }

    fun destroy() {
        if (billingClient.isReady) billingClient.endConnection()
    }
}
