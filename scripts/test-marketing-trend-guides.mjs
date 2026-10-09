import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const cache={};
function load(file){
 if(cache[file])return cache[file];
 const context={exports:{},Buffer,URL,AbortSignal,Date,Intl,console,Set,Map,require:name=>{
  if(name==='react')return {createElement:(tag,props,...children)=>({tag,props,children})};
  if(name==='next/og')return {ImageResponse:class{constructor(tree){this.tree=tree;}}};
  if(name==='server-only')return {};
  if(name.startsWith('./marketing-'))return load('src/lib/'+name.slice(2)+'.ts');
  return require(name);
 }};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,context);
 return cache[file]=context.exports;
}
const g=load('src/lib/marketing-trend-guide.ts'),p=load('src/lib/marketing-content-policy.ts'),v=load('src/lib/marketing-visuals.ts');
let checks=0;const check=callback=>{callback();checks++};
const sourceIds=['S1','S2'];
const pack={
 version:1,origin:'curated_from_existing_source_briefs',checked_at:'2026-10-08T11:00:00+09:00',
 expires_at:'2099-10-11T00:00:00+09:00',layout:'event_guide',
 facts:[
  {kind:'when',value_ko:'10월 9일 한글날',value_en:'October 9, Hangeul Day',source_ids:['S1']},
  {kind:'where',value_ko:'뚝섬한강공원',value_en:'Ttukseom Hangang Park',source_ids:['S2']},
  {kind:'price',value_ko:'무료 관람',value_en:'Free admission',source_ids:['S1']},
  {kind:'program',value_ko:'야간 드론 라이트 쇼',value_en:'Nighttime drone light show',source_ids:['S1','S2']}
 ]
};
const trend={category:'event',source_urls:[{url:'https://seoul.example/show'},{url:'https://seoul.example/dates'}],fact_pack:pack};
check(()=>assert.equal(g.factPackReady(trend),true));
check(()=>assert.equal(g.readTrendFactPack(pack,sourceIds).facts.length,4));
check(()=>assert.equal(g.trendFactPackIssues(g.readTrendFactPack(pack,sourceIds),'event').length,0));
check(()=>assert.equal(g.trendGuideRoles('event_guide').length,5));
check(()=>assert.equal(g.trendGuideRoles('popup_guide').length,5));
check(()=>assert.equal(g.trendGuideRoles('culture_brief').length,5));
check(()=>assert.equal(g.factPackReady({...trend,fact_pack:{...pack,expires_at:'2000-01-01T00:00:00Z'}}),false));
check(()=>assert.equal(g.factPackReady({...trend,fact_pack:{...pack,facts:pack.facts.slice(0,2)}}),false));
check(()=>assert.equal(g.factPackReady({...trend,fact_pack:{...pack,facts:pack.facts.map(f=>({...f,source_ids:['S99']}))}}),false));
check(()=>assert.equal(p.contentSchema('seoul_trend','ko','event_guide').properties.slides.minItems,5));
check(()=>assert.equal(p.contentSchema('seoul_trend','en','popup_guide').properties.slides.maxItems,5));
check(()=>assert.equal(p.contentSchema('seoul_trend','ko','culture_brief').properties.slides.minItems,5));
check(()=>assert.equal(p.contentSchema('seoul_trend','ko','event_guide').properties.slides.items.properties.role.enum[1],'facts'));
const sources=[{id:'S1',url:'https://seoul.example/show',title:'회크닉 드론쇼 서울시 공식 안내',evidence:'회크닉 10월 9일 한글날 무료 관람 야간 드론 라이트 쇼'},
 {id:'S2',url:'https://seoul.example/dates',title:'회크닉 야외 공연 장소',evidence:'회크닉 뚝섬한강공원 공연 장소'}];
