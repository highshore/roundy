import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async path => readFile(path, 'utf8');
const [discover, classic, languageExchange, catchAll, eventScope] = await Promise.all([
  read('src/app/discover/page.tsx'),
  read('src/app/discover/classic/page.tsx'),
  read('src/app/language-exchange/page.tsx'),
  read('src/app/[[...path]]/page.tsx'),
  read('src/lib/event-scope.ts'),
]);

assert.match(discover, /import LanguageExchangePage from ['"]@\/app\/language-exchange\/page['"]/);
assert.match(discover, /export default LanguageExchangePage/);
assert.match(discover, /force-dynamic/);
assert.match(classic, /<App path="discover"/);
assert.match(languageExchange, /href="\/discover\/classic"/);
assert.match(languageExchange, /href="\/refund-policy"/);
assert.match(languageExchange, /매칭/);
assert.match(languageExchange, /Language Exchange/);
assert.match(languageExchange, /eq\('theme', 'Language Exchange'\)/);
assert.match(catchAll, /<App key=\{pathname\} path=\{path\.join\('\/'\)\}/);
assert.match(eventScope, /1:1 Speed Mingle/);
console.log('PASS: new Discover route reuses the live language-exchange page; original Discovery, PG disclosure and event flows remain available');
