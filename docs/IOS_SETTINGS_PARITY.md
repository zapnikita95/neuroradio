# iOS Settings — паритет с Android

Экран: `ios/MusicStory/UI/SettingsView.swift`  
Эталон: `android/.../ui/screens/SettingsScreen.kt`

## Секции (порядок)

| # | Android string | iOS |
|---|----------------|-----|
| 1 | Общее | Уведомления, Shazam, **названия треков в озвучке** |
| 2 | Режим | Ручной режим |
| 3 | Триггер | TriggerMode + stepper N |
| 4 | `settings_narrator_section` | Рассказчик (амплуа) — 7 персонажей |
| 5 | `settings_voice_section` | Озвучка — см. ниже |
| 6 | Spotify | Client ID + кнопка |
| 7 | Ручной ввод | Артист / название |
| 8 | Офлайн-эфир | Только premium/unlimited |

## Озвучка (как Android)

**Бесплатный тариф:** только Microsoft Edge — выбор `EdgeVoicePreset`, скорость, длина.

**Trial / Premium:** переключатель движка Edge ↔ Yandex SpeechKit.

- **Edge:** пресеты Edge + скорость + длина
- **Yandex:** голоса SpeechKit + интонация + скорость + длина

## Чего нет в UI

- URL бэкенда (зашит `BackendURL.canonical`, failover в `BackendClient`)
- Аккаунт / вход (кнопка на главном экране)
- Офлайн «нет доступа» — секция скрыта

## Компоненты

- `SettingsSection` — сворачиваемая карточка с summary
- `SettingsPreferenceRow` — radio-строка как `PreferenceRadioRow` на Android
- `SettingsSubheading` — подзаголовок «Голос», «Скорость речи»

## Запрос истории

Поля в `StoryRequest` должны отражать настройки:

```json
{
  "story_narrator": "radio_host",
  "tts_voice": "alena",
  "tts_speed": 1.15,
  "tts_emotion": "good",
  "tts_provider": "edge",
  "edge_voice_preset": "svetlana_calm",
  "speak_track_names_in_voiceover": true,
  "client_platform": "ios"
}
```
