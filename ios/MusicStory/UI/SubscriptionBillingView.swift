import SwiftUI
import StoreKit

/// App Store subscription screen — English copy for Apple review.
struct SubscriptionBillingView: View {
    @StateObject private var billing = StoreKitBillingManager.shared
    @State private var premiumActive = false
    @State private var premiumUntilMs: Int64?
    @State private var tier = "free"
    @State private var loadingStatus = true
    @State private var selectedProductId: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Unlock more stories, premium voices, and the DeepSeek V3 narrator.")
                .font(.subheadline)
                .foregroundStyle(AppTheme.mutedLavender)

            premiumPitchCard

            if loadingStatus {
                ProgressView().tint(AppTheme.accentViolet)
            } else if premiumActive {
                Text(premiumStatusText)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.liveGreen)
            }

            if billing.loadingProducts {
                ProgressView("Loading plans…")
                    .tint(AppTheme.accentViolet)
            } else if billing.products.isEmpty {
                Text(billing.lastError ?? "Subscriptions are not configured in App Store Connect yet.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.errorCoral)
            } else {
                planPicker
                subscribeButton
            }

            SecondaryStoryButton(
                title: "Restore Purchases",
                enabled: billing.purchasingProductId == nil
            ) {
                Task {
                    await billing.restorePurchases()
                    await refreshBillingStatus()
                }
            }

            if let err = billing.lastError {
                Text(err)
                    .font(.caption)
                    .foregroundStyle(AppTheme.errorCoral)
            }

            legalFooter
        }
        .task {
            await billing.loadProducts()
            selectedProductId = billing.products.first(where: { $0.id.contains("year") })?.id
                ?? billing.products.first?.id
            await refreshBillingStatus()
        }
    }

    private var premiumPitchCard: some View {
        GlassCard(accentBorder: true) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Premium")
                    .font(.headline)
                    .foregroundStyle(AppTheme.creamText)
                ForEach(premiumBullets, id: \.self) { line in
                    Text("• \(line)")
                        .font(.caption)
                        .foregroundStyle(AppTheme.mutedLavender)
                }
            }
        }
    }

    private var premiumBullets: [String] {
        [
            "More daily and monthly stories",
            "Premium Yandex voices",
            "DeepSeek V3 narrator model",
            "Sync across devices with your account",
        ]
    }

    private var planPicker: some View {
        VStack(spacing: 10) {
            ForEach(billing.products, id: \.id) { product in
                Button {
                    selectedProductId = product.id
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(planTitle(for: product))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(AppTheme.creamText)
                            Text(product.displayPrice)
                                .font(.caption)
                                .foregroundStyle(AppTheme.mutedLavender)
                            if let period = product.subscription?.subscriptionPeriod {
                                Text(periodLabel(period))
                                    .font(.caption2)
                                    .foregroundStyle(AppTheme.mutedLavender)
                            }
                        }
                        Spacer()
                        Image(systemName: selectedProductId == product.id ? "largecircle.fill.circle" : "circle")
                            .foregroundStyle(AppTheme.accentViolet)
                    }
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(selectedProductId == product.id
                                  ? AppTheme.accentViolet.opacity(0.15)
                                  : AppTheme.surfaceGlass)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var subscribeButton: some View {
        let product = billing.products.first { $0.id == selectedProductId } ?? billing.products.first
        return PrimaryStoryButton(
            title: product.map { "Subscribe — \($0.displayPrice)" } ?? "Subscribe",
            loading: billing.purchasingProductId != nil
        ) {
            guard let product else { return }
            Task {
                if await billing.purchase(product) {
                    await refreshBillingStatus()
                }
            }
        }
        .disabled(product == nil || billing.purchasingProductId != nil)
    }

    private var legalFooter: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(
                "Payment will be charged to your Apple ID account at confirmation of purchase. " +
                "Subscription automatically renews unless canceled at least 24 hours before the end of the current period. " +
                "Manage or cancel in Settings → Apple ID → Subscriptions."
            )
            .font(.caption2)
            .foregroundStyle(AppTheme.mutedLavender)

            HStack(spacing: 16) {
                Link("Terms of Use", destination: URL(string: "https://www.efir-ai.ru/terms")!)
                Link("Privacy Policy", destination: URL(string: "https://www.efir-ai.ru/privacy")!)
            }
            .font(.caption2)
            .foregroundStyle(AppTheme.accentViolet)
        }
    }

    private var premiumStatusText: String {
        if let until = premiumUntilMs, until > Int64(Date().timeIntervalSince1970 * 1000) {
            let date = Date(timeIntervalSince1970: TimeInterval(until) / 1000)
            let formatted = date.formatted(.dateTime.month(.abbreviated).day().year())
            return "Premium active until \(formatted)"
        }
        return "Premium is active"
    }

    private func planTitle(for product: Product) -> String {
        let id = product.id.lowercased()
        if id.contains("year") { return "Annual" }
        if id.contains("quarter") { return "Quarterly" }
        if id.contains("month") { return "Monthly" }
        return product.displayName
    }

    private func periodLabel(_ period: Product.SubscriptionPeriod) -> String {
        switch period.unit {
        case .month where period.value == 1: return "Billed every month"
        case .month where period.value == 3: return "Billed every 3 months"
        case .year: return "Billed every year"
        default: return "Auto-renewing subscription"
        }
    }

    private func refreshBillingStatus() async {
        loadingStatus = true
        defer { loadingStatus = false }
        do {
            let status = try await BackendClient.shared.fetchBillingStatus()
            tier = status.tier ?? "free"
            premiumActive = status.premium ?? false
            premiumUntilMs = status.premiumUntilMs
        } catch {
            premiumActive = false
        }
    }
}
