import Foundation

/// Bilingual user-facing copy for main screens (mirror Android `values` / `values-en`).
struct AppL10n {
    let lang: ResolvedAppLanguage

    private var en: Bool { lang == .en }

    // MARK: - Settings

    var settingsTitle: String { en ? "Settings" : "Настройки" }
    var generalSection: String { en ? "General" : "Общее" }
    var generalSummary: String { en ? "Notifications and Shazam" : "Уведомления и Shazam" }
    var factNotifications: String { en ? "Fact notifications" : "Уведомления о фактах" }
    var speakTrackNames: String { en ? "Track names in voiceover" : "Названия треков в озвучке" }
    var modeSection: String { en ? "Mode" : "Режим" }
    var manualMode: String { en ? "Manual mode" : "Ручной режим" }
    var modeAuto: String { en ? "Auto" : "Авто" }
    var modeManual: String { en ? "Manual" : "Ручной" }
    var triggerSection: String { en ? "Trigger" : "Триггер" }
    func everyNTracks(_ n: Int) -> String {
        en ? "Every N tracks: \(n)" : "Каждые N треков: \(n)"
    }
    var narratorSection: String { en ? "Narrator (persona)" : "Рассказчик (амплуа)" }
    var voiceSection: String { en ? "Voiceover" : "Озвучка" }
    var ttsEngine: String { en ? "Voice engine" : "Движок озвучки" }
    var edgeVoice: String { en ? "Microsoft Edge voice" : "Голос Microsoft Edge" }
    var premiumVoiceIntro: String { en ? "The most realistic AI voices" : "Самые реалистичные нейросетевые голоса" }
    var voice: String { en ? "Voice" : "Голос" }
    var emotion: String { en ? "Intonation" : "Интонация" }
    var speechSpeed: String { en ? "Speech speed" : "Скорость речи" }
    var storyLength: String { en ? "Story length" : "Длина истории" }
    var languageSection: String { en ? "Language" : "Язык" }
    var languageSystem: String { en ? "System" : "Как в системе" }
    var languageRu: String { en ? "Russian" : "Русский" }
    var languageEn: String { en ? "English" : "English" }
    var spotifySection: String { "Spotify" }
    var spotifyConnected: String { en ? "Connected" : "Подключён" }
    var spotifyDisconnected: String { en ? "Not connected" : "Не подключён" }
    var spotifyClientId: String {
        en ? "Client ID from Spotify Developer Dashboard" : "Client ID из Spotify Developer Dashboard"
    }
    var connectSpotify: String { en ? "Connect Spotify" : "Подключить Spotify" }
    var manualSection: String { en ? "Manual input" : "Ручной ввод" }
    var manualSummary: String {
        en ? "Yandex Music and other players" : "Яндекс Музыка и другие плееры"
    }
    var artistField: String { en ? "Artist" : "Артист" }
    var titleField: String { en ? "Title" : "Название" }
    var storyForTrack: String { en ? "Story for this track" : "История для этого трека" }
    var offlinePackPrepare: String { en ? "Prepare pack" : "Подготовить пакет" }

    // MARK: - Home

    var musicPlaying: String { en ? "Music playing" : "Музыка играет" }
    var waitingTrack: String { en ? "Waiting for track" : "Ожидание трека" }
    var listening: String { en ? "Listening…" : "Слушаем…" }
    var preparingStory: String { en ? "Preparing story…" : "Готовим историю…" }
    var playingStory: String { en ? "Playing story" : "Воспроизводим историю" }
    var autoMonitoring: String { en ? "Auto · monitoring" : "Авто · мониторинг" }
    var manualModeStatus: String { en ? "Manual mode" : "Ручной режим" }
    var tellStory: String { en ? "Tell the story" : "Рассказать историю" }
    var generatingStory: String { en ? "Generating story…" : "Генерируем историю…" }
    var storyPlaying: String { en ? "Story playing…" : "История играет…" }
    var storySpokenTranscript: String { en ? "As voiced" : "Как озвучено" }
    var stopStory: String { en ? "Stop the story" : "Остановить историю" }

