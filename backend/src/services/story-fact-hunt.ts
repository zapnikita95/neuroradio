import { isCollectorFact } from './reference-fact-quality.js';

/**
 * Методология поиска «семени» истории: сильный малоизвестный факт про трек или артиста.
 * Используется в промптах ведущих и в дополнительных поисковых запросах к источникам.
 */

/** Дополнительные запросы к DuckDuckGo — углы, которые summary Wikipedia часто пропускает. */
export function buildFactHuntSearchQueries(artist: string, title: string): string[] {
  const cleanTitle = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return [
    `${artist} ${cleanTitle} meaning origin controversy`,
    `${artist} ${cleanTitle} hidden meaning sample melody plagiarism`,
    `${artist} ${cleanTitle} USSR Soviet Eastern Bloc meaning lyrics`,
    `${artist} ${cleanTitle} cover more famous than original`,
    `${artist} musician biography scandal lawsuit racism`,
    `${artist} wrote song army prison could not read music`,
  ];
}

/** Паттерны «ударного» факта — контраст, изнанка, парадокс. Плюс к interestScore. */
export const HIGH_IMPACT_FACT_PATTERNS: RegExp[] = [
  // Скрытый смысл: весёлая песня — тёмная изнанка
  /\b(?:hidden|secret|disguised|obscure|misunderstood|ironic|paradox)\b/i,
  /\b(?:invocation|incantation|chant|orix[aá]|umbanda|candombl[eé]|syncret|religious|spiritual|goddess|deity|ritual)\b/i,
  /\b(?:slang|idiom|colloquial|sarcastic|ironic)\b.*\b(?:title|meaning|lyrics|phrase)\b/i,
  /\b(?:meaning|metaphor|symbol|homage|tribute)\b.*\b(?:religion|african|slave|ancestor|warrior)\b/i,
  // Откуда мелодия / чужая слава
  /\b(?:underlying|borrowed|adapted|derived|sampled|based on|earlier|predates|prior)\b.*\b(?:melody|motif|recording|song|track)\b/i,
  /\b(?:melody|motif|chant|vocalization)\b.*\b(?:(?:19|20)\d{2}|earlier|before|prior|first appeared)\b/i,
  /\b(?:more\s+(?:well\s+)?known|better\s+known|definitive|iconic)\b.*\b(?:cover|version|arrangement)\b/i,
  /\b(?:outside|worldwide|international|global)\b.*\b(?:better known|more famous|definitive)\b/i,
  /\b(?:former|ex-)\b.*\b(?:guitarist|vocalist|member|bandmate)\b/i,
  // Скандал, расизм, суд, абсурд из жизни
  /\b(?:refused|denied|rejected|kicked out|left early|walked out|fled|return flight)\b/i,
  /\b(?:racism|racial|segregat|barber|We're busy|discriminat)\b/i,
  /\b(?:lawsuit|sued|plagiar|copyright|settled out of court|donated.*royalt)\b/i,
  /\b(?:censored|banned|forbidden|investigated|stopped mid)\b/i,
  /\b(?:could not read|didn't know|never learned).*(?:music|notes|write music)\b/i,
  /\b(?:wrote|composed|recorded).*(?:army|military|prison|hospital|church choir)\b/i,
  /\b(?:mission impossible|television|film|nightclub)\b.*\b(?:filmed|appeared|sang)\b/i,
  // Путаница имён, денег, авторства
  /\b(?:confused with|mistaken for|misdirected|wrong account|royalt)\b/i,
  /\b(?:incorrectly|misspell|misprint|wrongly)\b.*\b(?:title|name|listed)\b/i,
  /\b(?:USSR|Soviet Union|Eastern Bloc|Iron Curtain|officially released)\b/i,
  /\b(?:equality|president|take it easy|black or white)\b/i,
  /\b(?:Bollywood|Hindi cinema|plagiar)\b/i,
  // Русские маркеры изinanки
  /(?:скрыт|тайн|заклинан|богин|религи|сленг|ирони|парадокс|заимствован|мотив|плагиат|расизм|расист|дискриминац|отказал|суд|арми|тюрьм|не умел|перепутал|кавер.*известн|ярлык|этнич|коренн|наслед|бедност|безуми|предатель)/i,
];

/** Штраф за «учебниковую» интересность — заголовок, чарт, «стала хитом». */
export const WEAK_TRIVIA_PATTERNS: RegExp[] = [
  /\b(?:title|name)\b.*\b(?:means|meaning|translat|Portuguese|Spanish|slang)\b/i,
  /\b(?:reached|peaked|charted|hit)\s+(?:number\s+)?(?:one|#\s*\d|\d+\s+on|no\.?\s*\d)\b/i,
  /\b(?:top[- ]?(?:five|ten|40|100)|#\s*\d+\s+on|number\s+(?:one|\d+))\b/i,
  /\b(?:first|one of the first)\b.*\b(?:bands?|artists?|groups?)\b.*\b(?:hit|chart|top)\b/i,
  /\bbillboard\b|\bhot 100\b|\beasy listening\b|\buk singles\b|\bofficial charts?\b/i,
  /\b(?:inducted|hall of fame|grammy hall|greatest.*song)\b/i,
  /\b(?:first.*portuguese|first.*language)\b.*\b(?:hit|chart)\b/i,
  /\b(?:название|перевод|означает|сленг)\b.*\b(?:португал|испан)\b/i,
  /(?:попал\w*|вошл\w*|добрал\w*).*(?:чарт|хит-парад|billboard|hot 100|топ[- ]?\d)/i,
  /(?:хит[- ]?парад|топ[- ]?(?:пять|10|40|100))/i,
];

export const FACT_HUNT_PROMPT_BLOCK = `ПОИСК СЕМЕНИ — ОБЯЗАТЕЛЬНАЯ ЛОГИКА (не «интересный факт» из первой строки Wikipedia):

1. НЕ БРАТЬ МУСОР: год релиза, «стала хитом», «попала в чарт», Billboard/Hot 100, «первая группа с хитом», перевод/этимология названия, «сформировались в 19XX», зал славы, список каверов, реклама/игры/фильмы — это НЕ семя. Чарт = автоматический отказ.
2. ПРИОРИТЕТ — ИСТОРИЯ ЖИЗНИ: детство, семья, бедность, армия, тюрьма, расизм, скандал, абсурд, «не умел читать ноты», «написал в ванной/тюрьме/армии», предательство, плагиат, цензура, смерть, безумие, одержимость.
3. ТЕСТ СИЛЬНОГО КОНТРАСТА: слушатель, который слышал трек сто раз, должен сказать «что?!» — контраст важнее энциклопедичности.
   Примеры сильного семени: весёлый припев = религиозное заклинание; узнаваемый мотив украден/заимствован из более ранней песни; автор написал хит, а славу забрал другой; артиста не пустили в парикмахерскую из-за цвета кожи и он улетел домой; Rod Stewart признал плагиат; George Benson получил чужие роялти из-за похожего имени.
4. КОНТРАСТ — главный фильтр: светлая мелодия ↔ тёмный смысл; автор ↔ чужая слава; праздник ↔ расизм/скандал; «ла-ла-ла» ↔ бог/ритуал/проклятие.
5. Если в семенах только сухая биография — ищи глубже (extended Wikipedia, биография артиста, origin, controversy, sample, lawsuit). Не выдумывай — но не сдавайся на первом абзаце.
6. Выбирай ОДНО семя с максимальным контрастом. Не склеивай два факта в одну историю.

ЦЕПОЧКА ПОИСКА (пример «Hafanana» / Afric Simone):
1. Страница артиста, не только трека — у песни часто нет своей статьи.
2. Угол «СССР / официальный релиз / пионерские дискотеки» + «манифест равенства в тексте».
3. Контраст: весёлая дискотека ↔ президент vs нищий, смерть уравнивает, чёрный и белый — без разницы.
4. В script перевести: «официально выпустили в СССР», «крутили как музыку народов мира», «хафанана — не ла-ла-ла, а манифест равенства».

ЯЗЫК СЕМЕНИ И ТЕКСТА: только русский. Английский — только внутри «имя артиста» или «название трека». Запрещены английские слова и гибриды (brazilian, bonus, guitarist, cover version) — переводи: «бразильский», «гитарист», «кавер».

ЗАПРЕЩЕНО БЕЗ СЕМЕНИ В ТЕКСТЕ: запах сигарет/кофе в студии, «на моей полке», «скрытый смысл — свобода/любовь», «зрители сходили с ума», «пел с огоньком», выдуманный продюсер. Если в семени этого нет — не пиши.`;

/** Stage-1 LLM fact hunt: extract seed only from numbered snippets (no narrator). */
export const FACT_HUNT_LLM_PROMPT_BLOCK = `${FACT_HUNT_PROMPT_BLOCK}

ИЗВЛЕЧЕНИЕ СЕМЕНИ ИЗ СНИППЕТОВ (Stage 1):
- Тебе даны только пронумерованные сниппеты из Wikipedia/DDG/Wikidata/MusicBrainz.
- Выбери ОДНО семя: переведи мысль на русский (1–2 предложения), без английских слов вне имени артиста и названия трека.
- evidenceQuote — дословная подстрока из выбранного сниппета (язык источника).
- Если есть сниппет про чарт И сниппет про биографию/скандал/жизнь — бери ТОЛЬКО биографию. Чарт/Billboard/«попала в топ» = отказ или пропуск.
- Если ни один сниппет не содержит проверяемого факта про этот трек/артиста — верни {"reject": true, "reason": "..."}.
- ЗАПРЕЩЕНО выдумывать расизм, дискриминацию, «равенство и справедливость», политику — только если это ЕСТЬ в сниппете.
- ЗАПРЕЩЕНО в поле fact: «разорвал кабину», «разорвёт кабину» — служебная метафора, не для текста.`;

export function highImpactBonus(fact: string): number {
  if (isCollectorFact(fact)) return 8;
  let bonus = 0;
  for (const pattern of HIGH_IMPACT_FACT_PATTERNS) {
    if (pattern.test(fact)) bonus += 6;
  }
  for (const pattern of WEAK_TRIVIA_PATTERNS) {
    if (pattern.test(fact)) bonus -= 10;
  }
  return bonus;
}
