/**
 * Russian stress for Yandex SpeechKit: put + immediately BEFORE the stressed vowel.
 * @see https://yandex.ru/dev/dialogs/alice/doc/ru/speech-tuning.html
 *
 * Groq must NOT emit + marks — server applies this dictionary after generation.
 */

/** lowercase word → word with + before stressed vowel */
export const RUSSIAN_STRESS: Record<string, string> = {
  // studio / concert / tech
  атлас: 'атл+ас',
  атласе: 'атл+асе',
  барабан: 'бараб+ан',
  батарея: 'батар+ея',
  батарее: 'батар+ее',
  версии: 'верс+ии',
  версию: 'верс+ию',
  дубль: 'д+убль',
  дубля: 'д+убля',
  инженер: 'инжен+ер',
  инженера: 'инжен+ера',
  инженером: 'инжен+ером',
  инженеры: 'инжен+еры',
  колонках: 'кол+онках',
  колонки: 'кол+онки',
  концерт: 'конц+ерт',
  концерта: 'конц+ерта',
  концерте: 'конц+ерте',
  микрофон: 'микроф+он',
  микрофона: 'микроф+она',
  микрофоном: 'микроф+оном',
  монитор: 'монит+ор',
  монитора: 'монит+ора',
  мониторами: 'монит+орами',
  мониторах: 'монит+орах',
  мониторов: 'монит+оров',
  мониторы: 'монит+оры',
  студии: 'ст+удии',
  студий: 'ст+удий',
  студию: 'ст+удию',
  студия: 'ст+удия',
  телешоу: 'телеш+оу',
  звукорежиссёр: 'звукорежисс+ёр',
  звукорежиссёра: 'звукорежисс+ёра',
  звукорежиссёры: 'звукорежисс+ёры',

  // story vocabulary
  берет: 'бер+ет',
  бизнес: 'б+изнес',
  было: 'б+ыло',
  важный: 'в+ажный',
  гарлем: 'Г+арлем',
  голос: 'г+олос',
  дух: 'д+ух',
  зал: 'з+ал',
  зала: 'з+ала',
  замке: 'з+амке',
  замок: 'з+амок',
  кричал: 'кр+ичал',
  краснели: 'красн+ели',
  курьёз: 'курь+ёз',
  музыканты: 'музык+анты',
  начала: 'нач+ала',
  ноте: 'н+оте',
  ноту: 'н+оту',
  одержим: 'од+ержим',
  одержимый: 'од+ержимый',
  па: 'п+а',
  плащ: 'пл+ащ',
  плащом: 'пл+ащом',
  продюсер: 'прод+юсер',
  продюсеры: 'прод+юсеры',
  радиола: 'ради+ола',
  радиолы: 'ради+олы',
  раздевалке: 'раздев+алке',
  реакция: 'ре+акция',
  реакцию: 'ре+акцию',
  ритуал: 'риту+ал',
  свист: 'св+ист',
  свиста: 'св+иста',
  сезон: 'сез+он',
  сезона: 'сез+она',
  сингл: 'с+ингл',
  сингла: 'с+ингла',
  соседи: 'сос+еди',
  тогда: 'тогд+а',
  удар: 'уд+ар',
  фирменным: 'ф+ирменным',
  фраза: 'фр+аза',
  фразу: 'фр+азу',
  хит: 'х+ит',
  эфир: 'эф+ир',
  эфире: 'эф+ире',
  эпоха: 'эп+оха',
  эпохе: 'эп+охе',
};

/** Words that must never keep model-provided + marks (always re-stress from dictionary). */
export const FORCE_RESTRESS = new Set([
  'инженер',
  'инженера',
  'инженером',
  'инженеры',
  'звукорежиссёр',
  'звукорежиссёра',
  'звукорежиссёры',
  'версии',
  'версию',
  'атлас',
  'атласе',
  'монитор',
  'монитора',
  'мониторами',
  'мониторах',
  'мониторов',
  'мониторы',
]);

export function stripStressMarks(word: string): string {
  return word.replace(/\+/g, '');
}

export function applyStressToWord(word: string): string {
  if (word.includes('[[')) return word;

  const bare = stripStressMarks(word);
  const lower = bare.toLowerCase();
  const override = RUSSIAN_STRESS[lower];
  if (!override) return bare;

  if (bare[0] === bare[0].toUpperCase() && bare[0] !== bare[0].toLowerCase()) {
    return override.charAt(0).toUpperCase() + override.slice(1);
  }
  return override;
}

export function applyRussianStress(text: string): string {
  return text.replace(/[а-яёА-ЯЁ][а-яёА-ЯЁ+\-]*/g, (word) => applyStressToWord(word));
}

export function listStressEntries(): Array<{ word: string; marked: string }> {
  return Object.entries(RUSSIAN_STRESS).map(([word, marked]) => ({ word, marked }));
}