function guideDoc(){
 const koParts=['한글날 밤에는 어디로 갈까?','실제 행사 정보를 보고 방문 시간을 골라 보세요.','야간 드론 라이트 쇼를 함께 관람해보세요.','강변 산책 후 무료 공연을 관람하는 일정을 제안해보세요.','정확한 시작 시간은 공식 공지에서 확인해야 합니다.','서울에서 한 사람씩 만나고 대화를 이어가세요.'];
 const titles=['한강 야경 데이트','확인된 공연 정보','함께 관람할 프로그램','한글날 밤 데이트','방문 전 알아둘 점','마지막 인사'];
 const roles=Array.from(g.trendGuideRoles('event_guide'));
 return {schema_version:2,post_type:'seoul_trend',caption:'한글날 저녁 강변 데이트',cta:'Follow',
  book:{title:'',author:'',source_id:'',source_context:''},
  trend:{trend_id:'sample',trend_key:'hoe-picnic',display_name:'회크닉',category:'event',status:'rising',observed_at:'2026-10-08',summary:'한강에서 진행하는 행사',content_angle:'한글날 야경과 함께 즐기는 시간',source_ids:sourceIds},
  trend_layout:'event_guide',trend_fact_pack:pack,
  slides:roles.map((role,i)=>({role,title:titles[i],body:koParts[i],highlight:'',eyebrow:'',options:[],source_ids:i===0||i===roles.length-1?[]:sourceIds}))};
}
const doc=guideDoc();
const report=p.evaluateContent(doc,'seoul_trend','ko',sources);
check(()=>assert.equal(report.status,'passed',JSON.stringify(report.issues)));
const bad=guideDoc();bad.trend_fact_pack={...pack,facts:pack.facts.slice(0,1)};
check(()=>assert.equal(p.evaluateContent(bad,'seoul_trend','ko',sources).status,'rejected'));
const fakePack=guideDoc();fakePack.trend_fact_pack={...pack,facts:pack.facts.map(f=>({...f,source_ids:['S999']}))};
check(()=>assert.equal(p.evaluateContent(fakePack,'seoul_trend','ko',sources).status,'rejected'));
const slide=doc.slides.find(x=>x.role==='facts');
const image=v.renderCompactEditorial(slide,1,5,{...doc,content_language:'ko',slides:doc.slides});
const tree=JSON.stringify(image.tree);
check(()=>assert.ok(tree.includes('10월 9일 한글날')&&tree.includes('뚝섬한강공원')&&tree.includes('무료 관람')));
const source=fs.readFileSync('src/lib/marketing-editorial.ts','utf8');
check(()=>assert.ok(source.includes('trendPack=readTrendFactPack')&&source.includes('paid_web_search_calls:0')));
const candidates=[
 {trend_key:'unused-first',used_at:null,trend_score:94},
 {trend_key:'older-used',used_at:'2026-10-06T09:00:00+09:00',trend_score:99,published:false},
 {trend_key:'unused-second',used_at:null,trend_score:90},
 {trend_key:'newer-used',used_at:'2026-10-08T11:00:00+09:00',trend_score:85,published:true},
 {trend_key:'legacy-published',used_at:null,trend_score:70,published:true}
];
const groups=g.groupTrendsByUsage(candidates);
check(()=>assert.deepEqual(Array.from(groups.unused,x=>x.trend_key),['unused-first','unused-second'],'unused candidates retain score ranking'));
check(()=>assert.deepEqual(Array.from(groups.used,x=>x.trend_key),['newer-used','older-used','legacy-published'],'used archive sorts newest first and includes legacy published posts'));
check(()=>assert.equal(groups.used.length+groups.unused.length,candidates.length,'no trend is lost or duplicated'));
check(()=>assert.equal(candidates[1].trend_key,'older-used','grouping does not mutate the original list'));
check(()=>assert.equal(g.groupTrendsByUsage([]).used.length,0));
const marketingUi=fs.readFileSync('src/components/admin-marketing.tsx','utf8');
check(()=>assert.ok(marketingUi.includes("groupTrendsByUsage((data.trend?.trends||[])")&&marketingUi.includes("setTrendUsageView('used')"),'admin exposes a separate used trends section'));
check(()=>assert.ok(marketingUi.includes("publication_known")&&marketingUi.includes("Last used"),'used archive distinguishes published content and shows generation time'));
const radarSource=fs.readFileSync('src/lib/marketing-trend-radar.ts','utf8');
check(()=>assert.ok(radarSource.includes("publishedByKey")&&radarSource.includes("limit(100)")&&radarSource.includes(".eq('status','published')"),'read-only status lookup supports legacy drafts and full archive'));

console.log('PASS '+checks+' source-backed Trend Guide assertions; no paid providers called.');
