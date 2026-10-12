import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const tools=process.env.ROUNDY_QA_TOOLS||repo;
const require=createRequire(path.join(tools,'package.json'));
const {build}=await import(require.resolve('esbuild'));
const playwright=await import(require.resolve('playwright'));
const pw=playwright.chromium||playwright.default.chromium;
const output=path.join(repo,'quality-artifacts/unified-editor');fs.mkdirSync(output,{recursive:true});
await build({entryPoints:[path.join(repo,'scripts/qa-marketing-editor/fixture.tsx')],bundle:true,outfile:path.join(output,'entry.js'),format:'iife',platform:'browser',jsx:'automatic',tsconfig:path.join(repo,'tsconfig.json'),nodePaths:[path.join(repo,'node_modules')],define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'qa-boundaries',setup(b){b.onResolve({filter:/^(next\/navigation|next\/link|next\/image|@\/lib\/uploads|server-only)$/},a=>({path:a.path,namespace:'qa-stub'}));b.onLoad({filter:/.*/,namespace:'qa-stub'},a=>({contents:a.path==='@/lib/uploads'?'export function uploadFile(){throw Error("No live uploads in QA")}; export const uploadMarketingFile=uploadFile;':a.path==='server-only'?'export {};':a.path==='next/navigation'?'export const useRouter=()=>({push(){},refresh(){}}); export const usePathname=()=>"/admin/marketing"; export const useSearchParams=()=>new URLSearchParams();':'import React from "react";export default function Link(p){return React.createElement("a",p,p.children)};',resolveDir:repo}));}}]});

