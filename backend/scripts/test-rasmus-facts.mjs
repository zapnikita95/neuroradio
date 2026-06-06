#!/usr/bin/env node
/** Quick check: The Rasmus wiki-lead + fact bundle. */
import { fetchArtistWikiLead } from '../dist/services/wikipedia-lead.js';
import { fetchAggregatedFactContext } from '../dist/services/fact-aggregator.js';
import { isCatalogMajorArtist, resolveArtistTier } from '../dist/services/artist-notability.js';

const artist = 'The Rasmus';
const title = 'In The Shadows (Radio Edit)';

if (!isCatalogMajorArtist(artist)) {
  console.error('FAIL: The Rasmus should be catalog major');
  process.exit(1);
}
console.log('OK: The Rasmus is catalog major');

const lead = await fetchArtistWikiLead(artist);
if (!lead?.text || lead.text.length < 80) {
  console.error('FAIL: wiki lead empty');
  process.exit(1);
}
if (!/finnish rock|in the shadows/i.test(lead.text)) {
  console.error('FAIL: wiki lead missing expected content');
  console.error(lead.text.slice(0, 200));
  process.exit(1);
}
console.log(`OK: wiki lead (${lead.lang}) ${lead.text.slice(0, 120)}…`);

const ctx = await fetchAggregatedFactContext(artist, title);
const total = ctx.bundle.trackFacts.length + ctx.bundle.artistFacts.length;
if (total === 0) {
  console.error('FAIL: no facts in aggregated context');
  process.exit(1);
}
const tier = resolveArtistTier(artist, title, {}, ctx.bundle);
console.log(`OK: ${total} facts, tier=${tier}, track=${ctx.bundle.trackFacts.length} artist=${ctx.bundle.artistFacts.length}`);
console.log('OK: all Rasmus fact checks passed');