    // MARK: - Onboarding

    var onboardingWelcomeHeadline: String {
        en
            ? "AI radio host for Spotify\nand Apple Music"
            : "Нейроведущий для Spotify\nи Apple Music"
    }
    var onboardingWelcomeSubtitle: String {
        en
            ? "Voice stories about the track that is playing — without leaving your music app."
            : "На iPhone — Spotify, Apple Music и ShazamKit. Истории голосом, пока играет ваш трек."
    }
    var onboardingNotificationsTitle: String { en ? "Notifications" : "Уведомления" }
    var onboardingNotificationsSubtitle: String {
        en ? "Tell the story button in track alerts" : "Кнопка «Рассказать историю» на push"
    }
    var onboardingSpotifyTitle: String { "Spotify" }
    var onboardingSpotifySubtitle: String {
        en ? "Optional — for automatic mode" : "Опционально — для авто-режима"
    }
    var onboardingAccountTitle: String { en ? "Account" : "Аккаунт" }
    var onboardingAccountSubtitle: String {
        en ? "Telegram or email — history in the cloud" : "Telegram или email — история в облаке"
    }
    var onboardingAllowNotifications: String { en ? "Allow notifications" : "Разрешить уведомления" }
    var onboardingSpotifyHint: String {
        en
            ? "Start a track in Spotify, then confirm access — the app will return on its own."
            : "В Spotify включите трек, затем подтвердите доступ — приложение вернётся само."
    }
    var onboardingSpotifyConnected: String { en ? "Spotify connected" : "Spotify подключён" }
    var onboardingSkip: String { en ? "Skip" : "Пропустить" }
    var onboardingStartWithoutLogin: String { en ? "Continue without signing in" : "Начать без входа" }

    func tracksUntil(_ count: Int) -> String {
        let n = max(0, count)
        guard en else { return UserFacingError.tracksUntilLabel(n) }
        let word = n == 1 ? "track" : "tracks"
        return "Auto · in \(n) \(word)"
    }

    // MARK: - Story errors

    var playbackFailed: String { en ? "Could not play the story" : "Не удалось воспроизвести историю" }
    var playbackRetry: String {
        en ? "Voiceover did not start — try again" : "Озвучка не запустилась — попробуй ещё раз"
    }
    var offlineNoCache: String {
        en
            ? "No saved audio. Listen online once while connected."
            : "Нет сохранённой озвучки. Послушайте трек онлайн при подключении к интернету."
    }
    var invalidTrack: String { en ? "Invalid track metadata" : "Некорректные метаданные трека" }
    var manualTrackRequired: String {
        en ? "Enter artist and title" : "Укажите исполнителя и название"
    }
    var storyFetchTimeout: String {
        en
            ? "Story generation timed out. Check your connection and try again."
            : "История не успела сгенерироваться. Проверь интернет и попробуй ещё раз."
    }
    var offlineNoInternet: String {
        en
            ? "No internet. This story is not saved on the phone yet — listen online once while connected."
            : StoryRepository.offlineNoCacheMessageRu
    }

    // MARK: - History

    var historyTitle: String { en ? "History" : "История" }
    var listen: String { en ? "Listen" : "Слушать" }

    // MARK: - Account

