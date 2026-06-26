import Foundation

enum StoryNarrator: String, CaseIterable, Identifiable {
    case auto
    case radioHost = "radio_host"
    case contemporary
    case expert
    case fan
    case backstage
    case nightDj = "night_dj"

    var id: String { rawValue }

    var labelRu: String {
        switch self {
        case .auto: return "Авто"
        case .radioHost: return "Радиоведущий"
        case .contemporary: return "Современник эпохи"
        case .expert: return "Эксперт жанра"
        case .fan: return "Фанат-коллекционер"
        case .backstage: return "С закулисья"
        case .nightDj: return "Ночной диджей"
        }
    }

    var descriptionRu: String {
        switch self {
        case .auto: return "Персонаж подбирается по жанру и эпохе трека"
        case .radioHost: return "Тёплый эфирный тон: живо, но по факту"
        case .contemporary: return "Ностальгия от первого лица — ты жил, когда трек вышел"
        case .expert: return "Подкастовая экспертиза — механика жанра, не лекция"
        case .fan: return "Восторженный фанат от первого лица — обожает артиста и знает детали"
        case .backstage: return "Инсайдерский тон — только если в факте есть курьёз"
        case .nightDj: return "Тихий ночной эфир — факт чёткий, темп медленный"
        }
    }

    static func fromId(_ id: String?) -> StoryNarrator {
        guard let id, let value = StoryNarrator(rawValue: id) else { return .auto }
        return value
    }
}

enum StoryLength: String, CaseIterable, Identifiable {
    case sec30 = "30s"
    case sec60 = "60s"
    case unlimited

    var id: String { rawValue }

    var labelRu: String {
        switch self {
        case .sec30: return "30 секунд"
        case .sec60: return "1 минута"
        case .unlimited: return "Не ограничено"
        }
    }

    var descriptionRu: String {
        switch self {
        case .sec30: return "Короткая история — быстрый темп"
        case .sec60: return "Основной режим — около минуты голосом"
        case .unlimited: return "Развёрнутая история — дольше и подробнее"
        }
    }

    static func fromId(_ id: String?) -> StoryLength {
        guard let id else { return .sec60 }
        if id == "15s" { return .sec30 }
        return StoryLength(rawValue: id) ?? .sec60
    }
}

enum TtsSpeed: String, CaseIterable, Identifiable {
    case verySlow = "very_slow"
    case slow
    case normal
    case fast
    case veryFast = "very_fast"

    var id: String { rawValue }

    var labelRu: String {
        switch self {
        case .verySlow: return "Очень медленно"
        case .slow: return "Медленно"
        case .normal: return "Нормально"
        case .fast: return "Быстро"
        case .veryFast: return "Очень быстро"
        }
    }

    var yandexSpeed: Float {
        switch self {
        case .verySlow: return 0.88
        case .slow: return 1.0
        case .normal: return 1.15
        case .fast: return 1.32
        case .veryFast: return 1.48
        }
    }

    var speechRate: Float {
        switch self {
        case .verySlow: return 0.84
        case .slow: return 0.92
        case .normal: return 1.08
        case .fast: return 1.22
        case .veryFast: return 1.35
        }
    }

    static func fromId(_ id: String?) -> TtsSpeed {
        guard let id, let value = TtsSpeed(rawValue: id) else { return .normal }
        return value
    }

    static func fromLegacyFloat(_ value: Float) -> TtsSpeed {
        let presets: [(TtsSpeed, Float)] = TtsSpeed.allCases.map { ($0, $0.speechRate) }
        return presets.min(by: { abs($0.1 - value) < abs($1.1 - value) })?.0 ?? .normal
    }
}

enum TtsEmotion: String, CaseIterable, Identifiable {
    case neutral
    case good
    case evil

    var id: String { rawValue }

    var labelRu: String {
        switch self {
        case .neutral: return "Нейтральная"
        case .good: return "Живая"
        case .evil: return "Строгая"
        }
    }

