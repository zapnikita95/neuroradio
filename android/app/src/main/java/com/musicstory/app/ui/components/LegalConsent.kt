package com.musicstory.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.ClickableText
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.musicstory.app.ui.theme.CreamText
import com.musicstory.app.ui.theme.GoldBright
import com.musicstory.app.ui.theme.MutedLavender

object LegalUrls {
    const val BASE = "https://www.efir-ai.ru/docs"
    const val OFERTA = "$BASE/oferta.html"
    const val PRIVACY = "$BASE/privacy.html"
    const val TERMS = "$BASE/terms.html"
    const val CONSENT = "$BASE/consent.html"
}

@Composable
fun LegalCheckboxRow(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    label: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = onCheckedChange,
            enabled = enabled,
            colors = CheckboxDefaults.colors(
                checkedColor = GoldBright,
                uncheckedColor = MutedLavender,
                checkmarkColor = CreamText,
            ),
        )
        Column(modifier = Modifier.weight(1f)) {
            label()
        }
    }
}

@Composable
fun LegalLinkText(
    prefix: String,
    links: List<Pair<String, String>>,
    suffix: String = "",
    modifier: Modifier = Modifier,
) {
    val uriHandler = LocalUriHandler.current
    val annotated = buildAnnotatedString {
        append(prefix)
        links.forEachIndexed { index, (label, url) ->
            if (index > 0) append(", ")
            pushStringAnnotation(tag = "URL", annotation = url)
            withStyle(
                SpanStyle(
                    color = GoldBright,
                    textDecoration = TextDecoration.Underline,
                ),
            ) {
                append(label)
            }
            pop()
        }
        if (suffix.isNotEmpty()) append(suffix)
    }
    ClickableText(
        text = annotated,
        modifier = modifier,
        style = MaterialTheme.typography.bodySmall.copy(color = MutedLavender),
        onClick = { offset ->
            annotated.getStringAnnotations(tag = "URL", start = offset, end = offset)
                .firstOrNull()
                ?.let { uriHandler.openUri(it.item) }
        },
    )
}

@Composable
fun BillingPaymentConsentBlock(
    agreeOferta: Boolean,
    onAgreeOfertaChange: (Boolean) -> Unit,
    agreePrivacy: Boolean,
    onAgreePrivacyChange: (Boolean) -> Unit,
    agreeConsent: Boolean,
    onAgreeConsentChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        LegalCheckboxRow(
            checked = agreeOferta,
            onCheckedChange = onAgreeOfertaChange,
            enabled = enabled,
            label = {
                LegalLinkText(
                    prefix = "Принимаю ",
                    links = listOf("публичную оферту" to LegalUrls.OFERTA),
                )
            },
        )
        LegalCheckboxRow(
            checked = agreePrivacy,
            onCheckedChange = onAgreePrivacyChange,
            enabled = enabled,
            label = {
                LegalLinkText(
                    prefix = "Принимаю ",
                    links = listOf("политику конфиденциальности" to LegalUrls.PRIVACY),
                )
            },
        )
        LegalCheckboxRow(
            checked = agreeConsent,
            onCheckedChange = onAgreeConsentChange,
            enabled = enabled,
            label = {
                LegalLinkText(
                    prefix = "Согласен с ",
                    links = listOf("обработкой персональных данных" to LegalUrls.CONSENT),
                )
            },
        )
    }
}

@Composable
fun AuthPrivacyConsentRow(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    LegalCheckboxRow(
        checked = checked,
        onCheckedChange = onCheckedChange,
        modifier = modifier,
        enabled = enabled,
        label = {
            LegalLinkText(
                prefix = "Принимаю ",
                links = listOf("политику конфиденциальности" to LegalUrls.PRIVACY),
            )
        },
    )
}

@Composable
fun BillingLegalFooter(modifier: Modifier = Modifier) {
    Text(
        text = "Условия оплаты и использования сервиса:",
        style = MaterialTheme.typography.bodySmall,
        color = MutedLavender,
        modifier = modifier,
    )
    LegalLinkText(
        prefix = "",
        links = listOf(
            "Оферта" to LegalUrls.OFERTA,
            "Соглашение" to LegalUrls.TERMS,
            "Конфиденциальность" to LegalUrls.PRIVACY,
            "Обработка ПДн" to LegalUrls.CONSENT,
        ),
        modifier = modifier,
    )
}
