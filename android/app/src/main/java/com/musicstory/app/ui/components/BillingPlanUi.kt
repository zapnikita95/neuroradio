package com.musicstory.app.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.DeepVoid
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.MutedLavender

data class BillingPlanOption(
    val id: String,
    val title: String,
    val price: String,
    val oldPrice: String?,
    val badge: String?,
    val perMonthHint: String?,
    val confirmLead: String,
)

val defaultBillingPlans = listOf(
    BillingPlanOption(
        id = "month",
        title = "Месяц",
        price = "199 ₽",
        oldPrice = null,
        badge = null,
        perMonthHint = "199 ₽ в месяц",
        confirmLead = "Подписка на 1 месяц с расширенными лимитами и моделью DeepSeek V3.",
    ),
    BillingPlanOption(
        id = "year",
        title = "Год",
        price = "1999 ₽",
        oldPrice = "2388 ₽",
        badge = "Выгоднее всего",
        perMonthHint = "≈ 167 ₽ в месяц",
        confirmLead = "Подписка на 12 месяцев — самый выгодный вариант.",
    ),
    BillingPlanOption(
        id = "quarter",
        title = "Квартал",
        price = "499 ₽",
        oldPrice = "597 ₽",
        badge = null,
        perMonthHint = "≈ 166 ₽ в месяц",
        confirmLead = "Подписка на 3 месяца с автопродлением.",
    ),
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun BillingPlanCarousel(
    plans: List<BillingPlanOption>,
    selectedIndex: Int,
    onSelectedIndexChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val pagerState = rememberPagerState(
        initialPage = selectedIndex.coerceIn(0, (plans.size - 1).coerceAtLeast(0)),
        pageCount = { plans.size },
    )

    androidx.compose.runtime.LaunchedEffect(pagerState.currentPage) {
        onSelectedIndexChange(pagerState.currentPage)
    }

    val pageWidth = (LocalConfiguration.current.screenWidthDp.dp - 64.dp).coerceAtLeast(260.dp)

    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = "Листай влево или вправо — год по центру",
            style = MaterialTheme.typography.bodySmall,
            color = MutedLavender,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(bottom = 10.dp),
        )
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxWidth(),
            pageSpacing = 12.dp,
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 24.dp),
        ) { page ->
            BillingPlanCard(
                plan = plans[page],
                highlighted = page == pagerState.currentPage,
                modifier = Modifier.width(pageWidth),
            )
        }
        Row(
            modifier = Modifier.padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            plans.forEachIndexed { index, _ ->
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .width(if (index == pagerState.currentPage) 16.dp else 8.dp)
                        .height(8.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = if (index == pagerState.currentPage) {
                                GoldBright
                            } else {
                                MutedLavender.copy(alpha = 0.35f)
                            },
                        ),
                        shape = CircleShape,
                        modifier = Modifier
                            .width(if (index == pagerState.currentPage) 16.dp else 8.dp)
                            .height(8.dp),
                    ) {}
                }
            }
        }
    }
}

@Composable
private fun BillingPlanCard(
    plan: BillingPlanOption,
    highlighted: Boolean,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (highlighted) {
                GoldBright.copy(alpha = 0.16f)
            } else {
                DeepVoid.copy(alpha = 0.55f)
            },
        ),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            plan.badge?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.labelMedium,
                    color = GoldBright,
                    modifier = Modifier.padding(bottom = 6.dp),
                )
            }
            Text(
                text = plan.title,
                style = MaterialTheme.typography.titleLarge,
                color = CreamText,
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Bottom,
                modifier = Modifier.padding(top = 8.dp),
            ) {
                Text(
                    text = plan.price,
                    style = MaterialTheme.typography.headlineSmall,
                    color = GoldBright,
                )
                plan.oldPrice?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MutedLavender,
                    )
                }
            }
            plan.perMonthHint?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MutedLavender,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

@Composable
fun BillingSubscribeConfirmDialog(
    plan: BillingPlanOption,
    visible: Boolean,
    loading: Boolean,
    onDismiss: () -> Unit,
    onConfirmPay: () -> Unit,
) {
    if (!visible) return

    var agreeOferta by remember(visible) { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = { if (!loading) onDismiss() },
        title = {
            Text(
                text = "Расширенная подписка",
                style = MaterialTheme.typography.titleLarge,
                color = CreamText,
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = plan.confirmLead,
                    style = MaterialTheme.typography.bodyMedium,
                    color = CreamText,
                )
                Text(
                    text = "Стоимость: ${plan.price}",
                    style = MaterialTheme.typography.titleMedium,
                    color = GoldBright,
                )
                Text(
                    text = "В подписку входит:\n" +
                        "• до 25 историй в день\n" +
                        "• DeepSeek V3 — умнее ищет факты и лучше формулирует\n" +
                        "• расширенный Yandex SpeechKit — больше голосов\n" +
                        "• синхронизация истории между устройствами",
                    style = MaterialTheme.typography.bodySmall,
                    color = MutedLavender,
                )
                LegalCheckboxRow(
                    checked = agreeOferta,
                    onCheckedChange = { agreeOferta = it },
                    enabled = !loading,
                    label = {
                        LegalLinkText(
                            prefix = "Принимаю ",
                            links = listOf("публичную оферту" to LegalUrls.OFERTA),
                        )
                    },
                )
            }
        },
        confirmButton = {
            PrimaryStoryButton(
                text = if (loading) "…" else "Оплатить ${plan.price}",
                onClick = onConfirmPay,
                enabled = agreeOferta && !loading,
            )
        },
        dismissButton = {
            SecondaryStoryButton(
                text = "Отмена",
                onClick = onDismiss,
                enabled = !loading,
            )
        },
        containerColor = DeepVoid,
        titleContentColor = CreamText,
        textContentColor = MutedLavender,
    )
}
