import SwiftUI
import StoreKit

struct AccountView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var storeKit = StoreKitManager.shared
    @State private var selectedPlan = "quarter"
    @State private var isPurchasing = false
    @State private var message: String?

    private let plans: [(id: String, title: String, price: String)] = [
        ("month", "Month", "$3.99"),
        ("quarter", "Quarter", "$9.99"),
        ("year", "Year", "$39.99"),
    ]

    var body: some View {
        MusicStoryBackground {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(AppStrings.Billing.title)
                        .font(.title2.bold())
                        .foregroundStyle(AppTheme.creamText)

                    Text(AppStrings.Billing.playHint)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.mutedLavender)

                    Picker("Plan", selection: $selectedPlan) {
                        ForEach(plans, id: \.id) { plan in
                            Text("\(plan.title) · \(plan.price)").tag(plan.id)
                        }
                    }
                    .pickerStyle(.segmented)

                    Button {
                        Task { await purchase() }
                    } label: {
                        Text(isPurchasing ? AppStrings.Billing.processing : AppStrings.Billing.subscribe)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(AppTheme.goldBright)
                    .disabled(isPurchasing)

                    if let message {
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(AppTheme.mutedLavender)
                    }
                    if let err = storeKit.lastError {
                        Text(err)
                            .font(.footnote)
                            .foregroundStyle(.red)
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
                        .foregroundStyle(AppTheme.goldBright)
                }
            }
            ToolbarItem(placement: .principal) {
                Text(AppStrings.Billing.navTitle)
                    .foregroundStyle(AppTheme.creamText)
            }
        }
        .task {
            await storeKit.loadProducts()
        }
    }

    private func purchase() async {
        isPurchasing = true
        defer { isPurchasing = false }
        let ok = await storeKit.purchase(plan: selectedPlan)
        message = ok ? AppStrings.Billing.success : storeKit.lastError
    }
}
