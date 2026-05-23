import Foundation

/// Spotify App Remote integration.
/// Add `SpotifyiOS.xcframework` from https://github.com/spotify/ios-sdk to enable full SDK support.
/// Until then the manager tracks connection state and exposes metadata when SDK callbacks are wired.
@MainActor
final class SpotifyAppRemoteManager: ObservableObject {
    @Published private(set) var currentTrack: TrackInfo?
    @Published private(set) var isPlaying = false
    @Published private(set) var isConnected = false
    @Published private(set) var connectionError: String?
    @Published private(set) var sdkAvailable = false

    private var pollTask: Task<Void, Never>?
    private weak var sdkBridge: SpotifySDKBridge?

    func configure(clientId: String, redirectURI: String) {
        let bridge = SpotifySDKBridge.shared
        bridge.configure(clientId: clientId, redirectURI: redirectURI)
        sdkBridge = bridge
        sdkAvailable = bridge.isSDKAvailable

        bridge.onPlayerState = { [weak self] state in
            Task { @MainActor in
                self?.applyPlayerState(state)
            }
        }
        bridge.onConnectionChanged = { [weak self] connected in
            Task { @MainActor in
                self?.isConnected = connected
                if connected { self?.connectionError = nil }
            }
        }
    }

    func start() {
        sdkBridge?.start()
    }

    func connect() {
        guard let bridge = sdkBridge else {
            connectionError = "Укажите Spotify Client ID в настройках"
            return
        }
        if !bridge.isSDKAvailable {
            connectionError = "Добавьте SpotifyiOS.xcframework (см. docs/PLAN-06-ios.md)"
            return
        }
        bridge.connect()
    }

    func handleOpenURL(_ url: URL) {
        sdkBridge?.handleOpenURL(url)
    }

    func pauseMusic() {
        sdkBridge?.pause()
        isPlaying = false
    }

    func resumeMusic() {
        sdkBridge?.resume()
        isPlaying = true
    }

    var canControlPlayback: Bool { isConnected && sdkAvailable }

    private func applyPlayerState(_ state: SpotifyPlayerState?) {
        guard let state else {
            if !isConnected { currentTrack = nil }
            return
        }
        isPlaying = state.isPaused == false
        if let track = state.track {
            currentTrack = TrackInfo(
                artist: track.artist,
                title: track.title,
                album: track.album,
                source: .spotify,
                durationMs: track.durationMs
            )
        }
    }
}

struct SpotifyPlayerState: Sendable {
    let isPaused: Bool
    let track: SpotifyTrack?
}

struct SpotifyTrack: Sendable {
    let artist: String
    let title: String
    let album: String?
    let durationMs: Int64
}

/// Thin bridge — uses Spotify SDK when linked, otherwise no-op.
final class SpotifySDKBridge {
    static let shared = SpotifySDKBridge()

    var isSDKAvailable: Bool { SpotifySDKLoader.isAvailable }
    var onPlayerState: ((SpotifyPlayerState?) -> Void)?
    var onConnectionChanged: ((Bool) -> Void)?

    private init() {}

    func configure(clientId: String, redirectURI: String) {
        SpotifySDKLoader.configure(clientId: clientId, redirectURI: redirectURI)
        SpotifySDKLoader.onPlayerState = { [weak self] state in
            self?.onPlayerState?(state)
        }
        SpotifySDKLoader.onConnectionChanged = { [weak self] connected in
            self?.onConnectionChanged?(connected)
        }
    }

    func start() { SpotifySDKLoader.start() }
    func connect() { SpotifySDKLoader.connect() }
    func pause() { SpotifySDKLoader.pause() }
    func resume() { SpotifySDKLoader.resume() }
    func handleOpenURL(_ url: URL) { SpotifySDKLoader.handleOpenURL(url) }
}

