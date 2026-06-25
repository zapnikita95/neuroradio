/** Spotify/Apple Music duo tags: «Axwell /\ Ingrosso», «A / B» → splittable «A & B». */
const COLLAB_SPLIT_RE =
  /\s*(?:,|;|&|\s*\/\s*\\?\s*|\s+\/\s+|\s+\\+\s+|\s+feat\.?\s+|\s+ft\.?\s+|\s+x\s+|\s+×\s+|\s+and\s+)(?=\s*[\p{L}])/iu;

export function normalizeCollabArtistTag(artist: string): string {
  const trimmed = artist.trim();
  if (!trimmed) return artist;
  const parts = trimmed.split(COLLAB_SPLIT_RE).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2 && !/[,&]/.test(trimmed)) {
    return `${parts[0]} & ${parts[1]}`;
  }
  return trimmed.replace(/\s*\/\s*\\?\s*/g, ' & ').replace(/\s+\/\s+/g, ' & ').trim();
}

/** First credited artist from collab tags (Bad Omens, HEALTH → Bad Omens). */
export function primaryArtistName(artist: string): string {
  const trimmed = normalizeCollabArtistTag(artist);
  if (!trimmed) return artist;
  const split = trimmed.split(COLLAB_SPLIT_RE);
  return split[0]?.trim() || trimmed;
}

/** All credited names from a collab tag string. */
export function collaboratorNames(artist: string): string[] {
  return normalizeCollabArtistTag(artist)
    .split(COLLAB_SPLIT_RE)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeArtistKey(artist: string): string {
  return primaryArtistName(artist)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
