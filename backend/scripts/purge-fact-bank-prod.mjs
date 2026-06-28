#!/usr/bin/env node
/** POST /v1/admin/fact-bank/purge on production BFF. */
import '../dist/load-env.js';

const base = (process.env.RAILWAY_URL || process.env.BFF_URL || 'https://www.efir-ai.ru').replace(/\/$/, '');
const secret = process.env.BILLING_ADMIN_SECRET?.trim();
if (!secret) {
  console.error('BILLING_ADMIN_SECRET missing in .env');
  process.exit(1);
}

const previewOnly = process.argv.includes('--preview');

const path = previewOnly ? '/v1/admin/fact-bank/purge/preview' : '/v1/admin/fact-bank/purge';
const res = await fetch(`${base}${path}`, {
  method: previewOnly ? 'GET' : 'POST',
  headers: { 'x-billing-admin-secret': secret },
});

const text = await res.text();
console.log(`HTTP ${res.status}`);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
process.exit(res.ok ? 0 : 1);
