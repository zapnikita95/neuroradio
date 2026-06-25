#!/usr/bin/env node
/**
 * Artist-scope seeds must not be narrated as if THIS track is about that biography.
 * Soft gate + prompt framing — see artist-bio-track-framing.ts
 *
 *   npm run build && node scripts/test-artist-bio-track-framing.mjs
 */
import assert from 'node:assert/strict';

const {
  findArtistBioTrackFalseLinkage,
  seedExplicitlyLinksToTrack,
} = await import('../dist/services/artist-bio-track-framing.js');
const { validateStoryScript } = await import('../dist/services/story-quality.js');

const CASES = [
  {
    id: 'miyavi-long-nights',
    artist: 'MIYAVI',
    title: 'Long Nights',
    narrator: 'radio_host',
    seed:
      'In his youth Miyavi was an honors student and played football for the Cerezo Osaka youth team before a serious injury at age fifteen pushed him toward guitar.',
    bad: `Long Nights — MIYAVI — трек, который артист записал, вдохновившись детством. В школе он был отличником и гонял за мячом в академии Cerezo Osaka. Трек сочетает гитарные риффы и меланхоличные тексты — как будто это забеги по полю и тихие вечера над учебниками. Именно этот опыт вылился в музыку. Не переключайтесь!`,
    good: `Long Nights — MIYAVI — сейчас в эфире. К слову об артисте: до сцены он был отличником и играл в молодёжке Cerezo Osaka, пока травма в пятнадцать не переключила его на гитару. С Long Nights это напрямую не связано — просто редкая биография за ярким сценическим образом. Не переключайтесь!`,
  },
  {
    id: 'sting-shape',
    artist: 'Sting',
    title: 'Shape of My Heart',
    narrator: 'expert',
    seed:
      'Before The Police, Sting worked as a schoolteacher in Newcastle while playing in jazz clubs at night.',
    bad: `Shape of My Heart — Sting — песня о классной доске и школьных буднях, вдохновлённая его годами учителя в Ньюкасле.`,
    good: `Shape of My Heart — Sting. Пока звучит этот трек, напомню: до The Police он совмещал работу учителем в Ньюкасле с джазовыми клубами по вечерам — поворот, о котором мало говорят в чартах.`,
  },
  {
    id: 'adele-skyfall',
    artist: 'Adele',
    title: 'Skyfall',
    narrator: 'radio_host',
    seed:
      'Adele studied at the BRIT School for Performing Arts alongside Jessie J and Leona Lewis.',
    bad: `Skyfall — Adele — трек про BRIT School и одноклассниц, где она училась вместе с Jessie J.`,
    good: `Skyfall — Adele — в эфире. Мало кто помнит, что до мировой славы она училась в BRIT School вместе с Jessie J и Leona Lewis — фон карьеры, не сюжет Skyfall.`,
  },
  {
    id: 'brian-may-bohemian',
    artist: 'Queen',
    title: 'Bohemian Rhapsody',
    narrator: 'backstage',
    seed:
      'Brian May completed a PhD in astrophysics years after Queen became famous, publishing on interplanetary dust.',
    bad: `Bohemian Rhapsody — Queen — композиция о космической пыли и докторской May, вдохновлённая его астрофизикой.`,
    good: `Bohemian Rhapsody — Queen. За кулисами: Brian May позже защитил докторскую по астрофизике — культовый трек с этим не связан, но контраст науки и рок-сцены поражает.`,
  },
  {
    id: 'ozzy-crazy-train',
    artist: 'Ozzy Osbourne',
    title: 'Crazy Train',
    narrator: 'night_dj',
    seed:
      'As a teenager Ozzy Osbourne was fired from a factory job after a burglary conviction and struggled to find steady work.',
    bad: `Crazy Train — Ozzy Osbourne — песня о заводе и воровстве, выросшая из его увольнения с фабрики.`,
    good: `Crazy Train — Ozzy Osbourne — в ночном эфире. До славы его уволили с завода после судимости за кражу — жёсткий старт, не тема Crazy Train, но объясняет хрипоту судьбы.`,
  },
  {
    id: 'dolly-jolene',
    artist: 'Dolly Parton',
    title: 'Jolene',
    narrator: 'fan',
    seed:
      'Dolly Parton grew up poor in the Smoky Mountains as one of twelve children in a one-room cabin.',
    bad: `Jolene — Dolly Parton — трек про бедность в Смоки-Маунтинс и двенадцать детей в одной комнате.`,
    good: `Jolene — Dolly Parton — крутится сейчас. Я обожаю, что она выросла в одной комнате с eleven siblings в горах — это её корни, а Jolene — другая история про ревность.`,
  },
  {
    id: 'cobain-teen-spirit',
    artist: 'Nirvana',
    title: 'Smells Like Teen Spirit',
    narrator: 'contemporary',
    seed:
      'Kurt Cobain spent a lonely adolescence in Aberdeen, Washington, feeling like an outsider at school.',
    bad: `Smells Like Teen Spirit — Nirvana — песня о одиночестве в Абердине и школьном аутсайдерстве Кобейна.`,
    good: `Smells Like Teen Spirit — Nirvana — в ротации. К слову: Кобейн чувствовал себя чужим в школе в Абердине — это его юность, не обязательно лирика этого хита.`,
  },
  {
    id: 'beyonce-single-ladies',
    artist: 'Beyoncé',
    title: 'Single Ladies',
    narrator: 'contemporary',
    seed:
      "Destiny's Child began as a six-member girl group before lineup changes left Beyoncé, Kelly Rowland, and Michelle Williams.",
    bad: `Single Ladies — Beyoncé — трек про сокращение состава Destiny's Child до трёх участниц.`,
    good: `Single Ladies — Beyoncé — на повторе. Раньше в Destiny's Child было шесть человек, потом осталась тройка — предыстория группы, не сюжет Single Ladies.`,
  },
  {
    id: 'sia-chandelier',
    artist: 'Sia',
    title: 'Chandelier',
    narrator: 'fan',
    seed:
      'For years Sia wrote hits for other artists under contracts that kept her face off album covers.',
    bad: `Chandelier — Sia — песня о том, как она писала хиты для других и прятала лицо с обложек.`,
    good: `Chandelier — Sia — сейчас играет. Я тащусь, что годами она писала чужие хиты без лица на обложках — отдельная глава, не обязательно текст Chandelier.`,
  },
  {
    id: 'miyavi-long-nights-unhcr',
    artist: 'MIYAVI',
    title: 'Long Nights',
    narrator: 'radio_host',
    seed:
      'MIYAVI wrote Long Nights after visiting refugee camps in Lebanon while working with UNHCR; the song addresses heavy nights and hope for displaced people.',
    bad: null,
    good: `Long Nights — MIYAVI — трек, который он написал после поездки в лагеря беженцев в Ливане с UNHCR — о тяжёлых ночах и надежде. Сильная история, привязанная к песне напрямую.`,
    expectTrackLinkedSeed: true,
  },
];

