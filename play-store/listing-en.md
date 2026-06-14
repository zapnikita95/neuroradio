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

Use screenshots with **English UI** (device language English or in-app language → English):

1. Neural host in your player  
2. Live stories about every track  
3. Story archive and ratings  
4. Listening diary  
5. 6 narrator personas  
6. Voice picker  

Rebuild marketing frames (add `--locale en` when supported, or swap headline copy in `scripts/generate-store-screenshots.mjs`):

```bash
node scripts/generate-store-screenshots.mjs
```

## Data safety

See **`play-store/DATA-SAFETY.md`**

Account deletion URL:

```
https://www.efir-ai.ru/docs/delete-account.html
```
