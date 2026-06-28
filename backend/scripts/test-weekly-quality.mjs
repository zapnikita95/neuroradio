import '../dist/load-env.js';
import { isWikiMarkupJunkFact, sanitizeHarvestFactText } from '../dist/services/web-snippet-accept.js';
import { huntDeepFact } from '../dist/services/deep-search-orchestrator.js';

const junk = [
  'найти страницы, начинающиеся с «Зачем»',
  '| | Видеоклип | | --- | | Логотип YouTube upload.wikimedia.org «Пьяное солнце»',
  '[[edit](https://en.wikipedia.org/w/index.php?title=Amatory&action=edit)',
  'A Brief History Lesson Within Nailbomb Point Blank Interview with Max Cavalera of Soulfly',
];
for (const j of junk) {
  console.log('junk?', isWikiMarkupJunkFact(j), '→', sanitizeHarvestFactText(j).slice(0, 70));
}

const tracks = [
  ['5sta Family', 'Я буду'],
  ['5sta Family', 'Вместе мы'],
  ['5ivesta Family', 'Зачем?'],
  ['Alekseev', 'Пьяное солнце'],
  ['Alex Amadeus', 'На-на-ну-на'],
  ['Queen', 'Bohemian Rhapsody'],
];
for (const [a, t] of tracks) {
  const r = await huntDeepFact({
    artist: a,
    title: t,
    mode: 'ddg_jina',
    openRouterApiKey: process.env.OPEN_ROUTER_API_KEY?.trim(),
    weeklyBulk: true,
  });
  console.log(r ? `WIN: ${r.fact.slice(0, 100)}` : 'MISS', '—', a, '—', t);
}
