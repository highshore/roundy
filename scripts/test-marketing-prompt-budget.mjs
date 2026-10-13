import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=fs.readFileSync('src/lib/marketing-prompt-budget.ts','utf8');
const sandbox={exports:{},Buffer,Error};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText,sandbox);
const {fitEditorialWritingRequest,editorialRequestBytes,EDITORIAL_REQUEST_MAX_BYTES}=sandbox.exports;
let checks=0;
const check=(description,fn)=>{fn();checks++;console.log('PASS '+description);};
const schema={type:'object',strict_schema:'B'.repeat(11800)};
const instructions='A'.repeat(31500);
const evidence=[1,2].map(i=>({id:'S'+i,url:'https://example.com/official/'+i,title:'Verified program '+i,
 evidence:'가'.repeat(2500)}));
const factPack={layout:'event_guide',facts:[
 {kind:'when',value_ko:'공연 날짜는 2026년 10월',source_ids:['S1']},
 {kind:'where',value_ko:'서울 공연장',source_ids:['S2']},
 {kind:'program',value_ko:'무대 공연',source_ids:['S1','S2']}
]};
const payload={editorial_type:'seoul_trend',language:'ko',evidence,fact_pack:factPack,
 trend_context:{id:'verified-trend',source_ids:['S1','S2']},
 human_style_references:[{sample:'X'.repeat(4500)}]};
const before=JSON.stringify(payload);
const compact=fitEditorialWritingRequest(instructions,schema,payload);
check('oversized verified-trend request is fitted before a paid call',()=>{
 assert.ok(editorialRequestBytes(instructions,schema,payload)>EDITORIAL_REQUEST_MAX_BYTES);
 assert.ok(editorialRequestBytes(instructions,schema,compact)<=EDITORIAL_REQUEST_MAX_BYTES);
});
check('required trend facts and immutable source links survive compaction',()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(compact.fact_pack)),factPack);
 assert.deepEqual(JSON.parse(JSON.stringify(compact.trend_context)),payload.trend_context);
 const cited=JSON.parse(JSON.stringify(compact.evidence));
 assert.deepEqual(cited.map(x=>x.id),['S1','S2']);
 assert.deepEqual(cited.map(x=>x.url),evidence.map(x=>x.url));
 assert.deepEqual(cited.map(x=>x.title),evidence.map(x=>x.title));
 assert.ok(compact.evidence.every(x=>x.evidence.length<=600));
 assert.equal(compact.human_style_references.length,0);
});
check('source data and original saved request are not mutated',()=>assert.equal(JSON.stringify(payload),before));
check('small requests do not lose human style references or source details',()=>{
 const small=fitEditorialWritingRequest('Normal instructions',{type:'object'},
  {evidence:[{id:'S1',url:'https://example.com/a',title:'Original',evidence:'Full citation'}],
   human_style_references:[{sample:'Approved human example'}]});
 assert.equal(small.evidence[0].evidence,'Full citation');
 assert.equal(small.human_style_references[0].sample,'Approved human example');
});
check('unnecessary repair-review history may be removed while original slides survive',()=>{
 const sourceDoc={slides:[{role:'cover',title:'Original Korean copy'}],
  editorial_critic_history:[{reason:'X'.repeat(7000)}],
  editorial_topic_reviews:[{reason:'Y'.repeat(1500)}]};
 const repaired=fitEditorialWritingRequest('I'.repeat(29000),
  {schema:'S'.repeat(15000)},{original_document:sourceDoc,evidence:[],human_style_references:[]});
 assert.equal(repaired.original_document.slides[0].title,'Original Korean copy');
 assert.equal(repaired.original_document.editorial_critic_history,undefined);
 assert.equal(repaired.original_document.editorial_topic_reviews,undefined);
 assert.equal(sourceDoc.editorial_critic_history.length,1);
});
check('mandatory oversize still fails closed instead of bypassing safeguards',()=>{
 assert.throws(()=>fitEditorialWritingRequest('X'.repeat(EDITORIAL_REQUEST_MAX_BYTES+1),
  {type:'object'},{fact_pack:factPack,evidence:[]}),/PROMPT_SIZE_LIMIT/);
});
check('UI explains input-size errors separately from spending limits',()=>{
 const ui=fs.readFileSync('src/components/admin-marketing.tsx','utf8');
 assert.match(ui,/if\(\/PROMPT_SIZE_LIMIT\/\.test\(message\+' '\+code\)\)/);
 assert.match(ui,/원고 입력 크기 초과/);
});
console.log('PASS '+checks+' prompt-budget regression checks; no paid provider requests, database updates or publications.');