    var accountTab: String { en ? "Account" : "Аккаунт" }
    var subscriptionTab: String { en ? "Subscription" : "Подписка" }
    var accountSignInHint: String {
        en ? "Sign in to sync history across devices." : "Войдите — история сохранится в облаке."
    }
    var accountSignedInSubtitle: String {
        en ? "Cloud history sync is active on this device." : "История синхронизируется в облаке."
    }
    var accountSignIn: String { en ? "Sign in" : "Войти" }
    var accountSignOut: String { en ? "Sign out" : "Выйти" }
    var accountRefreshProfile: String { en ? "Refresh profile" : "Обновить профиль" }
    func accountPlanLabel(_ plan: String) -> String {
        en ? "Plan: \(plan)" : "Тариф: \(plan)"
    }
    var accountDelete: String { en ? "Delete account" : "Удалить аккаунт" }
    var accountDeleteTitle: String { en ? "Delete account?" : "Удалить аккаунт?" }
    var accountDeleteBody: String {
        en
            ? "Your cloud history and profile will be permanently deleted."
            : "Облачная история и профиль будут удалены безвозвратно."
    }
    var accountDeleteConfirm: String { en ? "Delete permanently" : "Удалить навсегда" }
    var accountDeleteCancel: String { en ? "Cancel" : "Отмена" }
    var accountDeleteSuccess: String { en ? "Account deleted" : "Аккаунт удалён" }
    var accountDeleteFailed: String { en ? "Could not delete account" : "Не удалось удалить аккаунт" }

    // MARK: - Billing

    var billingTitle: String { en ? "Extended" : "Расширенный" }
    var billingIntro: String {
        en
            ? "For daily listeners: more stories, smarter model, premium voices."
            : "Для тех, кто слушает много: больше историй, умнее модель, больше голосов."
    }
    var billingPitch: String {
        en
            ? "DeepSeek V3 finds sharper facts and cleaner scripts. ElevenLabs for premium voices. History syncs across phones with the same email."
            : "DeepSeek V3 лучше находит факты и формулирует текст. ElevenLabs — премиум-голоса. История синхронизируется между устройствами с одним email."
    }
    var billingPlansHeading: String { en ? "Choose billing period" : "Выберите период" }
    var billingSubscribe: String { en ? "Subscribe" : "Оформить подписку" }
    var billingRestorePurchases: String { en ? "Restore Purchases" : "Восстановить покупки" }
    var billingRestoreNone: String {
        en ? "No active subscription found for this Apple ID" : "Активная подписка для этого Apple ID не найдена"
    }
    var billingRestoreSuccess: String {
        en ? "Subscription restored" : "Подписка восстановлена"
    }
    var billingProcessing: String { "…" }
    var billingSuccess: String { en ? "Subscription activated" : "Подписка активирована" }
    var billingEmailRequired: String {
        en ? "Enter email to activate subscription" : "Укажите email для активации подписки"
    }
    var billingPaymentFailed: String {
        en ? "Could not create payment" : "Не удалось создать платёж"
    }
    var billingAppStoreHint: String {
        en
            ? "Payment via App Store. Manage in Settings → Apple ID → Subscriptions."
            : "Оплата через App Store. Управление — Настройки → Apple ID → Подписки."
    }
    var billingCrossPlatformHint: String {
        "Уже оформили подписку на efir-ai.ru или в Android? Войдите с тем же email — доступ активируется автоматически."
    }
    var billingMvpExternalOnly: String {
        "Оплата в приложении iOS временно недоступна. Расширенный тариф оформляется на сайте efir-ai.ru."
    }
    var billingCrossPlatformSignIn: String { en ? "Sign in" : "Войти" }
    var billingYookassaHint: String {
        en
            ? "Payment in rubles via YooKassa in the browser. Sign in with the same email after payment."
            : "Оплата в рублях через ЮKassa в браузере. После оплаты войдите тем же email в приложении."
    }
    var billingYookassaOpened: String {
        en
            ? "Complete payment in the browser, then sign in with the same email."
            : "Откройте браузер для оплаты. После оплаты войдите тем же email."
    }
    var billingAppStoreLegal: String {
        en
            ? "Payment will be charged to your Apple ID account. Subscription renews automatically unless canceled at least 24 hours before the end of the period. Manage in Settings → Apple ID → Subscriptions."
            : "Оплата списывается с Apple ID. Подписка продлевается автоматически, если не отменить её минимум за 24 часа до конца периода. Управление — Настройки → Apple ID → Подписки."
    }
    var billingEmailField: String { en ? "Email" : "Email" }
    var billingPremiumFeature1: String {
        en ? "Up to 25 stories per day" : "До 25 историй в день"
    }
    var billingPremiumFeature2: String {
        en ? "DeepSeek V3 for stories" : "DeepSeek V3 для историй"
    }
    var billingPremiumFeature3: String {
        en ? "ElevenLabs premium voices" : "ElevenLabs — премиум-голоса"
    }
    var billingPremiumFeature4: String {
        en ? "Sync across devices" : "Синхронизация между устройствами"
    }
    var billingPlanMonth: String { en ? "Extended · Month" : "Расширенный · Месяц" }
    var billingPlanQuarter: String { en ? "Extended · Quarter" : "Расширенный · Квартал" }
    var billingPlanYear: String { en ? "Extended Year USD" : "Расширенный · Год" }
    var billingPlanMonthDuration: String {
        en ? "1 month, auto-renewing" : "1 месяц, автопродление"
    }
    var billingPlanQuarterDuration: String {
        en ? "3 months, auto-renewing" : "3 месяца, автопродление"
    }
    var billingPlanYearDuration: String {
        en ? "1 year, auto-renewing" : "1 год, автопродление"
    }
    var billingBestValue: String { en ? "Best value" : "Выгоднее всего" }
    var billingPrivacyPolicy: String { en ? "Privacy Policy" : "Политика конфиденциальности" }
    var billingTermsOfUse: String { en ? "Terms of Use (EULA)" : "Пользовательское соглашение (EULA)" }
    var billingLegalLinksHint: String {
        en
            ? "Before subscribing, review our:"
            : "Перед оформлением подписки ознакомьтесь с:"
    }
    var settingsSubscriptionSection: String { en ? "Subscription" : "Подписка" }
    var settingsSubscriptionSummary: String {
        en ? "Extended plan — App Store" : "Тариф «Расширенный» — App Store"
    }
    var settingsOpenSubscription: String {
        en ? "View plans and subscribe" : "Тарифы и оформление подписки"
    }
}

