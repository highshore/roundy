import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const read=(path)=>fs.readFileSync(path,'utf8');
const exports={};
const context={module:{exports},exports,console,URL,Set,Array};
const code=ts.transpileModule(read('src/lib/marketing-regeneration-contract.ts'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
vm.runInNewContext(code,context,{filename:'marketing-regeneration-contract.js'});
const {parseRegenerationRequest,targetedSlideIndices,applySelectiveRewrite,
 estimatedUsd,unapprovedQuality,immutableContentSnapshot}=context.module.exports;
const req=(mode,scope,slides=[])=>parseRegenerationRequest({
 request_key:'rework:unit-test-0001',revision:12,mode,scope,slide_indices:slides,
 instruction:'서울의 실제 카페를 다뤄줘',confirm_cost:true
},5);
const slides=Array.from({length:5},(_,i)=>({
 role:i===0?'cover':i===4?'editorial_closing':'insight',
 title:'Headline '+i,body:'Body '+i,body_ko:'KO body '+i,body_en:'EN body '+i,photo_credit:'License '+i
}));
const frozen=JSON.stringify(slides),caption='Saved caption and real source credits';
assert.equal(req('render','all').mode,'render');
assert.equal(JSON.stringify(targetedSlideIndices(req('text','slides',[1,3]),5)),JSON.stringify([1,3]));
assert.equal(JSON.stringify(targetedSlideIndices(req('text','body'),5)),JSON.stringify([1,2,3,4]));
assert.equal(JSON.stringify(targetedSlideIndices(req('text','cover_title'),5)),JSON.stringify([0]));
assert.equal(JSON.stringify(targetedSlideIndices(req('text','caption'),5)),JSON.stringify([]));
assert.equal(estimatedUsd('text','all'),.02);
assert.equal(estimatedUsd('image','slides',false),0);
assert.equal(estimatedUsd('image','slides',true),.15);
assert.equal(estimatedUsd('both','all',true),.20);
assert.equal(estimatedUsd('render','all'),0);
const selective=applySelectiveRewrite(slides,caption,req('text','slides',[2]),{
 slides:[{index:2,title:'Verified Seoul insight',body:'One new factual detail.'}]
},'ko');
assert.equal(selective.slides[2].title,'Verified Seoul insight');
assert.equal(selective.slides[2].body_ko,'One new factual detail.');
assert.equal(selective.slides[2].body_en,'EN body 2','English secondary copy not silently changed');
assert.equal(selective.slides[1].title,'Headline 1','Unselected slide unchanged');
assert.equal(selective.slides[3].body,'Body 3','Unselected body unchanged');
assert.equal(selective.caption,caption);
assert.equal(JSON.stringify(slides),frozen,'Source array not mutated');
const cover=applySelectiveRewrite(slides,caption,req('text','cover_title'),{
 slides:[{index:0,title:'Shorter clear cover'}]
},'ko');
assert.equal(cover.slides[0].title,'Shorter clear cover');
assert.equal(cover.slides[0].body,'Body 0');
assert.equal(cover.slides[1].title,'Headline 1');
const body=applySelectiveRewrite(slides,caption,req('text','body'),{
 slides:[1,2,3,4].map(index=>({index,body:'New body '+index}))
},'en');
assert.equal(body.slides[2].body_en,'New body 2');
assert.equal(body.slides[2].body_ko,'KO body 2');
assert.equal(body.slides[0].body_en,'EN body 0');
const captionResult=applySelectiveRewrite(slides,caption,req('text','caption'),{
 slides:[],caption:'A verified concise Instagram caption.'
});
assert.equal(captionResult.caption,'A verified concise Instagram caption.');
assert.equal(JSON.stringify(captionResult.slides),frozen);
const unchangedImage=applySelectiveRewrite(slides,caption,req('image','slides',[2]),{slides:[]});
assert.equal(JSON.stringify(unchangedImage.slides),frozen);
assert.equal(unchangedImage.caption,caption);
assert.throws(()=>applySelectiveRewrite(slides,caption,req('text','slides',[1]),{
 slides:[{index:4,title:'Attempted mutation',body:'Disallowed'}]
}),/UNSELECTED_SLIDE_CHANGED/);
assert.throws(()=>parseRegenerationRequest({request_key:'rework:unit-test-001',revision:1,
 mode:'image',scope:'caption',slide_indices:[],instruction:'',confirm_cost:true},5),/INCOMPATIBLE/);
assert.throws(()=>parseRegenerationRequest({request_key:'rework:unit-test-001',revision:1,
 mode:'both',scope:'slides',slide_indices:[],instruction:'',confirm_cost:true},5),/SELECT_SLIDES_FIRST/);
assert.throws(()=>parseRegenerationRequest({request_key:'rework:unit-test-001',revision:1,
 mode:'text',scope:'all',slide_indices:[],instruction:'',confirm_cost:false},5),/COST_CONFIRMATION/);
assert.throws(()=>parseRegenerationRequest({request_key:'rework:unit-test-001',revision:1,
 mode:'text',scope:'slides',slide_indices:[6],instruction:'',confirm_cost:true},5),/INVALID_REGENERATION_SLIDE/);
assert.equal(unapprovedQuality().status,'rejected','Regeneration must not inherit approval');
const original={id:'original-id',revision:4,status:'published',carousel_slides:slides,
 images:['a','b','c','d','e'],caption,content_document:{slides}};
const snapshot=immutableContentSnapshot(original,[{asset_id:'approved-id',review_status:'approved',slot:1}]);
assert.equal(snapshot.status,'published');
assert.equal(snapshot.stock_photo_selections.length,1);
assert.equal(snapshot.images.length,5);
const server=read('src/lib/marketing-regeneration.ts');
const route=read('src/lib/marketing.ts');
const ui=read('src/components/admin-marketing-regeneration.tsx');
const style=read('src/components/admin-marketing-regeneration.css');
const sql=read('supabase/migrations/20261011155000_instagram_versioned_regeneration.sql');
assert.match(server,/approved_at:null,approved_by:null/);
assert.match(server,/marketing_run_id:null/);
assert.match(server,/scheduled_for:null,published_at:null/);
assert.match(server,/draft_role:'candidate'/);
assert.match(server,/reserve_marketing_generation/);
assert.match(server,/stockReady\(draft,photos\)/);
assert.match(server,/reviewMarketingDraft/);
assert.match(server,/validLicensedPhoto/);
assert.match(server,/photoCreditCaption/);
assert.match(server,/status:'needs_approval'/);
assert.match(server,/regeneration_saved_snapshot/);
assert.match(route,/path\[2\]==='versions'/);
assert.match(route,/path\[3\]==='restore'/);
assert.match(ui,/Before \/ after/);
assert.match(ui,/confirm_cost:true/);
assert.match(ui,/mode==='image'/);
assert.match(ui,/onCreated\(result\.draft\)/);
assert.match(style,/@media\(max-width:680px\)/);
assert.match(style,/@media\(max-width:390px\)/);
assert.match(sql,/regeneration_root_id/);
assert.match(sql,/regeneration_request_key/);
assert.doesNotMatch(sql,/(?:delete from public.instagram_post_drafts|update public.instagram_post_drafts|truncate table)/i);
console.log('PASS versioned regeneration: 5-slide selective text/image/render, caption/cover/body, untouched origin, licensing, cost, approval reset, compare/restore, responsive UI, additive migration.');
