#!/usr/bin/env node
/**
 * Generate static SEO pages from public-voiced-facts.json
 * Usage: node backend/scripts/generate-facts-seo-pages.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');
const dataDir = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(backendRoot, 'data');
const storePath = path.join(dataDir, 'public-voiced-facts.json');
const outDir = path.join(repoRoot, 'website', 'docs', 'facts');
const sitemapPath = path.join(repoRoot, 'website', 'sitemap.xml');

const NARRATOR_LABELS = {
  radio_host: 'Радиоведущий',
  night_dj: 'Ночной диджей',
  expert: 'Эксперт жанра',
  contemporary: 'Современник эпохи',
  fan: 'Фанат-коллекционер',
  backstage: 'Инсайдер с закулисья',
  auto: 'Авто',
};

const NARRATOR_ORDER = ['radio_host', 'night_dj', 'expert', 'contemporary', 'fan', 'backstage'];

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadFacts() {
  if (!fs.existsSync(storePath)) return [];
  const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  return (raw.facts ?? []).filter((f) => f.lang !== 'en' && f.voicedText?.length >= 20);
}

function groupByNarrator(facts) {
  const groups = {};
  for (const f of facts.sort((a, b) => b.firstVoicedAt - a.firstVoicedAt)) {
    const n = f.narrator || 'radio_host';
    if (!groups[n]) groups[n] = [];
    if (groups[n].length < 12) groups[n].push(f);
  }
  return groups;
}

function renderIndex(facts) {
  const groups = groupByNarrator(facts);
  const factOfDay = facts.sort((a, b) => b.firstVoicedAt - a.firstVoicedAt)[0];
  const sections = NARRATOR_ORDER.filter((n) => groups[n]?.length)
    .map((n) => {
      const cards = groups[n]
        .map(
          (f) => `
        <article class="fact-card">
          <h3>${esc(f.artist)} — ${esc(f.title)}</h3>
          <p class="fact-voiced">${esc(f.voicedText)}</p>
        </article>`,
        )
        .join('\n');
      return `
      <section class="facts-section" id="narrator-${n}">
        <h2>${esc(NARRATOR_LABELS[n] ?? n)}</h2>
        <div class="facts-grid">${cards}</div>
      </section>`;
    })
    .join('\n');

  const dayBlock = factOfDay
    ? `<section class="facts-day">
        <span class="legal-kicker">Факт дня</span>
        <h2>${esc(factOfDay.artist)} — ${esc(factOfDay.title)}</h2>
        <p class="fact-voiced fact-voiced--lead">${esc(factOfDay.voicedText)}</p>
        <p class="fact-meta">Амплуа: ${esc(NARRATOR_LABELS[factOfDay.narrator] ?? factOfDay.narrator)}</p>
      </section>`
    : `<p class="fact-empty">Пока нет озвученных фактов — они появятся после прослушивания историй в приложении.</p>`;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Интересные факты о музыке — Эфир AI</title>
  <meta name="description" content="Озвученные истории и факты о треках — как их услышали слушатели Эфир AI. По амплуа: радиоведущий, фанат, эксперт и другие." />
  <link rel="canonical" href="https://www.efir-ai.ru/docs/facts/index.html" />
  <meta name="robots" content="index, follow" />
  <link rel="stylesheet" href="../../styles.css" />
</head>
<body>
  <div class="bg-aurora" aria-hidden="true"><span class="orb orb-1"></span><span class="orb orb-2"></span><span class="orb orb-3"></span></div>
  <div class="bg-grain" aria-hidden="true"></div>
  <main class="legal-main facts-page">
    <a class="legal-back" href="../../index.html">← На главную</a>
    <span class="legal-kicker">Факты</span>
    <h1>Озвученные истории о музыке</h1>
    <p class="legal-meta">Тексты сохранены ровно в том виде, как их озвучил сервис — без переписывания.</p>
    ${dayBlock}
    <nav class="facts-nav" aria-label="Амплуа">
      ${NARRATOR_ORDER.filter((n) => groups[n]?.length)
        .map((n) => `<a href="#narrator-${n}">${esc(NARRATOR_LABELS[n])}</a>`)
        .join(' · ')}
    </nav>
    ${sections}
    <section class="facts-cta">
      <h2>Узнай факт о треке, который играет у тебя</h2>
      <p><a class="btn btn-primary" href="../../index.html#download">Скачать Эфир AI</a></p>
    </section>
  </main>
</body>
</html>`;
}

function artistSlug(artist) {
  return artist
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u0400-\u04ff-]/g, '')
    .slice(0, 64);
}

function groupByArtist(facts) {
  const groups = {};
  for (const f of facts) {
    const slug = artistSlug(f.artist);
    if (!slug) continue;
    if (!groups[slug]) groups[slug] = { artist: f.artist, slug, facts: [] };
    groups[slug].facts.push(f);
  }
  return Object.values(groups)
    .filter((g) => g.facts.length >= 1)
    .sort((a, b) => b.facts.length - a.facts.length)
    .slice(0, 24);
}

function renderArtistPage(group) {
  const cards = group.facts
    .sort((a, b) => b.firstVoicedAt - a.firstVoicedAt)
    .slice(0, 16)
    .map(
      (f) => `
        <article class="fact-card">
          <h3>${esc(f.title)}</h3>
          <p class="fact-meta">Амплуа: ${esc(NARRATOR_LABELS[f.narrator] ?? f.narrator)}</p>
          <p class="fact-voiced">${esc(f.voicedText)}</p>
        </article>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Факты о ${esc(group.artist)} — Эфир AI</title>
  <meta name="description" content="Озвученные истории о треках ${esc(group.artist)} — как их услышали в Эфир AI." />
  <link rel="canonical" href="https://www.efir-ai.ru/docs/facts/artists/${esc(group.slug)}.html" />
  <link rel="stylesheet" href="../../../styles.css" />
</head>
<body>
  <div class="bg-aurora" aria-hidden="true"><span class="orb orb-1"></span><span class="orb orb-2"></span><span class="orb orb-3"></span></div>
  <div class="bg-grain" aria-hidden="true"></div>
  <main class="legal-main facts-page">
    <a class="legal-back" href="../index.html">← Все факты</a>
    <span class="legal-kicker">Артист</span>
    <h1>${esc(group.artist)}</h1>
    <p class="legal-meta">${group.facts.length} озвучен${group.facts.length === 1 ? 'ная история' : 'ных историй'}</p>
    <div class="facts-grid">${cards}</div>
  </main>
</body>
</html>`;
}

function patchSitemap(extraUrls) {
  if (!fs.existsSync(sitemapPath)) return;
  let xml = fs.readFileSync(sitemapPath, 'utf8');
  for (const url of extraUrls) {
    if (xml.includes(url)) continue;
    const entry = `  <url><loc>${url}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>\n`;
    xml = xml.replace('</urlset>', `${entry}</urlset>`);
  }
  fs.writeFileSync(sitemapPath, xml, 'utf8');
}

function main() {
  const facts = loadFacts();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), renderIndex(facts), 'utf8');

  const artistsDir = path.join(outDir, 'artists');
  fs.mkdirSync(artistsDir, { recursive: true });
  const artistGroups = groupByArtist(facts);
  const sitemapUrls = ['https://www.efir-ai.ru/docs/facts/index.html'];
  for (const g of artistGroups) {
    fs.writeFileSync(path.join(artistsDir, `${g.slug}.html`), renderArtistPage(g), 'utf8');
    sitemapUrls.push(`https://www.efir-ai.ru/docs/facts/artists/${g.slug}.html`);
  }
  patchSitemap(sitemapUrls);
  console.log(
    `[generate-facts-seo] index.html with ${facts.length} facts, ${artistGroups.length} artist pages`,
  );
}

main();
