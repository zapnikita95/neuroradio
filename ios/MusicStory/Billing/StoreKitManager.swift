import Foundation
import StoreKit

enum PlayProductIds {
    static let month = "efir_premium_month_usd"
    static let quarter = "efir_premium_quarter_usd"
    static let year = "efir_premium_year_usd"
    static let all = [month, quarter, year]

    static func id(forPlan plan: String) -> String {
        switch plan {
        case "month": return month
        case "quarter": return quarter
        case "year": return year
        default: return month
        }
    }
}

@MainActor
final class StoreKitManager: ObservableObject {
    static let shared = StoreKitManager()

    @Published private(set) var products: [Product] = []
    @Published private(set) var isLoading = false
    @Published var lastError: String?

    private var updatesTask: Task<Void, Never>?

    private init() {
        updatesTask = Task { await listenForTransactions() }
    }

    deinit {
        updatesTask?.cancel()
    }

    func loadProducts() async {
        isLoading = true
        defer { isLoading = false }
        do {
            products = try await Product.products(for: PlayProductIds.all)
        } catch {
            lastError = error.localizedDescription
        }
    }

    func purchase(plan: String) async -> Bool {
        let productId = PlayProductIds.id(forPlan: plan)
        if products.isEmpty { await loadProducts() }
        guard let product = products.first(where: { $0.id == productId }) else {
            lastError = "Product not found in App Store"
            return false
        }
        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)
                let ok = await verifyOnServer(transaction: transaction)
                await transaction.finish()
                return ok
            case .userCancelled:
                return false
            case .pending:
                lastError = "Purchase pending approval"
                return false
            @unknown default:
                return false
            }
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    private func listenForTransactions() async {
        for await update in Transaction.updates {
            if case .verified(let transaction) = update {
                _ = await verifyOnServer(transaction: transaction)
                await transaction.finish()
            }
        }
    }

    private func verifyOnServer(transaction: Transaction) async -> Bool {
        guard let receiptURL = Bundle.main.appStoreReceiptURL,
              let receiptData = try? Data(contentsOf: receiptURL) else {
            lastError = "App Store receipt unavailable"
            return false
        }
        let base64 = receiptData.base64EncodedString()
        do {
            let resp = try await BackendClient.shared.verifyAppStorePurchase(receiptData: base64)
            return resp.ok == true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw StoreError.failedVerification
        case .verified(let safe):
            return safe
        }
    }

    enum StoreError: Error {
        case failedVerification
    }
}
