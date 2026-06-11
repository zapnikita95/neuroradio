import SwiftUI

enum AppTheme {
    static let deepVoid = Color(red: 8 / 255, green: 7 / 255, blue: 15 / 255)
    static let nightPlum = Color(red: 20 / 255, green: 16 / 255, blue: 31 / 255)
    static let surfaceElevated = Color(red: 26 / 255, green: 21 / 255, blue: 40 / 255)
    static let surfaceGlass = Color(red: 37 / 255, green: 32 / 255, blue: 53 / 255)

    static let accentViolet = Color(red: 168 / 255, green: 85 / 255, blue: 247 / 255)
    static let accentPink = Color(red: 255 / 255, green: 93 / 255, blue: 162 / 255)
    static let accentCyan = Color(red: 56 / 255, green: 225 / 255, blue: 255 / 255)

    static let creamText = Color(red: 245 / 255, green: 237 / 255, blue: 224 / 255)
    static let mutedLavender = Color(red: 155 / 255, green: 143 / 255, blue: 168 / 255)
    static let liveGreen = Color(red: 74 / 255, green: 222 / 255, blue: 128 / 255)
    static let errorCoral = Color(red: 255 / 255, green: 107 / 255, blue: 107 / 255)
    static let glassBorder = Color(red: 168 / 255, green: 85 / 255, blue: 247 / 255).opacity(0.35)

    // Legacy aliases used in older views
    static let goldBright = accentViolet
    static let goldWarm = accentPink
}

struct MusicStoryBackground<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [AppTheme.deepVoid, AppTheme.nightPlum, AppTheme.deepVoid],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
            RadialGradient(
                colors: [AppTheme.accentViolet.opacity(0.18), .clear],
                center: .top,
                startRadius: 20,
                endRadius: 420
            )
            .ignoresSafeArea()
            content()
        }
    }
}

struct BrandTitle: View {
    var fontSize: CGFloat = 22

    var body: some View {
        HStack(spacing: 0) {
            Text("Эфир ")
                .font(.system(size: fontSize, weight: .semibold, design: .serif))
                .foregroundStyle(AppTheme.creamText)
            Text("AI")
                .font(.system(size: fontSize, weight: .bold, design: .default))
                .foregroundStyle(AppTheme.accentViolet)
        }
    }
}

struct GlassCard<Content: View>: View {
    var accentBorder = false
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.surfaceGlass.opacity(0.72))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(
                        accentBorder ? AppTheme.accentViolet.opacity(0.45) : AppTheme.glassBorder,
                        lineWidth: 1
                    )
            )
    }
}

struct PrimaryStoryButtonLabel: View {
    let title: String
    var enabled: Bool = true
    var loading: Bool = false

    var body: some View {
        HStack(spacing: 10) {
            if loading {
                ProgressView()
                    .tint(AppTheme.deepVoid)
            }
            Text(title)
                .font(.headline.weight(.bold))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 15)
        .background(
            LinearGradient(
                colors: [AppTheme.accentPink, AppTheme.accentViolet, AppTheme.accentCyan.opacity(0.85)],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
        .foregroundStyle(AppTheme.deepVoid)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .opacity(enabled && !loading ? 1 : loading ? 0.92 : 0.45)
    }
}

struct PrimaryStoryButton: View {
    let title: String
    var enabled: Bool = true
    var loading: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            PrimaryStoryButtonLabel(title: title, enabled: enabled, loading: loading)
        }
        .disabled(!enabled || loading)
    }
}

struct SecondaryStoryButton: View {
    let title: String
    var enabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .foregroundStyle(AppTheme.accentViolet)
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(AppTheme.accentViolet.opacity(0.55), lineWidth: 1)
                )
        }
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
    }
}

