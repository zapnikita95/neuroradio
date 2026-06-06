import {
  factMentionsArtist,
  storyNamesForeignArtist,
} from '../dist/services/fact-relevance.js';
import { validateStoryScript } from '../dist/services/story-quality.js';
import { qualityOptionsForProductionAttempt } from '../dist/services/story-generate-loop.js';

const artist = 'Rosé, Bruno Mars';
const title = 'APT.';
const seed =
  "Roseanne Park, known mononymously as Rosé (Korean: 로제), is a New Zealand and South Korean singer and songwriter. Born in Auckland, she rose to fame as a member of Blackpink, formed by YG Entertainment.";
const story =
  'Rosé — это не просто голос Blackpink, а история девушки, которая перевернула свою жизнь ради музыки. Родившись в Новой Зеландии и выросшая в Австралии, она могла бы остаться в тени, но выбрала другой путь. В 2012 году она прошла прослушивание в YG Entertainment и переехала в Южную Корею, где начался её путь к славе. Четыре года упорных тренировок — и вот она на сцене с Blackpink, одной из самых успешных женских групп в истории.';

console.log('mentions artist:', factMentionsArtist(story, artist));
console.log('foreign artist:', storyNamesForeignArtist(story, artist, title, [seed]));
const q = validateStoryScript(story, 'medium', artist, title, qualityOptionsForProductionAttempt([seed]));
console.log('validate:', q);
