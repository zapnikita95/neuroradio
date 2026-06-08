/**
 * Green Day — Boulevard of Broken Dreams must not 503 when wiki/web are down.
 * Run: npm run build && node scripts/test-green-day-facts.mjs
 */
import assert from 'node:assert/strict';
import { lookupCuratedFact } from '../dist/services/curated-facts.js';
import { fetchEmergencyFactRescue } from '../dist/services/fact-aggregator.js';
import { isCatalogMajorArtist } from '../dist/services/artist-notability.js';
import { fetchArtistWikiLeadWithRetry } from '../dist/services/wikipedia-lead.js';
import { tryRetryArtistWikiSeed, resetArtistWikiDepthState } from '../dist/services/artist-wiki-depth.js';
import { isMusicArtistWikiExtract } from '../dist/services/wikipedia-music.js';
import { validateMajorCatalogFact } from '../dist/services/story-llm-fact-hunt.js';

const artist = 'Green Day';
const title = 'Boulevard of Broken Dreams';

assert.ok(isCatalogMajorArtist(artist), 'Green Day must be major tier');

const curated = lookupCuratedFact(artist, title);
assert.ok(curated, 'curated fact for Boulevard of Broken Dreams');
assert.match(curated.fact, /American Idiot|Grammy|Armstrong/i);

const rescue = await fetchEmergencyFactRescue(artist, title, []);
assert.equal(rescue.bundle.trackFacts.length, 1);
assert.match(rescue.bundle.trackFacts[0], /Boulevard of Broken Dreams/i);

const sampleRu =
  '«Boulevard of Broken Dreams» Green Day — Billie Joe Armstrong написал песню об одиночестве на гастролях для альбома American Idiot (2004).';
const validated = validateMajorCatalogFact(sampleRu, artist, title, 'track');
assert.equal(validated.ok, true, 'Russian catalog fact with title should pass');

resetArtistWikiDepthState();
const wikiLead = await fetchArtistWikiLeadWithRetry(artist, 3);
if (wikiLead?.text) {
  assert.ok(isMusicArtistWikiExtract(wikiLead.text), 'Green Day wiki lead is music extract');
  const retry = await tryRetryArtistWikiSeed({
    installId: 'test-install',
    artist,
    previousScripts: [],
  });
  assert.ok(retry?.text, 'tryRetryArtistWikiSeed returns Green Day bio');
}

console.log('OK: Green Day curated + emergency rescue + catalog validation + wiki retry');
