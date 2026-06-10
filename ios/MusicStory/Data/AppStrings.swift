import Foundation

/// User-facing copy — keep in sync with `android/app/src/main/res/values/strings.xml`.
enum AppStrings {
    enum OfflinePack {
        static let title = "Офлайн-эфир"
        static let intro = "Соберите 10 разных треков — приложение подготовит для них истории заранее. Потом можно слушать без интернета."
        static let start = "Подготовить офлайн-эфир"
        static let cancel = "Отменить"
        static let refresh = "Собрать новый пакет"
        static let collectingHint = "Включите shuffle или перематывайте треки в плеере. Каждый новый трек добавляется в пакет."
        static let readyHint = "Когда играет трек из пакета, Эфир расскажет сохранённую историю офлайн."
        static let premiumLocked = "Доступно по подписке (или укажи свой API-ключ для ручного режима)"
        static let tierRequiredError = "Офлайн-эфир доступен на расширенном тарифе"

        static func progress(collected: Int, target: Int) -> String {
            "Собрано \(collected) из \(target)"
        }

        static func generating(ready: Int, target: Int) -> String {
            "Готовим истории и факты… \(ready) из \(target)"
        }

        static func ready(count: Int) -> String {
            "Готово! \(count) историй на телефоне — можно слушать без сети."
        }

        static func tracksReadyBody(count: Int) -> String {
            "Готовим \(count) историй в фоне — пришлём уведомление, когда всё будет готово."
        }

        // Notifications — mirror `offline_pack_*` in strings.xml
        static let notifCollectingTitle = "Сбор треков для офлайн-эфира"
        static func notifCollectingBody(collected: Int, target: Int) -> String {
            "\(collected) из \(target)"
        }
        static let notifCollectingHint = "Перематывайте или включите shuffle в музыкальном плеере — нужны разные треки."
        static let notifTracksReadyTitle = "10 треков собраны"
        static func notifTracksReadyBody(count: Int) -> String {
            tracksReadyBody(count: count)
        }
        static let notifGeneratingTitle = "Готовим офлайн-эфир"
        static func notifGeneratingBody(ready: Int, target: Int) -> String {
            "\(ready) из \(target) готово"
        }
        static let notifDoneTitle = "Офлайн-эфир готов"
        static func notifDoneBody(count: Int) -> String {
            "\(count) историй можно слушать без интернета"
        }
        static let notifDoneHint = "Откройте настройки или просто включите трек из пакета — история заиграет офлайн."
        static let notifFailedTitle = "Не удалось подготовить офлайн-эфир"
        static let notifFailedBody = "Проверьте интернет и попробуйте снова в настройках."
    }

    enum History {
        static let listen = "Слушать"
    }
}
