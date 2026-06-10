/**
 * Detect target SSML / Edge lang for Latin spans in Russian narration.
 */
import {
  detectForeignSpeechLang as detectDeItEsEn,
  foreignLangToXmlLang as deItEsEnToXml,
  isGermanLatinPhrase,
  isKnownGermanPhrase,
} from './de-lang-detect.js';
import { isFrenchLatinPhrase, isKnownFrenchPhrase } from './fr-lang-detect.js';

export type ForeignLangCode = 'en-US' | 'de-DE' | 'it-IT' | 'es-ES' | 'fr-FR';
export type ForeignLang = 'en' | 'de' | 'it' | 'es' | 'fr';

export {
  normalizePhraseKey,
  isGermanLatinPhrase,
  isKnownGermanPhrase,
} from './de-lang-detect.js';

export { isFrenchLatinPhrase, isKnownFrenchPhrase } from './fr-lang-detect.js';

export function detectForeignLang(phrase: string): ForeignLang {
  if (isKnownGermanPhrase(phrase)) return 'de';
  if (isKnownFrenchPhrase(phrase)) return 'fr';
  if (isFrenchLatinPhrase(phrase)) return 'fr';
  return detectDeItEsEn(phrase);
}

export function foreignLangToCode(lang: ForeignLang): ForeignLangCode {
  if (lang === 'fr') return 'fr-FR';
  return deItEsEnToXml(lang) as ForeignLangCode;
}

export function detectLatinLangCode(span: string): ForeignLangCode {
  return foreignLangToCode(detectForeignLang(span));
}

export function isGermanArtistName(name: string): boolean {
  return isGermanLatinPhrase(name);
}

export function isFrenchArtistName(name: string): boolean {
  return isFrenchLatinPhrase(name);
}

/** Map to Edge TTS voice family (it/es → en until dedicated voices). */
export function edgeForeignLang(latin: string): 'en' | 'de' | 'fr' {
  const lang = detectForeignLang(latin);
  if (lang === 'de') return 'de';
  if (lang === 'fr') return 'fr';
  return 'en';
}
