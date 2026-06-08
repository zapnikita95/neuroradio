/**
 * Nirvana — Come As You Are must never 503 when wiki/web are down (curated + emergency).
 * Run: npm run build && node scripts/test-nirvana-facts.mjs
 */
import assert from 'node:assert/strict';
import { lookupCuratedFact } from '../dist/services/curated-facts.js';
import { fetchEmergencyFactRescue } from '../dist/services/fact-aggregator.js';
import { isCatalogMajorArtist } from '../dist/services/artist-notability.js';

const artist = 'Nirvana';
const title = 'Come As You Are';

assert.ok(isCatalogMajorArtist(artist), 'Nirvana must be major tier');

const curated = lookupCuratedFact(artist, title);
assert.ok(curated, 'curated fact for Come As You Are');
assert.match(curated.fact, /Nevermind|Cobain|grunge/i);

const rescue = await fetchEmergencyFactRescue(artist, title, []);
assert.equal(rescue.bundle.trackFacts.length, 1);
assert.match(rescue.bundle.trackFacts[0], /Come As You Are/i);

console.log('OK: Nirvana curated + emergency rescue');
