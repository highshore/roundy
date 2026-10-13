from pathlib import Path
import json

def put(path, text):
    p=Path(path)
    if p.exists():
        raise RuntimeError('Unexpected existing file: '+path)
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(text)

def replace(path, old, new):
    p=Path(path); text=p.read_text()
    if text.count(old)!=1:
        raise RuntimeError('Patch anchor mismatch: '+path+' '+old[:90])
    p.write_text(text.replace(old,new,1))

put('scripts/prepare-marketing-fonts.mjs', r'''import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const revision='f8d157532fbfaeda587e826d4cd5b21a49186f7c';
const root=path.join(process.cwd(),'.cache','marketing-fonts');
const files=[
 {name:'NotoSansCJKkr-Regular.otf',source:'OTF/Korean/NotoSansCJKkr-Regular.otf',sha:'dc4a7c65e6f450bf17c10a2405250b620eb78703',size:16433112},
 {name:'NotoSansCJKkr-Black.otf',source:'OTF/Korean/NotoSansCJKkr-Black.otf',sha:'b5b67bf293310a3648468a21ac829d6f2d58b2d5',size:17793656},
 {name:'LICENSE',source:'LICENSE',sha:'d952d62c065f3f35fb83a173496e90b21525aef3'}
];
const digest=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const valid=(b,f)=>digest(b)===f.sha&&(!f.size||b.length===f.size)&&(!f.name.endsWith('.otf')||b.subarray(0,4).toString()==='OTTO');
await mkdir(root,{recursive:true});
await Promise.all(files.map(async f=>{
 const dest=path.join(root,f.name);
 try{if(valid(await readFile(dest),f))return;}catch{}
 // Only build-time public static downloads retry. No runtime/provider/paid retry.
 for(let attempt=0;attempt<3;attempt++){
  const temp=dest+'.'+randomUUID()+'.tmp';
  try{
   const response=await fetch('https://raw.githubusercontent.com/notofonts/noto-cjk/'+revision+'/Sans/'+f.source,{signal:AbortSignal.timeout(45000),redirect:'error'});
   if(!response.ok)throw Error('FONT_DOWNLOAD_HTTP_'+response.status);
   const chunks=[];let size=0;
   for await(const chunk of response.body){size+=chunk.length;if(size>20*1024*1024)throw Error('FONT_DOWNLOAD_TOO_LARGE');chunks.push(chunk);}
   const bytes=Buffer.concat(chunks);
   if(!valid(bytes,f))throw Error('FONT_BUILD_INTEGRITY_FAILED: '+f.name);
   await writeFile(temp,bytes,{flag:'wx'});await rename(temp,dest);return;
  }catch(error){await rm(temp,{force:true});if(attempt===2)throw error;await new Promise(r=>setTimeout(r,500*(attempt+1)));}
 }
}));
console.log('PASS pinned marketing fonts and license verified for deployment; runtime uses local files only');
''')

Path('src/lib/marketing-render-assets.ts').write_text(r'''import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {EditorialAssets} from './marketing-visuals';

let fontPromise:Promise<NonNullable<EditorialAssets['fonts']>>|undefined;
function toArrayBuffer(bytes:Uint8Array):ArrayBuffer {const copy=new Uint8Array(bytes.length);copy.set(bytes);return copy.buffer;}
async function localFont(relative:string,signature:string):Promise<ArrayBuffer>{
 let bytes:Buffer;
 try{bytes=await readFile(path.join(process.cwd(),relative));}
 catch{throw new Error('FONT_ASSET_UNAVAILABLE');}
 if(bytes.length<100||bytes.length>20*1024*1024||bytes.subarray(0,4).toString()!==signature)
  throw new Error('FONT_ASSET_INVALID');
 return toArrayBuffer(bytes);
}
async function fonts():Promise<NonNullable<EditorialAssets['fonts']>>{
 if(!fontPromise)fontPromise=(async()=>{
  // These files are verified and bundled at build time, never fetched in a paid job.
  const [regular,black,latin,latinBold]=await Promise.all([
   localFont('.cache/marketing-fonts/NotoSansCJKkr-Regular.otf','OTTO'),
   localFont('.cache/marketing-fonts/NotoSansCJKkr-Black.otf','OTTO'),
   localFont('node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff','wOFF'),
   localFont('node_modules/@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff','wOFF')
  ]);
  return [
   {name:'Noto Sans KR',data:regular,weight:400 as const,style:'normal' as const},
   {name:'Noto Sans KR',data:black,weight:700 as const,style:'normal' as const},
   {name:'Noto Sans KR',data:black,weight:900 as const,style:'normal' as const},
   {name:'DM Sans',data:latin,weight:400 as const,style:'normal' as const},
   {name:'DM Sans',data:latinBold,weight:700 as const,style:'normal' as const},
   {name:'DM Sans',data:latinBold,weight:900 as const,style:'normal' as const}
  ];
 })().catch(error=>{fontPromise=undefined;throw error;});
 return fontPromise;
}
export async function loadEditorialAssets():Promise<EditorialAssets>{
 return {photo:null,photos:[],fonts:await fonts()};
}
''')

