package com.musicstory.app.security

import android.content.Context
import android.content.pm.Signature
import android.content.pm.PackageManager
import android.os.Build
import java.io.ByteArrayInputStream
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate

object AppSigning {

    fun certSha256(context: Context): String? {
        return try {
            val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                context.packageManager.getPackageInfo(
                    context.packageName,
                    PackageManager.GET_SIGNING_CERTIFICATES,
                )
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(
                    context.packageName,
                    PackageManager.GET_SIGNATURES,
                )
            }

            val certBytes = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val signatures = packageInfo.signingInfo?.apkContentsSigners
                signatures?.firstOrNull()?.let { certBytesFromSignature(it) }
            } else {
                @Suppress("DEPRECATION")
                packageInfo.signatures?.firstOrNull()?.let { certBytesFromSignature(it) }
            } ?: return null

            val digest = MessageDigest.getInstance("SHA-256")
            digest.digest(certBytes).joinToString("") { byte -> "%02x".format(byte) }
        } catch (_: Exception) {
            null
        }
    }

    private fun certBytesFromSignature(signature: Signature): ByteArray {
        val factory = CertificateFactory.getInstance("X509")
        val cert = factory.generateCertificate(ByteArrayInputStream(signature.toByteArray())) as X509Certificate
        return cert.encoded
    }
}
