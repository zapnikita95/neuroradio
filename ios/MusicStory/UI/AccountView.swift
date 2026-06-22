import SwiftUI

struct AccountView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var settings: SettingsStore

    @State private var loading = true
    @State private var profile: AccountProfile?
    @State private var loadError: String?
    @State private var showLogin = false
    @State private var isDeletingAccount = false
    @State private var showDeleteConfirm = false
    @State private var accountMessage: String?

    private var copy: AppL10n { AppStrings.l10n(settings.resolvedLanguage) }

    var body: some View {
        MusicStoryBackground {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    accountTabContent
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
                Text(copy.accountTab)
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
                        Text(copy.accountSignedInSubtitle)
                            .font(.footnote)
                            .foregroundStyle(AppTheme.mutedLavender)
                    }
                } else if let cached = settings.accountProfile, cached.isLoggedIn {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(cached.displayName)
                            .font(.headline)
                            .foregroundStyle(AppTheme.creamText)
                        Text(copy.accountSignedInSubtitle)
                            .font(.footnote)
                            .foregroundStyle(AppTheme.mutedLavender)
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
