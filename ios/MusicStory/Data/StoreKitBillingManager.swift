import Foundation
import StoreKit

@MainActor
final class StoreKitBillingManager: ObservableObject {
    static let shared = StoreKitBillingManager()

    static let productIds: Set<String> = [
        "premium_voice_monthly",
        "premium_voice_quarterly",
        "premium_voice_yearly",
    ]

    @Published private(set) var products: [Product] = []
    @Published private(set) var loadingProducts = false
    @Published private(set) var purchasingProductId: String?
    @Published var lastError: String?

    private var updatesTask: Task<Void, Never>?

    private init() {
        updatesTask = Task { await listenForTransactions() }
    }

    deinit {
        updatesTask?.cancel()
    }

    func loadProducts() async {
        loadingProducts = true
        defer { loadingProducts = false }
        do {
            let fetched = try await Product.products(for: Array(Self.productIds))
            products = fetched.sorted { lhs, rhs in
                sortRank(lhs.id) < sortRank(rhs.id)
            }
            lastError = products.isEmpty ? "Subscriptions are not available in App Store yet." : nil
        } catch {
            lastError = error.localizedDescription
            products = []
        }
    }

    func purchase(_ product: Product) async -> Bool {
        purchasingProductId = product.id
        lastError = nil
        defer { purchasingProductId = nil }

        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)
                let ok = await syncTransaction(transaction, signedInfo: verification.jwsRepresentation)
                await transaction.finish()
                return ok
            case .userCancelled:
                return false
            case .pending:
                lastError = "Purchase is pending approval."
                return false
            @unknown default:
                lastError = "Purchase could not be completed."
                return false
            }
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    func restorePurchases() async {
        lastError = nil
        var restored = false
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            if await syncTransaction(transaction, signedInfo: result.jwsRepresentation) {
                restored = true
            }
        }
        if !restored {
            lastError = "No active subscriptions found for this Apple ID."
        }
    }

    private func listenForTransactions() async {
        for await result in Transaction.updates {
            guard case .verified(let transaction) = result else { continue }
            _ = await syncTransaction(transaction, signedInfo: result.jwsRepresentation)
            await transaction.finish()
        }
    }

    private func syncTransaction(_ transaction: Transaction, signedInfo: String) async -> Bool {
        let expiresMs: Int64? = transaction.expirationDate.map {
            Int64($0.timeIntervalSince1970 * 1000)
        }
        do {
            _ = try await BackendClient.shared.verifyApplePurchase(
                signedTransactionInfo: signedInfo,
                transactionId: String(transaction.id),
                productId: transaction.productID,
                originalTransactionId: String(transaction.originalID),
                expiresDateMs: expiresMs,
                bundleId: transaction.appBundleID,
                environment: transaction.environment.rawValue
            )
            await StoryRepository.shared.refreshQuota()
            _ = await AccountAuthManager.shared.fetchProfile()
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw StoreKitError.unknown
        case .verified(let safe):
            return safe
        }
    }

    private func sortRank(_ productId: String) -> Int {
        if productId.contains("monthly") { return 0 }
        if productId.contains("quarter") { return 1 }
        if productId.contains("year") { return 2 }
        return 9
    }
}
