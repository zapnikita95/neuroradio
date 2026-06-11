import SwiftUI

/// Round Shazam-style control — brand violet/cyan, top-right on home.
struct ShazamFloatingButton: View {
    let isListening: Bool
    let action: () -> Void

    @State private var pulse = false

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [
                                AppTheme.accentViolet,
                                AppTheme.accentPink,
                                AppTheme.accentCyan.opacity(0.9),
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 56, height: 56)
                    .shadow(color: AppTheme.accentViolet.opacity(0.45), radius: isListening ? 14 : 8, y: 4)

                if isListening {
                    Circle()
                        .stroke(AppTheme.accentCyan.opacity(0.7), lineWidth: 2)
                        .frame(width: 64, height: 64)
                        .scaleEffect(pulse ? 1.12 : 0.92)
                        .opacity(pulse ? 0.15 : 0.55)
                }

                ShazamMarkIcon()
                    .frame(width: 28, height: 28)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(AppStrings.Shazam.recognizeButton)
        .disabled(isListening)
        .onChange(of: isListening) { _, listening in
            pulse = listening
        }
        .onAppear {
            if isListening { pulse = true }
        }
        .animation(
            isListening ? .easeInOut(duration: 1).repeatForever(autoreverses: true) : .default,
            value: pulse
        )
    }
}

/// Shazam-inspired waveform mark in app colors (not the official logo).
private struct ShazamMarkIcon: View {
    var body: some View {
        ZStack {
            Circle()
                .fill(AppTheme.creamText.opacity(0.95))
                .frame(width: 22, height: 22)

            Image(systemName: "waveform")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(
                    LinearGradient(
                        colors: [AppTheme.accentViolet, AppTheme.accentPink],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
        }
    }
}
