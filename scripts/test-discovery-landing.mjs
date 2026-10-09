import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async path => readFile(path, 'utf8');
const [discover, classic, languageExchange, programContent, catchAll, eventScope] = await Promise.all([
  read('src/app/discover/page.tsx'),
  read('src/app/discover/classic/page.tsx'),
  read('src/app/language-exchange/program-page.tsx'),
  read('src/app/language-exchange/program-content.tsx'),
  read('src/app/[[...path]]/page.tsx'),
  read('src/lib/event-scope.ts'),
]);

assert.match(discover, /import LanguageExchangePage from ['"]@\/app\/language-exchange\/program-page['"]/);
assert.match(discover, /<LanguageExchangePage memberDiscovery\/>/);
assert.match(discover, /force-dynamic/);
assert.match(classic, /<App path="discover"/);
const discoveryEntry = await read('src/components/discovery-entry.tsx');
assert.match(discoveryEntry, /account.authenticated \? <MemberDiscovery/);
assert.match(discoveryEntry, /: <LanguageExchangeContent events=/);
const siteFooter = await read('src/components/site-footer.tsx');
assert.doesNotMatch(siteFooter, /href="\/discover\/classic"/);
assert.match(classic, /<App path="discover"/);
assert.match(languageExchange, /import LanguageExchangeContent/);
assert.match(languageExchange, /<LanguageExchangeContent events=\{events\}/);
assert.match(await read('src/app/language-exchange/page.tsx'), /force-dynamic/);
assert.match(languageExchange, /eq\('theme', 'Language Exchange'\)/);
assert.match(programContent, /'use client'/);
assert.match(programContent, /useSiteLocale/);
const programStyles = await read('src/app/language-exchange/page.module.css');
assert.match(programStyles, /@container roundy \(max-width:759px\)/);
assert.doesNotMatch(programStyles, /@media\s*\(max-width/);
assert.match(programContent, /tr\(locale, english, korean\)/);
assert.match(programContent, /<main id="main">/);
assert.match(programContent, /href="\/refund-policy"/);
assert.match(programContent, /매칭/);
assert.match(programContent, /locale === 'ko' \? 'ko-KR' : 'en-US'/);
assert.match(programContent, /event.title_ko/);
assert.match(programContent, /t\('UPCOMING SESSIONS', '모집 일정'\)/);
assert.match(programContent, /t\('SAMPLE CURRICULUM', '예시 커리큘럼'\)/);
assert.doesNotMatch(programContent, /<SiteFooter|className=\{styles\.header\}/);
assert.match(catchAll, /import LanguageExchangePage from ['"]@\/app\/language-exchange\/program-page['"]/);
assert.match(catchAll, /if \(path\.length === 0\) return <LanguageExchangePage memberDiscovery\/>/);
assert.match(catchAll, /<App key=\{pathname\} path=\{path\.join\('\/'\)\}/);
assert.match(eventScope, /1:1 Speed Mingle/);
console.log('PASS: homepage and Discover localize all program sections with the global language selector while retaining live sessions and original Discovery');
