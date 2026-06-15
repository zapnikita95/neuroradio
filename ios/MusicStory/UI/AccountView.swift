import SwiftUI
import StoreKit

private enum AccountScreenTab: String, CaseIterable, Identifiable {
    case account = "Аккаунт"
    case subscription = "Subscription"

    var id: String { rawValue }
}

struct AccountView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var settings: SettingsStore
    @StateObject private var storeKit = StoreKitManager.shared

    @State private var loading = true
    @State private var profile: AccountProfile?
    @State private var loadError: String?
    @State private var showLogin = false
    @State private var selectedTab: AccountScreenTab = .account
    @State private var selectedPlan = "quarter"
    @State private var isPurchasing = false
    @State private var billingMessage: String?

    private let plans: [(id: String, title: String, price: String)] = [
        ("month", "Month", "$3.99"),
        ("quarter", "Quarter", "$9.99"),
        ("year", "Year", "$39.99"),
    ]

    var body: some View {
        MusicStoryBackground {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
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
                        subscriptionTabContent
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left")
                        .foregroundStyle(AppTheme.goldBright)
                }
            }
            ToolbarItem(placement: .principal) {
                Text(selectedTab.rawValue).foregroundStyle(AppTheme.creamText)
            }
        }
        .navigationDestination(isPresented: $showLogin) {
            AccountLoginView()
        }
        .task {
            await loadProfile()
            await storeKit.loadProducts()
        }
    }

    private var accountTabContent: some View {
        VStack(alignment: .leading, spacing: 16) {
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

    private var subscriptionTabContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(AppStrings.Billing.playHint)
                .font(.footnote)
                .foregroundStyle(AppTheme.mutedLavender)

            Picker("Plan", selection: $selectedPlan) {
                ForEach(plans, id: \.id) { plan in
                    Text("\(plan.title) · \(plan.price)").tag(plan.id)
                }
            }
            .pickerStyle(.segmented)

            PrimaryStoryButton(
                title: isPurchasing ? AppStrings.Billing.processing : AppStrings.Billing.subscribe,
                loading: isPurchasing
            ) {
                Task { await purchase() }
            }

            if let billingMessage {
                Text(billingMessage)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.mutedLavender)
            }
            if let err = storeKit.lastError {
                Text(err)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.errorCoral)
            }

            Text(
                "Payment will be charged to your Apple ID account. Subscription renews automatically unless canceled at least 24 hours before the end of the period. Manage in Settings → Apple ID → Subscriptions."
            )
            .font(.caption2)
            .foregroundStyle(AppTheme.mutedLavender)
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
        if result.profile?.isLoggedIn == true {
            AccountCloudSync.mergeCloudPayload(result)
        }
        if let err = result.error, !(profile?.isLoggedIn ?? settings.accountProfile?.isLoggedIn ?? false) {
            loadError = err
        }
        loading = false
    }

    private func purchase() async {
        isPurchasing = true
        defer { isPurchasing = false }
        let ok = await storeKit.purchase(plan: selectedPlan)
        billingMessage = ok ? AppStrings.Billing.success : storeKit.lastError
        if ok {
            await StoryRepository.shared.refreshQuota()
            await loadProfile()
        }
    }
}