    var descriptionRu: String {
        switch self {
        case .neutral: return "Ровная, спокойная подача"
        case .good: return "Дружелюбная, тёплая интонация"
        case .evil: return "Жёсткая, драматичная — для строгих голосов"
        }
    }

    static func fromId(_ id: String?) -> TtsEmotion {
        guard let id, let value = TtsEmotion(rawValue: id) else { return .good }
        return value
    }
}

enum TtsVoice: String, CaseIterable, Identifiable {
    case auto
    case alena, filipp, ermil, jane, omazh, zahar, marina, dasha

    var id: String { rawValue }

    var labelRu: String {
        switch self {
        case .auto: return "Авто"
        case .alena: return "Алёна"
        case .filipp: return "Филипп"
        case .ermil: return "Ермил"
        case .jane: return "Джейн"
        case .omazh: return "Омаж"
        case .zahar: return "Захар"
        case .marina: return "Марина"
        case .dasha: return "Даша"
        }
    }

    var descriptionRu: String {
        switch self {
        case .auto: return "Голос подбирается по эпохе и жанру трека"
        case .alena: return "женский, мягкий и дружелюбный"
        case .filipp: return "мужской, ровный и приятный"
        case .ermil: return "мужской, нейтральный и спокойный"
        case .jane: return "женский, строгий и чёткий"
        case .omazh: return "женский, строгий и драматичный"
        case .zahar: return "мужской, строгий и уверенный"
        case .marina: return "женский, тёплый и мягкий"
        case .dasha: return "женский, живой и современный"
        }
    }

    var supportsEvil: Bool {
        switch self {
        case .jane, .omazh, .zahar: return true
        case .auto, .alena, .filipp, .ermil, .marina, .dasha: return false
        }
    }

    static func fromId(_ id: String?) -> TtsVoice {
        guard let id, let value = TtsVoice(rawValue: id) else { return .auto }
        return value
    }
}

enum ServerTtsProvider: String, CaseIterable, Identifiable {
    case edge
    case yandex
    case elevenlabs

    var id: String { rawValue }

    var labelRu: String {
        switch self {
        case .edge: return "Microsoft Edge"
        case .yandex: return "Yandex SpeechKit"
        case .elevenlabs: return "ElevenLabs"
        }
    }

    var descriptionRu: String {
        switch self {
        case .edge: return "Нейросетевые голоса Edge"
        case .yandex: return "Профессиональная озвучка SpeechKit"
        case .elevenlabs: return "Премиум нейросетевые голоса для английских историй"
        }
    }

    static func fromId(_ id: String?) -> ServerTtsProvider {
        guard let id, let value = ServerTtsProvider(rawValue: id) else { return .edge }
        return value
    }

    static func options(for lang: ResolvedAppLanguage, premium: Bool) -> [ServerTtsProvider] {
        guard premium else { return [] }
        switch lang {
        case .en:
            return [.edge, .elevenlabs, .yandex]
        case .ru:
            return [.edge, .yandex]
        }
    }
}

enum EdgeVoicePreset: String, CaseIterable, Identifiable {
    case dmitryCalm = "dmitry_calm"
    case svetlanaCalm = "svetlana_calm"
    case dmitryLively = "dmitry_lively"
    case svetlanaLively = "svetlana_lively"
    case daria = "daria"

    var id: String { rawValue }

    var labelRu: String {
        switch self {
        case .dmitryCalm: return "Дмитрий — спокойный"
        case .svetlanaCalm: return "Светлана — спокойная"
        case .dmitryLively: return "Дмитрий — бодрый"
        case .svetlanaLively: return "Светлана — живая"
        case .daria: return "Дария — мягкая"
        }
    }

    var descriptionRu: String {
        switch self {
        case .dmitryCalm: return "Ровный мужской голос Microsoft Edge"
        case .svetlanaCalm: return "Нейтральный женский голос Microsoft Edge"
        case .dmitryLively: return "Энергичная мужская подача, ближе к радио"
        case .svetlanaLively: return "Выразительный женский голос"
        case .daria: return "Мягкий женский тембр Microsoft Edge"
        }
    }