put('src/lib/marketing-generated-assets.ts',r'''import {createHash} from 'node:crypto';
import sharp from 'sharp';
type Row=Record<string,any>;
export type GeneratedAsset={version:1;key:string;path:string;sha256:string;bytes:number};
const hash=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
export const generatedAssetKey=(prompt:string,model:string)=>hash(JSON.stringify(['roundy-ai-card-v1',model,prompt]));
export function savedGeneratedAsset(document:Row|undefined,key:string):GeneratedAsset|null{
 const entry=document?.generated_ai_assets?.[key];if(!entry)return null;
 if(entry.version!==1||entry.key!==key||!/^[a-f0-9]{64}$/.test(key)||
  typeof entry.path!=='string'||!/^generated\/[a-f0-9-]{36}\/[a-f0-9]{64}\.jpg$/.test(entry.path)||
  !entry.path.endsWith('/'+key+'.jpg')||!/^[a-f0-9]{64}$/.test(entry.sha256)||
  !Number.isInteger(entry.bytes)||entry.bytes<100||entry.bytes>5*1024*1024)
  throw new Error('AI_ASSET_RECOVERY_REQUIRED');
 return entry;
}
export async function loadGeneratedAsset(db:any,document:Row|undefined,key:string):Promise<string|null>{
 const entry=savedGeneratedAsset(document,key);if(!entry)return null;
 const result=await db.storage.from('marketing-images').download(entry.path);
 if(result.error||!result.data)throw new Error('AI_ASSET_RECOVERY_REQUIRED');
 const bytes=Buffer.from(await result.data.arrayBuffer());
 if(bytes.length!==entry.bytes||hash(bytes)!==entry.sha256)throw new Error('AI_ASSET_RECOVERY_REQUIRED');
 return 'data:image/jpeg;base64,'+bytes.toString('base64');
}
export async function persistGeneratedAsset(db:any,jobId:string,key:string,encoded:string):Promise<{asset:GeneratedAsset;image:string}>{
 if(!/^[a-f0-9-]{36}$/i.test(jobId)||!/^[a-f0-9]{64}$/.test(key))throw new Error('AI_ASSET_KEY_INVALID');
 const raw=Buffer.from(encoded,'base64');
 if(raw.length<100||raw.length>6*1024*1024)throw new Error('INVALID_GENERATED_AI_THUMBNAIL');
 const meta=await sharp(raw).metadata();
 if(!meta.width||!meta.height||meta.width*meta.height>24_000_000)throw new Error('INVALID_GENERATED_AI_THUMBNAIL');
 const bytes=await sharp(raw).rotate().resize(1080,1350,{fit:'cover'}).jpeg({quality:90}).toBuffer();
 if(bytes.length<100||bytes.length>5*1024*1024)throw new Error('INVALID_GENERATED_AI_THUMBNAIL');
 const asset:GeneratedAsset={version:1,key,path:'generated/'+jobId+'/'+key+'.jpg',sha256:hash(bytes),bytes:bytes.length};
 const result=await db.storage.from('marketing-images').upload(asset.path,bytes,{contentType:'image/jpeg',upsert:false});
 if(result.error)throw new Error('AI_ASSET_SAVE_FAILED');
 return {asset,image:'data:image/jpeg;base64,'+bytes.toString('base64')};
}
''')

