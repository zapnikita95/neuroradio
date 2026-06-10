import Foundation

/// Spotify App Remote integration.
/// Add `SpotifyiOS.xcframework` from https://github.com/spotify/ios-sdk to enable full SDK support.
@MainActor
final class SpotifyAppRemoteManager: ObservableObject {
    @Published private(set) var currentTrack: TrackInfo?
    @Published private(set) var isPlaying = false
    @Published private(set) var isConnected = false
    @Published private(set) var isAuthorizing = false
    @Published private(set) var connectionError: String?
    @Published private(set) var sdkAvailable = false

    private var pollTask: Task<Void, Never>?
    private weak var sdkBridge: SpotifySDKBridge?
    private var configuredClientId = ""
    private var configuredRedirectURI = SettingsDefaults.spotifyRedirectURI

    func configure(clientId: String, redirectURI: String) {
        configuredClientId = clientId.trimmingCharacters(in: .whitespacesAndNewlines)
        configuredRedirectURI = redirectURI.trimmingCharacters(in: .whitespacesAndNewlines)

        let bridge = SpotifySDKBridge.shared
        bridge.configure(clientId: configuredClientId, redirectURI: configuredRedirectURI)
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
                self?.isAuthorizing = false
                if connected { self?.connectionError = nil }
            }
        }
        bridge.onAuthError = { [weak self] message in
            Task { @MainActor in
                self?.isAuthorizing = false
                self?.connectionError = message
            }
        }
    }

    func start() {
        sdkBridge?.start()
        attemptSilentReconnect()
    }

    /// После фона / разрыва App Remote — подключиться с сохранённым токеном без OAuth.
    func attemptSilentReconnect() {
        guard !configuredClientId.isEmpty else { return }
        sdkBridge?.attemptSilentReconnect()
    }

    func connect() {
        connectionError = nil

        guard !configuredClientId.isEmpty else {
            connectionError = "Spotify не настроен в этой сборке. Обновите приложение или укажите Client ID в настройках."
            return
        }

        guard let bridge = sdkBridge else {
            connectionError = "Не удалось инициализировать Spotify. Перезапустите приложение."
            return
        }
        if !bridge.isSDKAvailable {
            connectionError = "Spotify временно недоступен. Попробуйте Apple Music или Shazam."
            return
        }

        isAuthorizing = true
        bridge.connect { [weak self] launched in
            Task { @MainActor in
                guard let self else { return }
                if !launched {
                    self.isAuthorizing = false
                    self.connectionError = "Установите приложение Spotify и попробуйте снова."
                }
            }
        }
    }

    func handleOpenURL(_ url: URL) {
        guard isSpotifyCallbackURL(url) else { return }
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

    private func isSpotifyCallbackURL(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "efirai" else { return false }
        let host = url.host?.lowercased() ?? ""
        let path = url.path.lowercased()
        return host == "spotify-callback" || path.contains("spotify-callback")
    }

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
    var onAuthError: ((String) -> Void)?

    private init() {}

    func configure(clientId: String, redirectURI: String) {
        SpotifySDKLoader.onAuthError = { [weak self] message in
            self?.onAuthError?(message)
        }
        SpotifySDKLoader.configure(clientId: clientId, redirectURI: redirectURI)
        SpotifySDKLoader.onPlayerState = { [weak self] state in
            self?.onPlayerState?(state)
        }
        SpotifySDKLoader.onConnectionChanged = { [weak self] connected in
            self?.onConnectionChanged?(connected)
        }
    }

    func start() { SpotifySDKLoader.start() }

    func attemptSilentReconnect() { SpotifySDKLoader.attemptSilentReconnect() }

    func connect(completion: @escaping (Bool) -> Void) {
        SpotifySDKLoader.connect(completion: completion)
    }

    func pause() { SpotifySDKLoader.pause() }
    func resume() { SpotifySDKLoader.resume() }
    func handleOpenURL(_ url: URL) { SpotifySDKLoader.handleOpenURL(url) }
}

enum SpotifySDKLoader {
    static var isAvailable = false
    static var onPlayerState: ((SpotifyPlayerState?) -> Void)?
    static var onConnectionChanged: ((Bool) -> Void)?
    static var onAuthError: ((String) -> Void)?

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

    static func attemptSilentReconnect() {
        #if canImport(SpotifyiOS)
        SpotifySDKImpl.attemptSilentReconnect()
        #endif
    }

