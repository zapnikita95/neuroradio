import { Request, Response, NextFunction } from 'express';
import { SECURITY } from '../config/security.js';
import { resolveStoryLength, StoryLengthId } from '../services/story-length.js';
import { resolveTtsEmotion, resolveTtsSpeed, TtsEmotion } from '../services/tts-options.js';

interface StoryFullBody {
  artist?: unknown;
  title?: unknown;
  previous_scripts?: unknown;
  story_length?: unknown;
  tts_speed?: unknown;
  tts_emotion?: unknown;
}

function asTrimmedString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

export function validateStoryFullBody(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as StoryFullBody;

  const artist = asTrimmedString(body.artist, SECURITY.maxArtistLength);
  const title = asTrimmedString(body.title, SECURITY.maxTitleLength);
  if (!artist || !title) {
    res.status(400).json({ error: 'Invalid artist or title (required, max 200 chars each)' });
    return;
  }

  let previousScripts: string[] = [];
  if (body.previous_scripts !== undefined) {
    if (!Array.isArray(body.previous_scripts)) {
      res.status(400).json({ error: 'previous_scripts must be an array' });
      return;
    }
    if (body.previous_scripts.length > SECURITY.maxPreviousScripts) {
      res.status(400).json({ error: `previous_scripts max ${SECURITY.maxPreviousScripts} items` });
      return;
    }
    previousScripts = [];
    for (const item of body.previous_scripts) {
      const script = asTrimmedString(item, SECURITY.maxPreviousScriptLength);
      if (!script) {
        res.status(400).json({ error: 'Invalid previous_scripts entry' });
        return;
      }
      previousScripts.push(script);
    }
  }

  const storyLength: StoryLengthId = resolveStoryLength(body.story_length);
  const ttsSpeed = resolveTtsSpeed(
    typeof body.tts_speed === 'number' ? body.tts_speed : Number(body.tts_speed),
  );
  const ttsEmotion: TtsEmotion = resolveTtsEmotion(body.tts_emotion);

  req.body = {
    artist,
    title,
    previous_scripts: previousScripts,
    story_length: storyLength,
    tts_speed: ttsSpeed,
    tts_emotion: ttsEmotion,
  };
  next();
}
