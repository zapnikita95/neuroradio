import SwiftUI

private let authCircleSize: CGFloat = 56

/// Блок входа (Apple, Telegram, email) — онбординг и настройки.
struct AccountAuthPanel: View {
    var onSuccess: () -> Void
    var onSkip: () -> Void
    var skipTitle: String = "Продолжить без входа"

    @EnvironmentObject private var settings: SettingsStore

    @State private var email = ""
    @State private var code = ""
    @State private var step: LoginStep = .email
    @State private var message: String?
    @State private var loading = false
    @State private var authConfig: AuthConfig?
    @State private var showEmailSheet = false
    @State private var emailSheetDetent: PresentationDetent = .height(300)
    @State private var backendReady = false
    @FocusState private var focusedField: EmailField?

    private enum LoginStep { case email, code }
    private enum EmailField: Hashable { case email, code }

    private var isReviewerEmail: Bool {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return trimmed == "appletester@test.ru" || trimmed == "googletester@test.ru"
    }

    var body: some View {
        VStack(spacing: 14) {
            if let message, !showEmailSheet {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(
                        message.contains("отправлен") || message.contains("Вход") ?
                            AppTheme.liveGreen : AppTheme.errorCoral
                    )
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
            }

            HStack(spacing: 20) {
                if authConfig?.appleSignInEnabled != false {
                    AppleLoginIconButton(loading: loading) {
                        Task { await signInWithApple() }
                    }
                }

                if authConfig?.showsTelegramLogin == true {
                    TelegramLoginIconButton(loading: loading) {
                        Task { await signInWithTelegram() }
                    }
                }

                EmailLoginIconButton(selected: showEmailSheet) {
                    showEmailSheet = true
                }
            }
            .frame(maxWidth: .infinity)

            Button(skipTitle) { onSkip() }
                .font(.subheadline)
                .foregroundStyle(AppTheme.mutedLavender)
        }
        .task { await bootstrap() }
        .sheet(isPresented: $showEmailSheet, onDismiss: resetEmailFlow) {
            emailLoginSheet
        }
    }

    private var emailLoginSheet: some View {
        NavigationStack {
            ZStack {
                AppTheme.nightPlum.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 16) {
                        GlassCard(accentBorder: true) {
                            VStack(alignment: .leading, spacing: 14) {
                                Text(step == .email ? "Email" : "Код из письма")
                                    .font(.caption)
                                    .foregroundStyle(AppTheme.mutedLavender)
                                emailFields
                            }
                        }

                        if let message {
                            Text(message)
                                .font(.caption)
                                .foregroundStyle(
                                    message.contains("отправлен") || message.contains("Вход") || message.contains("000000") ?
                                        AppTheme.liveGreen : AppTheme.errorCoral
                                )
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle("Вход по email")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Закрыть") {
                        focusedField = nil
                        showEmailSheet = false
                    }
                    .foregroundStyle(AppTheme.accentViolet)
                }
            }
        }
        .presentationDetents([.height(emailSheetCompactHeight), .large], selection: $emailSheetDetent)
        .presentationDragIndicator(.visible)
        .presentationBackground(AppTheme.nightPlum)
        .onChange(of: step) { _, _ in
            emailSheetDetent = focusedField == nil ? .height(emailSheetCompactHeight) : .large
        }
        .onChange(of: focusedField) { _, field in
            withAnimation(.easeInOut(duration: 0.2)) {
                emailSheetDetent = field == nil ? .height(emailSheetCompactHeight) : .large
            }
        }
    }

    private var emailSheetCompactHeight: CGFloat {
        step == .code ? 340 : 300
    }

    @ViewBuilder
    private var emailFields: some View {
        if step == .email {
            TextField("you@example.com", text: $email)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
                .foregroundStyle(AppTheme.creamText)
                .textContentType(.emailAddress)
                .focused($focusedField, equals: .email)
            if isReviewerEmail {
                Text("Тест App Review: «Получить код» → 000000")
                    .font(.caption)
                    .foregroundStyle(AppTheme.mutedLavender)
            }
            PrimaryStoryButton(title: "Получить код", loading: loading) {
                Task { await sendCode() }
            }
            .disabled(loading || email.trimmingCharacters(in: .whitespaces).isEmpty)
        } else {
            TextField("000000", text: $code)
                .keyboardType(.numberPad)
                .foregroundStyle(AppTheme.creamText)
                .focused($focusedField, equals: .code)
                .onChange(of: code) { _, newValue in
                    let digits = newValue.filter(\.isNumber)
                    if digits.count > 6 { code = String(digits.prefix(6)) }
                    else if digits != newValue { code = digits }
                }
            PrimaryStoryButton(title: "Войти", loading: loading) {
                Task { await verifyCode() }
            }
            .disabled(loading || code.count < 6)
            Button("Изменить email") {
                step = .email
                code = ""
                message = nil
            }
            .font(.caption)
            .foregroundStyle(AppTheme.mutedLavender)
        }
    }

    private func resetEmailFlow() {
        step = .email
        code = ""
        message = nil
        focusedField = nil
        emailSheetDetent = .height(emailSheetCompactHeight)
    }

    private func bootstrap() async {
        authConfig = AuthConfig(
            emailEnabled: true,
            telegramEnabled: false,
            telegramOAuthEnabled: false,
            appleSignInEnabled: true,
            telegramBotUsername: nil,
            telegramBotId: nil,
            telegramOAuthRedirectUri: nil,
            telegramWidgetBaseUrl: nil
        )
        let prep = await BackendClient.shared.prepareForLogin()
        backendReady = prep.ready
        if prep.ready {
            authConfig = await AccountAuthManager.shared.fetchConfig()
        } else {
            message = prep.error
        }
    }

    private func signInWithTelegram() async {
        loading = true
        defer { loading = false }
        let result = await AccountAuthManager.shared.signInWithTelegramOAuth()
        if let err = result.error {
            if !err.localizedCaseInsensitiveContains("отменён") {
                message = err
            }
        } else {
            await StoryRepository.shared.refreshQuota()
            onSuccess()
        }
    }

    private func signInWithApple() async {
        loading = true
        defer { loading = false }
        let result = await AccountAuthManager.shared.signInWithApple()
        if let err = result.error {
            if !err.localizedCaseInsensitiveContains("отменён") {
                message = err
            }
        } else {
            await StoryRepository.shared.refreshQuota()
            onSuccess()
        }
    }

    private func sendCode() async {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard trimmed.contains("@"), trimmed.contains(".") else {
            message = "Введите корректный email"
            return
        }
        email = trimmed
        message = nil
        loading = true
        defer { loading = false }

        if !backendReady {
            let prep = await BackendClient.shared.prepareForLogin()
            backendReady = prep.ready
            if prep.ready {
                authConfig = await AccountAuthManager.shared.fetchConfig()
            } else {
                message = prep.error ?? "Сервер недоступен"
                return
            }
        }
        if let err = await AccountAuthManager.shared.startEmailLogin(email: trimmed) {
            message = UserFacingError.message(for: err)
        } else {
            message = isReviewerEmail
                ? "Код для проверки: 000000"
                : "Код отправлен на \(trimmed)"
            step = .code
            if isReviewerEmail {
                code = "000000"
            }
        }
    }

    private func verifyCode() async {
        let trimmedCode = code.trimmingCharacters(in: .whitespaces)
        guard trimmedCode.count >= 6 else {
            message = "Введите 6-значный код"
            return
        }
        loading = true
        defer { loading = false }
        let result = await AccountAuthManager.shared.verifyEmailLogin(email: email, code: trimmedCode)
        if let err = result.error {
            message = err
        } else {
            message = "Вход выполнен"
            await StoryRepository.shared.refreshQuota()
            showEmailSheet = false
            onSuccess()
        }
    }

}

