/**
 * Detect target SSML / Edge lang for Latin spans in Russian narration.
 */
import {
  detectForeignSpeechLang,
  foreignLangToXmlLang,
  isGermanLatinPhrase,
  normalizePhraseKey,
} from './de-lang-detect.js';

export type ForeignLangCode = 'en-US' | 'de-DE' | 'it-IT' | 'es-ES';
export type ForeignLang = 'en' | 'de' | 'it' | 'es';

export {
  detectForeignSpeechLang as detectForeignLang,
  foreignLangToXmlLang,
  isGermanLatinPhrase,
  isKnownGermanPhrase,
  normalizePhraseKey,
} from './de-lang-detect.js';

export function foreignLangToCode(lang: ForeignLang): ForeignLangCode {
  return foreignLangToXmlLang(lang) as ForeignLangCode;
}

export function detectLatinLangCode(span: string): ForeignLangCode {
  return foreignLangToXmlLang(detectForeignSpeechLang(span)) as ForeignLangCode;
}

export function isGermanArtistName(name: string): boolean {
  return isGermanLatinPhrase(name);
}
