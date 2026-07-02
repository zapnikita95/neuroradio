package com.musicstory.app.ui.share

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
import android.graphics.Typeface
import androidx.core.content.FileProvider
import com.musicstory.app.R
import com.musicstory.app.domain.StoryNarrator
import com.musicstory.app.domain.StoryShareText
import java.io.File
import java.io.FileOutputStream

object StoryShareCardRenderer {
    private const val W = 1080
    private const val H = 1350

    private val narratorDrawable = mapOf(
        "radio_host" to R.drawable.persona_radio_host,
        "night_dj" to R.drawable.persona_night_dj,
        "expert" to R.drawable.persona_expert,
        "contemporary" to R.drawable.persona_contemporary,
        "fan" to R.drawable.persona_fan,
        "backstage" to R.drawable.persona_backstage,
    )

    fun render(
        context: Context,
        artist: String,
        title: String,
        voicedText: String,
        narratorId: String?,
        variant: Int,
    ): Bitmap {
        val bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)

        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = LinearGradient(
                0f, 0f, W.toFloat(), H.toFloat(),
                intArrayOf(0xFF08070F.toInt(), 0xFF2A1450.toInt(), 0xFF5A1A4A.toInt()),
                null,
                Shader.TileMode.CLAMP,
            )
        }
        canvas.drawRect(0f, 0f, W.toFloat(), H.toFloat(), bgPaint)

        val accentPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0x33FF5DA2
        }
        canvas.drawCircle(W * 0.85f, H * 0.12f, 220f, accentPaint)
        canvas.drawCircle(W * 0.1f, H * 0.88f, 180f, accentPaint)

        val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFF3EEFB.toInt()
            textSize = 52f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val artistPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFFFB86B.toInt()
            textSize = 40f
        }
        val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFE8E0F5.toInt()
            textSize = 36f
        }
        val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFA99FC4.toInt()
            textSize = 28f
        }
        val brandPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFC084FC.toInt()
            textSize = 30f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }

        val narrator = StoryNarrator.fromId(narratorId)
        val narratorLabel = if (narrator == StoryNarrator.AUTO) "Эфир AI" else narrator.labelRu
        val excerpt = StoryShareText.excerpt(voicedText, 300)
        val trackLine = "$artist — $title"

        val personaRes = narratorDrawable[narrator.id] ?: R.drawable.logo_efir_ai
        val personaBmp = android.graphics.BitmapFactory.decodeResource(context.resources, personaRes)
        val avatarSize = 280
        val scaledAvatar = Bitmap.createScaledBitmap(personaBmp, avatarSize, avatarSize, true)

        val logoBmp = android.graphics.BitmapFactory.decodeResource(context.resources, R.drawable.logo_efir_ai)
        val logoSize = 72
        val scaledLogo = Bitmap.createScaledBitmap(logoBmp, logoSize, logoSize, true)

        val pad = 64f
        val textLeft: Float
        val textTop: Float
        val textWidth: Float
        val avatarLeft: Float
        val avatarTop: Float

        when (variant % 4) {
            0 -> {
                avatarLeft = pad
                avatarTop = pad + 40f
                textLeft = pad + avatarSize + 40f
                textTop = pad + 20f
                textWidth = W - textLeft - pad
            }
            1 -> {
                avatarLeft = W - pad - avatarSize
                avatarTop = pad + 40f
                textLeft = pad
                textTop = pad + 20f
                textWidth = W - avatarSize - pad * 2 - 40f
            }
            2 -> {
                avatarLeft = (W - avatarSize) / 2f
                avatarTop = pad
                textLeft = pad
                textTop = pad + avatarSize + 48f
                textWidth = W - pad * 2
            }
            else -> {
                avatarLeft = W - pad - avatarSize
                avatarTop = H - pad - avatarSize - 120f
                textLeft = pad
                textTop = pad + 20f
                textWidth = W - pad * 2
            }
        }

        val avatarPath = Path().apply {
            addCircle(
                avatarLeft + avatarSize / 2f,
                avatarTop + avatarSize / 2f,
                avatarSize / 2f,
            )
        }
        canvas.save()
        canvas.clipPath(avatarPath)
        canvas.drawBitmap(scaledAvatar, avatarLeft, avatarTop, null)
        canvas.restore()

        var y = textTop
        y += drawWrapped(canvas, trackLine, textLeft, y, textWidth, titlePaint, 2)
        y += 16f
        y += drawWrapped(canvas, excerpt, textLeft, y, textWidth, bodyPaint, 8)
        y += 24f
        canvas.drawText(narratorLabel, textLeft, y, labelPaint)

        canvas.drawBitmap(scaledLogo, pad, H - pad - logoSize - 8f, null)
        canvas.drawText("Эфир AI", pad + logoSize + 16f, H - pad - 16f, brandPaint)

        personaBmp.recycle()
        scaledAvatar.recycle()
        logoBmp.recycle()
        scaledLogo.recycle()
        return bmp
    }

    private fun drawWrapped(
        canvas: Canvas,
        text: String,
        x: Float,
        startY: Float,
        maxWidth: Float,
        paint: Paint,
        maxLines: Int,
    ): Float {
        val words = text.split(Regex("\\s+"))
        var line = StringBuilder()
        var y = startY
        var lines = 0
        for (word in words) {
            val trial = if (line.isEmpty()) word else "$line $word"
            if (paint.measureText(trial) > maxWidth && line.isNotEmpty()) {
                canvas.drawText(line.toString(), x, y, paint)
                y += paint.textSize * 1.35f
                lines++
                if (lines >= maxLines) return y - startY
                line = StringBuilder(word)
            } else {
                line = StringBuilder(trial)
            }
        }
        if (line.isNotEmpty() && lines < maxLines) {
            canvas.drawText(line.toString(), x, y, paint)
            y += paint.textSize * 1.35f
        }
        return y - startY
    }
}

object StoryShareHelper {
    fun shareStory(
        context: Context,
        artist: String,
        title: String,
        voicedText: String,
        narratorId: String?,
        trackKey: String,
        playedAt: Long,
    ) {
        val variant = StoryShareText.cardVariantSeed(trackKey, playedAt)
        val bitmap = StoryShareCardRenderer.render(
            context = context,
            artist = artist,
            title = title,
            voicedText = voicedText,
            narratorId = narratorId,
            variant = variant,
        )
        val cacheDir = File(context.cacheDir, "share").apply { mkdirs() }
        val file = File(cacheDir, "story-share-${System.currentTimeMillis()}.png")
        FileOutputStream(file).use { out ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 95, out)
        }
        bitmap.recycle()

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file,
        )
        val text = StoryShareText.plainShareMessage(artist, title, voicedText)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TEXT, text)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, context.getString(R.string.action_share_story)))
    }
}
