import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireProxySecret } from '../middleware/proxy-auth.js';
import { enrichTrackMetadata } from '../services/musicbrainz.js';
import { generateStoryScript, hasGroqApiKey } from '../services/groq.js';
import { synthesizeSpeech, hasYandexCredentials } from '../services/yandex-tts.js';
import { voiceForYear } from '../services/voices.js';
import { buildDemoStory, isDemoMode } from '../services/demo.js';

const router = Router();

router.use(requireProxySecret);

interface StoryFullBody {
  artist?: string;
  title?: string;
  previous_scripts?: string[];
}

router.post('/full', async (req: Request, res: Response) => {
  const { artist, title, previous_scripts: previousScriptsRaw } = req.body as StoryFullBody;

  if (!artist?.trim() || !title?.trim()) {
    res.status(400).json({
      error: 'Missing required fields: artist, title',
    });
    return;
  }

  const cleanArtist = artist.trim();
  const cleanTitle = title.trim();

  try {
    const metadata = await enrichTrackMetadata(cleanArtist, cleanTitle);
    const voiceId = voiceForYear(metadata.year);
    const demo = isDemoMode();

    const previousScripts = Array.isArray(previousScriptsRaw)
      ? previousScriptsRaw.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [];

    let story;

    if (demo) {
      story = buildDemoStory(
        metadata.artist,
        metadata.title,
        metadata.year,
        metadata.genre,
        previousScripts,
      );
    } else {
      story = await generateStoryScript({
        artist: metadata.artist,
        title: metadata.title,
        year: metadata.year,
        genre: metadata.genre,
        voiceId,
        previousScripts,
      });
    }

    const response: Record<string, unknown> = {
      artist: metadata.artist,
      title: metadata.title,
      year: metadata.year ?? null,
      genre: metadata.genre ?? null,
      mbid: metadata.mbid ?? null,
      script: story.script,
      word_count: story.word_count,
      voiceId: story.voiceId,
      demo,
      sources: {
        musicbrainz: Boolean(metadata.year || metadata.genre || metadata.mbid),
        groq: !demo && hasGroqApiKey(),
        yandexTts: !demo && hasYandexCredentials(),
      },
    };

    if (!demo && hasYandexCredentials()) {
      const id = uuidv4();
      const audio = await synthesizeSpeech(story.script, story.voiceId, `${id}.ogg`);
      response.audioUrl = audio.audioUrl;
      response.audioFile = audio.fileName;
    } else {
      response.audioUrl = null;
      response.audioFile = null;
      response.ttsHint = hasYandexCredentials()
        ? null
        : 'Нет Yandex TTS — телефон озвучит текст через системный Android TTS';
    }

    res.json(response);
  } catch (err) {
    console.error('POST /v1/story/full failed:', err);
    res.status(500).json({
      error: 'Story generation failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

export default router;
