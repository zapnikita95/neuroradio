#!/usr/bin/env node
import '../dist/load-env.js';
import { searchTavily } from '../dist/services/deep-search-provider.js';

const key = process.env.TAVILY_API_KEY?.trim();
if (!key) {
  console.error('TAVILY_API_KEY missing in backend/.env or Railway');
  process.exit(1);
}

const { hits, costUsd } = await searchTavily(
  'Michael Jackson Billie Jean song inspiration groupies',
  key,
  'advanced',
);
console.log(`OK — ${hits.length} hits, $${costUsd.toFixed(4)}`);
for (const h of hits.slice(0, 5)) {
  console.log(`  • ${h.url}\n    ${h.title}`);
}