    static func fromId(_ id: String?) -> EdgeVoicePreset {
        guard let id, let value = EdgeVoicePreset(rawValue: id) else { return .svetlanaCalm }
        return value
    }
}

enum ElevenLabsVoice: String, CaseIterable, Identifiable {
    case auto
    case rachel
    case adam
    case antoni
    case bella
    case elli
    case josh
    case sam
    case emily
    case charlie
    case matilda

    var id: String { rawValue }

    func uiLabel(_ lang: ResolvedAppLanguage) -> String {
        guard lang == .en else { return labelRu }
        switch self {
        case .auto: return "Auto"
        case .rachel: return "Rachel"
        case .adam: return "Adam"
        case .antoni: return "Antoni"
        case .bella: return "Bella"
        case .elli: return "Elli"
        case .josh: return "Josh"
        case .sam: return "Sam"
        case .emily: return "Emily"
        case .charlie: return "Charlie"
        case .matilda: return "Matilda"
        }
    }

    func uiDescription(_ lang: ResolvedAppLanguage) -> String {
        guard lang == .en else { return descriptionRu }
        switch self {
        case .auto: return "Matched to narrator persona"
        case .rachel: return "Calm, clear female"
        case .adam: return "Deep, confident male"
        case .antoni: return "Warm, rounded male"
        case .bella: return "Soft, gentle female"
        case .elli: return "Young, upbeat female"
        case .josh: return "Crisp narrative male"
        case .sam: return "Raspy, characterful male"
        case .emily: return "Calm, mature female"
        case .charlie: return "Casual conversational male"
        case .matilda: return "Expressive, warm female"
        }
    }

    var labelRu: String {
        switch self {
        case .auto: return "Авто"
        case .rachel: return "Рейчел"
        case .adam: return "Адам"
        case .antoni: return "Антони"
        case .bella: return "Белла"
        case .elli: return "Элли"
        case .josh: return "Джош"
        case .sam: return "Сэм"
        case .emily: return "Эмили"
        case .charlie: return "Чарли"
        case .matilda: return "Матильда"
        }
    }

    var descriptionRu: String {
        switch self {
        case .auto: return "Голос подбирается по амплуа"
        case .rachel: return "Спокойный женский"
        case .adam: return "Глубокий мужской"
        case .antoni: return "Тёплый мужской"
        case .bella: return "Мягкий женский"
        case .elli: return "Молодой женский"
        case .josh: return "Чёткий повествователь"
        case .sam: return "Хриплый мужской"
        case .emily: return "Спокойная зрелая"
        case .charlie: return "Разговорный мужской"
        case .matilda: return "Выразительная женский"
        }
    }

    static func fromId(_ id: String?) -> ElevenLabsVoice {
        guard let id, let value = ElevenLabsVoice(rawValue: id) else { return .auto }
        return value
    }
}

enum UserFacingError {
    static func isBenignStoryCancel(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if (error as? URLError)?.code == .cancelled { return true }
        return isBenignStoryCancelMessage(error.localizedDescription)
    }

    static func isBenignStoryCancelMessage(_ raw: String) -> Bool {
        let lower = raw.lowercased()
        if lower.contains("cancel") || lower.contains("отмен") || lower.contains("499") { return true }
        return isConnectionInterrupt(lower)
    }

    static func storyMessage(for error: Error, lang: ResolvedAppLanguage = SettingsStore.shared.resolvedLanguage) -> String {
        if isBenignStoryCancel(error) { return "" }
        let copy = AppStrings.l10n(lang)
        if (error as? URLError)?.code == .timedOut {
            return copy.storyFetchTimeout
        }
        return message(for: error, lang: lang)
    }

    static func message(for text: String, lang: ResolvedAppLanguage = SettingsStore.shared.resolvedLanguage) -> String {
        let copy = AppStrings.l10n(lang)
        if isBenignStoryCancelMessage(text) { return "" }
        if isConnectionInterrupt(text.lowercased()) { return copy.storyInterrupted }
        if looksTechnical(text) {
            return copy.storyGenericFailure
        }
        return text
    }

