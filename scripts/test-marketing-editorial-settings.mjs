import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const code = ts.transpileModule(read('src/lib/marketing-editorial-settings.ts'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
}).outputText;
const mod = {exports: {}};
vm.runInNewContext(code, {exports: mod.exports, module: mod});
const {EDITORIAL_SETTINGS_DEFAULTS: defaults, parseEditorialSettingsPatch: parse} = mod.exports;
assert.equal(defaults.feed_daily_max_posts, 1);
assert.equal(defaults.carousel_mode, 'fixed');
assert.equal(defaults.carousel_default_slides, 5);
assert.equal(defaults.carousel_min_real_photos_5, 3);
assert.equal(defaults.carousel_min_real_photos_3, 2);
assert.equal(defaults.carousel_ai_thumbnail_enabled, false);
assert.equal(defaults.carousel_answer_first_enabled, false);
assert.equal(defaults.story_preview_auto_enabled, false);
assert.equal(defaults.carousel_title_font_size_px, 72);
assert.equal(defaults.carousel_body_font_size_px, 36);

const all = parse({...defaults, carousel_mode: 'alternating', carousel_default_slides: 3,
  carousel_min_real_photos_3: 2, carousel_ai_thumbnail_enabled: true,
  carousel_answer_first_enabled: true, story_preview_auto_enabled: true});
assert.equal(all.ok, true);
assert.equal(Object.keys(all.patch).length, Object.keys(defaults).length);
assert.equal(all.patch.carousel_mode, 'alternating');

const partial = parse({carousel_title_font_size_px: 88});
assert.equal(partial.ok, true);
assert.equal(partial.patch.carousel_title_font_size_px, 88);
assert.equal(Object.keys(partial.patch).length, 1, 'partial PATCH must leave every other preference unchanged');
for (const bad of [null, [], {}, {unknown_setting: true},
  {feed_daily_max_posts: 0}, {feed_daily_max_posts: 11}, {feed_daily_max_posts: '1'},
  {carousel_mode: 'mixed'}, {carousel_default_slides: 4},
  {carousel_min_real_photos_5: 6}, {carousel_min_real_photos_3: -1},
  {carousel_ai_thumbnail_enabled: 'true'}, {carousel_answer_first_enabled: 1},
  {story_preview_auto_enabled: null}, {carousel_title_font_size_px: 12},
  {carousel_body_font_size_px: 81}, {carousel_body_font_size_px: NaN}]) {
  assert.equal(parse(bad).ok, false, 'invalid settings payload must be rejected');
}

const migration = read('supabase/migrations/20261010113000_instagram_editorial_settings_foundation.sql');
for (const key of Object.keys(defaults)) {
  assert.match(migration, new RegExp('add column if not exists ' + key + '\\b'), key + ' column');
}
assert.doesNotMatch(migration, /\b(drop|truncate|delete\s+from|update\s+public\.instagram_post_drafts)\b/i);
assert.match(migration, /Manual extra publication remains permitted/);
const legacy = read('src/lib/marketing-legacy.ts');
assert.match(legacy, /req\.method==='GET'/);
assert.match(legacy, /parseEditorialSettingsPatch\(body\)/);
assert.match(legacy, /req\.method==='PATCH'/);
const component = read('src/components/admin-marketing.tsx');
assert.match(component, /EDITORIAL_SETTINGS_DEFAULTS/);
assert.match(component, /mutate\('\/settings',editorial,'PATCH'\)/);
assert.match(component, /<AdminMarketingSettings/);
const editorialUi = read('src/components/admin-marketing-settings.tsx');
assert.match(editorialUi, /Saved in the existing marketing settings record/i);
assert.match(editorialUi, /Fixed 5-card and Alternating 3\/5 rules/i);
console.log('PASS marketing editorial settings: defaults, strict partial writes, legacy isolation, GET/PATCH contract and additive migration');
