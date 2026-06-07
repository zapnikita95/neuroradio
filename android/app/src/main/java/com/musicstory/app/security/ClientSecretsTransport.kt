package com.musicstory.app.security

import com.musicstory.app.data.model.LlmProbeRequest
import com.musicstory.app.data.model.StoryRequest

object ClientSecretsTransport {

    fun wrapStoryRequest(transportKey: String?, request: StoryRequest): StoryRequest {
        val enc = encryptSecrets(
            transportKey,
            buildMap {
                request.groqApiKey?.takeIf { it.isNotBlank() }?.let { put("groq_api_key", it) }
                request.geminiApiKey?.takeIf { it.isNotBlank() }?.let { put("gemini_api_key", it) }
                request.openRouterApiKey?.takeIf { it.isNotBlank() }?.let { put("openrouter_api_key", it) }
                request.yandexApiKey?.takeIf { it.isNotBlank() }?.let { put("yandex_api_key", it) }
                request.yandexFolderId?.takeIf { it.isNotBlank() }?.let { put("yandex_folder_id", it) }
                request.saluteAuthKey?.takeIf { it.isNotBlank() }?.let { put("salute_auth_key", it) }
            },
        ) ?: return request
        return request.copy(
            clientSecretsEnc = enc,
            groqApiKey = null,
            geminiApiKey = null,
            openRouterApiKey = null,
            yandexApiKey = null,
            yandexFolderId = null,
            saluteAuthKey = null,
        )
    }

    fun wrapProbeRequest(transportKey: String?, request: LlmProbeRequest): LlmProbeRequest {
        val enc = encryptSecrets(
            transportKey,
            buildMap {
                request.groqApiKey?.takeIf { it.isNotBlank() }?.let { put("groq_api_key", it) }
                request.geminiApiKey?.takeIf { it.isNotBlank() }?.let { put("gemini_api_key", it) }
                request.openRouterApiKey?.takeIf { it.isNotBlank() }?.let { put("openrouter_api_key", it) }
            },
        ) ?: return request
        return request.copy(
            groqApiKey = null,
            geminiApiKey = null,
            openRouterApiKey = null,
            clientSecretsEnc = enc,
        )
    }

    private fun encryptSecrets(transportKey: String?, secrets: Map<String, String>): String? {
        val key = transportKey?.trim().orEmpty()
        if (key.isBlank() || secrets.isEmpty()) return null
        return ClientSecretsCipher.encrypt(key, secrets)
    }
}
