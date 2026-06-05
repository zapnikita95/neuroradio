/**
 * Russian stress for Yandex SpeechKit: put + immediately BEFORE the stressed vowel.
 * Only words Yandex often misreads — do not mark common vocabulary.
 */

import { normalizeRussianYo } from './russian-yo.js';

/** Loanwords: «трэк» (э) — англ. track /æ/, не «трек» с «йе». */
export const TTS_PRONUNCIATION: Record<string, string> = {
  трек: 'трэк',
  трека: 'трэка',
  треке: 'трэке',
  треки: 'трэки',
  треков: 'трэков',
  трекам: 'трэкам',
  треками: 'трэками',
  треках: 'трэках',
};

export const RUSSIAN_STRESS: Record<string, string> = {
  атлас: 'атл+ас',
  атласе: 'атл+асе',
  барабан: 'бараб+ан',
  батарея: 'батар+ея',
  батарее: 'батар+ее',
  версии: 'верс+ии',
  версию: 'в+ерсию',
  флоу: 'фл+оу',
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
  курьёз: 'курь+ёз',
  микрофон: 'микроф+он',
  микрофона: 'микроф+она',
  микрофоном: 'микроф+оном',
  монитор: 'монит+ор',
  монитора: 'монит+ора',
  мониторами: 'монит+орами',
  мониторах: 'монит+орах',
  мониторов: 'монит+оров',
  мониторы: 'монит+оры',
  продюсер: 'прод+юсер',
  продюсеры: 'прод+юсеры',
  радиола: 'ради+ола',
  радиолы: 'ради+олы',
  раздевалке: 'раздев+алке',
  свист: 'св+ист',
  свиста: 'св+иста',
  сингл: 'с+ингл',
  сингла: 'с+ингла',
  студии: 'ст+удии',
  студий: 'ст+удий',
  студию: 'ст+удию',
  студия: 'ст+удия',
  телешоу: 'телеш+оу',
  звукорежиссёр: 'звукорежисс+ёр',
  звукорежиссёра: 'звукорежисс+ёра',
  звукорежиссёры: 'звукорежисс+ёры',
  краснели: 'красн+ели',
  эфир: 'эф+ир',
  эфире: 'эф+ире',
  джаз: 'дж+аз',
  джаза: 'дж+аза',
  джазе: 'дж+азе',
  рок: 'р+ок',
  рока: 'р+ока',
  роке: 'р+оке',
  блюз: 'бл+юз',
  блюза: 'бл+юза',
  фанк: 'ф+анк',
  фанка: 'ф+анка',
  соул: 'с+оул',
  диско: 'д+иско',
  хит: 'х+ит',
  хита: 'х+ита',
  хите: 'х+ите',
  хиты: 'х+иты',
  чарт: 'ч+арт',
  чарта: 'ч+арта',
  чарте: 'ч+арте',
  чарты: 'ч+арты',
  сэмпл: 'с+эмпл',
  сэмпла: 'с+эмпла',
  сэмплов: 'с+эмплов',
  рэп: 'р+эп',
  рэпа: 'р+эпа',
  гитара: 'гит+ара',
  гитаре: 'гит+аре',
  гитару: 'гит+ару',
  гитары: 'гит+ары',
  барабаны: 'бараб+аны',
  клавиши: 'кл+авиши',
  клавишах: 'кл+авишах',
  оркестр: 'орк+естр',
  оркестра: 'орк+естра',
  оркестре: 'орк+естре',
  мелодия: 'мел+одия',
  мелодии: 'мел+одии',
  мелодию: 'мел+одию',
  аранжировка: 'аранж+ировка',
  аранжировке: 'аранж+ировке',
  аранжировку: 'аранж+ировку',
  пластинка: 'пласт+инка',
  пластинке: 'пласт+инке',
  пластинку: 'пласт+инку',
  кассета: 'касс+ета',
  кассете: 'касс+ете',
  кассету: 'касс+ету',
  альбом: 'альб+ом',
  альбома: 'альб+ома',
  альбоме: 'альб+оме',
  альбомы: 'альб+омы',
  клип: 'кл+ип',
  клипа: 'кл+ипа',
  клипе: 'кл+ипе',
  релиз: 'рел+из',
  релиза: 'рел+иза',
  релизе: 'рел+изе',
  дебют: 'д+ебют',
  дебюта: 'д+ебюта',
  дебюте: 'д+ебюте',
  фестиваль: 'фестив+аль',
  фестивале: 'фестив+але',
  фестиваля: 'фестив+аля',
  тур: 'т+ур',
  тура: 'т+ура',
  туре: 'т+уре',
  бутлег: 'бутл+ег',
  бутлега: 'бутл+ега',
  бутлеги: 'бутл+еги',
};

export const FORCE_RESTRESS = new Set(Object.keys(RUSSIAN_STRESS));

export function stripStressMarks(word: string): string {
  return word.replace(/\+/g, '');
}

export function applyStressToWord(word: string): string {
  if (word.includes('[[')) return word;

  const bare = stripStressMarks(word);
  const lower = bare.toLowerCase();
  const pronunciation = TTS_PRONUNCIATION[lower];
  if (pronunciation) {
    if (bare[0] === bare[0].toUpperCase() && bare[0] !== bare[0].toLowerCase()) {
      return pronunciation.charAt(0).toUpperCase() + pronunciation.slice(1);
    }
    return pronunciation;
  }
  const override = RUSSIAN_STRESS[lower];
  if (!override) return bare;

  if (bare[0] === bare[0].toUpperCase() && bare[0] !== bare[0].toLowerCase()) {
    return override.charAt(0).toUpperCase() + override.slice(1);
  }
  return override;
}

export function applyRussianStress(text: string): string {
  const normalized = normalizeRussianYo(text);
  return normalized.replace(/[а-яёА-ЯЁ][а-яёА-ЯЁ+\-]*/g, (word) => applyStressToWord(word));
}

export function listStressEntries(): Array<{ word: string; marked: string }> {
  return Object.entries(RUSSIAN_STRESS).map(([word, marked]) => ({ word, marked }));
}

/** @deprecated use RUSSIAN_STRESS */
export const STRESS_OVERRIDES = RUSSIAN_STRESS;
