import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var settings: SettingsStore
    @EnvironmentObject private var orchestrator: StoryOrchestrator
    @EnvironmentObject private var nowPlaying: NowPlayingCoordinator

    @State private var showAccount = false
    @State private var artistsDraft = ""
    @State private var genresDraft = ""

    var body: some View {
        MusicStoryBackground {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    accountSection
                    generalSection
                    triggerSection
                    sameTrackSection
                    narratorSection
                    voiceSection
                    musicSection
                    spotifySection
                    advancedSection
                }
                .padding(20)
            }
        }
        .onAppear {
            artistsDraft = settings.specificArtists.joined(separator: ", ")
            genresDraft = settings.specificGenres.joined(separator: ", ")
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
                Text("Настройки")
                    .foregroundStyle(AppTheme.creamText)
            }
        }
        .navigationDestination(isPresented: $showAccount) {
            AccountView()
        }
        .task {
            await StoryRepository.shared.refreshQuota()
            _ = await AccountAuthManager.shared.fetchProfile()
        }
    }

    private var accountSection: some View {
        SettingsSection(
            title: "Аккаунт",
            summary: accountSectionSummary
        ) {
            if settings.accountProfile?.isLoggedIn == true {
                Text(settings.accountProfile?.displayName ?? "")
                    .foregroundStyle(AppTheme.creamText)
                if let plan = settings.accountProfile?.plan {
                    Text(accountPlanLabel(plan))
                        .font(.caption)
                        .foregroundStyle(AppTheme.mutedLavender)
                }
                if let trialUntil = settings.accountProfile?.trialUntil,
                   trialUntil > Int64(Date().timeIntervalSince1970 * 1000),
                   settings.accountProfile?.plan?.lowercased() == "trial" {
                    Text("Пробный Premium до \(formatTrialDate(trialUntil))")
                        .font(.caption)
                        .foregroundStyle(AppTheme.liveGreen)
                }
                Button { showAccount = true } label: {
                    PrimaryStoryButtonLabel(title: "Аккаунт и подписка")
                }
                .buttonStyle(.plain)
            } else {
                Text("Войдите — история сохранится в облаке и восстановится на новом телефоне.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.mutedLavender)
                Button { showAccount = true } label: {
                    PrimaryStoryButtonLabel(title: "Войти")
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var accountSectionSummary: String {
        if settings.accountProfile?.isLoggedIn == true {
            return settings.accountProfile?.displayName ?? "Аккаунт активен"
        }
        return "Email — история в облаке"
    }

    private func accountPlanLabel(_ plan: String) -> String {
        switch plan.lowercased() {
        case "premium": return "Premium активен"
        case "trial": return "Пробный Premium"
        case "free": return "Бесплатный тариф"
        default: return "Тариф: \(plan)"
        }
    }

    private func formatTrialDate(_ ms: Int64) -> String {
        let date = Date(timeIntervalSince1970: TimeInterval(ms) / 1000)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ru_RU")
        formatter.dateFormat = "d MMM"
        return formatter.string(from: date)
    }

    private var generalSection: some View {
        SettingsSection(
            title: "Общее",
            summary: autoPlaybackOn ? "Автоперехват" : "Ручной режим",
            initiallyExpanded: true
        ) {
            Toggle(isOn: Binding(
                get: { autoPlaybackOn },
                set: { auto in
                    settings.setAutoPlaybackMode(auto)
                    orchestrator.syncModeFromSettings()
                }
            )) {
                Text(autoPlaybackOn ? "Автоперехват" : "Ручной режим")
                    .foregroundStyle(AppTheme.creamText)
            }
            .tint(AppTheme.accentViolet)

            Text("Включено — истории запускаются сами при смене трека. Выключено — только вручную кнопкой «Рассказать».")
                .font(.caption)
                .foregroundStyle(AppTheme.mutedLavender)

            Toggle(isOn: $settings.speakTrackNamesInVoiceover) {
                Text("Названия треков в озвучке")
                    .foregroundStyle(AppTheme.creamText)
            }
            .tint(AppTheme.accentViolet)

            Text("Включено — в голосе звучат название и исполнитель на английском (Title by Artist). Выключено — «эта песня», «текущий трек» и т.п.")
                .font(.caption)
                .foregroundStyle(AppTheme.mutedLavender)
        }
    }

    private var autoPlaybackOn: Bool {
        !settings.manualMode
    }

    private var triggerSection: some View {
        SettingsSection(
            title: "Когда рассказывать",
            summary: settings.triggerMode.label
        ) {
            Picker("Режим", selection: $settings.triggerMode) {
                ForEach(TriggerMode.allCases) { mode in
                    Text(mode.label).tag(mode)
                }
            }
            .pickerStyle(.menu)
            .tint(AppTheme.accentViolet)

            if settings.triggerMode == .everyNTracks {
                Stepper("Каждые N треков: \(settings.everyNTracks)", value: $settings.everyNTracks, in: 1...50)
                    .foregroundStyle(AppTheme.creamText)
            }

            if settings.triggerMode == .specificArtists {
                Text("Артисты через запятую")
                    .font(.caption)
                    .foregroundStyle(AppTheme.mutedLavender)
                listTextField("Lady Gaga, The Weeknd", text: $artistsDraft) {
                    settings.specificArtists = parseList($0)
                }
            }

            if settings.triggerMode == .specificGenres {
                Text("Жанры через запятую")
                    .font(.caption)
                    .foregroundStyle(AppTheme.mutedLavender)
                listTextField("rock, pop", text: $genresDraft) {
                    settings.specificGenres = parseList($0)
                }
            }
        }
    }

    private var sameTrackSection: some View {
        SettingsSection(
            title: "Повтор одного трека",
            summary: "Каждые \(settings.sameTrackStoryEveryN) раз(а)"
        ) {
            Stepper("История для того же трека: \(settings.sameTrackStoryEveryN)", value: $settings.sameTrackStoryEveryN, in: 1...10)
                .foregroundStyle(AppTheme.creamText)
        }
    }

    private var narratorSection: some View {
        SettingsSection(
            title: "Рассказчик (амплуа)",
            summary: settings.storyNarrator.labelRu
        ) {
            ForEach(StoryNarrator.allCases) { narrator in
                narratorRow(
                    label: narrator.labelRu,
                    description: narrator.descriptionRu,
                    selected: settings.storyNarrator == narrator
                ) {
                    settings.storyNarrator = narrator
                }
            }
        }
    }

    private var voiceSection: some View {
        SettingsSection(
            title: "Голос и длина",
            summary: voiceSectionSummary,
            initiallyExpanded: true
        ) {
            if settings.hasPremiumTtsAccess {
                Text("На подписке можно выбрать Microsoft Edge или Yandex SpeechKit.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.mutedLavender)

                ForEach(ServerTtsProvider.allCases, id: \.rawValue) { provider in
                    narratorRow(
                        label: provider.labelRu,
                        description: provider.descriptionRu,
                        selected: settings.serverTtsProvider == provider
                    ) {
                        settings.serverTtsProvider = provider
                    }
                }
            } else {
                Text("Сейчас озвучка — Microsoft Edge. Yandex SpeechKit доступен на пробном и платном тарифе после входа.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.mutedLavender)
            }

            if settings.effectiveServerTtsProvider == .edge {
                Text("Голос Microsoft Edge")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AppTheme.mutedLavender)
                    .padding(.top, 4)

                ForEach(EdgeVoicePreset.allCases) { preset in
                    narratorRow(
                        label: preset.labelRu,
                        description: preset.descriptionRu,
                        selected: settings.edgeVoicePreset == preset
                    ) {
                        settings.edgeVoicePreset = preset
                    }
                }
            } else {
                Text("Голос Yandex SpeechKit")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AppTheme.mutedLavender)
                    .padding(.top, 4)

                ForEach(TtsVoice.allCases) { voice in
                    narratorRow(
                        label: voice.labelRu,
                        description: voice.descriptionRu,
                        selected: settings.ttsVoice == voice
                    ) {
                        settings.ttsVoice = voice
                    }
                }

                Text("Интонация")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AppTheme.mutedLavender)
                    .padding(.top, 8)

                ForEach(TtsEmotion.allCases) { emotion in
                    narratorRow(
                        label: emotion.labelRu,
                        description: emotion.descriptionRu,
                        selected: settings.ttsEmotion == emotion
                    ) {
                        settings.ttsEmotion = emotion
                    }
                }
            }

            Text("Темп голоса")
                .font(.caption.weight(.semibold))
                .foregroundStyle(AppTheme.mutedLavender)
                .padding(.top, 8)

            ForEach(TtsSpeed.allCases) { speed in
                narratorRow(
                    label: speed.labelRu,
                    description: "",
                    selected: settings.ttsSpeedPreset == speed
                ) {
                    settings.ttsSpeedPreset = speed
                }
            }

            Text("Длина истории")
                .font(.caption.weight(.semibold))
                .foregroundStyle(AppTheme.mutedLavender)
                .padding(.top, 8)

            ForEach(StoryLength.allCases) { length in
                narratorRow(
                    label: length.labelRu,
                    description: length.descriptionRu,
                    selected: settings.storyLength == length
                ) {
                    settings.storyLength = length
                }
            }
        }
    }

    private var voiceSectionSummary: String {
        let speed = settings.ttsSpeedPreset.labelRu
        let length = settings.storyLength.labelRu
        if settings.effectiveServerTtsProvider == .yandex {
            return "\(length) · Yandex · \(settings.ttsVoice.labelRu) · \(speed)"
        }
        return "\(length) · Edge · \(settings.edgeVoicePreset.labelRu) · \(speed)"
    }

    private var musicSection: some View {
        SettingsSection(
            title: "Музыка",
            summary: "Затухание \(String(format: "%.1f", settings.musicFadeSeconds)) с"
        ) {
            VStack(alignment: .leading) {
                Text("Плавное затухание при истории")
                    .foregroundStyle(AppTheme.mutedLavender)
                    .font(.caption)
                Slider(value: $settings.musicFadeSeconds, in: 0...4, step: 0.5)
                    .tint(AppTheme.accentViolet)
            }
        }
    }

    private var spotifySection: some View {
        SettingsSection(
            title: "Spotify",
            summary: nowPlaying.spotify.isConnected ? "Подключён" : "Не подключён",
            initiallyExpanded: true
        ) {
            Text("Запустите трек в Spotify, затем нажмите «Подключить» и подтвердите доступ.")
                .font(.caption)
                .foregroundStyle(AppTheme.mutedLavender)

            #if DEBUG
            if !settings.hasSpotifyClientId {
                TextField("Spotify Client ID", text: $settings.spotifyClientId)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .foregroundStyle(AppTheme.creamText)
                    .onSubmit {
                        nowPlaying.prepareSpotify(settings: settings)
                    }
            }
            #endif

            if let error = nowPlaying.spotify.connectionError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(AppTheme.errorCoral)
            }

            PrimaryStoryButton(title: nowPlaying.spotify.isConnected ? "Переподключить Spotify" : "Подключить Spotify") {
                nowPlaying.prepareSpotify(settings: settings)
                nowPlaying.spotify.connect()
            }
            .disabled(nowPlaying.spotify.isAuthorizing)
        }
    }

    private var advancedSection: some View {
        SettingsSection(
            title: "Продвинутые настройки",
            summary: advancedSummary
        ) {
            if let quota = StoryRepository.shared.dailyQuota {
                Text("Лимит историй: \(quota.remaining) из \(quota.limit) сегодня")
                    .font(.caption)
                    .foregroundStyle(AppTheme.liveGreen)
            }

            if let tier = settings.serverTier, !tier.isEmpty {
                Text("Тариф на сервере: \(tier)")
                    .font(.caption)
                    .foregroundStyle(AppTheme.mutedLavender)
            }

            Toggle(isOn: $settings.autoIntercept) {
                Text("Автоперехват при смене трека")
                    .foregroundStyle(AppTheme.creamText)
            }
            .tint(AppTheme.accentViolet)

            Text("Артисты (для режима «Выбранные артисты»)")
                .font(.caption)
                .foregroundStyle(AppTheme.mutedLavender)
            listTextField("Lady Gaga, The Weeknd", text: $artistsDraft) {
                settings.specificArtists = parseList($0)
            }

            Text("Жанры (для режима «Выбранные жанры»)")
                .font(.caption)
                .foregroundStyle(AppTheme.mutedLavender)
            listTextField("rock, pop", text: $genresDraft) {
                settings.specificGenres = parseList($0)
            }
        }
    }

    private var advancedSummary: String {
        var parts: [String] = []
        if let tier = settings.serverTier, !tier.isEmpty { parts.append(tier) }
        if let q = StoryRepository.shared.dailyQuota {
            parts.append("\(q.remaining)/\(q.limit) историй")
        }
        return parts.isEmpty ? "Лимиты, артисты, жанры" : parts.joined(separator: " · ")
    }

    private func parseList(_ draft: String) -> [String] {
        draft
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private func listTextField(_ placeholder: String, text: Binding<String>, onCommit: @escaping (String) -> Void) -> some View {
        TextField(placeholder, text: text)
            .foregroundStyle(AppTheme.creamText)
            .onSubmit { onCommit(text.wrappedValue) }
            .onChange(of: text.wrappedValue) { onCommit($0) }
    }

    private func narratorRow(label: String, description: String, selected: Bool, onSelect: @escaping () -> Void) -> some View {
        Button(action: onSelect) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(selected ? AppTheme.accentViolet : AppTheme.mutedLavender)
                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .foregroundStyle(AppTheme.creamText)
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(AppTheme.mutedLavender)
                }
                Spacer()
            }
        }
        .buttonStyle(.plain)
    }
}
