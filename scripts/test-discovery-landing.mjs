import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async path => readFile(path, 'utf8');
const [discover, classic, languageExchange, programContent, catchAll, eventScope] = await Promise.all([
  read('src/app/discover/page.tsx'),
  read('src/app/discover/classic/page.tsx'),
  read('src/app/language-exchange/page.tsx'),
  read('src/app/language-exchange/program-content.tsx'),
  read('src/app/[[...path]]/page.tsx'),
  read('src/lib/event-scope.ts'),
]);

assert.match(discover, /import { App } from ['"]@\/components\/app['"]/);
assert.match(discover, /<App path="discover"/);
assert.match(discover, /force-dynamic/);
assert.match(classic, /<App path="discover"/);
const siteFooter = await read('src/components/site-footer.tsx');
assert.doesNotMatch(siteFooter, /href="\/discover\/classic"/);
assert.match(classic, /<App path="discover"/);
assert.match(languageExchange, /import LanguageExchangeContent/);
assert.match(languageExchange, /<LanguageExchangeContent events=\{events\}/);
assert.match(languageExchange, /force-dynamic/);
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
assert.doesNotMatch(catchAll, /LanguageExchangePage/);
const app = await read('src/components/app.tsx');
assert.match(app, /if\(route==='home'\|\|route==='discover'\)content=<LandingPage/);
const seo = await read('src/lib/seo.ts');
assert.match(seo, /서울 로테이션 소개팅/);
assert.match(seo, /'\/language-exchange':/);
assert.match(languageExchange, /publicMetadata\('\/language-exchange'\)/);
assert.match(catchAll, /<App key=\{pathname\} path=\{path\.join\('\/'\)\}/);
assert.match(eventScope, /1:1 Speed Mingle/);
console.log('PASS: 1:1 rotation dating is the homepage and Discover; language exchange remains a separate localized program route');
