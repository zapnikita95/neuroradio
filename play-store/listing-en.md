# Google Play — app listing (English)

Copy into Play Console: **Grow users → Store presence → Main store listing** (English — United States or your target locales).

## App name (max 30 characters)

```
Broadcast AI — neural radio
```

(27 characters)

Alternative if you want “host” in the title:

```
Broadcast AI — AI radio host
```

(28 characters)

> **Note:** `Broadcast AI | Neural radiohost` is 35 characters — Google Play rejects titles over 30. Also use **radio host** (two words), not “radiohost”.

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
Broadcast AI is a neural radio host for Android. While you listen in Spotify, Yandex Music, and other players, the app detects the current track, finds interesting facts from open sources, and tells a short story in a natural voice between songs.

How it works
• The app sees what is playing via system media notifications (MediaSession).
• Our service collects facts about the track and artist and ranks them by interest.
• AI writes a coherent script in your chosen narrator style — in English or Russian.
• Premium voices (ElevenLabs) or free Edge TTS speak the story — like a real broadcast.

6 narrator personas
Radio host, night DJ, genre expert, era contemporary, superfan, backstage insider — each with its own tone, pace, and delivery.

For you if
• You love music and want context around the tracks you play.
• You listen in the car, on a walk, or at home — hands free, stories on autopilot.
• You want “smart radio” on top of your own playlist, not pre-recorded shows.

Plans
• Basic — limited stories per day, Edge TTS voiceover.
• Extended — more broadcasts, premium voices, smarter AI — subscribe in Google Play or at efir-ai.ru.

Important
• Media notification access is required to detect the current track.
• Story generation and voiceover use the Broadcast AI server — internet required.
• This app does not replace your music player — it works on top of apps you already use.

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
