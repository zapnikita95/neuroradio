/**

 * Offline Yandex TTS demos for efir-ai.ru — nothing is synthesized in the browser.

 * Превью: websitePreview=true (русская транслитерация + ударения, без «в кавычках»).

 * Приложение: обычный пайплайн с SSML <lang en-US> — здесь не используется.

 *

 *   node scripts/generate-website-demos.mjs --preview

 *   node scripts/generate-website-demos.mjs --personas

 *   node scripts/generate-website-demos.mjs --studio        # короткие, выбранные голоса

 *   node scripts/generate-website-demos.mjs --studio-long   # по 1 длинной на амплуа (len2 + len4)

 *   node scripts/generate-website-demos.mjs --all

 */

import fs from 'node:fs';

import path from 'node:path';

import { fileURLToPath } from 'node:url';

import '../dist/load-env.js';



const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OUT_DIR = path.resolve(__dirname, '../../website/assets/demos');



const FACT_REGISTRY =

  'Thriller — единственный музыкальный клип в National Film Registry США: его сохраняют как культурное наследие наравне с художественным кино.';



const FACT_BUDGET =

  'Michael Jackson вложил в съёмки Thriller полмиллиона долларов из своего кармана — продюсеры крутили пальцем у виска, а после премьеры продажи альбома подскочили в семь раз.';



const THRILLER_STORY_MINUTE =

  'Michael Jackson записал Thriller в эпоху, когда музыкальные клипы только начинали менять правила игры. Это был не просто трек — целый кинематографический опыт, растянутый на четырнадцать минут. В те годы MTV крутил в основном рок, но клип Thriller взломал систему: его ставили в эфир целиком, прерывая регулярное вещание — случай беспрецедентный. Джексон понимал, что будущее за визуальными историями, и вложил в съёмки полмиллиона долларов из своего кармана. Бюджет казался безумием, но окупился сполна: продажи альбома подскочили в семь раз после премьеры видео. Клип снял John Landis, режиссёр «Американского оборотня в Лондоне» — столкновение двух вселенных. Сцена с зомби-танцами изначально не входила в сценарий: хореограф Michael Peters убеждал Landis, что это не испортит хоррор-эстетику. В итоге танец стал визитной карточкой ролика.';



const THRILLER_STORY_FULL =

  THRILLER_STORY_MINUTE +

  ' Thriller — единственный музыкальный клип в National Film Registry США: его сохраняют как культурное наследие наравне с художественным кино. Vincent Price записал зловещий закадровый текст, а съёмки танца с зомби длились неделями. Танцующие зомби, превращение в оборотня, культовая moon walk походка — всё это стало новой религией поп-культуры. Когда Thriller вышел, видеомагнитофоны в магазинах разлетались как горячие пирожки — люди пересматривали его снова и снова. Так родился первый вирусный хит до эпохи интернета.';



const BACKSTAGE_STORY_MINUTE =

  FACT_BUDGET +

  ' Vincent Price записал закадровый монолог за один день — режиссёр John Landis привёз в проект кинематографический масштаб. Хореограф Michael Peters добивался сцены с зомби-танцами: её изначально вырезали из сценария, а потом она стала визитной карточкой клипа. На съёмках Jackson настаивал на деталях, которые продюсеры считали лишними — и именно они потом взорвали MTV. Об этом редко говорят вслух.';

/** Современник эпохи — от первого лица, ностальгия (не энциклопедический THRILLER_STORY_MINUTE). */
const CONTEMPORARY_STORY_MINUTE =
  'Michael Jackson вложил пятьсот тысяч долларов из своего кармана в создание музыкального видео на трек Thriller. Мы тогда помним, как MTV в основном крутила рок, но этот четырнадцатиминутный ролик показывали целиком, прерывая обычные программы. Я помню то невероятное чувство, когда после премьеры видео продажи альбома выросли в семь раз. Режиссёр John Landis пришёл из большого кино, а хореографу Michael Peters даже пришлось убеждать его оставить ту самую сцену с танцем зомби. Это было не просто видео, а настоящее событие, которое меняло правила игры на телевидении. Позже люди начали массово скупать кассеты VHS в магазинах, чтобы пересматривать этот шедевр дома снова и снова. Весь мир замер, когда этот ролик появился в эфире, и музыка стала частью визуальной истории. Это был момент, когда поп-музыка окончательно объединилась с кинематографом.';

const CONTEMPORARY_STORY_SHORT =
  'Я помню это время. Michael Jackson вложил полмиллиона в клип Thriller — и после премьеры продажи альбома выросли в семь раз. Мы смотрели четырнадцатиминутный ролик по MTV целиком, а потом скупали VHS, чтобы пересматривать дома.';

