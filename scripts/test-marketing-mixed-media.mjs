import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const src=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const rights={exports:{}};
vm.runInNewContext(ts.transpileModule(src('src/lib/marketing-photo-rights.ts'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{module:rights,exports:rights.exports,URL});
const policy={exports:{}};
vm.runInNewContext(ts.transpileModule(src('src/lib/marketing-stock-photo-policy.ts'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{
 module:policy,exports:policy.exports,
 require:name=>name==='./marketing-photo-rights'?rights.exports:(()=>{throw Error('Unexpected module '+name)})()
});
const {configuredPhotoSourcingPolicy,savedPhotoSourcingPolicy,aiImageSlotForPolicy,
 requiredPhotoSlotsForRoles,allSelectedPhotosApproved}=policy.exports;
const settings={carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_ai_thumbnail_enabled:false};
const five=['cover','context','insight','insight','editorial_closing'];
const three=['cover','key_insight','editorial_closing'];
const approved=slots=>slots.map(slot=>({slot,review_status:'approved',storage_path:'marketing/approved/'+slot+'.jpg'}));
for(const [ai,slots] of [[0,[1,2,3]],[1,[0,2,3]],[2,[0,1,3]],[3,[0,1,2]]]){
 const p=configuredPhotoSourcingPolicy(settings,five,ai);
 assert.equal(p.ai_image_slot,ai);
 assert.equal(aiImageSlotForPolicy(p),ai);
 assert.deepEqual(Array.from(requiredPhotoSlotsForRoles(five,p)),slots);
 assert.equal(allSelectedPhotosApproved(five,approved(slots),p),true);
 assert.equal(allSelectedPhotosApproved(five,approved(slots.slice(0,2)),p),false);
 assert.equal(allSelectedPhotosApproved(five,approved([0,1,2,3].filter(v=>v!==ai).map((v,i)=>i===0?ai:v)),p),false);
 assert.equal(savedPhotoSourcingPolicy(JSON.parse(JSON.stringify(p))).ai_image_slot,ai);
}
const old=savedPhotoSourcingPolicy({version:1,slide_count:5,min_real_photos:3,
 ai_thumbnail_enabled:true,requested_ai_thumbnail:true});
assert.equal(aiImageSlotForPolicy(old),0,'legacy approved drafts retain their original AI cover');
assert.throws(()=>configuredPhotoSourcingPolicy(settings,three,0),/AI_IMAGE_SLOT_NOT_AVAILABLE/);
assert.throws(()=>configuredPhotoSourcingPolicy({...settings,carousel_min_real_photos_5:4},five,2),/AI_IMAGE_SLOT_NOT_AVAILABLE/);
assert.equal(aiImageSlotForPolicy(configuredPhotoSourcingPolicy(settings,three)),null);

const api=src('src/lib/marketing.ts');
const generation=src('src/lib/marketing-generation.ts');
const picker=src('src/components/admin-marketing.tsx');
const stock=src('src/lib/marketing-stock-photos.ts');
const ddl=src('supabase/migrations/20261011172500_marketing_explicit_mixed_media_assignments.sql');
assert.match(api,/path\[2\]==='assign-stock'/);
assert.match(api,/path\[2\]==='image-layout'/);
assert.match(api,/confirm_replace/);
assert.match(api,/createSignedUrls/);
assert.match(api,/status'\)==='approved'/);
assert.match(generation,/generateAiCard\(db,draft,job,aiSlot\)/);
assert.match(generation,/ai_image_slot:selectedAiSlot/);
assert.match(generation,/photoReviewRequired=true/);
assert.doesNotMatch(generation.split('}else if(stockVisuals){')[1]?.split('const coverStillPending=')[0]||'',/generateVisualSet\(/);
assert.match(picker,/marketing-approved-picker/);
assert.match(picker,/showApprovedPhotoPicker\(index\)/);
assert.match(picker,/ai_image_slot:newMediaPlan\.aiSlot/);
assert.match(stock,/const picked=new Map<number,Row>/);
assert.match(stock,/picked\.set\(Number\(asset\.slot\),asset\)/);
assert.match(ddl,/security definer set search_path=''/);
assert.match(ddl,/PHOTO_ASSET_NOT_APPROVED_FOR_REUSE/);
assert.match(ddl,/PHOTO_ALREADY_USED_IN_THIS_CAROUSEL/);
assert.match(ddl,/DRAFT_CHANGED_REFRESH_FIRST/);
assert.match(ddl,/grant execute on function public.assign_marketing_approved_photo/);
console.log('PASS explicit mixed image slots, licensed photo reuse, safe assignment, previous draft compatibility and source fallback');
