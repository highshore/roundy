import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const growth=read('src/components/admin-marketing-growth.tsx');
const reels=read('src/components/admin-marketing-reels.tsx');
const css=read('src/app/marketing-insights.css');
const layout=read('src/app/layout.tsx');

let passed=0;
const check=(name,run)=>{run();passed++;console.log('✓ '+name);};

check('mobile stylesheet loads after global styles',()=>{
 assert.ok(layout.indexOf("import './globals.css'")<layout.indexOf("import './marketing-insights.css'"));
});
check('analytics screens never use compact publishing-history log row',()=>{
 assert.doesNotMatch(growth,/marketing-log-row|marketing-log-main|marketing-log-list/);
 assert.doesNotMatch(reels,/marketing-log-row|marketing-log-main|marketing-log-list/);
});
check('growth content is structurally divided into readable sections',()=>{
 for(const name of ['marketing-insight-kpis','marketing-insight-allocation-list','marketing-insight-calendar','marketing-insight-topic-list'])assert.ok(growth.includes(name),name);
 assert.match(growth,/role="progressbar"/);
});
check('mobile metric and topic grids cannot overflow',()=>{
 assert.match(css,/\.marketing-insight-kpis\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.marketing-insight-topic-list\{grid-template-columns:minmax\(0,1fr\)\}/);
 assert.match(css,/\.marketing-insight-calendar-item\{grid-template-columns:48px minmax\(0,1fr\)/);
 assert.match(css,/\.marketing-insight-allocation-head strong\{[^}]*white-space:normal/);
 assert.match(css,/\.marketing-insight-calendar-body>strong\{[^}]*white-space:normal/);
});
check('mobile Safari file pickers use accessible labels rather than overflowing native labels',()=>{
 assert.match(reels,/className="marketing-reel-picker"/);
 assert.match(reels,/marketing-reel-picker-control/);
 assert.match(css,/\.marketing-reel-picker input\[type=file\]\{position:absolute!important/);
 assert.match(reels,/<input type="file" accept="video\/mp4,.mp4"/);
 assert.match(reels,/<input type="file" multiple accept="image\/jpeg,image\/png,image\/webp"/);
});
check('Reel controls and human approval are preserved',()=>{
 for(const token of ["'/'+selected.id+'/register'","'/'+selected.id+'/review'","'/'+selected.id+'/approve'","'/'+selected.id+'/resolve'"])assert.ok(reels.includes(token),token);
});
console.log('Passed '+passed+' mobile marketing layout assertions. No external API calls.');
