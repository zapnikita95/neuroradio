# Google Play — app listing (English)

Copy into Play Console: **Grow users → Store presence → Main store listing** (English — United States or your target locales).

## App name (max 30 characters) — **what users see in the store**

```
Broadcast AI — AI radio host
```

(28 characters)

Other options (all include **host**, not “radio” alone):

```
Broadcast AI — radio host
```
(25 characters)

```
Broadcast AI — neural host
```
(26 characters)

> **Do not** use “neural radio” — the product is a **radio host / presenter** (нейроведущий), not a radio station.

## Custom store listing — internal name (max 50, users never see it)

For **Специальная страница → Имя** your screenshot is fine:

```
Broadcast AI | Neural radio host
```

(32/50 — OK; use **radio host** as two words, not “radiohost”)

## Short description (max 80 characters)

```
AI radio host & stories about your music — right in your player
```

(63 characters)

Alternative (closer to the Russian “live stories” line):

```
Live music stories voiced by an AI host while your track plays
```

(63 characters)

## Full description (max 4000 characters)

```
Broadcast AI is an AI-powered radio host for Android. While you listen to music in Spotify, Yandex Music, and other players, the app recognizes the current track, finds interesting facts from open sources, and tells a short story in a natural voice between songs.

How it works
• The app sees what is playing now through system media notifications (MediaSession).
• The service collects facts about the track and artist and ranks them by how interesting they are.
• AI writes a coherent script in English in the style you choose.
• ElevenLabs or Microsoft Edge voice reads the story aloud — like a real broadcast.

6 narrator personas
Radio host, night DJ, genre expert, era contemporary, superfan, backstage insider — each with its own character, pace, and delivery.

Who it's for
• Music lovers who want context around the tracks they play.
• Listeners in the car, on a walk, or at home — hands free, stories flow on their own.
• Anyone who wants “smart radio” on top of their own playlist, without canned scripts.

Plans
• Basic — limited number of stories per day.
• Extended — more broadcasts, priority voiceover, subscribe via Google Play or at efir-ai.ru.

Important
• Media notification access is required (to detect the current track).
• Voiceover and story generation use the Broadcast AI server — an internet connection is required.
• The app does not replace your music player: it works on top of apps you already have installed.

Support: hello@efir-ai.ru
Website: https://www.efir-ai.ru
```

## Graphics (folder `play-store/graphics/`)

| File | Where in Play Console |
|------|------------------------|
| `icon-512.png` | App icon 512×512 |
| `feature-graphic-en-1024x500.png` | Feature graphic 1024×500 (**English listing**) |
| `feature-graphic-1024x500.png` | Feature graphic 1024×500 (Russian listing) |
| `screenshots/*` | Phone screenshots 1080×1920 — use English UI captures for EN listing |

Regenerate feature graphics:

```bash
node scripts/generate-play-store-assets.mjs
```

## Screenshots (English listing)

Folder **`play-store/screenshots-en/`** — 6 frames 1080×1920 with English headlines (from `ENG1.jpg` … `ENG6.jpg` on Desktop):

| # | File | Headline | Subtitle |
|---|------|----------|----------|
| 1 | `01-ENG1-play.jpg` | AI radio host **in your player** | Spotify, Yandex Music — no app switching |
| 2 | `02-ENG2-play.jpg` | Live stories **about every track** | Facts and emotion — voiced while the song plays |
| 3 | `03-ENG3-play.jpg` | Story **archive** | Read past broadcasts and rate with 👍 or 👎 |
| 4 | `04-ENG4-play.jpg` | Everything **you listened to** | Listening diary — see which tracks had a story |
| 5 | `05-ENG5-play.jpg` | 6 narrator **personas** | Radio host, DJ, expert, superfan — pick your mood |
| 6 | `06-ENG6-play.jpg` | Voice **your way** | Dozens of voices — or auto by genre and era |

Regenerate after new phone captures:

```bash
node scripts/generate-store-screenshots.mjs --locale en
```

## Data safety

See **`play-store/DATA-SAFETY.md`**

Account deletion URL:

```
https://www.efir-ai.ru/docs/delete-account.html
```