struct SettingsPreferenceRow: View {
    let label: String
    var subtitle: String? = nil
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(selected ? AppTheme.accentViolet : AppTheme.mutedLavender)
                    .padding(.top, 2)
                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .font(.body)
                        .foregroundStyle(AppTheme.creamText)
                        .multilineTextAlignment(.leading)
                    if let subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.caption)
                            .foregroundStyle(AppTheme.mutedLavender)
                            .multilineTextAlignment(.leading)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct SettingsSubheading: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.caption.weight(.semibold))
            .foregroundStyle(AppTheme.mutedLavender)
            .padding(.top, 4)
    }
}

struct SettingsSection<Content: View>: View {
    let title: String
    let summary: String
    var initiallyExpanded = false
    @ViewBuilder var content: () -> Content
    @State private var expanded = false

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(title)
                            .font(.headline)
                            .foregroundStyle(AppTheme.creamText)
                        Text(summary)
                            .font(.caption)
                            .foregroundStyle(AppTheme.mutedLavender)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: expanded ? "chevron.up" : "chevron.down")
                        .foregroundStyle(AppTheme.accentViolet)
                        .font(.body.weight(.semibold))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .onTapGesture {
                    withAnimation(.easeInOut(duration: 0.2)) { expanded.toggle() }
                }

                if expanded {
                    content()
                }
            }
        }
        .onAppear {
            if initiallyExpanded { expanded = true }
        }
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
            .foregroundStyle(AppTheme.accentViolet)
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
    var tonearmOnDisc = false

    private let discSize: CGFloat = 172
    private let frameSize: CGFloat = 200

    var body: some View {
        ZStack {
            spinningDiscLayer
            tonearmLayer
        }
        .frame(width: frameSize, height: frameSize)
    }

    @ViewBuilder
    private var spinningDiscLayer: some View {
        if spinning {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { context in
                discBody
                    .rotationEffect(discRotation(at: context.date))
            }
        } else {
            discBody
        }
    }

    private var discBody: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [Color.black, Color(red: 0.1, green: 0.08, blue: 0.12)],
                        center: .center,
                        startRadius: 8,
                        endRadius: 90
                    )
                )
                .frame(width: discSize, height: discSize)
                .overlay(
                    Circle()
                        .stroke(AppTheme.accentViolet.opacity(0.35), lineWidth: 2)
                )

            Circle()
                .fill(
                    RadialGradient(
                        colors: [AppTheme.accentPink, AppTheme.accentViolet],
                        center: .center,
                        startRadius: 2,
                        endRadius: 22
                    )
                )
                .frame(width: 44, height: 44)

            ForEach(0..<3, id: \.self) { ring in
                Circle()
                    .stroke(Color.white.opacity(0.04), lineWidth: 1)
                    .frame(width: discSize * (0.55 + CGFloat(ring) * 0.15))
            }
        }
    }

    private var tonearmLayer: some View {
        ZStack(alignment: .topTrailing) {
            Circle()
                .fill(AppTheme.surfaceElevated)
                .frame(width: 14, height: 14)
                .overlay(Circle().stroke(AppTheme.accentViolet.opacity(0.5), lineWidth: 1))
                .padding(.top, 6)
                .padding(.trailing, 10)

            RoundedRectangle(cornerRadius: 2)
                .fill(
                    LinearGradient(
                        colors: [AppTheme.creamText.opacity(0.95), AppTheme.mutedLavender.opacity(0.8)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: 4, height: 64)
                .overlay(alignment: .bottom) {
                    Circle()
                        .fill(AppTheme.accentPink)
                        .frame(width: 9, height: 9)
                        .offset(y: 4)
                }
                .offset(x: -18, y: 16)
                .rotationEffect(.degrees(tonearmOnDisc ? 18 : -34), anchor: .topTrailing)
                .animation(.easeInOut(duration: 0.45), value: tonearmOnDisc)
        }
        .frame(width: frameSize, height: frameSize, alignment: .topTrailing)
    }

    private func discRotation(at date: Date) -> Angle {
        let period = 4.0
        let progress = date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period) / period
        return .degrees(progress * 360)
    }
}
