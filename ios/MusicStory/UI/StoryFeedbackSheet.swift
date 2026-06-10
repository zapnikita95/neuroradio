import SwiftUI

struct StoryFeedbackSheet: View {
    let feedback: PendingStoryFeedback
    let onDismiss: () -> Void
    var onSubmitted: () -> Void = {}

    @State private var vote: FeedbackVote?
    @State private var selectedReasons = Set<String>()
    @State private var sent = false
    @State private var sending = false

    var body: some View {
        VStack(spacing: 14) {
            Text("Как история?")
                .font(.headline)
                .foregroundStyle(AppTheme.creamText)

            if sent {
                Text("Спасибо!")
                    .font(.body)
                    .foregroundStyle(AppTheme.liveGreen)
            } else {
                HStack(spacing: 32) {
                    feedbackVoteButton(emoji: "👍", selected: vote == .like) {
                        vote = .like
                        selectedReasons = []
                    }
                    feedbackVoteButton(emoji: "👎", selected: vote == .dislike) {
                        vote = .dislike
                        selectedReasons = []
                    }
                }

                if let vote {
                    Text("Можно выбрать несколько")
                        .font(.caption)
                        .foregroundStyle(AppTheme.mutedLavender)

                    ForEach(reasons(for: vote), id: \.id) { reason in
                        reasonRow(reason)
                    }

                    PrimaryStoryButton(
                        title: "Отправить",
                        enabled: !selectedReasons.isEmpty,
                        loading: sending
                    ) {
                        Task { await submit(vote: vote) }
                    }
                }

                SecondaryStoryButton(title: "Пропустить", action: onDismiss)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity)
        .background(
            AppTheme.deepVoid.opacity(0.96)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(AppTheme.glassBorder, lineWidth: 1)
        )
        .padding(.horizontal, 12)
        .onChange(of: sent) { ok in
            guard ok else { return }
            Task {
                try? await Task.sleep(nanoseconds: 1_400_000_000)
                onDismiss()
            }
        }
    }

    private func feedbackVoteButton(emoji: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(emoji)
                .font(.system(size: 32))
                .frame(width: 72, height: 72)
                .background(
                    Circle()
                        .fill(selected ? AppTheme.accentViolet.opacity(0.28) : AppTheme.surfaceGlass.opacity(0.5))
                )
                .overlay(
                    Circle()
                        .stroke(selected ? AppTheme.accentViolet : AppTheme.glassBorder, lineWidth: selected ? 2 : 1)
                )
        }
        .buttonStyle(.plain)
    }

    private func reasonRow(_ reason: FeedbackReasonOption) -> some View {
        let picked = selectedReasons.contains(reason.id)
        return Button {
            if picked {
                selectedReasons.remove(reason.id)
            } else {
                selectedReasons.insert(reason.id)
            }
        } label: {
            Text(reason.labelRu)
                .font(.body)
                .foregroundStyle(picked ? AppTheme.creamText : AppTheme.mutedLavender)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(picked ? AppTheme.accentViolet.opacity(0.22) : AppTheme.surfaceGlass.opacity(0.35))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(picked ? AppTheme.accentViolet : .clear, lineWidth: 1.5)
                )
        }
        .buttonStyle(.plain)
    }

    private func reasons(for vote: FeedbackVote) -> [FeedbackReasonOption] {
        switch vote {
        case .like: return FeedbackReasonOption.likeReasons
        case .dislike: return FeedbackReasonOption.dislikeReasons
        }
    }

    private func submit(vote: FeedbackVote) async {
        guard !selectedReasons.isEmpty, !sending else { return }
        sending = true
        defer { sending = false }
        let ok = await StoryRepository.shared.submitPendingStoryFeedback(
            feedback: feedback,
            vote: vote.rawValue,
            reasons: Array(selectedReasons)
        )
        if ok {
            sent = true
            onSubmitted()
        }
    }
}

enum FeedbackVote: String {
    case like
    case dislike
}

struct FeedbackReasonOption: Identifiable {
    let id: String
    let labelRu: String

    static let likeReasons: [FeedbackReasonOption] = [
        FeedbackReasonOption(id: "interesting_fact", labelRu: "Интересный факт"),
        FeedbackReasonOption(id: "good_speech", labelRu: "Хорошая речь"),
        FeedbackReasonOption(id: "good_persona", labelRu: "Понравился рассказчик"),
    ]

    static let dislikeReasons: [FeedbackReasonOption] = [
        FeedbackReasonOption(id: "hallucination", labelRu: "Выдумка / неправда"),
        FeedbackReasonOption(id: "boring_fact", labelRu: "Скучный факт"),
        FeedbackReasonOption(id: "unnatural_voice", labelRu: "Неестественный голос"),
        FeedbackReasonOption(id: "speech_manner", labelRu: "Манера речи"),
    ]
}
