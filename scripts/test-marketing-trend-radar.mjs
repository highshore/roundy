import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
let checks=0;const check=f=>{f();checks++;};

function harness(){
 const now=new Date().toISOString();
 const tables={
  marketing_trend_control:[{singleton:true,enabled:true,blocked_reason:null,scan_reservation_usd:.03,daily_budget_usd:.12,monthly_budget_usd:4}],
  marketing_automation_settings:[{singleton:true,trend_radar_enabled:true,trend_scan_interval_hours:168,trend_override_enabled:true,trend_override_score:80}],
  marketing_trends:[],
  marketing_trend_scans:[]
 };
 const requests=[];
 class Q{
  constructor(name){this.name=name;this.rows=tables[name]||[];this.pred=[];this.patch=null;this.n=Infinity;this.insertValue=null;}
  select(){return this;}
  eq(k,v){this.pred.push(r=>r[k]===v);return this;}
  gte(k,v){this.pred.push(r=>String(r[k]||'')>=String(v));return this;}
  in(k,v){this.pred.push(r=>v.includes(r[k]));return this;}
  not(k,op,v){if(op==='is'&&v===null)this.pred.push(r=>r[k]!=null);return this;}
  order(){return this;}
  limit(n){this.n=n;return this;}
  update(p){this.patch=p;return this;}
  insert(v){this.insertValue=v;return this;}
  single(){return this.exec(true);}
  maybeSingle(){return this.exec(true);}
  then(a,b){return this.exec(false).then(a,b);}
  exec(single=false){
   if(this.insertValue){
    const value=structuredClone(this.insertValue),row={id:value.id||'trend-'+String(this.rows.length+1),...value};
    this.rows.push(row);return Promise.resolve({data:structuredClone(single?row:[row]),error:null});
   }
   let rows=this.rows.filter(r=>this.pred.every(p=>p(r))).slice(0,this.n);
   if(this.patch)rows.forEach(r=>Object.assign(r,this.patch));
   return Promise.resolve({data:structuredClone(single?rows[0]||null:rows),error:null});
  }
 }
 const db={from:name=>new Q(name),rpc:async(name,p)=>{
  if(name!=='reserve_marketing_trend_scan')return {data:null,error:{message:'bad rpc'}};
  const old=tables.marketing_trend_scans.find(x=>x.scan_key===p.p_key);
  if(old)return {data:{accepted:false,scan:structuredClone(old)},error:null};
  const scan={id:'scan-'+String(tables.marketing_trend_scans.length+1),scan_key:p.p_key,status:'running',reserved_usd:.03,created_at:now,updated_at:now,input_tokens:0,output_tokens:0,web_search_calls:0,candidate_count:0};
  tables.marketing_trend_scans.push(scan);return {data:{accepted:true,scan:structuredClone(scan)},error:null};
 }};
 const provider={
  status:'completed',
  output:[
   {type:'web_search_call',status:'completed',action:{sources:[
    {url:'https://trends.google.com/trends/explore?geo=KR&q=%ED%9A%8C%ED%81%AC%EB%8B%89'},
    {url:'https://news.example/hoe-picnic'},
    {url:'https://news.example/weak-one'},
    {url:'https://news2.example/weak-two'},
    {url:'https://social.example/not-tiktok'}
   ]}},
   {type:'message',content:[{type:'output_text',text:JSON.stringify({candidates:[
    {display_name:'회크닉',trend_key:'hoe-picnic',aliases:['한강 회크닉'],category:'food',scope:'seoul',status:'rising',observed_at:'2026-10-06T00:00:00Z',momentum_score:95,roundy_relevance_score:96,target_relevance_score:94,seoul_relevance_score:98,visual_potential_score:92,summary:'서울에서 포장 회와 야외 피크닉을 결합해 즐기는 흐름.',content_angle:'이번 주 데이트로 즐기는 회크닉',angle_key:'hoe-picnic-date',suggested_route:'meme_remix',material_change:false,sources:[
     {url:'https://trends.google.com/trends/explore?geo=KR&q=%ED%9A%8C%ED%81%AC%EB%8B%89',title:'Search trend',signal_type:'search',why:'회크닉 검색 관심'},
     {url:'https://news.example/hoe-picnic',title:'Current report',signal_type:'news',why:'회크닉 확산 보도'}
    ]},
    {display_name:'약한 후보',trend_key:'weak-news-only',aliases:[],category:'lifestyle',scope:'korea',status:'rising',observed_at:'2026-10-06T00:00:00Z',momentum_score:90,roundy_relevance_score:90,target_relevance_score:90,seoul_relevance_score:90,visual_potential_score:90,summary:'뉴스에만 등장',content_angle:'약한 후보',angle_key:'weak',suggested_route:'seoul_trend',material_change:false,sources:[
     {url:'https://news.example/weak-one',title:'News 1',signal_type:'news',why:'one'},
     {url:'https://news2.example/weak-two',title:'News 2',signal_type:'news',why:'two'}
    ]}
   ]}),annotations:[]}]}
  ],
  usage:{input_tokens:1000,output_tokens:500}
 };
 const context={exports:{},Buffer,URL,AbortSignal,Intl,Date,console,setTimeout,clearTimeout,process:{env:{OPENAI_API_KEY:'mock-key'}},require:name=>{
  if(name==='server-only')return {};
  if(name==='./supabase/service')return {createServiceRoleClient:()=>db};
  return require(name);
 },fetch:async(url,init)=>{requests.push({url,body:JSON.parse(init.body)});return {ok:true,status:200,json:async()=>structuredClone(provider)};}};
 const source=fs.readFileSync('src/lib/marketing-trend-radar.ts','utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);
 return {radar:context.exports,tables,requests,provider,db};
}

{
 const h=harness();
 check(()=>assert.equal(h.radar.normalizeTrendKey('  회크닉 / 한강  '),'회크닉-한강'));
 check(()=>assert.equal(h.radar.computeTrendScore({momentum_score:100,roundy_relevance_score:100,target_relevance_score:100,seoul_relevance_score:100,visual_potential_score:100},100),100));
 const result=await h.radar.runTrendRadar('radar:test:001');
 check(()=>assert.equal(result.deduplicated,false));
 check(()=>assert.equal(h.requests.length,2,'one web research call and one tool-free formatter'));
 check(()=>assert.equal(h.requests[0].body.max_tool_calls,1));
 check(()=>assert.equal(h.requests[0].body.max_output_tokens,4500));
 check(()=>assert.match(h.requests[0].body.input,/6–12/));
 check(()=>assert.match(h.requests[0].body.input,/last 7 days/));
 check(()=>assert.equal(h.requests[1].body.tools,undefined,'formatter must not search the web again'));
 check(()=>assert.equal(h.requests[1].body.text.format.type,'json_schema'));
 check(()=>assert.equal(h.requests[1].body.text.format.strict,true));
 check(()=>assert.equal(result.candidates.length,1,'news-only candidate must be rejected'));
 const trend=result.candidates[0];
 check(()=>assert.equal(trend.trend_key,'hoe-picnic'));
 check(()=>assert.equal(trend.route_type,'seoul_trend','food must route to seoul_trend even if model suggests meme_remix'));
 check(()=>assert.ok(Number(trend.trend_score)>=90));
 check(()=>assert.deepEqual(Array.from(trend.signal_types).sort(),['news','search']));
 const evidence=h.radar.trendEvidence(trend);
 check(()=>assert.equal(evidence.length,2));
 check(()=>assert.ok(evidence[0].evidence.includes('회크닉')));
 const selected=await h.radar.selectTrendForAutomaticContent(h.db,80);
 check(()=>assert.equal(selected.id,trend.id));
 await h.radar.markTrendUsed(h.db,trend.id);
 const cooled=await h.radar.selectTrendForAutomaticContent(h.db,80);
 check(()=>assert.equal(cooled,null,'60-day same-trend cooldown must apply'));
 const stored=h.tables.marketing_trends[0];stored.material_change=true;stored.material_change_at=new Date(Date.now()+1000).toISOString();
 const changed=await h.radar.selectTrendForAutomaticContent(h.db,80);
 check(()=>assert.equal(changed.id,trend.id,'material change newer than use should bypass cooldown'));
}
{
 const h=harness();await h.radar.runTrendRadar('radar:test:002');const trend=h.tables.marketing_trends[0];
 trend.cooldown_until=null;trend.used_at=null;
 h.tables.marketing_trends.push({id:'recent-category',trend_key:'other-food',display_name:'다른 먹거리',category:'food',scope:'seoul',status:'rising',first_seen_at:new Date().toISOString(),last_seen_at:new Date().toISOString(),observed_at:new Date().toISOString(),momentum_score:80,roundy_relevance_score:80,target_relevance_score:80,seoul_relevance_score:80,visual_potential_score:80,source_confidence_score:80,trend_score:80,signal_types:['search','news'],source_urls:[],summary:'',content_angle:'',angle_key:'other-angle',route_type:'seoul_trend',material_change:false,used_at:new Date().toISOString(),cooldown_until:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
 const selected=await h.radar.selectTrendForAutomaticContent(h.db,90);
 check(()=>assert.equal(selected,null,'14-day category penalty must be able to push a candidate below threshold'));
}
{
 const h=harness();await h.radar.runTrendRadar('radar:test:003');const trend=h.tables.marketing_trends[0];
 trend.last_seen_at=new Date(Date.now()-8*86400000).toISOString();
 const selected=await h.radar.selectTrendForAutomaticContent(h.db,80);
 check(()=>assert.equal(selected,null,'candidates older than the 7-day pool must not be selected'));
}
{
 const h=harness();
 h.provider.output[1].content[0].text=JSON.stringify({candidates:[]});
 await assert.rejects(()=>h.radar.runTrendRadar('radar:test:empty'),/TREND_RADAR_NO_VERIFIED_CANDIDATES/);
 check(()=>assert.equal(h.tables.marketing_trend_scans[0].status,'failed','zero candidates must never count as completed'));
 check(()=>assert.equal(h.requests.length,2,'empty results must not trigger another search'));
}
{
 const h=harness();
 h.provider.output[1].content[0].text='not valid JSON';
 await assert.rejects(()=>h.radar.runTrendRadar('radar:test:invalid'),/TREND_RADAR_INVALID_JSON/);
 check(()=>assert.equal(h.tables.marketing_trend_scans[0].status,'failed'));
 check(()=>assert.equal(h.requests.length,2,'invalid JSON must not be retried automatically'));
}
{
 const h=harness();
 h.provider.output[0].action.sources=[];
 await assert.rejects(()=>h.radar.runTrendRadar('radar:test:no-sources'),/TREND_RADAR_NO_RESEARCH_EVIDENCE/);
 check(()=>assert.equal(h.tables.marketing_trend_scans[0].status,'failed'));
 check(()=>assert.equal(h.requests.length,1,'no verified web sources must not trigger the formatter'));
}
{
 const h=harness();
 h.provider.output[0].action.sources[0].url+='&utm_source=test';
 const response=await h.radar.runTrendRadar('radar:test:tracking');
 check(()=>assert.equal(response.candidates.length,1,'tracking query parameters must not cause false negatives'));
 check(()=>assert.equal(h.requests.length,2));
}
console.log('PASS '+checks+' Seoul Trend Radar assertions; provider calls mocked.');