replace('src/lib/marketing-generation.ts',"import {createServiceRoleClient}","import {createServiceRoleClient}") if False else None
p=Path('src/lib/marketing-generation.ts');s=p.read_text();s="import {generatedAssetKey,loadGeneratedAsset,persistGeneratedAsset} from './marketing-generated-assets';\n"+s
old=" const result=await upstream('images/generations',{\n  model:IMAGE_MODEL,prompt,n:1,size:'1024x1280',quality:'low',"
assert s.count(old)==1
s=s.replace(old," const assetKey=generatedAssetKey(prompt,IMAGE_MODEL);\n const cached=await loadGeneratedAsset(db,draft.content_document,assetKey);\n if(cached)return cached;\n const result=await upstream('images/generations',{\n  model:IMAGE_MODEL,prompt,n:1,size:'1024x1280',quality:'low',",1)
old=" await progress(db,job,'thumbnail_ready');\n return 'data:image/jpeg;base64,'+encoded;"
assert s.count(old)==1
s=s.replace(old," const saved=await persistGeneratedAsset(db,job.id,assetKey,encoded);\n // Persist the private raw image before rendering. A render failure must not buy it again.\n Object.assign(draft,await savePartial(db,draft,{content_document:{...draft.content_document,\n  generated_ai_assets:{...draft.content_document?.generated_ai_assets,[assetKey]:saved.asset}},quality_revision:null}));\n await progress(db,job,'thumbnail_ready');\n return saved.image;",1)
# Retain already paid images through a copy retry; exact prompt hashes decide reuse.
s=s.replace("const contentDocument={...copy.content_document,...(policy?", "const contentDocument={...copy.content_document,...(draft.content_document?.generated_ai_assets?{generated_ai_assets:draft.content_document.generated_ai_assets}:{}),...(policy?",1)
s=s.replace("FONT_ASSET_[A-Z_]+|STOCK_[A-Z_]+", "FONT_ASSET_[A-Z_]+|AI_ASSET_[A-Z_]+|STOCK_[A-Z_]+",1)
p.write_text(s)

# A missing Latin font is just as invalid as a missing Korean font.
p=Path('scripts/test-marketing-backend-resilience.mjs');s=p.read_text();a=s.index('// The real font loader');b=s.index('// Test the actual selection writer.')
s=s[:a]+r'''// Real local-font loader, isolated filesystem failures and forbidden network.
{
 let reads=0,healthy=false;
 const context={exports:{},Uint8Array,ArrayBuffer,Buffer,Promise,process:{cwd:()=>'/fixture'},require:name=>{
  if(name==='node:fs/promises')return {readFile:async p=>{reads++;if(!healthy)throw Error('missing');const b=Buffer.alloc(256);b.write(p.endsWith('.otf')?'OTTO':'wOFF');return b;}};
  return require(name);
 },fetch:()=>{throw Error('Runtime font network is forbidden');}};
 vm.runInNewContext(compile('src/lib/marketing-render-assets.ts'),context);
 await assert.rejects(()=>context.exports.loadEditorialAssets(),/FONT_ASSET_UNAVAILABLE/);
 assert.equal(reads,4);healthy=true;
 const [a,b]=await Promise.all([context.exports.loadEditorialAssets(),context.exports.loadEditorialAssets()]);
 assert.equal(reads,8);assert.equal(a.fonts.length,6);assert.equal(b.fonts.length,6);
 await context.exports.loadEditorialAssets();assert.equal(reads,8);
 console.log('PASS local fonts fail closed, retry cleanly and never use runtime network');
}

'''+s[b:];p.write_text(s)

