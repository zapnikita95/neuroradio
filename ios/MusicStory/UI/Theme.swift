import SwiftUI

enum AppTheme {
    static let deepVoid = Color(red: 0.07, green: 0.06, blue: 0.12)
    static let goldBright = Color(red: 0.95, green: 0.78, blue: 0.36)
    static let goldWarm = Color(red: 0.82, green: 0.62, blue: 0.28)
    static let creamText = Color(red: 0.94, green: 0.91, blue: 0.86)
    static let mutedLavender = Color(red: 0.62, green: 0.58, blue: 0.72)
    static let liveGreen = Color(red: 0.42, green: 0.86, blue: 0.58)
    static let errorCoral = Color(red: 0.95, green: 0.45, blue: 0.42)
    static let surfaceGlass = Color.white.opacity(0.08)
}

struct MusicStoryBackground<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [AppTheme.deepVoid, Color(red: 0.12, green: 0.08, blue: 0.18)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
            content()
        }
    }
}

struct GlassCard<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding()
            .background(AppTheme.surfaceGlass)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(AppTheme.goldWarm.opacity(0.25), lineWidth: 1)
            )
    }
}

struct PrimaryStoryButton: View {
    let title: String
    var enabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(enabled ? AppTheme.goldBright : AppTheme.mutedLavender.opacity(0.4))
                .foregroundStyle(AppTheme.deepVoid)
                .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .disabled(!enabled)
    }
}

struct SourceBadge: View {
    let source: TrackSource?

    var body: some View {
        Text(label)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(AppTheme.surfaceGlass)
            .foregroundStyle(AppTheme.goldBright)
            .clipShape(Capsule())
    }

    private var label: String {
        switch source {
        case .spotify: return "Spotify"
        case .appleMusic: return "Apple Music"
        case .shazam: return "Shazam"
        case .manual: return "Вручную"
        case .none: return "—"
        }
    }
}

struct VinylDisc: View {
    var spinning: Bool

    var body: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [Color.black, Color(red: 0.15, green: 0.12, blue: 0.18)],
                    center: .center,
                    startRadius: 8,
                    endRadius: 90
                )
            )
            .frame(width: 180, height: 180)
            .overlay(
                Circle()
                    .stroke(AppTheme.goldWarm.opacity(0.5), lineWidth: 2)
            )
            .overlay(
                Circle()
                    .fill(AppTheme.goldBright)
                    .frame(width: 36, height: 36)
            )
            .rotationEffect(.degrees(spinning ? 360 : 0))
            .animation(spinning ? .linear(duration: 4).repeatForever(autoreverses: false) : .default, value: spinning)
    }
}
