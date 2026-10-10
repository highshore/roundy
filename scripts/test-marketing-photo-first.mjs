import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const module={exports:{}};
const js=ts.transpileModule(source('src/lib/marketing-stock-photo-policy.ts'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
vm.runInNewContext(js,{module,exports:module.exports});
const {configuredPhotoSourcingPolicy,savedPhotoSourcingPolicy,
 requiredPhotoSlotsForRoles,allSelectedPhotosApproved}=module.exports;
const roles5=['cover','scenario','detail','practice','cta'],roles3=['cover','context','cta'];
const settings={
 carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_ai_thumbnail_enabled:false
};
const five=configuredPhotoSourcingPolicy(settings,roles5);
assert.equal(five.slide_count,5);
assert.equal(five.min_real_photos,3);
assert.equal(five.ai_thumbnail_enabled,false);
assert.deepEqual(Array.from(requiredPhotoSlotsForRoles(roles5,five)),[0,1,2]);
const withAi=configuredPhotoSourcingPolicy({...settings,carousel_ai_thumbnail_enabled:true},roles5);
assert.equal(withAi.ai_thumbnail_enabled,true);
assert.deepEqual(Array.from(requiredPhotoSlotsForRoles(roles5,withAi)),[1,2,3],
 'AI cover is index 0 and the other three photographic slots use authentic photos');
const three=configuredPhotoSourcingPolicy({...settings,carousel_ai_thumbnail_enabled:true},roles3);
assert.equal(three.min_real_photos,2);
assert.equal(three.ai_thumbnail_enabled,false,'3-slide CTA leaves insufficient non-cover positions for AI cover');
assert.deepEqual(Array.from(requiredPhotoSlotsForRoles(roles3,three)),[0,1]);
const approved=(slots)=>slots.map(slot=>({slot,review_status:'approved',storage_path:'stock/pexels/'+slot+'.jpg'}));
assert.equal(allSelectedPhotosApproved(roles5,approved([1,2,3]),withAi),true);
assert.equal(allSelectedPhotosApproved(roles5,approved([0,1,2]),withAi),false);
assert.equal(allSelectedPhotosApproved(roles5,approved([1,2]),withAi),false);
assert.equal(allSelectedPhotosApproved(roles5,[...approved([1,2]),{slot:3,review_status:'pending',storage_path:null}],withAi),false);
assert.equal(allSelectedPhotosApproved(roles3,approved([0,1]),three),true);
assert.equal(allSelectedPhotosApproved(roles3,approved([0]),three),false);
assert.equal(configuredPhotoSourcingPolicy({},roles5),null,'historical drafts with no settings keep their existing photo slots');
assert.equal(configuredPhotoSourcingPolicy(settings,['cover','context','detail','cta']),null,'older 4-card profiles remain unchanged');
assert.equal(savedPhotoSourcingPolicy(JSON.parse(JSON.stringify(withAi)))?.min_real_photos,3);
assert.equal(savedPhotoSourcingPolicy({version:1,slide_count:5,min_real_photos:10,ai_thumbnail_enabled:false,requested_ai_thumbnail:false}),null);
assert.equal(savedPhotoSourcingPolicy(null),null);
const strict={...settings,carousel_min_real_photos_5:4,carousel_ai_thumbnail_enabled:true};
const strictPolicy=configuredPhotoSourcingPolicy(strict,roles5);
assert.equal(strictPolicy.ai_thumbnail_enabled,false,'higher photo minimum disables AI cover');
assert.equal(allSelectedPhotosApproved(roles5,approved(requiredPhotoSlotsForRoles(roles5,strictPolicy)),strictPolicy),false,
 'existing publisher photo-count guard must not be bypassed by an impossible higher setting');

// Existing source table owns licensing evidence. No new asset DB schema or renderer changes.
const stock=source('src/lib/marketing-stock-photos.ts');
assert.match(stock,/license_url:PEXELS_LICENSE_URL/);
assert.match(stock,/source_url:source/);
assert.match(stock,/review_status:'approved'/);
assert.match(stock,/license_checked_at:new Date/);
assert.match(stock,/content_sha256:digest/);
assert.match(stock,/perceptual_hash:hash/);
assert.match(stock,/PHOTO_COOLDOWN_DAYS=90/);
assert.match(stock,/usedRecently\(db,draft\.id\)/);
assert.match(stock,/if\(!rows\.length\)return/,'zero-photo pending results must remain importable for admin sourcing');
assert.match(stock,/if\(picked\.length<slots\.length&&pexelsConfigured\(\)\)/);
assert.match(stock,/return \{photo:cardPhotos\[0\]\|\|null,photos:\[\],cardPhotos,reusePhotos:false\}/);
const generation=source('src/lib/marketing-generation.ts');
assert.match(generation,/configuredPhotoSourcingPolicy/);
assert.match(generation,/visualSource:VisualSource=managedPhotoSourcing\?'pexels':originallyRequested/);
assert.match(generation,/generateAiThumbnail\(db,draft,job\)/);
assert.match(generation,/photoReviewRequired=true/);
assert.match(generation,/photos_pending_review:photoReviewRequired/);
const visual=source('src/lib/marketing-visuals.ts');
assert.match(visual,/assets\.cardPhotos\?\.\[index\]/);
assert.match(visual,/function selectedPhoto\(/);
console.log('PASS Pexels-first photo sourcing: 5/3 min counts, single optional AI cover, source metadata, 90-day reuse, human review, fail-closed settings and existing renderer.');
