import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=fs.readFileSync(path.join(root,'src/lib/marketing-stock-photo-policy.ts'),'utf8');
const transpiled=ts.transpileModule(file,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function('exports','require','module',transpiled)(mod.exports,require,mod);
const {requiredPhotoSlotsForRoles,allSelectedPhotosApproved,photoCreditCaption}=mod.exports;

assert.deepEqual(requiredPhotoSlotsForRoles(['cover','content','cta']),[1]);
assert.deepEqual(requiredPhotoSlotsForRoles(['cover','content','content','cta']),[1,2]);
assert.deepEqual(requiredPhotoSlotsForRoles(['cover','context','detail','value','cta']),[1,2,3]);
assert.deepEqual(requiredPhotoSlotsForRoles(['cover','fact','content','content','content','cta']),[1,2,3]);
assert.throws(()=>requiredPhotoSlotsForRoles(['cover','cta']),/VALID_CAROUSEL/);
assert.throws(()=>requiredPhotoSlotsForRoles(['cta']),/VALID_CAROUSEL/);

const roles=['cover','context','detail','value','cta'];
const valid=[1,2,3].map(slot=>({slot,review_status:'approved',storage_path:'stock/pexels/'+slot+'.jpg'}));
assert.equal(allSelectedPhotosApproved(roles,valid),true);
assert.equal(allSelectedPhotosApproved(roles,valid.slice(0,2)),false);
assert.equal(allSelectedPhotosApproved(roles,[...valid,{slot:4,review_status:'approved',storage_path:'x'}]),false);
assert.equal(allSelectedPhotosApproved(roles,valid.map((photo,index)=>index===1?{...photo,review_status:'pending'}:photo)),false);
assert.equal(allSelectedPhotosApproved(roles,valid.map((photo,index)=>index===1?{...photo,review_status:'rejected'}:photo)),false);
assert.equal(allSelectedPhotosApproved(roles,valid.map((photo,index)=>index===1?{...photo,storage_path:null}:photo)),false);
assert.equal(allSelectedPhotosApproved(roles,[valid[1],valid[0],valid[2]]),false);
assert.equal(allSelectedPhotosApproved(['cover','context','cta'],[valid[0]]),true);

const credit=photoCreditCaption('Hello',['Alice','Bob','Alice']);
assert.equal(credit,'Hello\n\nPhotos: Alice, Bob / Pexels');
assert.equal(photoCreditCaption(credit,['Bob','Alice']), 'Hello\n\nPhotos: Bob, Alice / Pexels');
assert.throws(()=>photoCreditCaption('Hello',[]),/PHOTOGRAPHER_REQUIRED/);
assert.throws(()=>photoCreditCaption('x'.repeat(1990),['Alice']),/CREDIT_LIMIT/);

const stock=fs.readFileSync(path.join(root,'src/lib/marketing-stock-photos.ts'),'utf8');
const generation=fs.readFileSync(path.join(root,'src/lib/marketing-generation.ts'),'utf8');
const admin=fs.readFileSync(path.join(root,'src/lib/marketing.ts'),'utf8');
const worker=fs.readFileSync(path.join(root,'supabase/functions/roundy-marketing/index.ts'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261008160000_pexels_marketing_photo_library.sql'),'utf8');
for(const guard of ['DUPLICATE_OR_NEAR_DUPLICATE_STOCK_PHOTO','ARCHIVED_STOCK_IMAGE_INVALID','STOCK_PHOTO_ARCHIVE_CHANGED']){
 assert.ok(stock.includes(guard),guard);
}
assert.ok(stock.includes("review_status:'approved'")||stock.includes("review_status:'approved'"));
assert.ok(generation.includes('photoCreditCaption(')&&generation.includes('photoReviewRequired'));
assert.ok(admin.includes("path[2]==='review'")&&admin.includes("path[2]==='render-stock'"));
assert.ok(worker.includes('await validateReviewedStockDraft(t)'));
assert.ok(migration.includes('guard_marketing_stock_photo_publication'));
console.log('PASS marketing stock photos: slot counts, approval, rejection, archive, rights and attribution');
