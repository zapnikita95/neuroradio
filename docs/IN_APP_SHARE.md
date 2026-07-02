# Шаринг истории из приложения

## Формат

- **PNG 1080×1350** (4:5 — VK / Instagram / TG)
- **Plain text** fallback + ссылка `https://www.efir-ai.ru`
- Текст на карточке = **`voicedText`** (как озвучено), не сырой LLM-script

## Элементы карточки

1. Градиент фона (brand: `#08070f` → `#a855f7` → `#ff5da2`)
2. **Artist — Title**
3. Excerpt из `voicedText` (~280 символов, по границе предложения)
4. Круглый аватар амплуа (512px source)
5. Подпись амплуа RU («Радиоведущий», …)
6. Лого Эфир AI

## 4 шаблона (variant = hash % 4)

| Variant | Narrator | Text |
|---------|----------|------|
| 0 | слева | справа |
| 1 | справа | слева |
| 2 | сверху по центру | снизу |
| 3 | снизу справа | сверху слева |

Variant стабилен для одной истории: `hash(trackKey + playedAt) % 4`.

## Ассеты

| Платформа | Путь |
|-----------|------|
| Source | `play-store/personas-round/persona-{id}-round-512.png` |
| Android | `res/drawable-nodpi/persona_{id}.png` + `logo_efir_ai.png` |
| iOS | `Resources/Personas/persona-{id}.png` + logo |

Narrator ids: `radio_host`, `night_dj`, `expert`, `contemporary`, `fan`, `backstage`, `auto` → generic logo mark.

## Точки UI

1. **History** (primary) — рядом с «Слушать»
2. **StoryFeedbackSheet** — над «Пропустить»

## Реализация

| Platform | Renderer | Launcher |
|----------|----------|----------|
| Android | `StoryShareCardRenderer.kt` | `StoryShareHelper.kt` → `Intent.ACTION_SEND` |
| iOS | `StoryShareCardRenderer.swift` | `StoryShareHelper.swift` → `UIActivityViewController` |

## Строки

- Android: `action_share_story` в `strings.xml` / `values-en`
- iOS: `AppL10n.shareStory`

## Env

**Не требуются** — полностью on-device.
