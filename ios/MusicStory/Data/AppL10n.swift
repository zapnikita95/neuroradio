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
    var stopStory: String { en ? "Stop the story" : "Остановить историю" }

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
            ? "No saved audio. Listen online once with Extended plan."
            : "Нет сохранённой озвучки. Послушайте трек онлайн с расширенным тарифом."
    }
    var invalidTrack: String { en ? "Invalid track metadata" : "Некорректные метаданные трека" }
    var offlineNoInternet: String {
        en
            ? "No internet. This story is not saved on the phone yet — listen online once with Extended plan."
            : StoryRepository.offlineNoCacheMessageRu
    }

    // MARK: - History

    var historyTitle: String { en ? "History" : "История" }
    var listen: String { en ? "Listen" : "Слушать" }
}

extension StoryRepository {
    static let offlineNoCacheMessageRu =
        "Нет интернета. Эта история ещё не сохранена на телефоне — один раз послушайте онлайн с расширенным тарифом."
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
