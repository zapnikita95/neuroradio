import Foundation

extension StoryNarrator {
    func uiLabel(_ lang: ResolvedAppLanguage) -> String {
        guard lang == .en else { return labelRu }
        switch self {
        case .auto: return "Auto"
        case .radioHost: return "Radio host"
        case .contemporary: return "Contemporary"
        case .expert: return "Genre expert"
        case .fan: return "Superfan"
        case .backstage: return "Backstage insider"
        case .nightDj: return "Night DJ"
        }
    }

    func uiDescription(_ lang: ResolvedAppLanguage) -> String {
        guard lang == .en else { return descriptionRu }
        switch self {
        case .auto: return "Persona picked from track genre and era"
        case .radioHost: return "Warm on-air tone — lively but factual"
        case .contemporary: return "First-person nostalgia — you lived when the track dropped"
        case .expert: return "Podcast expertise — genre mechanics, not a lecture"
        case .fan: return "Enthusiastic collector from the first person"
        case .backstage: return "Insider tone when the fact has a twist"
        case .nightDj: return "Quiet night shift — clear fact, slow tempo"
        }
    }
}

extension StoryLength {
    func uiLabel(_ lang: ResolvedAppLanguage) -> String {
        guard lang == .en else { return labelRu }
        switch self {
        case .sec30: return "30 seconds"
        case .sec60: return "1 minute"
        case .unlimited: return "Extended"
        }
    }

    func uiDescription(_ lang: ResolvedAppLanguage) -> String {
        guard lang == .en else { return descriptionRu }
        switch self {
        case .sec30: return "Short story — fast pace"
        case .sec60: return "Default — about a minute of voice"
        case .unlimited: return "Longer, more detailed story"
        }
    }
}

extension TtsSpeed {
    func uiLabel(_ lang: ResolvedAppLanguage) -> String {
        guard lang == .en else { return labelRu }
        switch self {
        case .verySlow: return "Very slow"
        case .slow: return "Slow"
        case .normal: return "Normal"
        case .fast: return "Fast"
        case .veryFast: return "Very fast"
        }
    }
}

extension TtsEmotion {
    func uiLabel(_ lang: ResolvedAppLanguage) -> String {
        guard lang == .en else { return labelRu }
        switch self {
        case .neutral: return "Neutral"
        case .good: return "Lively"
        case .evil: return "Strict"
        }
    }

    func uiDescription(_ lang: ResolvedAppLanguage) -> String {
        guard lang == .en else { return descriptionRu }
        switch self {
        case .neutral: return "Even, calm delivery"
        case .good: return "Friendly, warm intonation"
        case .evil: return "Firm, dramatic — best with strict voices"
        }
    }
}

extension TtsVoice {
    func uiLabel(_ lang: ResolvedAppLanguage) -> String {
        guard lang == .en else { return labelRu }
        switch self {
        case .auto: return "Auto"
        case .alena: return "Alena"
        case .filipp: return "Filipp"
        case .ermil: return "Ermil"
        case .jane: return "Jane"
        case .omazh: return "Omazh"
        case .zahar: return "Zahar"
        case .marina: return "Marina"
        case .dasha: return "Dasha"
        }
    }

    func uiDescription(_ lang: ResolvedAppLanguage) -> String {
        guard lang == .en else { return descriptionRu }
        switch self {
        case .auto: return "Voice matched to track era and genre"
        case .alena: return "Female · soft and friendly"
        case .filipp: return "Male · steady and pleasant"
        case .ermil: return "Male · neutral and calm"
        case .jane: return "Female · strict and clear"
        case .omazh: return "Female · strict and dramatic"
        case .zahar: return "Male · deep and confident"
        case .marina: return "Female · warm and soft"
        case .dasha: return "Female · lively and modern"
        }
    }
}

extension ServerTtsProvider {
    func uiLabel(_ lang: ResolvedAppLanguage) -> String {
        guard lang == .en else { return labelRu }
        switch self {
        case .edge: return "Microsoft Edge"
        case .yandex: return "Yandex SpeechKit"
        case .elevenlabs: return "ElevenLabs"
        }
    }

    func uiDescription(_ lang: ResolvedAppLanguage) -> String {
        guard lang == .en else { return descriptionRu }
        switch self {
        case .edge: return "Neural Edge voices"
        case .yandex: return "Professional SpeechKit voiceover"
        case .elevenlabs: return "Premium neural voices for English stories"
        }
    }
}

extension EdgeVoicePreset {
    func uiLabel(_ lang: ResolvedAppLanguage) -> String {
        guard lang == .en else { return labelRu }
        switch self {
        case .dmitryCalm: return "Eric"
        case .svetlanaCalm: return "Anna"
        case .dmitryLively: return "Chris"
        case .svetlanaLively: return "Aria"
        case .daria: return "Michelle"
        }
    }

    func uiDescription(_ lang: ResolvedAppLanguage) -> String {
        guard lang == .en else { return descriptionRu }
        switch self {
        case .dmitryCalm: return "Male · calm, steady delivery"
        case .svetlanaCalm: return "Female · calm, neutral tone"
        case .dmitryLively: return "Male · lively, radio-like"
        case .svetlanaLively: return "Female · expressive, energetic"
        case .daria: return "Female · soft, gentle tone"
        }
    }
}

extension TriggerMode {
    func uiLabel(_ lang: ResolvedAppLanguage) -> String {
        guard lang == .en else { return label }
        switch self {
        case .everyNTracks: return "Every N tracks"
        case .specificArtists: return "Selected artists"
        case .specificGenres: return "Selected genres"
        case .always: return "Always"
        case .never: return "Never"
        }
    }
}