const CONTEMPORARY_STORY_FULL =
  CONTEMPORARY_STORY_MINUTE +
  ' Vincent Price голосом из кино читал закадровый текст — у нас мурашки по коже. Мы учили moon walk походку у телевизора, повторяли танец зомби на дискотеках. Годы спустя Thriller попал в National Film Registry — единственный музыкальный клип в списке культурного наследия США. Сейчас это кажется само собой, а тогда мы впервые поняли: песня может быть фильмом, а фильм — событием на весь мир.';



/** Карточки амплуа + студия: короткий / минута / без лимита. */

const PERSONAS = [

  {

    id: 'radio_host',

    voice: 'zahar',

    speed: 1.08,

    studioVoices: ['zahar', 'ermil', 'alexander'],

    short: 'А вот это — личное. ' + FACT_REGISTRY + ' Именно этот клип взорвал MTV!',

    minute: 'А вот это — личное. ' + THRILLER_STORY_MINUTE + ' Именно этот клип взорвал MTV!',

    full: 'А вот это — личное. ' + THRILLER_STORY_FULL + ' Именно этот клип взорвал MTV!',

  },

  {

    id: 'night_dj',

    voice: 'ermil',

    speed: 0.92,

    studioVoices: ['ermil'],

    short: 'Доброй ночи! Интересный факт: ' + FACT_REGISTRY + ' Оставайтесь на нашей волне до утра.',

    minute: 'Доброй ночи! Интересный факт: ' + THRILLER_STORY_MINUTE + ' Оставайтесь на нашей волне до утра.',

    full: 'Доброй ночи! Интересный факт: ' + THRILLER_STORY_FULL + ' Оставайтесь на нашей волне до утра.',

  },

  {

    id: 'expert',

    voice: 'ermil',

    speed: 1.0,

    studioVoices: ['ermil', 'zahar', 'filipp'],

    short: 'Уникальный факт: ' + FACT_REGISTRY + ' Это эталон поп-хоррора восьмидесятых.',

    minute: 'Уникальный факт: ' + THRILLER_STORY_MINUTE + ' Это эталон поп-хоррора восьмидесятых.',

    full: 'Уникальный факт: ' + THRILLER_STORY_FULL + ' Это эталон поп-хоррора восьмидесятых.',

  },

  {

    id: 'contemporary',

    voice: 'alena',

    speed: 0.98,

    studioVoices: ['alena', 'omazh', 'marina'],

    short: CONTEMPORARY_STORY_SHORT,

    minute: 'Я помню это время. ' + CONTEMPORARY_STORY_MINUTE,

    full: 'Я помню это время. ' + CONTEMPORARY_STORY_FULL,

  },

  {

    id: 'fan',

    voice: 'jane',

    speed: 1.12,

    studioVoices: ['jane', 'dasha', 'lera'],

    short: 'Обожаю этот момент! ' + FACT_REGISTRY + ' И да — я знаю каждую секунду этого клипа наизусть!',

    minute: 'Обожаю этот момент! ' + THRILLER_STORY_MINUTE + ' И да — я знаю каждую секунду этого клипа наизусть!',

    full: 'Обожаю этот момент! ' + THRILLER_STORY_FULL + ' И да — я знаю каждую секунду этого клипа наизусть!',

  },

  {

    id: 'backstage',

    voice: 'omazh',

    speed: 0.96,

    studioVoices: ['omazh', 'jane'],

    /** ~1 мин — инсайд про бюджет, не реестр наследия. */

    short: 'Только между нами. ' + BACKSTAGE_STORY_MINUTE,

    minute: 'Только между нами. ' + BACKSTAGE_STORY_MINUTE,

    full: 'Только между нами. ' + BACKSTAGE_STORY_MINUTE + ' ' + THRILLER_STORY_FULL,

  },

];



const TEST_IDS = ['radio_host', 'night_dj', 'expert'];



function studioShortFile(personaId, voiceId) {

  return `studio-${personaId}-${voiceId}.wav`;

}



function studioLongFile(personaId, suffix) {

  return `studio-${personaId}${suffix}.wav`;

}



async function loadTts() {

  const { prepareYandexTtsText } = await import('../dist/services/tts-markup.js');

  const { stripYandexMarkup } = await import('../dist/services/tts-azure-ssml.js');

  const { synthesizeSpeech } = await import('../dist/services/yandex-tts.js');

  return { prepareYandexTtsText, stripYandexMarkup, synthesizeSpeech };

}



