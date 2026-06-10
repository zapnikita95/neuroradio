import AVFoundation
import MediaPlayer
import UIKit

/// Плавное затухание системной громкости (аналог Android fadeOutAndPause / resumeMusicWithFade).
@MainActor
final class SystemVolumeFader {
    private let volumeView = MPVolumeView(frame: CGRect(x: -1000, y: -1000, width: 1, height: 1))
    private var savedVolume: Float?

    init() {
        volumeView.showsRouteButton = false
        volumeView.isHidden = true
        attachToKeyWindow()
    }

    func fadeOut(duration: TimeInterval) async {
        guard let slider = volumeSlider else { return }
        let start = slider.value
        guard start > 0.01 else { return }
        if savedVolume == nil {
            savedVolume = start
        }
        await ramp(slider: slider, from: start, to: 0, duration: duration)
    }

    func fadeIn(duration: TimeInterval) async {
        guard let slider = volumeSlider else { return }
        let target = savedVolume ?? slider.value
        guard target > 0.01 else {
            savedVolume = nil
            return
        }
        await ramp(slider: slider, from: slider.value, to: target, duration: duration)
        savedVolume = nil
    }

    func restoreIfNeeded() async {
        guard savedVolume != nil else { return }
        await fadeIn(duration: 0.3)
    }

    private var volumeSlider: UISlider? {
        attachToKeyWindow()
        return volumeView.subviews.compactMap { $0 as? UISlider }.first
    }

    private func attachToKeyWindow() {
        guard volumeView.superview == nil else { return }
        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) else { return }
        window.addSubview(volumeView)
    }

    private func ramp(slider: UISlider, from: Float, to: Float, duration: TimeInterval) async {
        if duration <= 0.2 {
            slider.value = to
            return
        }
        let steps = max(8, min(20, Int(duration * 12)))
        let delayNs = UInt64((duration / Double(steps)) * 1_000_000_000)
        for step in 1...steps {
            let progress = Float(step) / Float(steps)
            slider.value = from + (to - from) * progress
            try? await Task.sleep(nanoseconds: delayNs)
        }
        slider.value = to
    }
}