put('scripts/test-marketing-generated-assets.mjs',r'''import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),sharp=require('sharp');
const context={exports:{},Buffer,require};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/marketing-generated-assets.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);
const api=context.exports,objects=new Map();let uploads=0,corrupt=false,fail=false;
const db={storage:{from:bucket=>{assert.equal(bucket,'marketing-images');return {
 upload:async(p,b,o)=>{uploads++;assert.equal(o.upsert,false);if(fail)return {error:{message:'offline'}};objects.set(p,b);return {error:null};},
 download:async p=>({data:objects.has(p)?{arrayBuffer:async()=>corrupt?Buffer.from('corrupt'):objects.get(p)}:null,error:null})
};}}};
const key=api.generatedAssetKey('specific cover scene','test-model');
assert.notEqual(key,api.generatedAssetKey('different scene','test-model'));
assert.equal(await api.loadGeneratedAsset(db,{},key),null);
const jpeg=await sharp({create:{width:512,height:640,channels:3,background:'#ddd'}}).jpeg().toBuffer();
const saved=await api.persistGeneratedAsset(db,'11111111-1111-4111-8111-111111111111',key,jpeg.toString('base64'));
const doc={generated_ai_assets:{[key]:saved.asset}};
assert.equal(await api.loadGeneratedAsset(db,doc,key),saved.image);assert.equal(uploads,1);
assert.equal((await sharp(Buffer.from(saved.image.split(',')[1],'base64')).metadata()).width,1080);
assert.equal(await api.loadGeneratedAsset(db,doc,api.generatedAssetKey('changed title','test-model')),null);
corrupt=true;await assert.rejects(()=>api.loadGeneratedAsset(db,doc,key),/AI_ASSET_RECOVERY_REQUIRED/);corrupt=false;
await assert.rejects(()=>api.loadGeneratedAsset(db,{generated_ai_assets:{[key]:{...saved.asset,path:'../../private'}}},key),/AI_ASSET_RECOVERY_REQUIRED/);
objects.clear();await assert.rejects(()=>api.loadGeneratedAsset(db,doc,key),/AI_ASSET_RECOVERY_REQUIRED/);
fail=true;await assert.rejects(()=>api.persistGeneratedAsset(db,'11111111-1111-4111-8111-111111111111',key,jpeg.toString('base64')),/AI_ASSET_SAVE_FAILED/);
console.log('PASS private AI image durability, exact-context reuse, changed-context isolation, corrupt/missing asset and failed-save safeguards');
''')

put('scripts/test-marketing-runtime-assets.mjs',r'''import assert from 'node:assert/strict';
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
''')

p=Path('package.json');v=json.loads(p.read_text());v['scripts']['prebuild']='node scripts/prepare-marketing-fonts.mjs';v['scripts']['predev']='node scripts/prepare-marketing-fonts.mjs';v['scripts']['test']='node scripts/test-marketing-generated-assets.mjs && '+v['scripts']['test'];v['scripts']['test:marketing-runtime-assets']='node scripts/prepare-marketing-fonts.mjs && node scripts/test-marketing-runtime-assets.mjs';p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
p=Path('next.config.ts');s=p.read_text();needle="'/*':[";assert s.count(needle)==1;s=s.replace(needle,needle+"'./.cache/marketing-fonts/*',",1);p.write_text(s)
p=Path('.gitignore');s=p.read_text();p.write_text(s+'\n# Pinned build-time marketing assets; traced into server functions, not public.\n.cache/marketing-fonts/\n')
p=Path('docs/instagram-backend-resilience-audit-20261013.md');s=p.read_text();s+='\n## Final verification follow-up\n\n- Removed runtime font downloads. Build downloads a commit-pinned Noto font set and its license, validates Git blob hashes, and traces it into the application. Missing/corrupt local fonts fail closed before image work.\n- Persist the optional generated AI card in private marketing-images storage before rendering, with its exact prompt/model hash and content digest in the draft. Matching image-only completion can reuse it after render failure; missing or corrupt saved assets stop instead of silently buying replacements.\n- Added actual ImageResponse/Sharp rendering of 20 Korean/English 3/5-story-plus-brand cards using bundled fonts with runtime network forbidden, plus private image-cache fault injection.\n- No production credentials are copied into CI and no publishing approvals are bypassed. Live authenticated generation remains a separate verification boundary.\n';p.write_text(s)
print('Applied final bounded backend fixes and regression tests')