function previewMarkup(raw) {

  return {

    artist: 'Michael Jackson',

    title: 'Thriller',

    sentencePauses: true,

    pauseProfile: 'tight',

    websitePreview: true,

  };

}

const DISPLAY_NAME_FIXES = [
  [/\bмайкл джексон\b/gi, 'Майкл Джексон'],
  [/\bджохн ландис\b/gi, 'Джон Ландис'],
  [/\bвинсент прайс\b/gi, 'Винсент Прайс'],
  [/\bмикхаил питерс\b/gi, 'Майкл Питерс'],
  [/\bджакксон\b/gi, 'Джексон'],
];

function prettyDisplayText(speakable) {
  let t = speakable;
  for (const [re, repl] of DISPLAY_NAME_FIXES) t = t.replace(re, repl);
  return t;
}

function scriptTexts(raw, prepareYandexTtsText, stripYandexMarkup) {
  const marked = prepareYandexTtsText(raw, previewMarkup());
  const speakable = stripYandexMarkup(marked);
  return { raw, marked, speakable, display: prettyDisplayText(speakable) };
}

/** Yandex часто добавляет тишину в начале — обрезаем для мгновенного старта на сайте. */
function trimLeadingSilenceWav(buffer, threshold = 600, padMs = 15) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') return buffer;
  const numChannels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  if (bitsPerSample !== 16 || numChannels < 1) return buffer;
  const bytesPerSample = (bitsPerSample / 8) * numChannels;
  const pcmStart = 44;
  const pcm = buffer.subarray(pcmStart);
  const maxSamples = Math.min(Math.floor(pcm.length / bytesPerSample), Math.floor(sampleRate * 2.5));
  let startSample = 0;
  for (let i = 0; i < maxSamples; i++) {
    let amp = 0;
    for (let c = 0; c < numChannels; c++) {
      amp = Math.max(amp, Math.abs(pcm.readInt16LE(i * bytesPerSample + c * 2)));
    }
    if (amp > threshold) {
      startSample = Math.max(0, i - Math.floor((sampleRate * padMs) / 1000));
      break;
    }
  }
  if (startSample === 0) return buffer;
  const newPcm = pcm.subarray(startSample * bytesPerSample);
  const out = Buffer.alloc(44 + newPcm.length);
  buffer.copy(out, 0, 0, 44);
  out.writeUInt32LE(36 + newPcm.length, 4);
  out.writeUInt32LE(newPcm.length, 40);
  newPcm.copy(out, 44);
  return out;
}

function writeDemoWav(outPath, buf) {
  fs.writeFileSync(outPath, trimLeadingSilenceWav(buf));
}



function ensureKeys() {

  if (!process.env.YANDEX_API_KEY?.trim() || !process.env.YANDEX_FOLDER_ID?.trim()) {

    throw new Error('YANDEX_API_KEY и YANDEX_FOLDER_ID не найдены в backend/.env');

  }

}



async function writePreview() {

  const { prepareYandexTtsText, stripYandexMarkup } = await loadTts();

  fs.mkdirSync(OUT_DIR, { recursive: true });



  const out = {

    generatedAt: new Date().toISOString(),

    note: 'websitePreview: кириллица + ударения. Приложение — отдельный SSML-пайплайн.',

    personas: PERSONAS.map((p) => {

      const texts = scriptTexts(p.short, prepareYandexTtsText, stripYandexMarkup);

      return {

        id: p.id,

        voice: p.voice,

        speed: p.speed,

        studioVoices: p.studioVoices,

        raw: texts.raw,

        marked: texts.marked,

        speakable: texts.speakable,

        display: texts.display,

        file: `persona-${p.id}.wav`,

      };

    }),

    studioLong: PERSONAS.map((p) => {

      const len2 = scriptTexts(p.minute, prepareYandexTtsText, stripYandexMarkup);

      const len4 = scriptTexts(p.full, prepareYandexTtsText, stripYandexMarkup);

      return {

        persona: p.id,

        voice: p.voice,

        len2: { raw: len2.raw, speakable: len2.speakable, display: len2.display, file: studioLongFile(p.id, '-len2') },

        len4: { raw: len4.raw, speakable: len4.speakable, display: len4.display, file: studioLongFile(p.id, '-len4') },

      };

    }),

  };



  const jsonPath = path.join(OUT_DIR, 'preview-texts.json');

  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2), 'utf8');

  console.log('wrote', jsonPath);

  for (const p of out.personas) {

    console.log('\n---', p.id, '---\n', p.speakable);

  }

}



