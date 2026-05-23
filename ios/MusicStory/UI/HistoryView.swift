import SwiftUI
import SwiftData

struct HistoryView: View {
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \StoryHistoryEntry.createdAt, order: .reverse) private var stories: [StoryHistoryEntry]
    @Query(sort: \ScrobbleEntry.scrobbledAt, order: .reverse) private var scrobbles: [ScrobbleEntry]

    @State private var tab = 0

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
                Text("История")
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
                        Text("\(entry.artist) — \(entry.title)")
                            .font(.headline)
                            .foregroundStyle(AppTheme.creamText)
                        Text(entry.script)
                            .font(.caption)
                            .foregroundStyle(AppTheme.mutedLavender)
                            .lineLimit(4)
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
