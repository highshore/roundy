import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import ts from 'typescript';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const calls=[];
const env={};
const commons=(name,lic='CC0 1.0',url='https://creativecommons.org/publicdomain/zero/1.0/')=>({
 title:'File:'+name,
 imageinfo:[{url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/seoul-photo.jpg',
  thumburl:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/seoul-photo.jpg',
  mime:'image/jpeg',width:1600,height:2000,
  extmetadata:{LicenseShortName:{value:lic},LicenseUrl:{value:url},Artist:{value:'Independent Creator'},AttributionRequired:{value:lic==='CC BY 4.0'?'true':'false'}}}]
});
const commonsItems=[
 commons('Seoul cafe CC0.jpg'),commons('Han River CC BY.jpg','CC BY 4.0','https://creativecommons.org/licenses/by/4.0/'),
 commons('Restricted.jpg','CC BY-NC 4.0','https://creativecommons.org/licenses/by-nc/4.0/')
];
async function mockFetch(value,init){
 const url=new URL(value.toString());calls.push(url.hostname+url.pathname);
 let data;
 if(url.hostname==='commons.wikimedia.org'){
  data={query:{pages:url.searchParams.get('titles')?[commonsItems[0]]:commonsItems}};
 }else if(url.hostname==='api.openverse.org'){
  data={results:[{id:'94601a62-1899-4e5c-85cd-9da9f34aed12',
   foreign_landing_url:'https://commons.wikimedia.org/wiki/File:Seoul_cafe_CC0.jpg'}]};
 }else if(url.hostname==='api.pexels.com'){
  data={photos:[{id:123,url:'https://www.pexels.com/photo/people-talking-123/',
   src:{large2x:'https://images.pexels.com/photos/123/p.jpeg',medium:'https://images.pexels.com/photos/123/p.jpeg'},
   photographer:'Pexels Creator',photographer_url:'https://www.pexels.com/@creator/',width:1000,height:1500}]};
 }else if(url.hostname==='api.unsplash.com'){
  data={results:[{id:'xyz0001',width:1000,height:1500,
   links:{html:'https://unsplash.com/photos/xyz0001',download_location:'https://api.unsplash.com/photos/xyz0001/download'},
   urls:{regular:'https://images.unsplash.com/photo-123123',small:'https://images.unsplash.com/photo-123123'},
   user:{name:'Unsplash Creator',links:{html:'https://unsplash.com/@creator'}}}]};
 }else if(url.hostname==='pixabay.com'){
  data={hits:[{id:123,user_id:5,user:'Pixabay Creator',pageURL:'https://pixabay.com/photos/coffee-123/',
   imageWidth:1100,imageHeight:1600,largeImageURL:'https://cdn.pixabay.com/photo/2026/coffee.jpg',
   webformatURL:'https://cdn.pixabay.com/photo/2026/coffee.jpg'}]};
 }else throw new Error('Unmocked network call: '+url.hostname);
 return {ok:true,status:200,json:async()=>data,headers:new Map([['content-type','application/json']])};
}
const cache=new Map();
function load(path){
 if(cache.has(path))return cache.get(path);
 const module={exports:{}};
 const context={module,exports:module.exports,Date,Buffer,URL,AbortSignal,console,
  process:{env},fetch:mockFetch,require:name=>{
   if(name==='server-only')return {};
   if(name.startsWith('./'))return load('src/lib/'+name.slice(2)+'.ts');
   return require(name);
  }};
 const js=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,context,{filename:path});cache.set(path,module.exports);return module.exports;
}
const rights=load('src/lib/marketing-photo-rights.ts');
const provider=load('src/lib/marketing-photo-providers.ts');
const policy=load('src/lib/marketing-stock-photo-policy.ts');
assert.deepEqual(Array.from(rights.PHOTO_PROVIDERS),['wikimedia','openverse','pexels','unsplash','pixabay']);
assert.equal(provider.providerConfigured('wikimedia'),true);
assert.equal(provider.providerConfigured('openverse'),true);
assert.equal(provider.providerConfigured('pexels'),false);
const pexelsSkip=await provider.searchLicensedPhotos('pexels','seoul friends','seoul_dating');
assert.equal(pexelsSkip.skipped,'API_KEY_NOT_CONFIGURED');
assert.equal(calls.length,0,'missing Pexels API key must not invoke the external API');

