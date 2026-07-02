import UIKit

enum StoryShareCardRenderer {
    private static let width: CGFloat = 1080
    private static let height: CGFloat = 1350

    private static let personaImages: [String: String] = [
        "radio_host": "persona-radio_host",
        "night_dj": "persona-night_dj",
        "expert": "persona-expert",
        "contemporary": "persona-contemporary",
        "fan": "persona-fan",
        "backstage": "persona-backstage",
    ]

    static func render(
        artist: String,
        title: String,
        voicedText: String,
        narratorId: String?,
        variant: Int
    ) -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height))
        return renderer.image { ctx in
            let rect = CGRect(x: 0, y: 0, width: width, height: height)
            let colors = [
                UIColor(red: 0.03, green: 0.03, blue: 0.06, alpha: 1).cgColor,
                UIColor(red: 0.16, green: 0.08, blue: 0.31, alpha: 1).cgColor,
                UIColor(red: 0.35, green: 0.10, blue: 0.29, alpha: 1).cgColor,
            ] as CFArray
            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.55, 1]) {
                ctx.cgContext.drawLinearGradient(
                    gradient,
                    start: .zero,
                    end: CGPoint(x: width, y: height),
                    options: []
                )
            } else {
                UIColor.black.setFill()
                ctx.fill(rect)
            }

            let narrator = StoryNarrator.fromId(narratorId)
            let narratorLabel = narrator == .auto ? "Эфир AI" : narrator.labelRu
            let excerpt = StoryShareText.excerpt(voicedText, maxChars: 300)
            let trackLine = "\(artist) — \(title)"

            let personaName = personaImages[narrator.rawValue] ?? "persona-radio_host"
            let personaImg = UIImage(named: personaName) ?? UIImage()
            let logoImg = UIImage(named: "logo_efir_ai") ?? UIImage()

            let avatarSize: CGFloat = 280
            let pad: CGFloat = 64
            let textLeft: CGFloat
            let textTop: CGFloat
            let textWidth: CGFloat
            let avatarLeft: CGFloat
            let avatarTop: CGFloat

            switch variant % 4 {
            case 0:
                avatarLeft = pad
                avatarTop = pad + 40
                textLeft = pad + avatarSize + 40
                textTop = pad + 20
                textWidth = width - textLeft - pad
            case 1:
                avatarLeft = width - pad - avatarSize
                avatarTop = pad + 40
                textLeft = pad
                textTop = pad + 20
                textWidth = width - avatarSize - pad * 2 - 40
            case 2:
                avatarLeft = (width - avatarSize) / 2
                avatarTop = pad
                textLeft = pad
                textTop = pad + avatarSize + 48
                textWidth = width - pad * 2
            default:
                avatarLeft = width - pad - avatarSize
                avatarTop = height - pad - avatarSize - 120
                textLeft = pad
                textTop = pad + 20
                textWidth = width - pad * 2
            }

            let avatarRect = CGRect(x: avatarLeft, y: avatarTop, width: avatarSize, height: avatarSize)
            ctx.cgContext.saveGState()
            ctx.cgContext.addEllipse(in: avatarRect)
            ctx.cgContext.clip()
            personaImg.draw(in: avatarRect)
            ctx.cgContext.restoreGState()

            var y = textTop
            y += drawWrapped(ctx: ctx.cgContext, text: trackLine, x: textLeft, y: y, width: textWidth, font: .boldSystemFont(ofSize: 52), color: UIColor(white: 0.95, alpha: 1), maxLines: 2)
            y += 16
            y += drawWrapped(ctx: ctx.cgContext, text: excerpt, x: textLeft, y: y, width: textWidth, font: .systemFont(ofSize: 36), color: UIColor(white: 0.9, alpha: 1), maxLines: 8)
            y += 24
            let labelAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 28),
                .foregroundColor: UIColor(white: 0.65, alpha: 1),
            ]
            (narratorLabel as NSString).draw(at: CGPoint(x: textLeft, y: y), withAttributes: labelAttrs)

            let logoSize: CGFloat = 72
            logoImg.draw(in: CGRect(x: pad, y: height - pad - logoSize - 8, width: logoSize, height: logoSize))
            let brandAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: 30),
                .foregroundColor: UIColor(red: 0.75, green: 0.52, blue: 0.99, alpha: 1),
            ]
            ("Эфир AI" as NSString).draw(at: CGPoint(x: pad + logoSize + 16, y: height - pad - 24), withAttributes: brandAttrs)
        }
    }

    private static func drawWrapped(
        ctx: CGContext,
        text: String,
        x: CGFloat,
        y: CGFloat,
        width: CGFloat,
        font: UIFont,
        color: UIColor,
        maxLines: Int
    ) -> CGFloat {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byWordWrapping
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: paragraph,
        ]
        let bounding = (text as NSString).boundingRect(
            with: CGSize(width: width, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: attrs,
            context: nil
        )
        let drawHeight = min(bounding.height, font.lineHeight * 1.35 * CGFloat(maxLines))
        (text as NSString).draw(
            with: CGRect(x: x, y: y, width: width, height: drawHeight),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: attrs,
            context: nil
        )
        return drawHeight
    }
}

enum StoryShareHelper {
    static func shareStory(
        artist: String,
        title: String,
        voicedText: String,
        narratorId: String?,
        trackKey: String,
        playedAt: TimeInterval
    ) {
        let variant = StoryShareText.cardVariantSeed(trackKey: trackKey, playedAt: playedAt)
        let image = StoryShareCardRenderer.render(
            artist: artist,
            title: title,
            voicedText: voicedText,
            narratorId: narratorId,
            variant: variant
        )
        let text = StoryShareText.plainShareMessage(artist: artist, title: title, voicedText: voicedText)
        let activity = UIActivityViewController(
            activityItems: [image, text],
            applicationActivities: nil
        )
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
              let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else { return }
        var presenter = root
        while let next = presenter.presentedViewController { presenter = next }
        if let pop = activity.popoverPresentationController {
            pop.sourceView = presenter.view
            pop.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
        }
        presenter.present(activity, animated: true)
    }
}