extension StoryRepository {
    static let offlineNoCacheMessageRu =
        "Нет интернета. Эта история ещё не сохранена на телефоне — один раз послушайте онлайн при подключении к сети."
}

extension AppStrings {
    static func l10n(_ lang: ResolvedAppLanguage) -> AppL10n { AppL10n(lang: lang) }

    static func offlinePackTitle(_ lang: ResolvedAppLanguage) -> String {
        lang == .en ? "Offline broadcast" : OfflinePack.title
    }

    static func offlinePackIntro(_ lang: ResolvedAppLanguage) -> String {
        lang == .en
            ? "Collect 10 different tracks — the app prepares stories in advance. Listen without internet later."
            : OfflinePack.intro
    }

    static func offlinePackStart(_ lang: ResolvedAppLanguage) -> String {
        lang == .en ? "Prepare offline broadcast" : OfflinePack.start
    }

    static func offlinePackCancel(_ lang: ResolvedAppLanguage) -> String {
        lang == .en ? "Cancel" : OfflinePack.cancel
    }

    static func offlinePackRefresh(_ lang: ResolvedAppLanguage) -> String {
        lang == .en ? "Build new pack" : OfflinePack.refresh
    }

    static func offlinePackCollectingHint(_ lang: ResolvedAppLanguage) -> String {
        lang == .en
            ? "Enable shuffle or skip tracks in the player. Each new track is added to the pack."
            : OfflinePack.collectingHint
    }

    static func offlinePackReadyHint(_ lang: ResolvedAppLanguage) -> String {
        lang == .en
            ? "When a pack track plays, Broadcast AI tells the saved story offline."
            : OfflinePack.readyHint
    }

    static func offlinePackProgress(collected: Int, target: Int, lang: ResolvedAppLanguage) -> String {
        lang == .en ? "\(collected) of \(target)" : OfflinePack.progress(collected: collected, target: target)
    }