const wikimedia=await provider.searchLicensedPhotos('wikimedia','Seoul cafe','seoul_dating');
assert.equal(wikimedia.photos.length,2,'CC0 and CC BY accepted; noncommercial excluded');
const zero=wikimedia.photos.find(p=>p.license_name==='CC0 1.0');
const attribution=wikimedia.photos.find(p=>p.license_name==='CC BY 4.0');
assert.ok(zero&&!zero.attribution_required);
assert.ok(attribution&&attribution.attribution_required);
assert.equal(rights.photoRightsIssues(attribution).length,0);
assert.equal(rights.validLicensedPhoto({...zero,commercial_use_allowed:false}),false);
assert.equal(rights.validLicensedPhoto({...zero,modifications_allowed:false}),false);
assert.equal(rights.validLicensedPhoto({...zero,license_url:'https://creativecommons.org/licenses/by-nc/4.0/'}),false);
assert.equal(rights.validLicensedPhoto({...zero,source_url:'https://news-site.example/image.jpg'}),false);
assert.equal(rights.validLicensedPhoto({...zero,provider:'google'}),false);
assert.equal(rights.validLicensedPhoto({...attribution,attribution_required:false}),false);
assert.equal(rights.normalizeOpenLicense('CC BY-ND 4.0','https://creativecommons.org/licenses/by-nd/4.0/'),null);

const openverse=await provider.searchLicensedPhotos('openverse','Seoul cafe','seoul_dating');
assert.equal(openverse.photos.length,1,'Openverse result is verified again at Commons source');
assert.equal(openverse.photos[0].license_name,'CC0 1.0');

env.PEXELS_API_KEY='mock-api-key';env.UNSPLASH_ACCESS_KEY='mock-api-key';env.PIXABAY_API_KEY='mock-api-key';
for(const name of ['pexels','unsplash','pixabay']){
 const answer=await provider.searchLicensedPhotos(name,'Seoul friends','seoul_dating');
 assert.equal(answer.photos.length,1,'expected one licensed '+name+' image');
 assert.equal(rights.photoRightsIssues(answer.photos[0]).length,0,name);
}
const caption=policy.photoCreditCaption('Roundy story', [zero,attribution]);
assert.ok(rights.captionHasRequiredCredits(caption,[zero,attribution]));
assert.ok(caption.includes(zero.source_url),'Even CC0 sources must show the original URL');
assert.ok(caption.includes(attribution.source_url),'CC BY photo source URL in caption');
assert.ok(caption.includes('Wikimedia Commons / Independent Creator'));
assert.equal(rights.captionHasRequiredCredits(caption.replace(zero.source_url,''),[zero,attribution]),false,'Missing CC0 credit must block publishing');
assert.equal(rights.captionHasRequiredCredits(caption.replaceAll('Wikimedia Commons',''),[zero,attribution]),false,'Missing provider must block publishing');
assert.match(rights.photoCardSourceLabel(zero),/^Photo: Wikimedia Commons \/ Independent Creator/);
assert.ok(rights.photoCardSourceLabel({...zero,photographer:'가'.repeat(150)}).length<100,'Long Korean creator must be clipped to fit');
assert.equal(policy.photoCreditCaption(caption,[zero,attribution]),caption,'Caption credits are idempotent');
assert.equal(rights.captionHasRequiredCredits('Roundy story',[attribution]),false);
assert.equal(rights.captionHasRequiredCredits(caption.replace('(cropped and text overlaid)',''),[attribution]),false);
assert.equal(policy.photoCreditCaption('Hello',['Alice','Bob']),'Hello\n\nPhotos: Alice, Bob / Pexels');
const list=read('src/lib/marketing-stock-photos.ts');
assert.match(list,/MAX_PROVIDER_ATTEMPTS=10/);
assert.match(list,/ATTEMPTS_PER_PROVIDER=2/);
assert.match(list,/logProviderAttempt/);
assert.match(list,/usedRecently\(db,draft.id\)/);
assert.match(list,/photoSearchQuery\(draft,topic,slot,attempt\)/);
assert.match(list,/reviewStockAsset/);
assert.match(list,/trackUnsplashDownload\(asset\)/);
const sql=read('supabase/migrations/20261010195000_marketing_multi_provider_photo_rights.sql');
assert.match(sql,/update public.marketing_photo_assets/);
assert.match(sql,/create table if not exists public.marketing_photo_source_attempts/);
assert.match(sql,/marketing_photo_rights_valid/);
assert.match(sql,/guard_marketing_preflight_transition/);
assert.match(sql,/if d.visual_source not in \('pexels','stock'\)/);
const worker=read('supabase/functions/roundy-marketing/index.ts');
assert.match(worker,/STOCK_REQUIRED_ATTRIBUTION_MISSING/);
assert.match(worker,/await validateReviewedStockDraft\(t\)/);
assert.match(read('src/lib/marketing.ts'),/path\[1\]==='attempts'/);
console.log('PASS multi-source photos: keyless Wikimedia/Openverse, optional provider mocks, CC0 and CC BY attribution, license rejection, admin gate, bounded fallback and unchanged mock Instagram worker.');
