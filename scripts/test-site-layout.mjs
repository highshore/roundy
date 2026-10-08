import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const read = path => readFile(path, 'utf8');
const compile = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');

const { siteLayoutForPath } = await import(compile(await read('src/lib/site-layout.ts')));
for (const path of ['/', '/discover', '/language-exchange', '/events', '/events/sample', '/matches', '/me', '/terms', '/unexpected-new-page']) {
  const policy = siteLayoutForPath(path);
  assert.equal(policy.useSiteShell, true, path);
  assert.equal(policy.header, true, path + ': global header');
  assert.equal(policy.footer, true, path + ': global footer');
}
for (const path of ['/', '/discover', '/language-exchange']) {
  assert.equal(siteLayoutForPath(path).programWidth, true, path);
  assert.equal(siteLayoutForPath(path).bottomNav, true, path + ': shared mobile nav');
}
assert.equal(siteLayoutForPath('/discover/classic').programWidth, false, 'Keep classic Discovery mobile-first');
assert.equal(siteLayoutForPath('/discover/classic').bottomNav, true);
assert.equal(siteLayoutForPath('/onboarding/basics').header, false);
assert.equal(siteLayoutForPath('/onboarding/basics').footer, false);
assert.equal(siteLayoutForPath('/onboarding/basics').bottomNav, false);
for (const path of ['/admin', '/admin/events', '/auth/callback']) {
  assert.equal(siteLayoutForPath(path).useSiteShell, false, path);
}
for (const path of ['/checkout/event', '/terms', '/refund-policy', '/privacy', '/event-night/id']) {
  assert.equal(siteLayoutForPath(path).bottomNav, false, path);
}

const root = await read('src/app/layout.tsx');
const chrome = await read('src/components/site-shell.tsx');
const app = await read('src/components/app.tsx');
const program = await read('src/app/language-exchange/page.tsx');
const programContent = await read('src/app/language-exchange/program-content.tsx');
const footer = await read('src/components/site-footer.tsx');
assert.match(root, /<SiteShell>\{children\}<\/SiteShell>/);
assert.match(chrome, /className="site-header"/);
assert.match(chrome, /className="bottom-nav"/);
assert.match(chrome, /<SiteFooter locale=\{locale\}\/>/);
assert.match(chrome, /<LocaleToggle locale=\{locale\}/);
assert.match(chrome, /<RoundyBrand\s*\/>/);
assert.match(chrome, /roundy-locale/);
assert.match(chrome, /aria-current=\{item\.active/);
assert.match(chrome, /useSiteLocale/);
assert.match(app, /const \{locale\}=useSiteLocale\(\)/);
assert.match(app, /wizardHeader=<header className="wizard-header"/);
assert.doesNotMatch(app, /<header className="site-header"/);
assert.doesNotMatch(app, /<nav className="bottom-nav"/);
assert.doesNotMatch(app, /<SiteFooter locale=/);
assert.doesNotMatch(program, /<SiteFooter|className=\{styles\.header\}/);
assert.match(program, /<LanguageExchangeContent events=\{events\}/);
assert.match(programContent, /<main id="main">/);
assert.match(programContent, /useSiteLocale/);
assert.match(footer, /href="\/discover\/classic"/);
assert.match(await read('src/app/globals.css'), /experience\.program-shell:not\(\.route-admin\)/);
console.log('PASS: global layout chrome defaults, existing nav/footer/mobile nav, route exceptions, shared locale and no duplicated page chrome');
