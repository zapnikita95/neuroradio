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
  // Русские маркеры изinanки
  /\b(?:скрыт|тайн|заклинан|богин|религи|сленг|ирони|парадокс|заимствован|мотив|плагиат|расизм|отказал|суд|арми|не умел|перепутал|кавер.*известн)\b/i,
];

/** Штраф за «учебниковую» интересность — заголовок, чарт, «стала хитом». */
export const WEAK_TRIVIA_PATTERNS: RegExp[] = [
  /\b(?:title|name)\b.*\b(?:means|meaning|translat|Portuguese|Spanish|slang)\b/i,
  /\b(?:reached|peaked|charted|billboard|hot 100|easy listening)\b/i,
  /\b(?:inducted|hall of fame|grammy hall|greatest.*song)\b/i,
  /\b(?:first.*portuguese|first.*language)\b.*\b(?:hit|chart)\b/i,
  /\b(?:название|перевод|означает|сленг)\b.*\b(?:португал|испан)\b/i,
];

export const FACT_HUNT_PROMPT_BLOCK = `ПОИСК СЕМЕНИ — ОБЯЗАТЕЛЬНАЯ ЛОГИКА (не «интересный факт» из первой строки Wikipedia):

1. НЕ БРАТЬ МУСОР: год релиза, «стала хитом», перевод названия, чарт, зал славы, список каверов, реклама/игры/фильмы — это НЕ семя.
2. КОПАТЬ УГЛЫ (минимум два источника/раздела): страница трека И артиста; происхождение мелодии; скрытый смысл текста/припева; кто прославился вместо автора; суд/плагиат/цензура/расизм; абсурд из биографии.
3. ТЕСТ «РАЗОРВЁТ КАБИНУ»: слушатель, который слышал трек сто раз, должен сказать «что?!» — контраст важнее энциклопедичности.
   Примеры сильного семени: весёлый припев = религиозное заклинание; узнаваемый мотив украден/заимствован из более ранней песни; автор написал хит, а славу забрал другой; артиста не пустили в парикмахерскую из-за цвета кожи и он улетел домой; Rod Stewart признал плагиат; George Benson получил чужие роялти из-за похожего имени.
4. КОНТРАСТ — главный фильтр: светлая мелодия ↔ тёмный смысл; автор ↔ чужая слава; праздник ↔ расизм/скандал; «ла-ла-ла» ↔ бог/ритуал/проклятие.
5. Если в семенах только сухая биография — ищи глубже (extended Wikipedia, биография артиста, origin, controversy, sample, lawsuit). Не выдумывай — но не сдавайся на первом абзаце.
6. Выбирай ОДНО семя с максимальным контрастом. Не склеивай два факта в одну историю.

ЯЗЫК СЕМЕНИ И ТЕКСТА: только русский. Английский — только внутри «имя артиста» или «название трека». Запрещены английские слова и гибриды (brazilian, bonus, guitarist, cover version) — переводи: «бразильский», «гитарист», «кавер».`;

export function highImpactBonus(fact: string): number {
  let bonus = 0;
  for (const pattern of HIGH_IMPACT_FACT_PATTERNS) {
    if (pattern.test(fact)) bonus += 6;
  }
  for (const pattern of WEAK_TRIVIA_PATTERNS) {
    if (pattern.test(fact)) bonus -= 10;
  }
  return bonus;
}