    static func message(for text: String) -> String {
        message(for: text, lang: SettingsStore.shared.resolvedLanguage)
    }

    static func message(for error: Error) -> String {
        message(for: error, lang: SettingsStore.shared.resolvedLanguage)
    }

    static func message(for error: Error, lang: ResolvedAppLanguage) -> String {
        if isBenignStoryCancel(error) { return "" }
        let copy = AppStrings.l10n(lang)
        if let localized = error as? LocalizedError, let text = localized.errorDescription, !text.isEmpty {
            if !looksTechnical(text) { return text }
        }
        return message(for: error as NSError, lang: lang)
    }

    static func message(for error: NSError, lang: ResolvedAppLanguage) -> String {
        let copy = AppStrings.l10n(lang)
        let en = lang == .en
        if error.domain == NSURLErrorDomain {
            switch error.code {
            case NSURLErrorTimedOut:
                return copy.storyFetchTimeout
            case NSURLErrorSecureConnectionFailed,
                 NSURLErrorServerCertificateUntrusted,
                 NSURLErrorServerCertificateHasBadDate,
                 NSURLErrorServerCertificateNotYetValid:
                return en
                    ? "Could not connect securely. Check internet and update the app."
                    : "Не удалось безопасно подключиться. Проверь интернет и обнови приложение."
            case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost:
                return copy.storyNetworkIssue
            case NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed:
                return copy.storyNetworkIssue
            case NSURLErrorCancelled:
                return ""
            default:
                break
            }
        }

        if error.domain == "com.apple.coreaudio.avfaudio" || error.domain.contains("coreaudio") {
            return en
                ? "Could not use the microphone. Close other music apps and try again."
                : "Не удалось включить микрофон. Закрой другие приложения с музыкой и попробуй снова."
        }

        let raw = error.localizedDescription
        if raw.localizedCaseInsensitiveContains("превышен лимит времени") ||
            raw.localizedCaseInsensitiveContains("timed out") {
            return copy.storyFetchTimeout
        }

        if isConnectionInterrupt(raw.lowercased()) {
            return copy.storyInterrupted
        }

        if looksTechnical(raw) {
            return copy.storyGenericFailure
        }
        return raw
    }

    static func tracksUntilLabel(_ count: Int) -> String {
        let n = max(0, count)
        let mod10 = n % 10
        let mod100 = n % 100
        let word: String
        if mod100 >= 11 && mod100 <= 14 {
            word = "треков"
        } else if mod10 == 1 {
            word = "трек"
        } else if mod10 >= 2 && mod10 <= 4 {
            word = "трека"
        } else {
            word = "треков"
        }
        return "Авто · через \(n) \(word)"
    }

    static func looksTechnical(_ text: String) -> Bool {
        let lower = text.lowercased()
        return lower.contains("com.apple.") ||
            lower.contains("avfaudio") ||
            lower.contains("ошибка -") ||
            lower.contains("error -") ||
            lower.contains("nsurlerror") ||
            lower.contains("operation couldn't") ||
            lower.contains("не удалось завершить операцию") ||
            lower.contains("http ") ||
            lower.contains("okhttp") ||
            lower.contains("socket") ||
            lower.contains("connection abort") ||
            lower.contains("stream was reset") ||
            lower.contains("прерван") ||
            lower.contains("разорван") ||
            lower.contains("соединен")
    }

    private static func isConnectionInterrupt(_ lower: String) -> Bool {
        lower.contains("прерван") ||
            lower.contains("разорван") ||
            lower.contains("connection abort") ||
            lower.contains("stream was reset") ||
            lower.contains("unexpected end of stream") ||
            lower.contains("socket closed") ||
            lower.contains("connection reset") ||
            (lower.contains("соединен") && (lower.contains("сброш") || lower.contains("закры") || lower.contains("прерван")))
    }
}
