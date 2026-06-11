import java.io.File
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
}

val localBuildDir = File(System.getenv("LOCALAPPDATA") ?: System.getProperty("java.io.tmpdir"), "MusicStoryBuild/app")
layout.buildDirectory.set(localBuildDir)

val keystorePropertiesFile = rootProject.layout.projectDirectory.file("keystore.properties").asFile
val keystoreProperties = Properties()
val hasReleaseKeystore = keystorePropertiesFile.isFile
if (hasReleaseKeystore) {
    val lines = keystorePropertiesFile.readLines(Charsets.UTF_8)
    lines.forEach { line ->
        val clean = line.trim().removePrefix("\uFEFF")
        val sep = clean.indexOf('=')
        if (sep > 0) {
            keystoreProperties[clean.substring(0, sep).trim()] = clean.substring(sep + 1).trim()
        }
    }
}

android {
    namespace = "com.musicstory.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.efirai.myapp"
        minSdk = 26
        targetSdk = 35
        versionCode = 103
        versionName = "1.5.65"

        buildConfigField("String", "VERSION_NAME", "\"$versionName\"")
        buildConfigField("int", "VERSION_CODE", "$versionCode")

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        ndk {
            debugSymbolLevel = "SYMBOL_TABLE"
        }
    }

    signingConfigs {
        getByName("debug") {
            storeFile = file("keystore/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        if (hasReleaseKeystore) {
            create("release") {
                val storeFileProp = keystoreProperties.getProperty("storeFile")?.trim()
                require(!storeFileProp.isNullOrBlank()) { "keystore.properties: storeFile is missing" }
                storeFile = file(storeFileProp)
                storePassword = keystoreProperties.getProperty("storePassword")?.trim()
                keyAlias = keystoreProperties.getProperty("keyAlias")?.trim()
                keyPassword = keystoreProperties.getProperty("keyPassword")?.trim()
                require(storeFile?.exists() == true) { "Release keystore not found: ${storeFile?.absolutePath}" }
            }
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("debug")
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            if (hasReleaseKeystore) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }
}

afterEvaluate {
    val projectRoot = rootProject.rootDir.parentFile

    fun exportApk(variantFolder: String, apkFileName: String, destFileName: String) {
        val apk = layout.buildDirectory.file("outputs/apk/$variantFolder/$apkFileName").get().asFile
        if (!apk.exists()) return
        val dest = projectRoot.resolve(destFileName)
        apk.copyTo(dest, overwrite = true)
        logger.lifecycle("APK → ${dest.absolutePath}")
        if (destFileName == "efir-ai.apk") {
            val siteApk = projectRoot.resolve("website/efir-ai.apk")
            apk.copyTo(siteApk, overwrite = true)
            logger.lifecycle("APK → ${siteApk.absolutePath}")
        }
    }

    tasks.matching { it.name == "assembleDebug" }.configureEach {
        doLast { exportApk("debug", "app-debug.apk", "efir-ai.apk") }
    }

    tasks.matching { it.name == "assembleRelease" }.configureEach {
        doLast { exportApk("release", "app-release.apk", "efir-ai-release.apk") }
    }

    tasks.matching { it.name == "bundleRelease" }.configureEach {
        doLast {
            val aab = layout.buildDirectory.file("outputs/bundle/release/app-release.aab").get().asFile
            if (!aab.exists()) return@doLast
            val dest = projectRoot.resolve("efir-ai.aab")
            aab.copyTo(dest, overwrite = true)
            logger.lifecycle("AAB → ${dest.absolutePath}")
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.service)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation("androidx.compose.foundation:foundation")
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    implementation(libs.androidx.navigation.compose)

    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.gson)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)

    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.session)

    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.security.crypto)
    implementation(libs.billing.ktx)

    testImplementation(libs.junit4)
}