    static func connect(completion: @escaping (Bool) -> Void) {
        #if canImport(SpotifyiOS)
        SpotifySDKImpl.connect(completion: completion)
        #else
        completion(false)
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
    private static let accessTokenKey = "spotify_app_remote_access_token"
    private static var appRemote: SPTAppRemote?
    private static var pendingCallbackURL: URL?
    private static var configuredClientId = ""
    private static var configuredRedirectURI = ""
    private static var reconnectTask: Task<Void, Never>?

    static func configure(clientId: String, redirectURI: String) {
        configuredClientId = clientId.trimmingCharacters(in: .whitespacesAndNewlines)
        configuredRedirectURI = redirectURI.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !configuredClientId.isEmpty else {
            appRemote = nil
            return
        }
        guard let redirectURL = URL(string: configuredRedirectURI) else {
            SpotifySDKLoader.onAuthError?("Неверный Redirect URI Spotify.")
            appRemote = nil
            return
        }

        let config = SPTConfiguration(clientID: configuredClientId, redirectURL: redirectURL)
        config.playURI = ""
        let remote = SPTAppRemote(configuration: config, logLevel: .none)
        remote.delegate = AppRemoteDelegate.shared
        AppRemoteDelegate.shared.appRemote = remote
        appRemote = remote
        if let saved = UserDefaults.standard.string(forKey: accessTokenKey), !saved.isEmpty {
            remote.connectionParameters.accessToken = saved
        }

        if let pending = pendingCallbackURL {
            pendingCallbackURL = nil
            _ = handleOpenURL(pending)
        }
    }

    static func start() {
        attemptSilentReconnect()
    }

    static func attemptSilentReconnect() {
        guard let remote = appRemote, !configuredClientId.isEmpty else { return }
        guard !remote.isConnected else { return }
        var token = remote.connectionParameters.accessToken ?? ""
        if token.isEmpty {
            token = UserDefaults.standard.string(forKey: accessTokenKey) ?? ""
        }
        guard !token.isEmpty else { return }
        remote.connectionParameters.accessToken = token
        remote.connect()
    }

    static func connect(completion: @escaping (Bool) -> Void) {
        guard !configuredClientId.isEmpty else {
            SpotifySDKLoader.onAuthError?("Не задан Spotify Client ID.")
            completion(false)
            return
        }
        appRemote?.authorizeAndPlayURI("", asRadio: false, additionalScopes: nil) { success in
            DispatchQueue.main.async {
                completion(success)
            }
        }
    }

    static func pause() {
        appRemote?.playerAPI?.pause(nil)
    }

    static func resume() {
        appRemote?.playerAPI?.resume(nil)
    }

    static func handleOpenURL(_ url: URL) -> Bool {
        guard let appRemote else {
            pendingCallbackURL = url
            return false
        }
        guard let params = appRemote.authorizationParameters(from: url) else {
            SpotifySDKLoader.onAuthError?("Spotify не вернул данные авторизации. Проверьте Redirect URI: efirai://spotify-callback")
            return false
        }

        if let token = params[SPTAppRemoteAccessTokenKey] {
            UserDefaults.standard.set(token, forKey: accessTokenKey)
            appRemote.connectionParameters.accessToken = token
            appRemote.connect()
            return true
        }

        if let error = params[SPTAppRemoteErrorDescriptionKey], !error.isEmpty {
            SpotifySDKLoader.onAuthError?(error)
        } else if params[SPTAppRemoteErrorKey] != nil {
            SpotifySDKLoader.onAuthError?("Spotify отклонил подключение.")
        } else {
            SpotifySDKLoader.onAuthError?("Не удалось завершить подключение Spotify.")
        }
        return false
    }

    private final class AppRemoteDelegate: NSObject, SPTAppRemoteDelegate {
        static let shared = AppRemoteDelegate()
        weak var appRemote: SPTAppRemote?

        func appRemoteDidEstablishConnection(_ appRemote: SPTAppRemote) {
            SpotifySDKLoader.onConnectionChanged?(true)
            appRemote.playerAPI?.delegate = PlayerDelegate.shared
            appRemote.playerAPI?.subscribe(toPlayerState: { result, _ in
                guard let state = result as? SPTAppRemotePlayerState else { return }
                PlayerDelegate.shared.playerStateDidChange(state)
            })
            appRemote.playerAPI?.getPlayerState { result, _ in
                guard let state = result as? SPTAppRemotePlayerState else { return }
                PlayerDelegate.shared.playerStateDidChange(state)
            }
        }

        func appRemote(_ appRemote: SPTAppRemote, didFailConnectionAttemptWithError error: Error?) {
            SpotifySDKLoader.onConnectionChanged?(false)
            let message = error?.localizedDescription ?? "Spotify не подключился. Запустите трек в Spotify и попробуйте снова."
            SpotifySDKLoader.onAuthError?(message)
        }

        func appRemote(_ appRemote: SPTAppRemote, didDisconnectWithError error: Error?) {
            SpotifySDKLoader.onConnectionChanged?(false)
            SpotifySDKImpl.scheduleReconnect()
        }
    }

    static func scheduleReconnect() {
        reconnectTask?.cancel()
        reconnectTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            attemptSilentReconnect()
        }
    }

    private final class PlayerDelegate: NSObject, SPTAppRemotePlayerStateDelegate {
        static let shared = PlayerDelegate()

        func playerStateDidChange(_ playerState: SPTAppRemotePlayerState) {
            let trackObj = playerState.track
            let mapped = SpotifyTrack(
                artist: trackObj.artist.name,
                title: trackObj.name,
                album: trackObj.album.name,
                durationMs: Int64(trackObj.duration)
            )
            SpotifySDKLoader.onPlayerState?(
                SpotifyPlayerState(isPaused: playerState.isPaused, track: mapped)
            )
        }
    }
}
#endif