enum SpotifySDKLoader {
    static var isAvailable = false
    static var onPlayerState: ((SpotifyPlayerState?) -> Void)?
    static var onConnectionChanged: ((Bool) -> Void)?

    static func configure(clientId: String, redirectURI: String) {
        #if canImport(SpotifyiOS)
        isAvailable = true
        SpotifySDKImpl.configure(clientId: clientId, redirectURI: redirectURI)
        #else
        isAvailable = false
        #endif
    }

    static func start() {
        #if canImport(SpotifyiOS)
        SpotifySDKImpl.start()
        #endif
    }

    static func connect() {
        #if canImport(SpotifyiOS)
        SpotifySDKImpl.connect()
        #endif
    }

    static func pause() {
        #if canImport(SpotifyiOS)
        SpotifySDKImpl.pause()
        #endif
    }

    static func resume() {
        #if canImport(SpotifyiOS)
        SpotifySDKImpl.resume()
        #endif
    }

    static func handleOpenURL(_ url: URL) {
        #if canImport(SpotifyiOS)
        _ = SpotifySDKImpl.handleOpenURL(url)
        #endif
    }
}

#if canImport(SpotifyiOS)
import SpotifyiOS
import UIKit

enum SpotifySDKImpl {
    private static var appRemote: SPTAppRemote?
    private static var configuration: SPTConfiguration?

    static func configure(clientId: String, redirectURI: String) {
        guard let redirectURL = URL(string: redirectURI) else { return }
        let config = SPTConfiguration(clientID: clientId, redirectURL: redirectURL)
        configuration = config
        appRemote = SPTAppRemote(configuration: config, logLevel: .none)
        appRemote?.delegate = AppRemoteDelegate.shared
        appRemote?.playerAPI?.delegate = PlayerDelegate.shared
        PlayerDelegate.shared.appRemote = appRemote
        AppRemoteDelegate.shared.appRemote = appRemote
    }

    static func start() {}

    static func connect() {
        appRemote?.connect()
    }

    static func pause() {
        appRemote?.playerAPI?.pause(nil)
    }

    static func resume() {
        appRemote?.playerAPI?.resume(nil)
    }

    static func handleOpenURL(_ url: URL) -> Bool {
        appRemote?.authorizeAndPlayURI("", asRadio: false, additionalScopes: nil)
        return appRemote?.application(UIApplication.shared, open: url, options: [:]) ?? false
    }

    private final class AppRemoteDelegate: NSObject, SPTAppRemoteDelegate {
        static let shared = AppRemoteDelegate()
        weak var appRemote: SPTAppRemote?

        func appRemoteDidEstablishConnection(_ appRemote: SPTAppRemote) {
            SpotifySDKLoader.onConnectionChanged?(true)
            appRemote.playerAPI?.subscribe(toPlayerState: { _, _ in })
            appRemote.playerAPI?.delegate?.playerStateDidChange?(appRemote.playerAPI!.playerState)
        }

        func appRemote(_ appRemote: SPTAppRemote, didFailConnectionAttemptWithError error: Error?) {
            SpotifySDKLoader.onConnectionChanged?(false)
        }

        func appRemote(_ appRemote: SPTAppRemote, didDisconnectWithError error: Error?) {
            SpotifySDKLoader.onConnectionChanged?(false)
        }
    }

    private final class PlayerDelegate: NSObject, SPTAppRemotePlayerStateDelegate {
        static let shared = PlayerDelegate()
        weak var appRemote: SPTAppRemote?

        func playerStateDidChange(_ playerState: SPTAppRemotePlayerState) {
            let track = playerState.track.map {
                SpotifyTrack(
                    artist: $0.artist.name,
                    title: $0.name,
                    album: $0.album.name,
                    durationMs: Int64($0.duration)
                )
            }
            SpotifySDKLoader.onPlayerState?(
                SpotifyPlayerState(isPaused: playerState.isPaused, track: track)
            )
        }
    }
}
#endif
