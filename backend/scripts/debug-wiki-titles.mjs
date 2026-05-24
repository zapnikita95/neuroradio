import fetch from 'node-fetch';

const titles = [
  'Sing, Sing, Sing (1937 song)',
  'Sing Sing Sing (song)',
  'Benny Goodman',
  'Rock & Roll Queen (song)',
  'Rock and Roll Queen',
  'The Subways',
  'I Put a Spell on You',
  'I Put a Spell on You (Screamin\' Jay Hawkins song)',
  'Sixteen Tons (Merle Travis song)',
  'Группа крови',
  'Группа крови (песня)',
  'Кино (группа)',
];

for (const t of titles) {
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsentences=12&format=json&origin=*&titles=' +
    encodeURIComponent(t);
  const r = await fetch(url, { headers: { 'User-Agent': 'MusicStory/1.0' } });
  const d = await r.json();
  const page = Object.values(d.query.pages)[0];
  console.log('\n---', t, '---');
  console.log((page.extract || 'NO').slice(0, 500));
}
