package com.musicstory.app.security

import android.util.Base64
import org.json.JSONObject
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

object ClientSecretsCipher {
    private const val PREFIX = "v1:"

    fun encrypt(transportKeyBase64Url: String, secrets: Map<String, String>): String {
        if (secrets.isEmpty()) return ""
        val key = decodeTransportKey(transportKeyBase64Url)
        val json = JSONObject()
        secrets.forEach { (k, v) ->
            if (v.isNotBlank()) json.put(k, v.trim())
        }
        val plaintext = json.toString().toByteArray(Charsets.UTF_8)
        val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        val out = cipher.doFinal(plaintext)
        val tagLen = 16
        require(out.size > tagLen)
        val ct = out.copyOfRange(0, out.size - tagLen)
        val tag = out.copyOfRange(out.size - tagLen, out.size)
        val packed = iv + tag + ct
        return PREFIX + Base64.encodeToString(packed, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
    }

    private fun decodeTransportKey(transportKeyBase64Url: String): ByteArray {
        val raw = transportKeyBase64Url.trim()
        val decoded = Base64.decode(raw, Base64.URL_SAFE or Base64.NO_WRAP)
        require(decoded.size == 32) { "Invalid secrets transport key length" }
        return decoded
    }
}