let failed = 0;

for (const c of CASES) {
  if (c.expectTrackLinkedSeed) {
    assert.equal(
      seedExplicitlyLinksToTrack(c.seed, c.title),
      true,
      `${c.id}: seed must count as track-linked`,
    );
    assert.equal(
      findArtistBioTrackFalseLinkage(c.good, c.title, [c.seed]),
      null,
      `${c.id}: track-linked seed story must pass gate`,
    );
    console.log(`ok: ${c.id} (track-linked seed allowed)`);
    continue;
  }

  assert.equal(
    seedExplicitlyLinksToTrack(c.seed, c.title),
    false,
    `${c.id}: seed must NOT count as track-linked`,
  );

  const badHit = findArtistBioTrackFalseLinkage(c.bad, c.title, [c.seed]);
  assert.ok(badHit, `${c.id}: bad script must be rejected (got ${badHit ?? 'null'})`);

  const goodHit = findArtistBioTrackFalseLinkage(c.good, c.title, [c.seed]);
  assert.equal(goodHit, null, `${c.id}: good parallel framing must pass (got ${goodHit})`);

  const badVal = validateStoryScript(c.bad, '60s', c.artist, c.title, {
    referenceFacts: [c.seed],
    storyNarrator: c.narrator,
    skipPersonaCliches: true,
    skipBannedPatterns: true,
    speakTrackNamesInVoiceover: true,
  });
  assert.equal(badVal.ok, false, `${c.id}: validateStoryScript rejects bad`);
  assert.match(
    badVal.reason ?? '',
    /artist biography falsely linked|artist milestone|ungrounded|voiceover names leak/i,
    `${c.id}: bad rejection reason (${badVal.reason})`,
  );

  const goodVal = validateStoryScript(c.good, '60s', c.artist, c.title, {
    referenceFacts: [c.seed],
    storyNarrator: c.narrator,
    skipPersonaCliches: true,
    skipBannedPatterns: true,
    skipFirstSentenceAnchor: true,
    speakTrackNamesInVoiceover: true,
  });
  if (!goodVal.ok && /artist biography falsely linked/.test(goodVal.reason ?? '')) {
    failed += 1;
    console.error(`FAIL: ${c.id} good script blocked: ${goodVal.reason}`);
    continue;
  }
  console.log(`ok: ${c.id} (${c.narrator})`);
}

if (failed > 0) {
  console.error(`\nFAIL — ${failed} case(s)`);
  process.exit(1);
}
console.log(`\nAll ${CASES.length} artist-bio framing cases passed.`);
