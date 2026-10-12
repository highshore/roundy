from pathlib import Path
import json

def replace(path, old, new):
    p=Path(path); text=p.read_text()
    assert text.count(old)==1, (path, 'Expected one exact patch target', text.count(old))
    p.write_text(text.replace(old,new))

replace('src/lib/marketing.ts',
 "   let imported:Row=savedCopy||checked(await service.rpc('create_marketing_candidate_from_generation',{p_job_id:path[2]}));",
 "   // The workspace helper already restores photos for review-only copy and\n   // returns existing imported drafts unchanged. Do not import them twice or\n   // overwrite subsequent admin edits with the original generation snapshot.\n   if(savedCopy)return json({draft:savedCopy});\n   let imported:Row=checked(await service.rpc('create_marketing_candidate_from_generation',{p_job_id:path[2]}));")

replace('src/lib/marketing-generation.ts',
 '    saved_at:new Date().toISOString(),editorial_review_required:true};',
 '    saved_at:new Date().toISOString(),editorial_review_required:true,\n    // Copy review happens before photo discovery. An empty selection is valid,\n    // not a missing asset error; photos still require separate review/rendering.\n    stock_photo_selections:[],photos_pending_review:!!policy,\n    real_photos_required:policy?.min_real_photos||null,\n    real_photos_selected:0,real_photos_approved:0,\n    photo_review_reason:policy?\'EDITORIAL_REVIEW_BEFORE_PHOTO_SOURCING\':null};')

p=Path('scripts/test-marketing-generation.mjs')
addition='''
// A rejected copy is saved before stock discovery; the result contract must
// expose an empty photo selection, never borrow photographs from the old draft.
for(const language of ['ko','en'])for(const source of ['stock','none']){
 const h=harness({answerFirst:true,criticOutcome:'reject',
  templateSettings:{carousel_mode:'fixed',carousel_default_slides:5,carousel_brand_outro_enabled:true},
  photoSettings:{carousel_min_real_photos_5:3,carousel_min_real_photos_3:2,carousel_ai_thumbnail_enabled:true}});
 const original=JSON.stringify(h.tables.instagram_post_drafts[0]);
 const result=await h.api.runGeneration(id,{...base,request_key:'manual:pre-photo-review-'+language+'-'+source,
  mode:source==='stock'?'both':'text',content_mode:'growth_carousel',topic_type:'conversation_prompt',
  visual_source:source,language},null);
 assert.equal(result.job.stage,'editorial_review_required',JSON.stringify(result));
 const saved=result.job.result_snapshot;
 assert.equal(saved.editorial_review_required,true);
 assert.ok(Array.isArray(saved.stock_photo_selections));
 assert.equal(saved.stock_photo_selections.length,0);
 assert.equal(saved.images.length,0);
 assert.equal(saved.photos_pending_review,source==='stock');
 assert.equal(saved.real_photos_required,source==='stock'?4:null);
 assert.equal(saved.real_photos_selected,0);assert.equal(saved.real_photos_approved,0);
 assert.equal(saved.photo_review_reason,source==='stock'?'EDITORIAL_REVIEW_BEFORE_PHOTO_SOURCING':null);
 assert.equal(h.requests.filter(x=>x.url.endsWith('images/generations')).length,0);
 assert.equal(JSON.stringify(h.tables.instagram_post_drafts[0]),original);
}
console.log('PASS 4 KO/EN pre-photo editorial-review snapshot scenarios; no real AI or photo requests.');
'''
assert 'pre-photo-review-' not in p.read_text()
p.write_text(p.read_text()+addition)
p=Path('package.json');data=json.loads(p.read_text())
data['scripts']['test:marketing-copy-import']='node scripts/test-marketing-copy-import.mjs'
data['scripts']['test']+=' && npm run test:marketing-copy-import'
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('Applied bounded import and review-snapshot repair; no production data changes.')