async function synthPersona(p, synthesizeSpeech) {

  const tmp = `_tmp-${p.id}`;

  const result = await synthesizeSpeech(p.short, p.voice, tmp, {

    speed: p.speed,

    artist: 'Michael Jackson',

    title: 'Thriller',

    pauseProfile: 'tight',

    websitePreview: true,

  });

  const buf = fs.readFileSync(result.filePath);

  fs.unlinkSync(result.filePath);

  const out = path.join(OUT_DIR, `persona-${p.id}.wav`);

  writeDemoWav(out, buf);

  console.log('wrote', out, buf.length, 'bytes');

}



async function synthStudioShort(persona, voice, synthesizeSpeech) {

  const tmp = `_tmp-studio-${persona.id}-${voice}`;

  const result = await synthesizeSpeech(persona.short, voice, tmp, {

    speed: voice === persona.voice ? persona.speed : 1.08,

    artist: 'Michael Jackson',

    title: 'Thriller',

    pauseProfile: 'tight',

    websitePreview: true,

  });

  const buf = fs.readFileSync(result.filePath);

  fs.unlinkSync(result.filePath);

  const out = path.join(OUT_DIR, studioShortFile(persona.id, voice));

  writeDemoWav(out, buf);

  console.log('wrote', out, buf.length, 'bytes');

}



async function synthStudioLong(persona, synthesizeSpeech, suffix, script) {

  const tmp = `_tmp-studio-${persona.id}${suffix}`;

  const result = await synthesizeSpeech(script, persona.voice, tmp, {

    speed: persona.speed,

    artist: 'Michael Jackson',

    title: 'Thriller',

    pauseProfile: 'tight',

    websitePreview: true,

  });

  const buf = fs.readFileSync(result.filePath);

  fs.unlinkSync(result.filePath);

  const out = path.join(OUT_DIR, studioLongFile(persona.id, suffix));

  writeDemoWav(out, buf);

  console.log('wrote', out, buf.length, 'bytes');

}



function purgeOldStudioWavs() {

  if (!fs.existsSync(OUT_DIR)) return;

  for (const name of fs.readdirSync(OUT_DIR)) {

    if (name.startsWith('studio-') && name.endsWith('.wav')) {

      fs.unlinkSync(path.join(OUT_DIR, name));

      console.log('removed', name);

    }

  }

}



async function main() {

  const args = process.argv.slice(2);

  const arg = args[0] ?? '--preview';

  const onlyIdx = args.indexOf('--only');

  const onlyPersonaId = onlyIdx >= 0 ? args[onlyIdx + 1] : null;



  if (arg === '--preview') {

    await writePreview();

    return;

  }



  ensureKeys();

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { synthesizeSpeech } = await loadTts();

  const targets = onlyPersonaId

    ? PERSONAS.filter((p) => p.id === onlyPersonaId)

    : PERSONAS;

  if (onlyPersonaId && targets.length === 0) {

    console.error('Unknown persona:', onlyPersonaId);

    process.exit(1);

  }



  if (onlyPersonaId) {

    await writePreview();

    for (const p of targets) {

      await synthPersona(p, synthesizeSpeech);

      for (const voice of p.studioVoices) {

        await synthStudioShort(p, voice, synthesizeSpeech);

      }

      await synthStudioLong(p, synthesizeSpeech, '-len2', p.minute);

      await synthStudioLong(p, synthesizeSpeech, '-len4', p.full);

    }

    console.log('done —', onlyPersonaId);

    return;

  }



  if (arg === '--test') {

    for (const id of TEST_IDS) {

      await synthPersona(PERSONAS.find((x) => x.id === id), synthesizeSpeech);

    }

    console.log('test done');

    return;

  }



  if (arg === '--personas' || arg === '--all') {

    for (const p of PERSONAS) {

      await synthPersona(p, synthesizeSpeech);

    }

  }



  if (arg === '--studio' || arg === '--all') {

    purgeOldStudioWavs();

    console.log('studio short: selected voices per persona');

    for (const p of PERSONAS) {

      for (const voice of p.studioVoices) {

        await synthStudioShort(p, voice, synthesizeSpeech);

      }

    }

  }



  if (arg === '--studio-long' || arg === '--all') {

    console.log('studio long: 1× len2 + 1× len4 per persona (default voice)');

    for (const p of PERSONAS) {

      await synthStudioLong(p, synthesizeSpeech, '-len2', p.minute);

      await synthStudioLong(p, synthesizeSpeech, '-len4', p.full);

    }

  }



  if (!['--test', '--personas', '--studio', '--studio-long', '--all', '--only'].includes(arg) && onlyIdx < 0) {

    console.error('Unknown flag:', arg);

    process.exit(1);

  }



  console.log('done');

}



main().catch((err) => {

  console.error(err);

  process.exit(1);

});


