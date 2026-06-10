/**
 * Detect target SSML / Edge lang for Latin spans in Russian narration.
 */
import {
  detectForeignSpeechLang as detectDeItEsEn,
  foreignLangToXmlLang as deItEsEnToXml,
  isGermanLatinPhrase,
  isKnownGermanPhrase,
  normalizePhraseKey,
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
export function edgeForeignLang(latin: string, artist = '', title = ''): 'en' | 'de' | 'fr' {
  const latinKey = normalizePhraseKey(latin);
  const artistKey = artist ? normalizePhraseKey(artist) : '';
  const titleKey = title ? normalizePhraseKey(title) : '';

  const mentionsArtist = Boolean(artistKey && latinKey.includes(artistKey));
  const mentionsTitle = Boolean(titleKey && latinKey.includes(titleKey));

  if (mentionsArtist || mentionsTitle) {
    if (
      (artist && isKnownFrenchPhrase(artist)) ||
      (title && isKnownFrenchPhrase(title))
    ) {
      return 'fr';
    }
    if (
      (artist && isKnownGermanPhrase(artist)) ||
      (title && isKnownGermanPhrase(title))
    ) {
      return 'de';
    }
    const artistLooksFr = Boolean(artist && isFrenchLatinPhrase(artist));
    const titleLooksFr = Boolean(title && isFrenchLatinPhrase(title));
    const artistLooksDe = Boolean(artist && isGermanLatinPhrase(artist));
    const titleLooksDe = Boolean(title && isGermanLatinPhrase(title));
    if ((artistLooksFr || titleLooksFr) && !(artistLooksDe || titleLooksDe)) return 'fr';
    if ((artistLooksDe || titleLooksDe) && !(artistLooksFr || titleLooksFr)) return 'de';
  }

  const lang = detectForeignLang(latin);
  if (lang === 'de') return 'de';
  if (lang === 'fr') return 'fr';
  return 'en';
}
