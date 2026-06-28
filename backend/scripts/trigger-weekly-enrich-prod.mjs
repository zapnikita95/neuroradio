#!/usr/bin/env node
/** POST /v1/admin/weekly-deep-enrich/run on production BFF. */
import '../dist/load-env.js';

const base = (process.env.RAILWAY_URL || process.env.BFF_URL || 'https://www.efir-ai.ru').replace(/\/$/, '');
const secret = process.env.BILLING_ADMIN_SECRET?.trim();
if (!secret) {
  console.error('BILLING_ADMIN_SECRET missing in .env');
  process.exit(1);
}

const forceEra = process.argv.includes('--force-era');

const res = await fetch(`${base}/v1/admin/weekly-deep-enrich/run`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-billing-admin-secret': secret,
  },
  body: JSON.stringify({ forceEra }),
});

const text = await res.text();
console.log(`HTTP ${res.status}`);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
process.exit(res.ok ? 0 : 1);
