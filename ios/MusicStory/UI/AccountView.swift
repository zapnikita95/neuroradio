import SwiftUI
import StoreKit

enum AccountScreenTab: Hashable {
    case account
    case subscription
}

private struct BillingPlanOption: Identifiable {
    let id: String
    let title: String
    let duration: String
    let price: String
    let oldPrice: String?
    let badge: String?
    let perMonthHint: String?
}

struct AccountView: View {
    var initialTab: AccountScreenTab = .subscription

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @EnvironmentObject private var settings: SettingsStore
    @StateObject private var storeKit = StoreKitManager.shared

    @State private var loading = true
    @State private var profile: AccountProfile?
    @State private var loadError: String?
    @State private var showLogin = false
    @State private var selectedTab: AccountScreenTab
    @State private var selectedPlan = "quarter"
    @State private var isPurchasing = false
    @State private var isRestoring = false
    @State private var isDeletingAccount = false
    @State private var showDeleteConfirm = false
    @State private var billingMessage: String?
    @State private var billingError: String?
    @State private var accountMessage: String?

    private var copy: AppL10n { AppStrings.l10n(settings.resolvedLanguage) }

    init(initialTab: AccountScreenTab = .subscription) {
        self.initialTab = initialTab
        _selectedTab = State(initialValue: initialTab)
    }

    private var plans: [BillingPlanOption] {
        let monthPrice = storeKit.displayPrice(forPlan: "month") ?? "$3.99"
        let quarterPrice = storeKit.displayPrice(forPlan: "quarter") ?? "$9.99"
        let yearPrice = storeKit.displayPrice(forPlan: "year") ?? "$39.99"
        return [
            BillingPlanOption(
                id: "month",
                title: copy.billingPlanMonth,
                duration: copy.billingPlanMonthDuration,
                price: monthPrice,
                oldPrice: nil,
                badge: nil,
                perMonthHint: "\(monthPrice) / mo"
            ),
            BillingPlanOption(
                id: "quarter",
                title: copy.billingPlanQuarter,
                duration: copy.billingPlanQuarterDuration,
                price: quarterPrice,
                oldPrice: "$11.97",
                badge: nil,
                perMonthHint: "≈ $3.33 / mo"
            ),
            BillingPlanOption(
                id: "year",
                title: copy.billingPlanYear,
                duration: copy.billingPlanYearDuration,
                price: yearPrice,
                oldPrice: "$47.88",
                badge: copy.billingBestValue,
                perMonthHint: "≈ $3.33 / mo"
            ),
        ]
    }

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
        .confirmationDialog(
            copy.accountDeleteTitle,
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button(copy.accountDeleteConfirm, role: .destructive) {
                Task { await deleteAccount() }
            }
            Button(copy.accountDeleteCancel, role: .cancel) {}
        } message: {
            Text(copy.accountDeleteBody)
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
                    accountMessage = nil
                }
                Button(copy.accountRefreshProfile) {
                    Task { await loadProfile() }
                }
                .font(.caption)
                .foregroundStyle(AppTheme.mutedLavender)

                Button {
                    showDeleteConfirm = true
                } label: {
                    Text(copy.accountDelete)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.errorCoral)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .disabled(isDeletingAccount)

                if isDeletingAccount {
                    ProgressView().tint(AppTheme.accentViolet)
                }
                if let accountMessage {
                    Text(accountMessage)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.mutedLavender)
                }
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

            GlassCard {
                VStack(alignment: .leading, spacing: 10) {
                    Text(copy.billingCrossPlatformHint)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.mutedLavender)
                    if !isLoggedIn {
                        SecondaryStoryButton(title: copy.billingCrossPlatformSignIn) {
                            showLogin = true
                        }
                    }
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

            PrimaryStoryButton(
                title: isPurchasing ? copy.billingProcessing : copy.billingSubscribe,
                loading: isPurchasing
            ) {
                Task { await purchase() }
            }

            Button {
                Task { await restorePurchases() }
            } label: {
                Text(copy.billingRestorePurchases)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.accentViolet)
            }
            .disabled(isRestoring || isPurchasing)

            if isRestoring {
                ProgressView().tint(AppTheme.accentViolet)
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
            } else if let err = storeKit.lastError {
                Text(err)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.errorCoral)
            }

            Text(copy.billingAppStoreHint)
                .font(.caption)
                .foregroundStyle(AppTheme.mutedLavender)

            Text(copy.billingAppStoreLegal)
                .font(.caption2)
                .foregroundStyle(AppTheme.mutedLavender)

            subscriptionLegalLinks
        }
    }

    private var subscriptionLegalLinks: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(copy.billingLegalLinksHint)
                .font(.caption)
                .foregroundStyle(AppTheme.mutedLavender)

            HStack(spacing: 16) {
                Button {
                    openURL(AppLegalURLs.privacyPolicy)
                } label: {
                    Text(copy.billingPrivacyPolicy)
                        .font(.caption.weight(.semibold))
                        .underline()
                        .foregroundStyle(AppTheme.accentViolet)
                }
                .buttonStyle(.plain)

                Button {
                    openURL(AppLegalURLs.termsOfUse)
                } label: {
                    Text(copy.billingTermsOfUse)
                        .font(.caption.weight(.semibold))
                        .underline()
                        .foregroundStyle(AppTheme.accentViolet)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 4)
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

        let ok = await storeKit.purchase(plan: selectedPlan)
        if ok {
            billingMessage = copy.billingSuccess
            await StoryRepository.shared.refreshQuota()
            await loadProfile()
        } else if storeKit.lastError != nil {
            billingError = storeKit.lastError
        }
    }

    private func restorePurchases() async {
        billingError = nil
        billingMessage = nil
        isRestoring = true
        defer { isRestoring = false }

        let ok = await storeKit.restorePurchases()
        if ok {
            billingMessage = copy.billingRestoreSuccess
            await StoryRepository.shared.refreshQuota()
            await loadProfile()
        } else {
            billingError = storeKit.lastError ?? copy.billingRestoreNone
        }
    }

    private func deleteAccount() async {
        isDeletingAccount = true
        accountMessage = nil
        defer { isDeletingAccount = false }

        do {
            try await BackendClient.shared.deleteAccount()
            settings.clearAccountProfile()
            profile = nil
            loadError = nil
            accountMessage = copy.accountDeleteSuccess
            await StoryRepository.shared.refreshQuota()
        } catch {
            accountMessage = error.localizedDescription.isEmpty
                ? copy.accountDeleteFailed
                : error.localizedDescription
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
                    Text(plan.duration)
                        .font(.caption)
                        .foregroundStyle(AppTheme.mutedLavender)
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
