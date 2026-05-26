package com.musicstory.app.domain

data class GeminiPaidModelReference(
    val id: String,
    val labelRu: String,
)

enum class GeminiModel(
    val id: String,
    val labelRu: String,
    val descriptionRu: String,
    val recommended: Boolean = false,
) {
    FLASH_LITE_20(
        id = "gemini-2.0-flash-lite",
        labelRu = "Gemini 2.0 Flash-Lite",
        descriptionRu = "Быстрая, щадящая к лимитам",
        recommended = true,
    ),
    FLASH_20(
        id = "gemini-2.0-flash",
        labelRu = "Gemini 2.0 Flash",
        descriptionRu = "Баланс скорости и качества",
    ),
    FLASH_LITE_25(
        id = "gemini-2.5-flash-lite",
        labelRu = "Gemini 2.5 Flash-Lite",
        descriptionRu = "Новее; на free tier часто жёстче RPM, чем 2.0 Flash-Lite",
    ),
    FLASH_25(
        id = "gemini-2.5-flash",
        labelRu = "Gemini 2.5 Flash",
        descriptionRu = "Сильнее, но free RPM ниже — при 429 выбери 2.0 Flash-Lite",
    ),
    ;

    val settingsLabelRu: String
        get() = when {
            recommended -> "$labelRu · бесплатная · оптимальная"
            else -> "$labelRu · бесплатная"
        }

    companion object {
        val paidReferences: List<GeminiPaidModelReference> = listOf(
            GeminiPaidModelReference("gemini-2.5-pro", "Gemini 2.5 Pro"),
            GeminiPaidModelReference("gemini-2.0-pro", "Gemini 2.0 Pro"),
        )

        fun fromId(id: String?): GeminiModel =
            entries.firstOrNull { it.id == id?.trim() } ?: FLASH_LITE_20

        val defaultRecommended: GeminiModel get() = FLASH_LITE_20
    }
}
