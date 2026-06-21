import Foundation

enum AppLanguage: String, CaseIterable, Identifiable {
    case system
    case ru
    case en

    var id: String { rawValue }

    static func fromId(_ id: String?) -> AppLanguage {
        guard let id, let value = AppLanguage(rawValue: id.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            return .system
        }
        return value
    }
}

enum ResolvedAppLanguage {
    case ru
    case en

    var apiCode: String {
        switch self {
        case .ru: return "ru"
        case .en: return "en"
        }
    }
}

func resolveAppLanguage(_ stored: AppLanguage, device: Locale = .current) -> ResolvedAppLanguage {
    .ru
}
