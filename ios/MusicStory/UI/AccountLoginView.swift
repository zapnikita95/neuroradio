import SwiftUI

/// Блок входа (Telegram + email) — онбординг и настройки.
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

    var body: some View {
        VStack(spacing: 14) {
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

            if authConfig?.emailEnabled != false {
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
                            PrimaryStoryButton(title: "Получить код", loading: loading) {
                                Task { await sendCode() }
                            }
                            .disabled(loading || email.trimmingCharacters(in: .whitespaces).isEmpty)
                            if let message, !message.contains("отправлен") {
                                Text(message)
                                    .font(.caption)
                                    .foregroundStyle(AppTheme.errorCoral)
                                    .multilineTextAlignment(.center)
                            }
                        } else {
                            TextField("000000", text: $code)
                                .keyboardType(.numberPad)
                                .foregroundStyle(AppTheme.creamText)
                                .onChange(of: code) { newValue in
                                    let digits = newValue.filter(\.isNumber)
                                    if digits.count > 6 { code = String(digits.prefix(6)) }
                                    else if digits != newValue { code = digits }
                                }
                            PrimaryStoryButton(title: "Войти", loading: loading) {
                                Task { await verifyCode() }
                            }
                            Button("Изменить email") { step = .email }
                                .font(.caption)
                                .foregroundStyle(AppTheme.mutedLavender)
                        }
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
        .onChange(of: email) { _ in
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
        authConfig = AuthConfig(emailEnabled: true, telegramEnabled: false, telegramBotUsername: nil, telegramWidgetBaseUrl: nil)
        let prep = await BackendClient.shared.prepareForLogin()
        backendReady = prep.ready
        if prep.ready {
            authConfig = await AccountAuthManager.shared.fetchConfig()
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
            message = "Код отправлен на \(trimmed)"
            step = .code
        }
    }

    private func verifyCode() async {
        loading = true
        defer { loading = false }
        let result = await AccountAuthManager.shared.verifyEmailLogin(email: email, code: code)
        if let err = result.error {
            message = err
        } else {
            await StoryRepository.shared.refreshQuota()
            onSuccess()
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

private enum AccountScreenTab: String, CaseIterable, Identifiable {
    case account = "Аккаунт"
    case subscription = "Subscription"

    var id: String { rawValue }
}

struct AccountView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var settings: SettingsStore

    @State private var loading = true
    @State private var profile: AccountProfile?
    @State private var loadError: String?
    @State private var showLogin = false
    @State private var selectedTab: AccountScreenTab = .account

    var body: some View {
        MusicStoryBackground {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Picker("Section", selection: $selectedTab) {
                        ForEach(AccountScreenTab.allCases) { tab in
                            Text(tab.rawValue).tag(tab)
                        }
                    }
                    .pickerStyle(.segmented)

                    switch selectedTab {
                    case .account:
                        accountTabContent
                    case .subscription:
                        SubscriptionBillingView()
                    }
                }
                .padding()
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
            ToolbarItem(placement: .principal) {
                Text(selectedTab.rawValue).foregroundStyle(AppTheme.creamText)
            }
        }
        .navigationDestination(isPresented: $showLogin) {
            AccountLoginView()
        }
        .task { await loadProfile() }
    }

    private var accountTabContent: some View {
        VStack(alignment: .leading, spacing: 20) {
            GlassCard {
                if loading {
                    ProgressView().tint(AppTheme.accentViolet)
                } else if let profile, profile.isLoggedIn {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(profile.displayName)
                            .font(.headline)
                            .foregroundStyle(AppTheme.creamText)
                        if let plan = profile.plan {
                            Text("Тариф: \(plan)")
                                .foregroundStyle(AppTheme.mutedLavender)
                        }
                    }
                } else if let cached = settings.accountProfile, cached.isLoggedIn {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(cached.displayName)
                            .font(.headline)
                            .foregroundStyle(AppTheme.creamText)
                        if let plan = cached.plan {
                            Text("Тариф: \(plan)")
                                .foregroundStyle(AppTheme.mutedLavender)
                        }
                        Text("Данные с устройства — обновите профиль.")
                            .font(.caption)
                            .foregroundStyle(AppTheme.mutedLavender)
                    }
                } else {
                    Text(loadError ?? "Войдите — история сохранится в облаке.")
                        .foregroundStyle(AppTheme.mutedLavender)
                }
            }

            if isLoggedIn {
                SecondaryStoryButton(title: "Выйти") {
                    settings.clearAccountProfile()
                    profile = nil
                    loadError = nil
                }
                Button("Обновить профиль") {
                    Task { await loadProfile() }
                }
                .font(.caption)
                .foregroundStyle(AppTheme.mutedLavender)
            } else {
                PrimaryStoryButton(title: "Войти") {
                    showLogin = true
                }
            }
        }
    }

    private var isLoggedIn: Bool {
        (profile?.isLoggedIn ?? false) || (settings.accountProfile?.isLoggedIn ?? false)
    }

    private func loadProfile() async {
        loading = true
        loadError = nil
        settings.backendURL = BackendURL.normalize(settings.backendURL)
        let result = await AccountAuthManager.shared.fetchProfile()
        profile = result.profile ?? settings.accountProfile
        if let err = result.error, !(profile?.isLoggedIn ?? settings.accountProfile?.isLoggedIn ?? false) {
            loadError = err
        }
        loading = false
    }
}
