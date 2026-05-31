/** First credited artist from collab tags (Bad Omens, HEALTH → Bad Omens). */
export function primaryArtistName(artist: string): string {
  const trimmed = artist.trim();
  if (!trimmed) return artist;
  const split = trimmed.split(/\s*(?:,|;|&|\s+feat\.?\s+|\s+ft\.?\s+|\s+x\s+|\s+×\s+|\s+and\s+)(?=\s*[A-Za-zА-Яа-я])/i);
  return split[0]?.trim() || trimmed;
}

/** All credited names from a collab tag string. */
export function collaboratorNames(artist: string): string[] {
  return artist
    .split(/\s*(?:,|;|&|\s+feat\.?\s+|\s+ft\.?\s+|\s+x\s+|\s+×\s+|\s+and\s+)(?=\s*[A-Za-zА-Яа-я])/i)
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
