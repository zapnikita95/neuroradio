import { validateStoryScript, anchorsReferenceFact } from '../dist/services/story-quality.js';
import { qualityOptionsForProductionAttempt } from '../dist/services/story-generate-loop.js';

const fact =
  "It was the second biggest-song globally on Luminate's 2025 midyear report, earning 1.624 billion on-demand audio streams in the first half of the year.";
const deepseek =
  'APT от Rosé и Bruno Mars — это не просто трек, а настоящий потоковой монстр. По данным Luminate, он стал вторым по популярности в мире в середине года, собрав больше полутора миллиардов прослушиваний только за первые шесть месяцев. Такой результат — не случайность, а результат идеального микса: харизма Rosé, фирменный фанк Mars и тот самый момент, когда две звезды находят общий язык. Они не просто записали песню — они создали гимн, который захватил платформы. И если кто-то ещё сомневается в силе коллабораций, APT — лучший ответ.';
const groq =
  'Песня APT от Rosé и Bruno Mars стала второй по популярности во всём мире согласно полугодовому отчёту Luminate, собрав более 1,6 миллиарда прослушиваний в первом полугодии. Это говорит о том, что их музыка нашла отклик у слушателей. Для артистов это значит, что их работа приносит результаты. Это показывает, что их музыка действительно нравится людям.';

const opts = qualityOptionsForProductionAttempt([fact]);
for (const [name, script] of [
  ['deepseek', deepseek],
  ['groq', groq],
]) {
  console.log(name, 'anchor=', anchorsReferenceFact(script, [fact]));
  const q = validateStoryScript(script, 'medium', 'Rosé, Bruno Mars', 'APT.', opts);
  console.log(name, 'validate=', q);
}
