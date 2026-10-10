import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const loadPure=path=>{
 const context={exports:{},Intl,Date,console,require};
 vm.runInNewContext(ts.transpileModule(read(path),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText,context);
 return context.exports;
};
const view=loadPure('src/lib/marketing-admin-view.ts');
assert.equal(view.formatMarketingKst('2026-10-10T15:30:00Z'),'2026-10-11',
 'UTC midnight rollover must use KST instead');
assert.equal(view.formatMarketingKst('2026-10-10T14:59:00Z'),'2026-10-10');
assert.equal(view.formatMarketingKst('invalid'),null);
const feedRuns=[
 {id:'feed-a',channel:'instagram',status:'queued',scheduled_for:'2026-10-10T15:30:00Z',snapshot:{
  draft_id:'draft-a',caption:'First approved Feed\nMore detail',images:['https://example.invalid/feed-a.jpg'],feed_sequence:1}},
 {id:'feed-b',channel:'instagram',status:'needs_review',scheduled_for:'2026-10-11T11:00:00Z',message:'Meta outcome not confirmed',
  snapshot:{draft_id:'draft-b',caption:'Second approved Feed',images:[]}},
 {id:'reel-c',channel:'instagram',status:'queued',scheduled_for:'2026-10-10T14:00:00Z',
  snapshot:{media_kind:'reel',caption:'Reel Studio is separate'}},
 {id:'koreapas-d',channel:'koreapas',status:'queued',scheduled_for:'2026-10-10T13:00:00Z',snapshot:{caption:'Not Instagram'}},
 {id:'feed-c',channel:'instagram',status:'sent',scheduled_for:'2026-10-09T12:00:00Z',snapshot:{caption:'Already published'}}
];
const stories=[
 {id:'story-a',status:'scheduled',scheduled_for:'2026-10-11T09:00:00Z',feed_run_id:'feed-a',
  teaser_title:'Next day teaser',image_url:'https://example.invalid/story.jpg'},
 {id:'story-b',status:'failed',scheduled_for:null,preview_date_kst:'2026-10-10',
  teaser_title:'Needs manual upload',error_message:'Source unavailable'},
 {id:'story-c',status:'generated',scheduled_for:null,preview_date_kst:'2026-10-11',
  teaser_title:'Awaiting approval'}
];
const combined=view.marketingScheduleItems(feedRuns,stories);
assert.equal(combined.length,6,'Reel and Koreapas are excluded from the Feed/Story queue');
assert.equal(combined.find(x=>x.id==='feed-a').date_kst,'2026-10-11');
assert.equal(combined.find(x=>x.id==='story-a').kind,'story');
assert.ok(combined.find(x=>x.id==='feed-b').error.includes('Meta'));
assert.equal(combined[0].id,'feed-a','upcoming items come before failed records');
assert.equal(combined[1].id,'story-a');
const stats=view.marketingDashboardMetrics(
 [{id:'draft-1',status:'needs_approval'},{id:'draft-2',status:'skipped'}],
 feedRuns,stories,5);
assert.equal(stats.drafts_awaiting_review,1);
assert.equal(stats.feeds_queued,1);
assert.equal(stats.stories_awaiting_review,1);
assert.equal(stats.unresolved_failures,2);
assert.equal(stats.approved_photos,5);
assert.equal(stats.stories_queued,1);
const src=read('src/components/admin-marketing.tsx');
for(const expression of [
 /<AdminMarketingOverview/,/<AdminMarketingAssets/,/<AdminMarketingQueue/,
 /<AdminMarketingSettings/,/<MarketingMobilePreview/,
 /const \[activeTab,setActiveTab\]/,/setActiveTab\('draft'\)/,
 /['"]\/draft\/['"]\+draft\.id\+['"]\/approve['"]/,/['"]\/draft\/['"]\+draft\.id\+['"]\/publish-now['"]/,
 /['"]\/draft\/['"]\+draft\.id\+['"]\/thumbnail['"]/,/setMarketingSettings|\/settings/,
 /importResultToDraft/,/reviewStock\(/,/recheckForPublishing|quality\/recheck/,
 /generation\/jobs/,/activeTab==='growth'/,/activeTab==='reels'/,
 /activeTab==='stories'/,/activeTab==='trend'/,/activeTab==='publishing'/,
 /activeTab==='connection'/,/channel==='koreapas'/
])assert.match(src,expression);
const api=read('src/lib/marketing.ts');
assert.match(api,/path\[1\]==='assets'&&req\.method==='GET'/);
assert.match(api,/marketing_photo_assets/);
assert.match(api,/marketing_draft_photos/);
assert.match(api,/reviewStockAsset\(service,path\[1\]/);
assert.match(api,/path\[2\]==='publish-now'/);
assert.match(api,/path\[2\]==='approve'/);
const settings=read('src/components/admin-marketing-settings.tsx');
assert.match(settings,/EDITORIAL_SETTINGS_DEFAULTS/);
assert.match(settings,/carousel_default_slides|Default card count/);
assert.match(settings,/carousel_min_real_photos_5/);
assert.match(settings,/carousel_min_real_photos_3/);
for(const key of ['feed_daily_max_posts','carousel_mode','carousel_ai_thumbnail_enabled',
 'carousel_answer_first_enabled','story_preview_auto_enabled',
 'carousel_title_font_size_px','carousel_body_font_size_px'])
 assert.ok(settings.includes(key),'Missing existing setting: '+key);
assert.match(src,/mutate\('\/settings',editorial,'PATCH'\)/);
assert.doesNotMatch(src,/create table marketing_admin_settings|insert into marketing_admin_settings/i);
const css=read('src/components/admin-marketing-workspace.css');
assert.match(css,/@media\(max-width:760px\)/);
assert.match(css,/@media\(max-width:540px\)/);
assert.match(css,/--mw-accent:#ff6666/);
assert.match(css,/marketing-mobile-preview/);
assert.match(css,/marketing-copy-options-grid/);
const previewSource=read('src/components/marketing-mobile-preview.tsx');
assert.match(previewSource,/draft\.images/);
assert.match(previewSource,/draft\.carousel_slides/);
assert.match(previewSource,/marketing-phone-safe-guide/);
assert.doesNotMatch(previewSource,/fetch\(|media_publish/);
// Render the actual preview component and exercise its card navigation with no network.
const module={exports:{}};
const cjs=ts.transpileModule(previewSource,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,
 esModuleInterop:true
}}).outputText;
vm.runInNewContext(cjs,{
 module,exports:module.exports,console,require:name=>{
  if(name==='react')return React;
  if(name==='react/jsx-runtime')return require('react/jsx-runtime');
  if(name==='lucide-react')return require('lucide-react');
  if(name==='@/lib/locale')return {tr:(locale,en,ko)=>locale==='ko'?ko:en};
  throw new Error('Unexpected preview dependency: '+name);
 }
});
const example={id:'example-draft',revision:4,caption:'A three-part guide',
 content_language:'ko',carousel_slides:[
  {title:'첫 번째',body_ko:'소개'}, {title:'두 번째',body_ko:'요약'},
  {title:'세 번째',body_ko:'참여'}
 ],images:['https://example.invalid/1.jpg','https://example.invalid/2.jpg','https://example.invalid/3.jpg']};
let renderer;
await act(async()=>{renderer=TestRenderer.create(
 React.createElement(module.exports.MarketingMobilePreview,{draft:example,locale:'ko'})
);});
const getCard=()=>renderer.root.findAllByProps({className:'marketing-phone-counter'})[0].children.join('');
assert.equal(getCard(),'1 / 3');
await act(async()=>renderer.root.findByProps({'aria-label':'다음 카드'}).props.onClick());
assert.equal(getCard(),'2 / 3');
await act(async()=>renderer.root.findByProps({'aria-label':'카드 3'}).props.onClick());
assert.equal(getCard(),'3 / 3');
await act(async()=>renderer.root.findByProps({'aria-label':'안전 여백'}).props.onClick());
assert.equal(renderer.root.findAllByProps({className:'marketing-phone-safe-guide'}).length,1);
await act(async()=>renderer.unmount());
console.log('PASS marketing admin workspace: KST selectors, status aggregation, old approval and publish paths, existing DB settings, photo rights library, mobile preview paging and safety guides.');
