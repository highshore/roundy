import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),sharp=require('sharp'),cache={};
function load(file){
 if(cache[file])return cache[file];const context={exports:{},Buffer,URL,Intl,Date,Uint8Array,ArrayBuffer,process,console,setTimeout,clearTimeout,AbortSignal,
 fetch:()=>{throw Error('NETWORK_FORBIDDEN_DURING_FONT_LOAD_AND_RENDER');},require:n=>n==='server-only'?{}:n==='./supabase/service'?{createServiceRoleClient:()=>({})}:n.startsWith('./')&&fs.existsSync('src/lib/'+n.slice(2)+'.ts')?load('src/lib/'+n.slice(2)+'.ts'):require(n)};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);
 return cache[file]=context.exports;
}
const assets=await load('src/lib/marketing-render-assets.ts').loadEditorialAssets();
assert.equal(assets.fonts.length,6);
const renderer=load('src/lib/marketing-editorial.ts');let count=0;
const image=await sharp({create:{width:1080,height:1350,channels:3,background:'#decfc3'}}).jpeg().toBuffer();
assets.cardPhotos=Object.fromEntries(Array.from({length:5},(_,i)=>[i,'data:image/jpeg;base64,'+image.toString('base64')]));assets.reusePhotos=false;
for(const lang of ['ko','en'])for(const length of [3,5]){
 const doc={schema_version:2,design_preset:'roundy_magazine_editorial_v2',content_language:lang,brand_outro_version:1,
 carousel_template:{version:1,mode:'fixed',slide_count:length,title_font_size_px:72,body_font_size_px:36,reservation_number:null}};
 const cards=Array.from({length:length+1},(_,i)=>({role:i===0?'cover':i===length?'brand_outro':i===length-1?'editorial_closing':'insight',
 title:lang==='ko'?'비 오는 날, 대화가 시작되는 순간':'A rainy day and a different conversation',
 body:lang==='ko'?'같은 상황에서도 어떤 말을 고르느냐에 따라 다음 대화가 달라집니다.':'The next conversation changes when you choose a different response.'}));
 for(let i=0;i<cards.length;i++){
  const png=Buffer.from(await renderer.editorialCard(cards[i],i,cards.length,{...doc,slides:cards},assets).arrayBuffer());
  const meta=await sharp(png).metadata();assert.equal(meta.width,1080);assert.equal(meta.height,1350);assert.ok(png.length>3000);count++;
 }
}
assert.equal(count,20);
const traces=['.next/server/app/api/internal/marketing-generation/route.js.nft.json','.next/server/app/api/admin/marketing/[[...marketingPath]]/route.js.nft.json'];
for(const p of traces){if(!fs.existsSync(p))continue;const text=fs.readFileSync(p,'utf8');for(const name of ['NotoSansCJKkr-Regular.otf','NotoSansCJKkr-Black.otf','dm-sans-latin-400-normal.woff','dm-sans-latin-700-normal.woff'])assert.ok(text.includes(name),'Missing deployment font '+name+' in '+p);}
console.log('PASS 20 real Korean/English story+brand cards with bundled fonts and runtime network forbidden');
