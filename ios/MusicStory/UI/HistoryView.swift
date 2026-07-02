import SwiftUI
import SwiftData

struct HistoryView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var orchestrator: StoryOrchestrator
    @EnvironmentObject private var settings: SettingsStore
    @Query(sort: \StoryHistoryEntry.createdAt, order: .reverse) private var stories: [StoryHistoryEntry]
    @Query(sort: \ScrobbleEntry.scrobbledAt, order: .reverse) private var scrobbles: [ScrobbleEntry]

    @State private var tab = 0

    private var copy: AppL10n { AppStrings.l10n(settings.resolvedLanguage) }

    var body: some View {
        MusicStoryBackground {
            VStack(spacing: 0) {
                Picker("", selection: $tab) {
                    Text("Истории").tag(0)
                    Text("Прослушивания").tag(1)
                }
                .pickerStyle(.segmented)
                .padding()

                if tab == 0 {
                    storyList
                } else {
                    scrobbleList
                }
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
                Text(copy.historyTitle)
                    .foregroundStyle(AppTheme.creamText)
            }
        }
    }

    private var storyList: some View {
        List {
            if stories.isEmpty {
                Text("Пока нет сохранённых историй")
                    .foregroundStyle(AppTheme.mutedLavender)
                    .listRowBackground(Color.clear)
            } else {
                ForEach(stories) { entry in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("\(entry.artist) — \(entry.title)")
                                .font(.headline)
                                .foregroundStyle(AppTheme.creamText)
                            Spacer()
                            if let vote = entry.vote {
                                Text(vote == "like" ? "👍" : "👎")
                            }
                        }
                        if let vote = entry.vote {
                            Text(vote == "like" ? "Ты поставил 👍" : "Ты поставил 👎")
                                .font(.caption2)
                                .foregroundStyle(AppTheme.liveGreen)
                        }
                        Text(entry.displayVoicedText)
                            .font(.caption)
                            .foregroundStyle(AppTheme.mutedLavender)
                            .lineLimit(4)
                        if StoryRepository.shared.canReplayOffline(trackKey: entry.trackKey) {
                            Button(copy.listen) {
                                Task { await orchestrator.replayHistoryStory(entry) }
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(AppTheme.goldBright)
                        }
                        SecondaryStoryButton(title: copy.shareStory) {
                            StoryShareHelper.shareStory(
                                artist: entry.artist,
                                title: entry.title,
                                voicedText: entry.displayVoicedText,
                                narratorId: entry.storyNarrator,
                                trackKey: entry.trackKey,
                                playedAt: entry.createdAt.timeIntervalSince1970
                            )
                        }
                    }
                    .listRowBackground(AppTheme.surfaceGlass)
                }
            }
        }
        .scrollContentBackground(.hidden)
    }

    private var scrobbleList: some View {
        List {
            if scrobbles.isEmpty {
                Text("Пока нет записей")
                    .foregroundStyle(AppTheme.mutedLavender)
                    .listRowBackground(Color.clear)
            } else {
                ForEach(scrobbles) { entry in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(entry.title)
                                .foregroundStyle(AppTheme.creamText)
                            Text(entry.artist)
                                .font(.caption)
                                .foregroundStyle(AppTheme.mutedLavender)
                        }
                        Spacer()
                        SourceBadge(source: entry.source)
                    }
                    .listRowBackground(AppTheme.surfaceGlass)
                }
            }
        }
        .scrollContentBackground(.hidden)
    }
}
