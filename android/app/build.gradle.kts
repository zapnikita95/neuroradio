import java.io.File

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
}

val localBuildDir = File(System.getenv("LOCALAPPDATA") ?: System.getProperty("java.io.tmpdir"), "MusicStoryBuild/app")
layout.buildDirectory.set(localBuildDir)

android {
    namespace = "com.musicstory.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.musicstory.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 73
        versionName = "1.5.35"

        buildConfigField("String", "VERSION_NAME", "\"$versionName\"")
        buildConfigField("int", "VERSION_CODE", "$versionCode")

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
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

    signingConfigs {
        getByName("debug") {
            storeFile = file("keystore/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
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
    }

    tasks.matching { it.name == "assembleDebug" }.configureEach {
        doLast { exportApk("debug", "app-debug.apk", "MusicStory.apk") }
    }

    tasks.matching { it.name == "assembleRelease" }.configureEach {
        doLast { exportApk("release", "app-release.apk", "MusicStory-release.apk") }
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

    testImplementation(libs.junit4)
}
