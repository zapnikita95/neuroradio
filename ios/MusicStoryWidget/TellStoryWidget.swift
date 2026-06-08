import WidgetKit
import SwiftUI

struct TellStoryWidget: Widget {
    let kind = "TellStoryWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TellStoryProvider()) { _ in
            TellStoryWidgetView()
        }
        .configurationDisplayName("Music Story")
        .description("Быстро запросить историю о текущем треке")
        .supportedFamilies([.systemSmall, .accessoryCircular])
    }
}

struct TellStoryProvider: TimelineProvider {
    func placeholder(in context: Context) -> TellStoryEntry {
        TellStoryEntry(date: .now)
    }

    func getSnapshot(in context: Context, completion: @escaping (TellStoryEntry) -> Void) {
        completion(TellStoryEntry(date: .now))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TellStoryEntry>) -> Void) {
        completion(Timeline(entries: [TellStoryEntry(date: .now)], policy: .never))
    }
}

struct TellStoryEntry: TimelineEntry {
    let date: Date
}

struct TellStoryWidgetView: View {
    var body: some View {
        Link(destination: URL(string: "efirai://tell-story")!) {
            ZStack {
                ContainerRelativeShape()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.07, green: 0.06, blue: 0.12),
                                Color(red: 0.12, green: 0.08, blue: 0.18),
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                VStack(spacing: 8) {
                    Image(systemName: "waveform.circle.fill")
                        .font(.title)
                        .foregroundStyle(Color(red: 0.95, green: 0.78, blue: 0.36))
                    Text("История")
                        .font(.caption.bold())
                        .foregroundStyle(.white)
                }
            }
        }
    }
}

@main
struct MusicStoryWidgetBundle: WidgetBundle {
    var body: some Widget {
        TellStoryWidget()
    }
}
