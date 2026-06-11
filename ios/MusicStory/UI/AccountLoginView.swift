import SwiftUI
import AuthenticationServices

/// Блок входа (Sign in with Apple, Telegram, email) — онбординг и настройки.
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
    @State private var showTelegramSheet = false
    @State private var backendReady = false

    private enum LoginStep { case email, code }

    private var isReviewerEmail: Bool {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return trimmed == "appletester@test.ru" || trimmed == "googletester@test.ru"
    }

    var body: some View {
        VStack(spacing: 14) {
            if authConfig?.appleSignInEnabled != false {
                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.email, .fullName]
                } onCompletion: { result in
                    Task { await handleAppleSignIn(result) }
                }
                .signInWithAppleButtonStyle(.white)
                .frame(height: 50)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .disabled(loading)
            }

            if let cfg = authConfig, cfg.canUseTelegram {
                GlassCard(accentBorder: true) {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Telegram")
                            .font(.caption)
                            .foregroundStyle(AppTheme.mutedLavender)
                        PrimaryStoryButton(title: "Войти через Telegram", loading: loading) {
                            showTelegramSheet = true
                        }
                    }
                }
            }

            GlassCard(accentBorder: true) {
                VStack(alignment: .leading, spacing: 14) {
                    Text(step == .email ? "Email" : "Код из письма")
                        .font(.caption)
                        .foregroundStyle(AppTheme.mutedLavender)
                    if step == .email {
                        TextField("you@example.com", text: $email)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            .autocorrectionDisabled()
                            .foregroundStyle(AppTheme.creamText)
                            .textContentType(.emailAddress)
                        if isReviewerEmail {
                            Text("Тест App Review: нажмите «Получить код», затем введите 000000")
                                .font(.caption)
                                .foregroundStyle(AppTheme.mutedLavender)
                        }
                        PrimaryStoryButton(title: "Получить код", loading: loading) {
                            Task { await sendCode() }
                        }
                        .disabled(loading || email.trimmingCharacters(in: .whitespaces).isEmpty)
                        if let message, !message.contains("отправлен"), step == .email {
                            Text(message)
                                .font(.caption)
                                .foregroundStyle(AppTheme.errorCoral)
                                .multilineTextAlignment(.center)
                        }
                    } else {
                        TextField("000000", text: $code)
                            .keyboardType(.numberPad)
                            .foregroundStyle(AppTheme.creamText)
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
            }

            if let message, step == .code || message.contains("отправлен") || message.contains("Вход") {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(
                        message.contains("отправлен") || message.contains("Вход") ?
                            AppTheme.liveGreen : AppTheme.errorCoral
                    )
                    .multilineTextAlignment(.center)
            }

            Button(skipTitle) { onSkip() }
                .foregroundStyle(AppTheme.mutedLavender)

            Text("Без входа доступен бесплатный тариф с базовыми настройками.")
                .font(.caption)
                .foregroundStyle(AppTheme.mutedLavender)
                .multilineTextAlignment(.center)
        }
        .task { await bootstrap() }
        .onChange(of: email) { _, _ in
            if step == .email { message = nil }
        }
        .sheet(isPresented: $showTelegramSheet) {
            if let cfg = authConfig,
               let bot = cfg.telegramBotUsername,
               let base = cfg.telegramWidgetBaseUrl {
                TelegramLoginSheet(
                    botUsername: bot,
                    widgetBaseURL: base,
                    onAuth: { payload in
                        Task { await handleTelegramAuth(payload) }
                    },
                    onDismiss: { showTelegramSheet = false }
                )
            }
        }
    }

    private func bootstrap() async {
        authConfig = AuthConfig(
            emailEnabled: true,
            telegramEnabled: false,
            appleSignInEnabled: true,
            telegramBotUsername: nil,
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
            onSuccess()
        }
    }

    private func handleAppleSignIn(_ result: Result<ASAuthorization, Error>) async {
        switch result {
        case .failure(let error):
            let ns = error as NSError
            if ns.domain == ASAuthorizationError.errorDomain,
               ns.code == ASAuthorizationError.canceled.rawValue {
                return
            }
            message = error.localizedDescription
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let token = String(data: tokenData, encoding: .utf8),
                  !token.isEmpty else {
                message = "Не удалось получить токен Apple"
                return
            }
            loading = true
            defer { loading = false }
            let login = await AccountAuthManager.shared.completeAppleSignIn(
                identityToken: token,
                email: credential.email
            )
            if let err = login.error {
                message = err
            } else {
                await StoryRepository.shared.refreshQuota()
                onSuccess()
            }
        }
    }

    private func handleTelegramAuth(_ payload: [String: Any]) async {
        loading = true
        defer { loading = false }
        showTelegramSheet = false
        let result = await AccountAuthManager.shared.linkTelegram(payload: payload)
        if let err = result.error {
            message = err
        } else {
            await StoryRepository.shared.refreshQuota()
            onSuccess()
        }
    }
}

struct AccountLoginView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        MusicStoryBackground {
            ScrollView {
                VStack(spacing: 20) {
                    BrandTitle(fontSize: 18)
                    Text("Вход в аккаунт")
                        .font(.title.bold())
                        .foregroundStyle(AppTheme.creamText)

                    VinylDisc(spinning: true)
                        .padding(.vertical, 8)

                    AccountAuthPanel(
                        onSuccess: { dismiss() },
                        onSkip: { dismiss() }
                    )
                }
                .padding(24)
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
