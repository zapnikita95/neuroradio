import SwiftUI
import StoreKit

private enum AccountScreenTab: Hashable {
    case account
    case subscription
}

private struct BillingPlanOption: Identifiable {
    let id: String
    let title: String
    let price: String
    let oldPrice: String?
    let badge: String?
    let perMonthHint: String?
}

struct AccountView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
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
    @State private var billingError: String?
    @State private var billingEmail = ""

    private var copy: AppL10n { AppStrings.l10n(settings.resolvedLanguage) }
    private var useAppStore: Bool { settings.resolvedLanguage == .en }

    private var usdPlans: [BillingPlanOption] {
        let monthPrice = storeKit.displayPrice(forPlan: "month") ?? "$3.99"
        let quarterPrice = storeKit.displayPrice(forPlan: "quarter") ?? "$9.99"
        let yearPrice = storeKit.displayPrice(forPlan: "year") ?? "$39.99"
        return [
            BillingPlanOption(
                id: "month",
                title: copy.billingPlanMonth,
                price: monthPrice,
                oldPrice: nil,
                badge: nil,
                perMonthHint: useAppStore ? "\(monthPrice) / mo" : nil
            ),
            BillingPlanOption(
                id: "quarter",
                title: copy.billingPlanQuarter,
                price: quarterPrice,
                oldPrice: useAppStore ? "$11.97" : "597 ₽",
                badge: nil,
                perMonthHint: useAppStore ? "≈ $3.33 / mo" : "≈ 166 ₽ в месяц"
            ),
            BillingPlanOption(
                id: "year",
                title: copy.billingPlanYear,
                price: yearPrice,
                oldPrice: useAppStore ? "$47.88" : "2388 ₽",
                badge: copy.billingBestValue,
                perMonthHint: useAppStore ? "≈ $3.33 / mo" : "≈ 167 ₽ в месяц"
            ),
        ]
    }

    private var rubPlans: [BillingPlanOption] {
        [
            BillingPlanOption(id: "month", title: copy.billingPlanMonth, price: "199 ₽", oldPrice: nil, badge: nil, perMonthHint: "199 ₽ в месяц"),
            BillingPlanOption(id: "quarter", title: copy.billingPlanQuarter, price: "499 ₽", oldPrice: "597 ₽", badge: nil, perMonthHint: "≈ 166 ₽ в месяц"),
            BillingPlanOption(id: "year", title: copy.billingPlanYear, price: "1999 ₽", oldPrice: "2388 ₽", badge: copy.billingBestValue, perMonthHint: "≈ 167 ₽ в месяц"),
        ]
    }

    private var plans: [BillingPlanOption] { useAppStore ? usdPlans : rubPlans }

    var body: some View {
        MusicStoryBackground {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Picker("Section", selection: $selectedTab) {
                        Text(copy.accountTab).tag(AccountScreenTab.account)
                        Text(copy.subscriptionTab).tag(AccountScreenTab.subscription)
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
                Text(selectedTab == .account ? copy.accountTab : copy.subscriptionTab)
                    .foregroundStyle(AppTheme.creamText)
            }
        }
        .navigationDestination(isPresented: $showLogin) {
            AccountLoginView()
        }
        .task {
            billingEmail = settings.accountProfile?.email ?? ""
            await loadProfile()
            if useAppStore {
                await storeKit.loadProducts()
            }
        }
        .onChange(of: settings.resolvedLanguage) { _, lang in
            if lang == .en {
                Task { await storeKit.loadProducts() }
            }
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
                            Text(copy.accountPlanLabel(plan))
                                .foregroundStyle(AppTheme.mutedLavender)
                        }
                    }
                } else if let cached = settings.accountProfile, cached.isLoggedIn {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(cached.displayName)
                            .font(.headline)
                            .foregroundStyle(AppTheme.creamText)
                        if let plan = cached.plan {
                            Text(copy.accountPlanLabel(plan))
                                .foregroundStyle(AppTheme.mutedLavender)
                        }
                    }
                } else {
                    Text(loadError ?? copy.accountSignInHint)
                        .foregroundStyle(AppTheme.mutedLavender)
                }
            }

            if isLoggedIn {
                SecondaryStoryButton(title: copy.accountSignOut) {
                    settings.clearAccountProfile()
                    profile = nil
                    loadError = nil
                    billingEmail = ""
                }
                Button(copy.accountRefreshProfile) {
                    Task { await loadProfile() }
                }
                .font(.caption)
                .foregroundStyle(AppTheme.mutedLavender)
            } else {
                PrimaryStoryButton(title: copy.accountSignIn) {
                    showLogin = true
                }
            }
        }
    }

    private var subscriptionTabContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(copy.billingIntro)
                .font(.subheadline)
                .foregroundStyle(AppTheme.creamText)

            Text(copy.billingPitch)
                .font(.footnote)
                .foregroundStyle(AppTheme.mutedLavender)

            GlassCard(accentBorder: true) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(copy.billingTitle)
                        .font(.headline)
                        .foregroundStyle(AppTheme.creamText)
                    billingFeatureRow(copy.billingPremiumFeature1)
                    billingFeatureRow(copy.billingPremiumFeature2)
                    billingFeatureRow(copy.billingPremiumFeature3)
                    billingFeatureRow(copy.billingPremiumFeature4)
                }
            }

            Text(copy.billingPlansHeading)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppTheme.creamText)

            VStack(spacing: 10) {
                ForEach(plans) { plan in
                    BillingPlanCard(
                        plan: plan,
                        selected: selectedPlan == plan.id,
                        onSelect: { selectedPlan = plan.id }
                    )
                }
            }

            if !useAppStore {
                VStack(alignment: .leading, spacing: 8) {
                    Text(copy.billingEmailField)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.mutedLavender)
                    TextField(copy.billingEmailField, text: $billingEmail)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                        .padding(12)
                        .background(AppTheme.surfaceElevated.opacity(0.9))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(AppTheme.creamText)
                }
            }

            PrimaryStoryButton(
                title: isPurchasing ? copy.billingProcessing : copy.billingSubscribe,
                loading: isPurchasing
            ) {
                Task { await purchase() }
            }

            if let billingMessage {
                Text(billingMessage)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.liveGreen)
            }
            if let billingError {
                Text(billingError)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.errorCoral)
            } else if useAppStore, let err = storeKit.lastError {
                Text(err)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.errorCoral)
            }

            Text(useAppStore ? copy.billingAppStoreHint : copy.billingYookassaHint)
                .font(.caption)
                .foregroundStyle(AppTheme.mutedLavender)

            if useAppStore {
                Text(copy.billingAppStoreLegal)
                    .font(.caption2)
                    .foregroundStyle(AppTheme.mutedLavender)
            }
        }
    }

    private func billingFeatureRow(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("•")
                .foregroundStyle(AppTheme.accentViolet)
            Text(text)
                .font(.footnote)
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
        if let email = profile?.email ?? settings.accountProfile?.email, !email.isEmpty {
            billingEmail = email
        }
        if result.profile?.isLoggedIn == true {
            AccountCloudSync.mergeCloudPayload(result)
        }
        if let err = result.error, !(profile?.isLoggedIn ?? settings.accountProfile?.isLoggedIn ?? false) {
            loadError = err
        }
        loading = false
    }

    private func purchase() async {
        billingError = nil
        billingMessage = nil
        isPurchasing = true
        defer { isPurchasing = false }

        if useAppStore {
            let ok = await storeKit.purchase(plan: selectedPlan)
            if ok {
                billingMessage = copy.billingSuccess
                await StoryRepository.shared.refreshQuota()
                await loadProfile()
            } else if storeKit.lastError != nil {
                billingError = storeKit.lastError
            }
            return
        }

        let email = billingEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard email.contains("@"), email.count <= 254 else {
            billingError = copy.billingEmailRequired
            return
        }

        do {
            let resp = try await BackendClient.shared.createYooKassaPayment(email: email, plan: selectedPlan)
            guard resp.ok == true, let urlString = resp.confirmationUrl, let url = URL(string: urlString) else {
                billingError = resp.error ?? copy.billingPaymentFailed
                return
            }
            openURL(url)
            billingMessage = copy.billingYookassaOpened
        } catch {
            billingError = error.localizedDescription
        }
    }
}

private struct BillingPlanCard: View {
    let plan: BillingPlanOption
    let selected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    if let badge = plan.badge {
                        Text(badge)
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(AppTheme.accentPink)
                    }
                    Text(plan.title)
                        .font(.headline)
                        .foregroundStyle(AppTheme.creamText)
                    if let hint = plan.perMonthHint {
                        Text(hint)
                            .font(.caption)
                            .foregroundStyle(AppTheme.mutedLavender)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(plan.price)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(AppTheme.accentViolet)
                    if let old = plan.oldPrice {
                        Text(old)
                            .font(.caption)
                            .strikethrough()
                            .foregroundStyle(AppTheme.mutedLavender)
                    }
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(selected ? AppTheme.accentViolet.opacity(0.18) : AppTheme.surfaceGlass.opacity(0.72))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(selected ? AppTheme.accentViolet : AppTheme.glassBorder, lineWidth: selected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
    }
}
