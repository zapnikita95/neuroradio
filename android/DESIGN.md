# Эфир AI — дизайн-код Android UI

Единственный источник цветов: `app/src/main/java/com/musicstory/app/ui/theme/Color.kt`.

## Палитра (efir-ai.ru)

| Токен | HEX | Назначение |
|-------|-----|------------|
| `DeepVoid` | `#08070F` | фон, текст на ярких кнопках |
| `NightPlum` | `#14101F` | поверхности |
| `AccentViolet` | `#A855F7` | **основной акцент**, иконки, заголовки трека |
| `AccentPink` | `#FF5DA2` | вторичный акцент, градиенты |
| `AccentCyan` | `#38E1FF` | третий акцент в градиентах |
| `CreamText` | `#F5EDE0` | основной текст |
| `MutedLavender` | `#9B8FA8` | вторичный текст |
| `LiveGreen` | `#4ADE80` | «музыка играет» |
| `GlassBorder` | `#A855F7` @ 20% | обводки карточек |

## Алиасы (не использовать для нового кода)

`GoldBright` → `AccentViolet`, `GoldWarm` → `AccentPink`, `Copper` → `AccentCyan`.

**Запрещено** хардкодить золото `#E8A838` / `#FFC857` / `#B87333` в UI — это ломает бренд.

## Primary CTA «Рассказать историю»

- Компонент: `PrimaryStoryButton` (`ui/components/Buttons.kt`)
- Форма: `RoundedCornerShape(28.dp)` — pill/capsule
- Градиент: `AccentViolet → AccentPink → AccentCyan` (horizontal)
- Текст: `DeepVoid`, Bold
- Высота: 56.dp

## Vinyl / фон

- `VinylDisc`, `MusicStoryBackground` — только токены из `Color.kt`, без literal gold.

## Material theme

`Theme.kt`: `primary = AccentViolet`, `secondary = AccentPink`, `tertiary = AccentCyan`.