fs.copyFileSync(path.join(repo,'src/app/globals.css'),path.join(output,'globals.css'));
fs.writeFileSync(path.join(output,'index.html'),"<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><link rel=\"stylesheet\" href=\"/globals.css\"><link rel=\"stylesheet\" href=\"/entry.css\"><style>body{margin:0;background:#faf9f5;font-family:\"Noto Sans KR\",Arial,sans-serif}.admin-main{max-width:1120px;margin:0 auto;padding:24px}.admin-panel{padding:24px;background:white}*{box-sizing:border-box}@media(max-width:700px){.admin-main{padding:12px}.admin-panel{padding:12px}}</style></head><body><div id=\"root\"></div><script src=\"/entry.js\"></script></body></html>\n");
const server=http.createServer((req,res)=>{
 const file=path.join(output,new URL(req.url,'http://localhost').pathname==='/'?'index.html':path.basename(new URL(req.url,'http://localhost').pathname));
 if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let opts={headless:true,args:['--no-sandbox']};
if(process.env.ROUNDY_QA_SERVERLESS==='1'){
 const {default:chromium}=await import(require.resolve('@sparticuz/chromium'));
 opts={...opts,executablePath:await chromium.executablePath(),args:chromium.args};
}
const browser=await pw.launch(opts);
const font=process.env.ROUNDY_QA_FONT?fs.readFileSync(process.env.ROUNDY_QA_FONT).toString('base64'):null;
let checks=0;
try{
for(const lang of ['ko','en'])for(const width of [360,390,768,1440]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/?lang='+lang);if(font){await page.addStyleTag({content:'@font-face{font-family:QA-Noto;src:url(data:font/ttf;base64,'+font+')}body{font-family:QA-Noto,Arial,sans-serif!important}'});await page.evaluate(()=>document.fonts.ready);}await page.waitForSelector('#roundy-editorial-studio');await page.waitForTimeout(250);
 const t=(ko,en)=>lang==='ko'?ko:en;
 const check=(label,fn)=>{fn();checks++;console.log('PASS '+lang+' '+width+' '+label)};
 const studio=page.locator('#roundy-editorial-studio');
 check('one full-card preview',()=>{});assert.equal(await page.locator('.roundy-editorial-card-media img:visible').count(),1);
 assert.equal(await page.locator('.marketing-version-studio').count(),0);checks++;
 const publish=page.getByRole('button',{name:t('바로 게시','Publish now'),exact:true});
 assert.equal(await publish.isEnabled(),true,'fresh passed checks supersede stale persisted rejection');checks++;
 const layout=await page.evaluate(()=>{const e=document.querySelector('.marketing-layout-unified');return {columns:getComputedStyle(e).gridTemplateColumns,outer:e.getBoundingClientRect().width,editor:document.querySelector('.marketing-editor').getBoundingClientRect().width}});
 check('one full-width editor column',()=>{assert.equal(layout.columns.split(' ').length,1);assert.ok(layout.editor>=layout.outer-2);});
 const overflow=await page.evaluate(()=>({body:document.documentElement.scrollWidth,width:innerWidth}));
 check('no horizontal overflow',()=>assert.ok(overflow.body<=overflow.width+1,JSON.stringify(overflow)));
 await studio.locator('.roundy-editorial-card-navigation button').nth(2).click();
 await studio.locator('article:visible').getByRole('button',{name:t('텍스트 수정','Edit text'),exact:true}).click();
 const form=studio.locator('article:visible .roundy-editorial-manual');
 assert.equal(await form.locator('details').getAttribute('open'),null);checks++;
 const titleInput=form.locator('input').first();await titleInput.fill(t('이 카드의 제목만 수정','Change only this card title'));
 assert.equal(await titleInput.isEditable(),true);assert.equal(await publish.isDisabled(),true);checks+=2;
 page.once('dialog',d=>d.dismiss());await studio.locator('.roundy-editorial-card-navigation button').nth(3).click();
 assert.equal(await studio.locator('.roundy-editorial-card-navigation button[aria-pressed=true]').innerText(),'03');checks++;
 if(width===390||width===1440)await studio.screenshot({path:output+'/editor-text-'+lang+'-'+width+'.png'});
 await page.evaluate(()=>{window.delaySave=true;window.apiCalls=[];});
 const save=form.getByRole('button',{name:t('이 카드 저장','Save this card'),exact:true});
 await save.click();
 await page.waitForTimeout(100);assert.equal(await publish.isDisabled(),true);checks++;
 await page.waitForTimeout(850);
 const saved=await page.evaluate(()=>window.apiCalls.filter(c=>c.route.endsWith('/versions/manual')));
 check('one manual request for selected card',()=>{assert.equal(saved.length,1);assert.equal(saved[0].body.index,2);assert.equal(saved[0].body.revision,7);});
 assert.equal(await studio.locator('.roundy-editorial-card-navigation button[aria-pressed=true]').innerText(),'03');checks++;
 assert.equal(await publish.isEnabled(),true);checks++;
 await studio.locator('article:visible').getByRole('button',{name:t('이미지 변경','Change image'),exact:true}).click();
 assert.equal(await studio.locator('article:visible [data-photo-slot="2"]').count(),1);checks++;
 await studio.locator('article:visible').getByRole('button',{name:t('AI 재작성','AI rewrite'),exact:true}).click();
 const ai=studio.locator('.marketing-inline-rewrite');await ai.locator('textarea').fill(t('짧은 대화 예시로 바꿔줘.','Use one brief dialogue instead.'));
 await page.evaluate(()=>{window.apiCalls=[];});
 page.once('dialog',d=>d.accept());await ai.getByRole('button',{name:t('이 카드 재작성','Rewrite this card'),exact:true}).click();await page.waitForTimeout(350);
 const aiCalls=await page.evaluate(()=>window.apiCalls.filter(c=>c.route.endsWith('/versions')&&c.method==='POST'));
 check('one scoped AI request',()=>{assert.equal(aiCalls.length,1);assert.equal(aiCalls[0].body.mode,'text');assert.deepEqual(aiCalls[0].body.slide_indices,[2]);});
 assert.equal(await page.evaluate(()=>window.apiCalls.filter(c=>/publish|approve|draft\/generate/.test(c.route)).length),0);checks++;
 await studio.locator('.roundy-editorial-card-navigation button').last().click();assert.equal(await studio.locator('article:visible button').count(),0);checks++;
 await studio.locator('.roundy-editorial-card-navigation button').first().click();
 if(width===390||width===1440)await studio.screenshot({path:output+'/editor-preview-'+lang+'-'+width+'.png'});
 await page.evaluate(()=>{window.blockChecks=true});await page.getByRole('button',{name:t('검사 새로고침','Refresh checks'),exact:true}).click();await page.waitForTimeout(250);assert.equal(await publish.isDisabled(),true);checks++;
 await page.evaluate(()=>{window.blockChecks=false;window.staleChecks=true});await page.getByRole('button',{name:t('검사 새로고침','Refresh checks'),exact:true}).click();await page.waitForTimeout(250);assert.equal(await publish.isDisabled(),true);checks++;
 check('no client runtime errors',()=>assert.deepEqual(errors,[]));

}
console.log('PASS '+checks+' Chromium assertions. Actual parent and editor components, synthetic data and mocked HTTP; no live paid generation or Instagram publication.');
}finally{await browser.close();server.close();}
