import { isNonMusicDomainFact, hasMusicDomainContext } from '../dist/services/web-snippet-accept.js';

const cases = [
  {
    artist: 'Escape',
    title: 'Аладдин',
    fact: 'Уровень 1 «Королевский рынок Аграбы» из игры Disney\'s Aladdin на Mega Drive.',
    expectReject: true,
  },
  {
    artist: 'DOROFEEVA',
    title: 'Краш',
    fact: 'The song became the most-watched Russian-language song on YouTube.',
    expectReject: true,
  },
  {
    artist: 'Queen',
    title: 'Bohemian Rhapsody',
    fact: 'Bohemian Rhapsody was recorded at Rockfield Studios in Wales over three weeks in 1975.',
    expectReject: false,
  },
  {
    artist: 'Элджей',
    title: 'Розовое вино',
    fact: 'Клип на песню «Розовое вино» был заблокирован на YouTube из-за спора о порядке имён в титрах.',
    expectReject: false,
  },
  {
    artist: 'Some Band',
    title: 'Paris',
    fact: 'Paris is the capital of France with a population of over 2 million.',
    expectReject: true,
  },
];

let failed = 0;
for (const c of cases) {
  const reject = isNonMusicDomainFact(c.fact, c.artist, c.title);
  const music = hasMusicDomainContext(c.fact, c.artist, c.title);
  const ok = reject === c.expectReject;
  if (!ok) failed++;
  console.log(ok ? 'OK' : 'FAIL', '| reject=', reject, '| music=', music, '|', c.artist, '—', c.title);
}
process.exit(failed > 0 ? 1 : 0);