struct AppleLoginIconButton: View {
    var loading: Bool = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(.white)
                Image(systemName: "apple.logo")
                    .font(.system(size: 26, weight: .medium))
                    .foregroundStyle(.black)
            }
            .frame(width: authCircleSize, height: authCircleSize)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Войти через Apple")
        .disabled(loading)
        .opacity(loading ? 0.6 : 1)
    }
}

struct TelegramLoginIconButton: View {
    var loading: Bool = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(Color(red: 42 / 255, green: 171 / 255, blue: 238 / 255))
                TelegramPaperPlane()
                    .fill(.white)
                    .frame(width: 24, height: 24)
                    .offset(x: -1, y: 1)
            }
            .frame(width: authCircleSize, height: authCircleSize)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Войти через Telegram")
        .disabled(loading)
        .opacity(loading ? 0.6 : 1)
    }
}

struct EmailLoginIconButton: View {
    var selected: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(selected ? AppTheme.accentViolet.opacity(0.35) : AppTheme.surfaceGlass)
                Image(systemName: "envelope.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(selected ? AppTheme.creamText : AppTheme.mutedLavender)
            }
            .frame(width: authCircleSize, height: authCircleSize)
            .overlay(
                Circle()
                    .stroke(selected ? AppTheme.accentViolet : AppTheme.glassBorder, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Войти по email")
    }
}

struct TelegramPaperPlane: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let w = rect.width
        let h = rect.height
        path.move(to: CGPoint(x: 0.08 * w, y: 0.48 * h))
        path.addLine(to: CGPoint(x: 0.92 * w, y: 0.08 * h))
        path.addLine(to: CGPoint(x: 0.56 * w, y: 0.92 * h))
        path.addLine(to: CGPoint(x: 0.44 * w, y: 0.56 * h))
        path.closeSubpath()
        return path
    }
}

struct AccountLoginView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var settings: SettingsStore

    var body: some View {
        MusicStoryBackground {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(spacing: 20) {
                        BrandTitle(fontSize: 18, lang: settings.resolvedLanguage)
                        Text("Вход в аккаунт")
                            .font(.title.bold())
                            .foregroundStyle(AppTheme.creamText)

                        VinylDisc(spinning: true)
                            .padding(.vertical, 8)
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 24)
                }

                AccountAuthPanel(
                    onSuccess: { dismiss() },
                    onSkip: { dismiss() }
                )
                .padding(.horizontal, 24)
                .padding(.bottom, 12)
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left")
                        .foregroundStyle(AppTheme.accentViolet)
                }
            }
        }
    }
}