    static func offlinePackGenerating(ready: Int, target: Int, lang: ResolvedAppLanguage) -> String {
        lang == .en
            ? "Preparing stories… \(ready) of \(target)"
            : OfflinePack.generating(ready: ready, target: target)
    }

    static func offlinePackReady(count: Int, lang: ResolvedAppLanguage) -> String {
        lang == .en
            ? "Ready! \(count) stories on your phone — listen offline."
            : OfflinePack.ready(count: count)
    }

    static func offlinePackTracksReadyBody(count: Int, lang: ResolvedAppLanguage) -> String {
        lang == .en
            ? "Preparing \(count) stories in the background — we'll notify when done."
            : OfflinePack.tracksReadyBody(count: count)
    }

    static func shazamHomeIdle(_ lang: ResolvedAppLanguage) -> String {
        lang == .en
            ? "Spotify and Apple Music — automatic. Other players — round Shazam button on the right."
            : Shazam.homeIdleSubtitle
    }

    static func shazamAutoDetectTitle(_ lang: ResolvedAppLanguage) -> String {
        lang == .en ? "Shazam for other players" : Shazam.autoDetectTitle
    }

    static func shazamAutoDetectHint(_ lang: ResolvedAppLanguage) -> String {
        lang == .en
            ? "While another player runs: short Shazam (~10 s), then pause for track length. Music stops — Shazam off."
            : Shazam.autoDetectHint
    }
}

extension UserFacingError {
    static func message(for text: String, lang: ResolvedAppLanguage) -> String {
        if looksTechnical(text) {
            return lang == .en
                ? "Something went wrong. Please try again."
                : "Что-то пошло не так. Попробуйте ещё раз."
        }
        return text
    }

    static func message(for error: Error, lang: ResolvedAppLanguage) -> String {
        if let localized = error as? LocalizedError, let text = localized.errorDescription, !text.isEmpty {
            if !looksTechnical(text) { return text }
        }
        return message(for: error as NSError, lang: lang)
    }

    static func message(for error: NSError, lang: ResolvedAppLanguage) -> String {
        let en = lang == .en
        if error.domain == NSURLErrorDomain {
            switch error.code {
            case NSURLErrorTimedOut:
                return en
                    ? "Server is taking too long. Try again in a minute."
                    : "Сервер долго не отвечает. Попробуйте ещё раз через минуту."
            case NSURLErrorSecureConnectionFailed,
                 NSURLErrorServerCertificateUntrusted,
                 NSURLErrorServerCertificateHasBadDate,
                 NSURLErrorServerCertificateNotYetValid:
                return en
                    ? "Could not connect to the server. Check internet and update the app."
                    : "Не удалось подключиться к серверу. Проверьте интернет и обновите приложение."
            case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost:
                return en
                    ? "No internet. Check Wi‑Fi or mobile data."
                    : "Нет интернета. Проверьте Wi‑Fi или мобильную сеть."
            case NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed:
                return en
                    ? "Server unavailable. Check your connection."
                    : "Сервер недоступен. Проверьте интернет."
            default:
                break
            }
        }

        if error.domain == "com.apple.coreaudio.avfaudio" || error.domain.contains("coreaudio") {
            return en
                ? "Could not use the microphone. Close other music apps and try again."
                : "Не удалось включить микрофон. Закройте другие приложения с музыкой и попробуйте снова."
        }

        let raw = error.localizedDescription
        if raw.localizedCaseInsensitiveContains("превышен лимит времени") ||
            raw.localizedCaseInsensitiveContains("timed out") {
            return en
                ? "Server is taking too long. Try again in a minute."
                : "Сервер долго не отвечает. Попробуйте ещё раз через минуту."
        }

        if looksTechnical(raw) {
            return en
                ? "Something went wrong. Please try again."
                : "Что-то пошло не так. Попробуйте ещё раз."
        }
        return raw
    }
}
